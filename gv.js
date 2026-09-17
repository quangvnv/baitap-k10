/* ══════════════════════════════════════════════════════════════════════════════════════════════
   BẢNG THEO DÕI CỦA CÁN BỘ, GIẢNG VIÊN (§41)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   Trang này đăng nhập bằng tài khoản CB/GV rồi đọc THẲNG bảng qua REST — khác hẳn trang học viên
   (chỉ gọi Edge Function, không chạm bảng nào). RLS lo phần phân quyền: GV thấy phiên của mình,
   admin thấy toàn Khoa (web/sql/01-schema.sql).

   ⚠ FILE NÀY GIỮ PHIÊN ĐĂNG NHẬP CHO CẢ TRANG. `admin.js` (tab Tài khoản) nạp SAU và dùng lại
     `window.WebGV` — KHÔNG khai lại TOKEN/api/$/esc… ở đó. Hai file cùng khai `const TOKEN` ở
     cấp cao nhất sẽ ném SyntaxError "Identifier has already been declared" và CẢ TRANG chết.

   ⚠ VÌ SAO HỎI LẠI MỖI 4 GIÂY, KHÔNG DÙNG REALTIME WEBSOCKET:
     Realtime của Supabase đi qua giao thức Phoenix Channels — tự viết thì rối, mà nạp supabase-js
     từ CDN lại thêm một phụ thuộc mạng ngoài cho trang vốn phải mở được ở lớp học có mạng yếu.
     Lớp 30 học viên, dashboard mở ~45 phút ⇒ ~700 lời gọi, nằm sâu trong hạn mức miễn phí.
     Độ trễ 4 giây là không đáng kể khi GV đang đứng lớp. Muốn đổi sang Realtime sau này thì chỉ
     phải thay hàm `batNhip()`, phần vẽ bảng không đụng tới.

   ⚠ KHÔNG có họ tên học viên ở đây (§41.3) — CSDL chỉ lưu mã định danh. Đây là chủ ý.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

const KHOA_TOKEN = 'gv_token', KHOA_EMAIL = 'gv_email';
const NHIP_MS = 4000;

let TOKEN = null, TOI = null;
let PHIEN_HIEN = null;      // phiên đang xem chi tiết
let NHIP = null;            // id setInterval
let TAB = 'phien';          // tab đang mở: 'phien' | 'theodoi' | 'taikhoan' | 'dungluong'

const $ = (id) => document.getElementById(id);
const hien = (id, on) => $(id).classList.toggle('an', !on);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let bTimer = null;
function bao(chu, loai) {
  const b = $('banner');
  b.textContent = chu;
  b.className = 'banner' + (loai ? ' banner--' + loai : '');
  clearTimeout(bTimer);
  bTimer = setTimeout(() => b.classList.add('an'), 3500);
}

/* ── REST ────────────────────────────────────────────────────────────────────────────────── */
async function api(duong, tuyChon = {}) {
  const h = { apikey: CAU_HINH.anonKey, 'content-type': 'application/json', ...(tuyChon.headers || {}) };
  if (TOKEN) h.Authorization = 'Bearer ' + TOKEN;
  const r = await fetch(CAU_HINH.url + duong, { ...tuyChon, headers: h });
  const chu = await r.text();
  let kq = null;
  try { kq = chu ? JSON.parse(chu) : null; } catch { kq = chu; }
  if (!r.ok) throw new Error((kq && (kq.loi || kq.message || kq.error_description || kq.msg)) || ('Lỗi ' + r.status));
  return kq;
}

/* Mặt tiền dùng chung cho admin.js + gv-theo-doi.js — đừng để tab khác tự dựng lại phiên đăng
   nhập. `moPhien` để tab "Theo dõi lớp" bấm tiêu đề cột là nhảy sang chi tiết phiên đó. */
window.WebGV = { api, bao, esc, $, hien, toi: () => TOI, moPhien, veChiTiet };

/* Màn chữa bài quay về chi tiết phiên — phải BẬT LẠI nhịp hỏi máy chủ, nếu không bảng đứng
   im mà nhìn vẫn như đang chạy. */
function veChiTiet() {
  hien('manCB', false); hien('manCT', true);
  if (PHIEN_HIEN) { lamMoi(); batNhip(); }
}

/* ⚠ Tên bài phải TRUYỀN VÀO: join `bai_tap(ten)` trả NULL với bài của GV khác (policy `bt_doc`
   chỉ cho chủ bài + bài đã chia sẻ đọc). Tab Theo dõi lấy tên từ view `v_phien_bang` (§41.22). */
async function moPhien(id, tenBai, soCau) {
  try {
    const r = await api('/rest/v1/phien?select=*,bai_tap(ten,so_cau,chu_gv)&id=eq.' + id);
    if (!r || !r.length) { bao('Không mở được phiên này.', 'nhac'); return; }
    const p = r[0];
    if (!p.bai_tap) p.bai_tap = { ten: tenBai || '—', so_cau: soCau || 0 };
    await doiTab('phien');
    await moChiTiet(p);
  } catch (e) { bao(e.message, 'nhac'); }
}

/* ── Đăng nhập ───────────────────────────────────────────────────────────────────────────── */
$('oEmail').value = localStorage.getItem(KHOA_EMAIL) || '';
$('btVao').addEventListener('click', vao);
$('oMk').addEventListener('keydown', e => { if (e.key === 'Enter') vao(); });

async function vao() {
  const email = $('oEmail').value.trim(), mk = $('oMk').value;
  $('vaoLoi').textContent = '';
  $('btVao').disabled = true; $('btVao').textContent = 'Đang vào…';
  try {
    const kq = await api('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email, password: mk }),
    });
    TOKEN = kq.access_token;
    try { localStorage.setItem(KHOA_TOKEN, TOKEN); localStorage.setItem(KHOA_EMAIL, email); } catch { }
    await sauDangNhap(email);
  } catch (e) {
    $('vaoLoi').textContent = e.message;
  } finally {
    $('btVao').disabled = false; $('btVao').textContent = 'Đăng nhập';
  }
}

async function sauDangNhap(email) {
  /* ⚠ PHẢI lọc theo id của chính mình: tài khoản quản trị đọc được MỌI dòng nguoi_dung (nd_doc_minh
     cho admin thấy hết) ⇒ `limit=1` trần có thể trả về NGƯỜI KHÁC, làm sai vai trò/chủ phiên. */
  let uid = '';
  try { uid = JSON.parse(atob(TOKEN.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch { }
  const nd = await api('/rest/v1/nguoi_dung?select=id,vai_tro,ten,viet_tat'
    + (uid ? '&id=eq.' + uid : '') + '&limit=1');
  if (!nd || !nd.length) {
    // Có tài khoản đăng nhập nhưng chưa có bản ghi phân quyền ⇒ RLS chặn hết. Báo rõ, đừng để
    // GV nhìn bảng trống rồi tưởng chưa có phiên nào.
    TOKEN = null;
    $('vaoLoi').textContent = 'Tài khoản chưa được cấp quyền. Nhờ cán bộ quản trị thêm vào bảng nguoi_dung.';
    return;
  }
  TOI = nd[0];
  const laAdmin = TOI.vai_tro === 'admin';
  $('chipTen').textContent = TOI.ten || email;
  $('chipVai').textContent = laAdmin ? 'CB' : 'GV';
  $('chipVai').className = 'badge ' + (laAdmin ? 'cb' : 'gv');
  // Tab Tài khoản do VAI TRÒ trong CSDL quyết định (§41.14), không phải công tắc giao diện.
  $('tabTaiKhoan').classList.toggle('an', !laAdmin);
  $('tabDungLuong').classList.toggle('an', !laAdmin);   // §41.23 — chỉ CB

  hien('manVao', false);
  hien('thanhTren', true);
  hien('thanhTab', true);

  // admin.html cũ chuyển hướng sang gv.html#taikhoan ⇒ mở thẳng tab đó nếu có quyền.
  const muon = location.hash.slice(1);
  const moDuoc = muon === 'theodoi' || ((muon === 'taikhoan' || muon === 'dungluong') && laAdmin);
  await doiTab(moDuoc ? muon : 'phien');
  // Chấm đỏ trên nút tab Dung lượng khi có hạn mức ≥80% — chạy nền, không chặn việc vào trang.
  if (laAdmin && window.DungLuong && muon !== 'dungluong') window.DungLuong.kiemNen();
}

$('btRa').addEventListener('click', () => {
  TOKEN = null; TOI = null; PHIEN_HIEN = null;
  try { localStorage.removeItem(KHOA_TOKEN); } catch { }
  dungNhip();
  ['manDS', 'manCT', 'manCB', 'manTD', 'manHV', 'manTK', 'manDL', 'thanhTren', 'thanhTab'].forEach(id => hien(id, false));
  hien('manVao', true);
  $('oMk').value = '';
  location.hash = '';
});

/* ── Chuyển tab ──────────────────────────────────────────────────────────────────────────── */
document.querySelectorAll('.pill[data-tab]').forEach(b => {
  b.addEventListener('click', () => doiTab(b.dataset.tab));
});

async function doiTab(ten) {
  TAB = ten;
  document.querySelectorAll('.pill[data-tab]').forEach(b => b.classList.toggle('dang', b.dataset.tab === ten));
  location.hash = ten === 'phien' ? '' : '#' + ten;
  // Rời tab Phiên thì THÔI hỏi lại máy chủ — 2 tab kia là màn xem tổng kết, không cần nhịp.
  if (ten !== 'phien') dungNhip();
  ['manDS', 'manCT', 'manCB', 'manTD', 'manHV', 'manTK', 'manDL'].forEach(id => hien(id, false));
  if (ten === 'taikhoan') { hien('manTK', true); if (window.QuanTri) await window.QuanTri.mo(); return; }
  if (ten === 'dungluong') { hien('manDL', true); if (window.DungLuong) await window.DungLuong.mo(); return; }
  if (ten === 'theodoi') { if (window.TheoDoi) await window.TheoDoi.mo(); return; }
  await veDS();
}

/* ── Danh sách phiên ─────────────────────────────────────────────────────────────────────── */
$('locTT').addEventListener('change', veDS);

async function veDS() {
  dungNhip();
  PHIEN_HIEN = null;
  hien('manCT', false); hien('manCB', false); hien('manDS', true);
  const loc = $('locTT').value;
  let ds = [];
  try {
    ds = await api('/rest/v1/phien?select=*,bai_tap(ten,so_cau,chu_gv)&order=mo_luc.desc'
      + (loc ? '&trang_thai=eq.' + loc : ''));
  } catch (e) { bao(e.message, 'nhac'); return; }

  // Đếm bài nộp + điểm trung bình cho từng phiên (một lời gọi, lọc phía máy)
  let luot = [];
  if (ds.length) {
    const ids = ds.map(p => p.id).join(',');
    try { luot = await api('/rest/v1/luot?select=phien_id,ma_hv,diem,nop_luc&phien_id=in.(' + ids + ')'); }
    catch { luot = []; }
  }
  const theoPhien = {};
  luot.filter(l => l.nop_luc).forEach(l => {
    const t = theoPhien[l.phien_id] || (theoPhien[l.phien_id] = { hv: {}, tong: 0 });
    // §41.9: điểm chính thức = LƯỢT CAO NHẤT của mỗi học viên
    if (t.hv[l.ma_hv] == null || l.diem > t.hv[l.ma_hv]) t.hv[l.ma_hv] = l.diem;
  });

  /* Cột "Giảng viên" CHỈ cho quản trị (§41.22 — GV chỉ thấy phiên của mình nên cột thừa).
     Tên lấy từ nguoi_dung; RLS chỉ cho admin đọc hết bảng này. */
  const laAdmin = !!(TOI && TOI.vai_tro === 'admin');
  $('thGv').classList.toggle('an', !laAdmin);
  let tenGv = {};
  if (laAdmin && ds.length) {
    try {
      (await api('/rest/v1/nguoi_dung?select=id,ten,viet_tat')).forEach(n => { tenGv[n.id] = n; });
    } catch { tenGv = {}; }
  }
  const oGv = (p) => {
    if (!laAdmin) return '';
    const n = tenGv[p.gv];
    return '<td title="' + esc(n ? n.ten : '') + '">' + (n ? esc(n.ten || n.viet_tat || '') : '<span class="mo-nhat">(không rõ)</span>') + '</td>';
  };

  hien('dsTrong', !ds.length);
  $('dsBody').innerHTML = ds.map((p, i) => {
    const t = theoPhien[p.id];
    const dsD = t ? Object.values(t.hv) : [];
    const tb = dsD.length ? (dsD.reduce((a, b) => a + (+b || 0), 0) / dsD.length).toFixed(1) : '–';
    return `<tr data-id="${p.id}" class="co-tro">
      <td class="giua mo-nhat">${i + 1}</td>
      <td>${esc(p.bai_tap ? p.bai_tap.ten : '—')}</td>
      ${oGv(p)}
      <td class="giua">${esc(p.ma_lop)}</td>
      <td class="giua">${p.kieu === 'tai_lop' ? 'Tại lớp' : 'Về nhà'}</td>
      <td class="giua ma">${esc(p.ma_phien)}</td>
      <td class="giua">${dsD.length}</td>
      <td class="giua diem-o">${tb}</td>
      <td class="giua">${p.trang_thai === 'mo' ? '<span class="cham-mo"></span>Đang mở' : '<span class="mo-nhat">Đã đóng</span>'}</td>
      <td class="giua">${laCuaToi(p) ? `<button class="bt bt-nho bt-do bt-xoa" type="button" data-xoa="${p.id}"
        ${p.trang_thai === 'mo' ? 'disabled title="Đóng phiên trước khi xoá"' : 'title="Xoá phiên này"'}>${ICON_XOA}</button>` : ''}</td>
    </tr>`;
  }).join('');
  $('dsBody').querySelectorAll('tr[data-id]').forEach(tr => {
    tr.onclick = () => moChiTiet(ds.find(p => p.id === tr.dataset.id));
  });
  $('dsBody').querySelectorAll('[data-xoa]').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); xoaPhien(ds.find(p => p.id === b.dataset.xoa)); };
  });
}

/* ── Chi tiết phiên ──────────────────────────────────────────────────────────────────────── */
$('btVe').addEventListener('click', veDS);

async function moChiTiet(p) {
  if (!p) return;
  PHIEN_HIEN = p;
  hien('manDS', false); hien('manCT', true);
  $('ctTen').textContent = (p.bai_tap ? p.bai_tap.ten : 'Bài tập') + ' · ' + p.ma_lop
    + ' · ' + (p.kieu === 'tai_lop' ? 'Tại lớp' : 'Về nhà');
  $('ctMa').textContent = p.ma_phien;
  $('btDong').disabled = p.trang_thai !== 'mo';
  $('btDong').textContent = p.trang_thai === 'mo' ? 'Đóng phiên' : 'Đã đóng';
  dongBoNutXoa();
  dongBoNutQR();
  dongBoNutChuaBai();
  await lamMoi();
  batNhip();
}

function batNhip() {
  dungNhip();
  if (!PHIEN_HIEN || PHIEN_HIEN.trang_thai !== 'mo') return;   // phiên đóng thì thôi hỏi lại
  NHIP = setInterval(lamMoi, NHIP_MS);
}
function dungNhip() { if (NHIP) { clearInterval(NHIP); NHIP = null; } }

async function lamMoi() {
  if (!PHIEN_HIEN) return;
  const p = PHIEN_HIEN;
  let luot = [], dsLop = [];
  try {
    [luot, dsLop] = await Promise.all([
      api('/rest/v1/luot?select=*&phien_id=eq.' + p.id + '&order=lan.asc'),
      api('/rest/v1/lop_hv?select=ma_hv&ma_lop=eq.' + encodeURIComponent(p.ma_lop)),
    ]);
  } catch (e) { bao(e.message, 'nhac'); return; }

  $('ctNhip').classList.add('dap');
  setTimeout(() => $('ctNhip').classList.remove('dap'), 400);

  // Gộp theo học viên, giữ LƯỢT CAO NHẤT (§41.9); lượt đang làm dở thì giữ để hiện "đang làm"
  const theoHV = {};
  luot.forEach(l => {
    const c = theoHV[l.ma_hv];
    if (!c) { theoHV[l.ma_hv] = l; return; }
    if (!l.nop_luc) { if (!c.nop_luc) theoHV[l.ma_hv] = l; return; }
    if (!c.nop_luc || (l.diem || 0) > (c.diem || 0)) theoHV[l.ma_hv] = l;
  });
  const soLan = {};
  luot.filter(l => l.nop_luc).forEach(l => { soLan[l.ma_hv] = (soLan[l.ma_hv] || 0) + 1; });

  // Danh sách hiển thị = học viên của lớp + khách (mã ngoài lớp) xếp cuối
  const trongLop = dsLop.map(x => x.ma_hv);
  const khach = Object.keys(theoHV).filter(m => trongLop.indexOf(m) < 0).sort();
  const hang = trongLop.slice().sort().concat(khach);

  const daNop = Object.values(theoHV).filter(l => l.nop_luc);
  const tb = daNop.length ? (daNop.reduce((a, l) => a + (+l.diem || 0), 0) / daNop.length).toFixed(1) : '–';
  $('ctNop').textContent = daNop.length + '/' + hang.length;
  $('ctTB').textContent = tb;

  $('ctBody').innerHTML = hang.map(ma => {
    const l = theoHV[ma];
    const laKhach = trongLop.indexOf(ma) < 0;
    if (!l) return `<tr><td class="ma">${esc(ma)}</td><td class="giua mo-nhat">Chưa vào</td>
        <td class="giua mo-nhat">–</td><td class="giua mo-nhat">–</td><td></td><td class="giua mo-nhat">–</td></tr>`;
    if (!l.nop_luc) return `<tr><td class="ma">${esc(ma)}${laKhach ? ' <i class="nhan-khach">khách</i>' : ''}</td>
        <td class="giua dang-lam">Đang làm</td><td class="giua mo-nhat">–</td>
        <td class="giua">${phut(l.bat_dau)}</td><td></td><td class="giua">${soLan[ma] || 0}</td></tr>`;
    const qs = l.qs || [];
    return `<tr><td class="ma">${esc(ma)}${laKhach ? ' <i class="nhan-khach">khách</i>' : ''}</td>
      <td class="giua xong">Đã nộp</td>
      <td class="giua diem-o">${l.so_dung}/${l.tong}</td>
      <td class="giua">${phut(l.bat_dau, l.nop_luc)}</td>
      <td class="o-qs">${qs.map(d => '<i class="' + (d ? 'd' : 's') + '"></i>').join('')}</td>
      <td class="giua">${soLan[ma] || 1}</td></tr>`;
  }).join('');

  veCot(daNop, p.bai_tap ? p.bai_tap.so_cau : 0);
}

function phut(tu, den) {
  const a = new Date(tu).getTime(), b = den ? new Date(den).getTime() : Date.now();
  const s = Math.max(0, Math.round((b - a) / 1000));
  return Math.floor(s / 60) + "'" + String(s % 60).padStart(2, '0');
}

/* Biểu đồ % lớp đúng mỗi câu — div/CSS thuần, KHÔNG thư viện (đồng bộ §32.30). */
function veCot(daNop, soCau) {
  const n = soCau || (daNop[0] && (daNop[0].qs || []).length) || 0;
  if (!n || !daNop.length) { $('ctCot').innerHTML = '<span class="mo-nhat">chưa có bài nộp</span>'; return; }
  const dung = new Array(n).fill(0);
  daNop.forEach(l => (l.qs || []).forEach((d, i) => { if (d) dung[i]++; }));
  $('ctCot').innerHTML = dung.map((d, i) => {
    const pc = Math.round(d / daNop.length * 100);
    const mau = pc < 50 ? ' kem' : (pc < 80 ? ' vua' : '');
    return `<i class="cot-1${mau}" style="height:${Math.max(4, pc)}%" title="Câu ${i + 1}: ${pc}% đúng"></i>`;
  }).join('');
}

/* ── Đóng phiên ──────────────────────────────────────────────────────────────────────────── */
$('btDong').addEventListener('click', async () => {
  if (!PHIEN_HIEN || PHIEN_HIEN.trang_thai !== 'mo') return;
  /* ⚠ `confirm()` native ở ĐÂY là được — §13 cấm nó trong app vì bug Electron/Windows (renderer
     không lấy lại focus sau khi hộp thoại đóng). Trang này chạy trong trình duyệt thường nên
     không dính bug đó. ĐỪNG bê `confirm()` ngược vào app. */
  if (!confirm('Đóng phiên này? Học viên sẽ không vào làm được nữa.')) return;
  try {
    await api('/rest/v1/phien?id=eq.' + PHIEN_HIEN.id, {
      method: 'PATCH',
      body: JSON.stringify({ trang_thai: 'dong', dong_luc: new Date().toISOString() }),
    });
    PHIEN_HIEN.trang_thai = 'dong';
    $('btDong').disabled = true; $('btDong').textContent = 'Đã đóng';
    dongBoNutXoa();
    dongBoNutQR();
    hien('hopQR', false);        // mã QR của phiên vừa đóng không còn dùng được

    dungNhip();
    bao('Đã đóng phiên.', 'ok');
  } catch (e) { bao(e.message, 'nhac'); }
});

/* ── Xoá phiên ───────────────────────────────────────────────────────────────────────────── */
/* Chỉ phiên CỦA MÌNH (kể cả CB) và chỉ khi ĐÃ ĐÓNG. Nút ẩn/mờ chỉ là tiện lợi — quyền thật nằm ở
   hàm `xoa_phien` trên máy chủ (tự kiểm chủ phiên + trạng thái), gọi thẳng REST cũng không vượt.
   Xoá kèm lượt làm bài; bài tập hết phiên thì máy chủ xoá luôn. Không ghi nhật ký (đã chốt). */
const ICON_XOA = '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9M5.5 4V2.5h3V4M4 4l.5 8h5l.5-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const laCuaToi = (p) => !!(p && TOI && p.gv === TOI.id);

function dongBoNutXoa() {
  const p = PHIEN_HIEN;
  hien('btXoa', laCuaToi(p));
  $('btXoa').disabled = !p || p.trang_thai === 'mo';
  $('btXoa').title = p && p.trang_thai === 'mo' ? 'Đóng phiên trước khi xoá' : 'Xoá phiên này';
}

async function xoaPhien(p) {
  if (!laCuaToi(p) || p.trang_thai === 'mo') return;
  const ten = p.bai_tap ? p.bai_tap.ten : 'bài tập';
  // confirm() native được phép trên trang web (xem ghi chú ở nút Đóng phiên)
  if (!confirm(`Xoá phiên ${p.ma_phien} (${ten} · ${p.ma_lop})?

`
    + 'Toàn bộ kết quả làm bài của phiên này sẽ bị xoá, không khôi phục được.')) return;
  try {
    const kq = await api('/rest/v1/rpc/xoa_phien', { method: 'POST', body: JSON.stringify({ p_id: p.id }) });
    bao('Đã xoá phiên' + (kq && kq.so_luot ? ` và ${kq.so_luot} lượt làm bài` : '')
      + (kq && kq.xoa_bai_tap ? ' (bài tập không còn phiên nào nên đã xoá luôn).' : '.'), 'ok');
    await veDS();
  } catch (e) { bao(e.message, 'nhac'); }
}
$('btXoa').addEventListener('click', () => xoaPhien(PHIEN_HIEN));

/* ── Tải kết quả ─────────────────────────────────────────────────────────────────────────── */
/* Xuất JSON để app nhập vào lưới điểm quá trình (§32.31). Phiên "về nhà" KHÔNG đổ về điểm QT
   (§41.5) nên đánh dấu rõ trong file để bên nhận tự chặn. */
$('btTai').addEventListener('click', async () => {
  if (!PHIEN_HIEN) return;
  const p = PHIEN_HIEN;
  let luot = [];
  try { luot = await api('/rest/v1/luot?select=*&phien_id=eq.' + p.id + '&nop_luc=not.is.null'); }
  catch (e) { bao(e.message, 'nhac'); return; }

  const tot = {};
  luot.forEach(l => { if (!tot[l.ma_hv] || l.diem > tot[l.ma_hv].diem) tot[l.ma_hv] = l; });
  const goi = {
    loai: 'ket_qua_web', phienBan: 1,
    maLop: p.ma_lop, kieu: p.kieu,
    tenBai: p.bai_tap ? p.bai_tap.ten : '',
    soCau: p.bai_tap ? p.bai_tap.so_cau : 0,
    moLuc: p.mo_luc,
    dungChoDiemQT: p.kieu === 'tai_lop',
    items: Object.values(tot).map(l => ({
      ma: l.ma_hv, khach: !!l.khach, dung: l.so_dung, tong: l.tong, diem: l.diem, nopLuc: l.nop_luc,
    })),
  };
  const ten = 'ketqua-' + p.ma_lop.replace(/\s+/g, '') + '-' + p.ma_phien + '.json';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(goi, null, 2)], { type: 'application/json' }));
  a.download = ten;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  bao('Đã tải ' + ten + (goi.dungChoDiemQT ? '' : ' (phiên về nhà — không đổ vào điểm quá trình)'), 'ok');
});

/* ── Mã QR vào bài ───────────────────────────────────────────────────────────────────────── */
/* Chiếu lên bảng thay cho việc đọc to mã 6 số + địa chỉ trang. Mã QR mở trang học viên với ô
   "Mã phiên" điền sẵn (`index.html?p=<mã>`); học viên chỉ còn nhập mã của mình.
   ⚠ Địa chỉ suy TỪ CHÍNH trang đang mở (`new URL('index.html', location.href)`), KHÔNG viết
   cứng tên repo — đổi chỗ đặt trang là mã QR tự đúng theo.
   ⚠ `?p=` còn tiện thêm một việc: URL khác nhau nên BỎ QUA cache 10 phút của index.html trên
   GitHub Pages (§41.19) — học viên không dính bản cũ. */
function diaChiVaoBai(ma) {
  const u = new URL('index.html', location.href);
  u.search = '';                 // bỏ ?debug=1 hay tham số lạ đang có trên trang GV
  u.hash = '';
  u.searchParams.set('p', ma);
  return u.href;
}

function dongBoNutQR() {
  const p = PHIEN_HIEN, mo = !!p && p.trang_thai === 'mo';
  $('btQR').disabled = !mo;
  $('btQR').title = mo ? 'Hiện mã QR để học viên quét vào bài'
    : 'Phiên đã đóng — học viên không vào làm được nữa';
}

function moQR() {
  const p = PHIEN_HIEN;
  if (!p || p.trang_thai !== 'mo') return;
  const diaChi = diaChiVaoBai(p.ma_phien);
  $('qrTen').textContent = p.bai_tap ? p.bai_tap.ten : 'Quét để vào làm bài';
  $('qrMa').textContent = p.ma_phien;
  $('qrDiaChi').textContent = diaChi;
  $('qrLoi').textContent = '';
  try {
    $('qrHinh').innerHTML = QR.svg(diaChi, { oCo: 8 });
  } catch (e) {
    /* Không vẽ được thì nói thẳng — mã QR hỏng mà vẫn hiện ra là cả lớp quét vào chỗ sai */
    $('qrHinh').innerHTML = '';
    $('qrLoi').textContent = 'Không tạo được mã QR: ' + e.message + ' — đọc mã phiên cho học viên gõ tay.';
  }
  hien('hopQR', true);
}

$('btQR').addEventListener('click', moQR);

/* ── Chữa bài ────────────────────────────────────────────────────────────────────────────── */
/* ⚠ Điều kiện mở là QUYỀN ĐỌC ĐÁP ÁN, không phải quyền xem phiên: policy `da_chu` chỉ cho chủ
   bài tập + CB quản trị đọc `bai_tap_dap_an`, và bài ĐÃ CHIA SẺ cũng KHÔNG kéo theo quyền đó.
   Nói rõ lý do trên nút thay vì để GV bấm vào rồi nhận màn trống. */
function dongBoNutChuaBai() {
  const p = PHIEN_HIEN;
  const laAdmin = !!(TOI && TOI.vai_tro === 'admin');
  const laChuBai = !!(p && p.bai_tap && TOI && p.bai_tap.chu_gv === TOI.id);
  const duoc = !!p && (laChuBai || laAdmin);
  $('btChuaBai').disabled = !duoc;
  $('btChuaBai').title = duoc ? 'Chiếu chữa bài cho cả lớp'
    : 'Chỉ chủ bài tập và cán bộ quản trị mới xem được đáp án';
}

$('btChuaBai').addEventListener('click', () => {
  if ($('btChuaBai').disabled) return;
  dungNhip();                     // rời màn chi tiết thì thôi hỏi lại máy chủ
  window.ChuaBai.mo(PHIEN_HIEN);
});
$('qrDong').addEventListener('click', () => hien('hopQR', false));
$('qrChep').addEventListener('click', async () => {
  const t = $('qrDiaChi').textContent;
  try { await navigator.clipboard.writeText(t); bao('Đã chép địa chỉ vào bộ nhớ tạm.', 'ok'); }
  catch { bao('Trình duyệt không cho chép tự động — bôi đen dòng địa chỉ rồi Ctrl+C.', 'nhac'); }
});
/* Esc đóng popup. KHÔNG đóng khi bấm nền (§13) — đang chiếu lên bảng, lỡ tay là mất mã. */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('hopQR').classList.contains('an')) hien('hopQR', false);
});

/* ── Vào lại bằng token cũ ───────────────────────────────────────────────────────────────── */
(async function () {
  const t = localStorage.getItem(KHOA_TOKEN);
  if (!t) return;
  TOKEN = t;
  try { await sauDangNhap(localStorage.getItem(KHOA_EMAIL) || ''); }
  catch { TOKEN = null; }      // token hết hạn → về màn đăng nhập
})();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) dungNhip();
  else if (TAB === 'phien' && PHIEN_HIEN && !$('manCT').classList.contains('an')) { lamMoi(); batNhip(); }
});
