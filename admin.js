/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TAB "TÀI KHOẢN" của gv.html (§41.4) — CB cấp/khoá tài khoản giảng viên
   ──────────────────────────────────────────────────────────────────────────────────────────────
   ⚠ ĐÂY LÀ MỘT TAB, KHÔNG PHẢI MỘT TRANG. Trước đây là admin.html riêng, mỗi trang tự dựng lại
     phiên đăng nhập. Nay gộp vào gv.html vì cả hai dùng CHUNG token, chung CSS, chung vỏ trang.
     File này nạp SAU gv.js và mượn nguyên `window.WebGV` — TUYỆT ĐỐI không khai lại
     TOKEN/api/$/esc/bao ở cấp cao nhất: trùng tên với gv.js là SyntaxError, cả trang chết.

   ⚠ MỌI THAO TÁC ĐI QUA EDGE FUNCTION `quanTri`, KHÔNG gọi thẳng bảng: tạo tài khoản cần
     service_role, mà khoá đó không bao giờ được xuống trình duyệt (§41.3). Function tự kiểm
     người gọi có phải admin không — tab này chỉ là giao diện.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { api, bao, esc, $, hien } = window.WebGV;
  let DS = [];

  const goiQT = (than) => api('/functions/v1/quanTri', { method: 'POST', body: JSON.stringify(than) });

  /* ── Vẽ bảng ───────────────────────────────────────────────────────────────────────────── */
  function veBang() {
    $('tkBody').innerHTML = DS.map((x, i) => `<tr>
      <td class="giua mo-nhat">${i + 1}</td>
      <td class="ma">${esc(x.email)}</td>
      <td>${esc(x.ten)}${x.laToi ? ' <i class="nhan-khach">bạn</i>' : ''}</td>
      <td class="giua">${esc(x.viet_tat)}</td>
      <td class="giua">${x.vai_tro === 'admin' ? 'Quản trị' : 'Giảng viên'}</td>
      <td class="giua">${x.khoa ? '<span class="mo-nhat">Đã khoá</span>' : '<span class="xong">Hoạt động</span>'}</td>
      <td class="thao-tac">
        <button class="bt bt-nho" type="button" data-mk="${x.id}">Đổi mật khẩu</button>
        ${x.laToi ? '' : `<button class="bt bt-nho" type="button" data-khoa="${x.id}">${x.khoa ? 'Mở khoá' : 'Khoá'}</button>
        <button class="bt bt-nho bt-do" type="button" data-xoa="${x.id}">Xoá</button>`}
      </td></tr>`).join('');

    $('tkBody').querySelectorAll('[data-mk]').forEach(b => b.onclick = () => moDoiMatKhau(b.dataset.mk));
    $('tkBody').querySelectorAll('[data-khoa]').forEach(b => b.onclick = () => doiKhoa(b.dataset.khoa));
    $('tkBody').querySelectorAll('[data-xoa]').forEach(b => b.onclick = () => xoa(b.dataset.xoa));
  }

  async function lamMoi() {
    const kq = await goiQT({ viec: 'danhSach' });
    DS = kq.ds || [];
    veBang();
  }

  /* Gọi từ gv.js mỗi lần mở tab. Lỗi (vd không phải admin) thì báo và để bảng trống — đừng
     ném ra ngoài làm hỏng luôn việc chuyển tab. */
  async function mo() {
    try { await lamMoi(); }
    catch (e) { DS = []; veBang(); bao(e.message, 'nhac'); }
  }

  /* ── Khoá / xoá ────────────────────────────────────────────────────────────────────────── */
  async function doiKhoa(id) {
    const x = DS.find(y => y.id === id); if (!x) return;
    if (!confirm((x.khoa ? 'Mở khoá' : 'Khoá') + ' tài khoản ' + x.email + '?')) return;
    try { await goiQT({ viec: 'khoa', id, khoa: !x.khoa }); await lamMoi(); bao('Đã cập nhật.', 'ok'); }
    catch (e) { bao(e.message, 'nhac'); }
  }

  async function xoa(id) {
    const x = DS.find(y => y.id === id); if (!x) return;
    /* ⚠ bai_tap.chu_gv cascade ⇒ xoá giảng viên là mất luôn bài tập của họ. Cảnh báo rõ và
       khuyên dùng "Khoá" — khoá thì không đăng nhập được nữa nhưng dữ liệu còn nguyên. */
    if (!confirm('XOÁ VĨNH VIỄN tài khoản ' + x.email + '?\n\n'
      + 'Toàn bộ BÀI TẬP do người này tạo sẽ bị xoá theo và KHÔNG khôi phục được.\n\n'
      + 'Nếu chỉ muốn ngăn đăng nhập, hãy dùng "Khoá" thay vì "Xoá".')) return;
    try { await goiQT({ viec: 'xoa', id }); await lamMoi(); bao('Đã xoá tài khoản.', 'ok'); }
    catch (e) { bao(e.message, 'nhac'); }
  }

  /* ── Popup thêm / đổi mật khẩu ─────────────────────────────────────────────────────────── */
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
      <select id="fVaiTro" class="o" style="width:100%"><option value="gv">Giảng viên</option><option value="admin">Quản trị</option></select>
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

  window.QuanTri = { mo };
})();
