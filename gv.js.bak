/* ══════════════════════════════════════════════════════════════════════════════════════════════
   BẢNG THEO DÕI CỦA GIÁO VIÊN (§41)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   Trang này đăng nhập bằng tài khoản CB/GV rồi đọc THẲNG bảng qua REST — khác hẳn trang học viên
   (chỉ gọi Edge Function, không chạm bảng nào). RLS lo phần phân quyền: GV thấy phiên của mình,
   admin thấy toàn Khoa (web/sql/01-schema.sql).

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
  if (!r.ok) throw new Error((kq && (kq.message || kq.error_description || kq.msg)) || ('Lỗi ' + r.status));
  return kq;
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
  const nd = await api('/rest/v1/nguoi_dung?select=id,vai_tro,ten,viet_tat&limit=1');
  if (!nd || !nd.length) {
    // Có tài khoản đăng nhập nhưng chưa có bản ghi phân quyền ⇒ RLS chặn hết. Báo rõ, đừng để
    // GV nhìn bảng trống rồi tưởng chưa có phiên nào.
    TOKEN = null;
    $('vaoLoi').textContent = 'Tài khoản chưa được cấp quyền. Nhờ cán bộ quản trị thêm vào bảng nguoi_dung.';
    return;
  }
  TOI = nd[0];
  $('aiDo').textContent = (TOI.ten || email) + (TOI.vai_tro === 'admin' ? ' · quản trị' : '');
  hien('manVao', false);
  await veDS();
}

$('btRa').addEventListener('click', () => {
  TOKEN = null; TOI = null;
  try { localStorage.removeItem(KHOA_TOKEN); } catch { }
  dungNhip();
  hien('manDS', false); hien('manCT', false); hien('manVao', true);
  $('oMk').value = '';
});

/* ── Danh sách phiên ─────────────────────────────────────────────────────────────────────── */
$('locTT').addEventListener('change', veDS);

async function veDS() {
  dungNhip();
  hien('manCT', false); hien('manDS', true);
  const loc = $('locTT').value;
  let ds = [];
  try {
    ds = await api('/rest/v1/phien?select=*,bai_tap(ten,so_cau)&order=mo_luc.desc'
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

  hien('dsTrong', !ds.length);
  $('dsBody').innerHTML = ds.map((p, i) => {
    const t = theoPhien[p.id];
    const dsD = t ? Object.values(t.hv) : [];
    const tb = dsD.length ? (dsD.reduce((a, b) => a + (+b || 0), 0) / dsD.length).toFixed(1) : '–';
    return `<tr data-id="${p.id}" class="co-tro">
      <td class="giua">${i + 1}</td>
      <td>${esc(p.bai_tap ? p.bai_tap.ten : '—')}</td>
      <td class="giua">${esc(p.ma_lop)}</td>
      <td class="giua">${p.kieu === 'tai_lop' ? 'Tại lớp' : 'Về nhà'}</td>
      <td class="giua ma">${esc(p.ma_phien)}</td>
      <td class="giua">${dsD.length}</td>
      <td class="giua">${tb}</td>
      <td class="giua">${p.trang_thai === 'mo' ? '<span class="cham-mo"></span>Đang mở' : 'Đã đóng'}</td>
    </tr>`;
  }).join('');
  $('dsBody').querySelectorAll('tr[data-id]').forEach(tr => {
    tr.onclick = () => moChiTiet(ds.find(p => p.id === tr.dataset.id));
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
        <td class="giua">–</td><td class="giua">–</td><td></td><td class="giua">–</td></tr>`;
    if (!l.nop_luc) return `<tr><td class="ma">${esc(ma)}${laKhach ? ' <i class="nhan-khach">khách</i>' : ''}</td>
        <td class="giua dang-lam">Đang làm</td><td class="giua">–</td>
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
    dungNhip();
    bao('Đã đóng phiên.', 'ok');
  } catch (e) { bao(e.message, 'nhac'); }
});

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
  else if (PHIEN_HIEN && !$('manCT').classList.contains('an')) { lamMoi(); batNhip(); }
});
