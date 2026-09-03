/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TRANG QUẢN TRỊ TÀI KHOẢN (§41.4) — CB cấp/khoá tài khoản giáo viên
   ──────────────────────────────────────────────────────────────────────────────────────────────
   ⚠ MỌI THAO TÁC ĐI QUA EDGE FUNCTION `quanTri`, KHÔNG gọi thẳng bảng: tạo tài khoản cần
     service_role, mà khoá đó không bao giờ được xuống trình duyệt (§41.3). Function tự kiểm
     người gọi có phải admin không — trang này chỉ là giao diện.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

const KHOA_TOKEN = 'gv_token', KHOA_EMAIL = 'gv_email';   // dùng chung phiên với gv.html
let TOKEN = null, TOI = null, DS = [];

const $ = (id) => document.getElementById(id);
const hien = (id, on) => $(id).classList.toggle('an', !on);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let bT = null;
function bao(chu, loai) {
  const b = $('banner');
  b.textContent = chu; b.className = 'banner' + (loai ? ' banner--' + loai : '');
  clearTimeout(bT); bT = setTimeout(() => b.classList.add('an'), 3500);
}

async function api(duong, tuyChon = {}) {
  const h = { apikey: CAU_HINH.anonKey, 'content-type': 'application/json', ...(tuyChon.headers || {}) };
  if (TOKEN) h.Authorization = 'Bearer ' + TOKEN;
  const r = await fetch(CAU_HINH.url + duong, { ...tuyChon, headers: h });
  const t = await r.text();
  let kq = null; try { kq = t ? JSON.parse(t) : null; } catch { kq = t; }
  if (!r.ok) throw new Error((kq && (kq.loi || kq.message || kq.error_description || kq.msg)) || ('Lỗi ' + r.status));
  return kq;
}
const goiQT = (than) => api('/functions/v1/quanTri', { method: 'POST', body: JSON.stringify(than) });

/* ── Đăng nhập ───────────────────────────────────────────────────────────────────────────── */
$('oEmail').value = localStorage.getItem(KHOA_EMAIL) || '';
$('btVao').addEventListener('click', vao);
$('oMk').addEventListener('keydown', e => { if (e.key === 'Enter') vao(); });

async function vao() {
  $('vaoLoi').textContent = '';
  $('btVao').disabled = true; $('btVao').textContent = 'Đang vào…';
  try {
    const kq = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: $('oEmail').value.trim(), password: $('oMk').value }),
    });
    TOKEN = kq.access_token;
    try { localStorage.setItem(KHOA_TOKEN, TOKEN); localStorage.setItem(KHOA_EMAIL, $('oEmail').value.trim()); } catch { }
    await vaoTrong();
  } catch (e) {
    $('vaoLoi').textContent = e.message;
  } finally { $('btVao').disabled = false; $('btVao').textContent = 'Đăng nhập'; }
}

async function vaoTrong() {
  try {
    const kq = await goiQT({ viec: 'danhSach' });
    DS = kq.ds || [];
    TOI = DS.find(x => x.laToi);
    $('aiDo').textContent = (TOI && TOI.ten) || '';
    hien('manVao', false); hien('manDS', true);
    veBang();
  } catch (e) {
    TOKEN = null;
    $('vaoLoi').textContent = e.message;
    hien('manVao', true); hien('manDS', false);
  }
}

$('btRa').addEventListener('click', () => {
  TOKEN = null; try { localStorage.removeItem(KHOA_TOKEN); } catch { }
  hien('manDS', false); hien('manVao', true); $('oMk').value = '';
});

/* ── Bảng ────────────────────────────────────────────────────────────────────────────────── */
function veBang() {
  $('dsBody').innerHTML = DS.map((x, i) => `<tr>
    <td class="giua">${i + 1}</td>
    <td class="ma">${esc(x.email)}</td>
    <td>${esc(x.ten)}${x.laToi ? ' <i class="nhan-khach">bạn</i>' : ''}</td>
    <td class="giua">${esc(x.viet_tat)}</td>
    <td class="giua">${x.vai_tro === 'admin' ? 'Quản trị' : 'Giảng viên'}</td>
    <td class="giua">${x.khoa ? '<span class="mo-nhat">Đã khoá</span>' : '<span class="xong">Hoạt động</span>'}</td>
    <td class="giua">
      <button class="bt bt-nho" data-mk="${x.id}">Đổi mật khẩu</button>
      ${x.laToi ? '' : `<button class="bt bt-nho" data-khoa="${x.id}">${x.khoa ? 'Mở khoá' : 'Khoá'}</button>
      <button class="bt bt-nho bt-do" data-xoa="${x.id}">Xoá</button>`}
    </td></tr>`).join('');

  $('dsBody').querySelectorAll('[data-mk]').forEach(b => b.onclick = () => moDoiMatKhau(b.dataset.mk));
  $('dsBody').querySelectorAll('[data-khoa]').forEach(b => b.onclick = () => doiKhoa(b.dataset.khoa));
  $('dsBody').querySelectorAll('[data-xoa]').forEach(b => b.onclick = () => xoa(b.dataset.xoa));
}

async function lamMoi() { const kq = await goiQT({ viec: 'danhSach' }); DS = kq.ds || []; TOI = DS.find(x => x.laToi); veBang(); }

async function doiKhoa(id) {
  const x = DS.find(y => y.id === id); if (!x) return;
  if (!confirm((x.khoa ? 'Mở khoá' : 'Khoá') + ' tài khoản ' + x.email + '?')) return;
  try { await goiQT({ viec: 'khoa', id, khoa: !x.khoa }); await lamMoi(); bao('Đã cập nhật.', 'ok'); }
  catch (e) { bao(e.message, 'nhac'); }
}

async function xoa(id) {
  const x = DS.find(y => y.id === id); if (!x) return;
  /* ⚠ bai_tap.chu_gv cascade ⇒ xoá giáo viên là mất luôn bài tập của họ. Cảnh báo rõ và
     khuyên dùng "Khoá" — khoá thì không đăng nhập được nữa nhưng dữ liệu còn nguyên. */
  if (!confirm('XOÁ VĨNH VIỄN tài khoản ' + x.email + '?\n\n'
    + 'Toàn bộ BÀI TẬP do người này tạo sẽ bị xoá theo và KHÔNG khôi phục được.\n\n'
    + 'Nếu chỉ muốn ngăn đăng nhập, hãy dùng "Khoá" thay vì "Xoá".')) return;
  try { await goiQT({ viec: 'xoa', id }); await lamMoi(); bao('Đã xoá tài khoản.', 'ok'); }
  catch (e) { bao(e.message, 'nhac'); }
}

/* ── Popup ───────────────────────────────────────────────────────────────────────────────── */
let viecDangLam = null;
const dongPopup = () => hien('hopThem', false);
$('htHuy').addEventListener('click', dongPopup);
document.addEventListener('keydown', e => { if (e.key === 'Escape') dongPopup(); });

$('btThem').addEventListener('click', () => {
  viecDangLam = { viec: 'them' };
  $('htTieuDe').textContent = 'Thêm tài khoản';
  $('htOk').textContent = 'Tạo tài khoản';
  $('htThan').innerHTML = `
    <label class="nhan">Email</label><input id="fEmail" class="o" type="email" placeholder="ten@vidu.com">
    <label class="nhan">Mật khẩu ban đầu</label><input id="fMk" class="o" type="text" placeholder="ít nhất 6 ký tự">
    <label class="nhan">Họ tên</label><input id="fTen" class="o" placeholder="Nguyễn Văn A">
    <label class="nhan">Viết tắt</label><input id="fVt" class="o" placeholder="NVA">
    <label class="nhan">Vai trò</label>
    <select id="fVaiTro" class="o"><option value="gv">Giảng viên</option><option value="admin">Quản trị</option></select>
    <p class="phu" style="text-align:left;margin-top:8px">Mật khẩu hiện dạng chữ thường để bạn chép lại đưa cho giảng viên.</p>`;
  $('htLoi').textContent = '';
  hien('hopThem', true);
  setTimeout(() => $('fEmail').focus(), 50);
});

function moDoiMatKhau(id) {
  const x = DS.find(y => y.id === id); if (!x) return;
  viecDangLam = { viec: 'doiMatKhau', id };
  $('htTieuDe').textContent = 'Đổi mật khẩu';
  $('htOk').textContent = 'Đổi mật khẩu';
  $('htThan').innerHTML = `<p class="phu">${esc(x.email)}</p>
    <label class="nhan">Mật khẩu mới</label><input id="fMk" class="o" type="text" placeholder="ít nhất 6 ký tự">`;
  $('htLoi').textContent = '';
  hien('hopThem', true);
  setTimeout(() => $('fMk').focus(), 50);
}

$('htOk').addEventListener('click', async () => {
  if (!viecDangLam) return;
  const b = $('htOk'); b.disabled = true; const nhan = b.textContent; b.textContent = 'Đang xử lý…';
  $('htLoi').textContent = '';
  try {
    if (viecDangLam.viec === 'them') {
      await goiQT({
        viec: 'them',
        email: $('fEmail').value, matKhau: $('fMk').value,
        ten: $('fTen').value, vietTat: $('fVt').value, vaiTro: $('fVaiTro').value,
      });
      bao('Đã tạo tài khoản.', 'ok');
    } else {
      await goiQT({ viec: 'doiMatKhau', id: viecDangLam.id, matKhau: $('fMk').value });
      bao('Đã đổi mật khẩu.', 'ok');
    }
    dongPopup(); await lamMoi();
  } catch (e) { $('htLoi').textContent = e.message; }
  finally { b.disabled = false; b.textContent = nhan; }
});

/* ── Vào lại bằng token cũ ───────────────────────────────────────────────────────────────── */
(async () => {
  const t = localStorage.getItem(KHOA_TOKEN);
  if (!t) return;
  TOKEN = t;
  try { await vaoTrong(); } catch { TOKEN = null; }
})();
