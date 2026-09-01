/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TRANG LÀM BÀI CỦA HỌC VIÊN (§41)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   Trang này CHỈ hiển thị + thu bài làm. KHÔNG chấm, KHÔNG biết đáp án — mọi thứ đó ở Edge
   Function `nop` (§41.1). Mở DevTools cũng không tìm thấy đáp án ở đâu.

   ⚠ KHÔNG render slide ở đây: app đã render sẵn (từ slots ĐÃ bóc đáp án) và lưu HTML vào
     bai_tap.de.slides[i].html ⇒ trang chỉ gán innerHTML rồi để engine.js lo tương tác. Nhờ vậy
     KHÔNG có bản sao thứ hai của renderSlide phải giữ khớp (bài học §32.4).

   ⚠ HÀNG ĐỢI KHI MẤT MẠNG (§41.8 — bắt buộc có): Wi-Fi lớp học không tin cậy được. Nộp hỏng thì
     bài làm nằm trong localStorage và tự gửi lại khi có mạng; học viên không mất bài.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

const KHOA_MA_HV = 'bt_ma_hv';          // nhớ mã học viên, buổi sau chỉ gõ mã phiên
const KHOA_HANG_DOI = 'bt_hang_doi';    // bài đã làm nhưng chưa gửi được

let PHIEN = null;      // { luotId, de, soCau, conLaiGiay, ... } — trả về từ batDau
let CHI_SO = 0;        // slide đang xem
let DONG_HO = null;    // id setInterval

const $ = (id) => document.getElementById(id);
const hien = (id, on) => $(id).classList.toggle('an', !on);

/* ── Băng thông báo (đè mép trên, đồng bộ mirror-host §32.4) ─────────────────────────────── */
let bannerTimer = null;
function bao(chu, loai) {
  const b = $('banner');
  b.textContent = chu;
  b.className = 'banner' + (loai ? ' banner--' + loai : '');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('an'), 4000);
}
/* engine.js trích từ app có gọi toast() — cấp bản thay thế (cùng cách §32.24.1 làm). */
window.toast = (s) => bao(s);
window.mirrorPush = () => {};

/* ── Gọi Edge Function ───────────────────────────────────────────────────────────────────── */
async function goiFn(ten, than) {
  const r = await fetch(CAU_HINH.fnUrl(ten), {
    method: 'POST',
    /* ⚠ PHẢI có CẢ `apikey` LẪN `Authorization` — Edge Function của Supabase mặc định đòi JWT,
       thiếu Authorization là 401 "Missing authorization header". Ở đây dùng chính `anon` key làm
       JWT (nó vốn là một JWT hợp lệ mang role=anon) vì học viên KHÔNG có tài khoản (§41.4).
       Không cấp quyền gì thêm: RLS chặn sạch `anon`, và mọi việc đi qua Edge Function. */
    headers: {
      'content-type': 'application/json',
      apikey: CAU_HINH.anonKey,
      Authorization: 'Bearer ' + CAU_HINH.anonKey,
    },
    body: JSON.stringify(than),
  });
  const kq = await r.json().catch(() => ({ loi: 'Máy chủ trả về dữ liệu không đọc được' }));
  if (!r.ok) throw new Error(kq.loi || ('Lỗi ' + r.status));
  return kq;
}

/* ── MÀN 1: vào bài ──────────────────────────────────────────────────────────────────────── */
$('oMaHV').value = localStorage.getItem(KHOA_MA_HV) || '';
$('oMaPhien').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });

$('btVao').addEventListener('click', async () => {
  const maPhien = $('oMaPhien').value.trim();
  const maHV = $('oMaHV').value.trim().toLowerCase();
  $('vaoLoi').textContent = '';
  if (!/^\d{6}$/.test(maPhien)) { $('vaoLoi').textContent = 'Mã phiên phải là 6 chữ số'; return; }
  if (!maHV) { $('vaoLoi').textContent = 'Chưa nhập mã học viên'; return; }

  $('btVao').disabled = true;
  $('btVao').textContent = 'Đang vào…';
  try {
    PHIEN = await goiFn('batDau', { maPhien, maHV });
    PHIEN.maHV = maHV;
    localStorage.setItem(KHOA_MA_HV, maHV);
    vaoLamBai();
  } catch (e) {
    $('vaoLoi').textContent = e.message;
  } finally {
    $('btVao').disabled = false;
    $('btVao').textContent = 'Vào làm bài';
  }
});

/* ── MÀN 2: làm bài ──────────────────────────────────────────────────────────────────────── */
function vaoLamBai() {
  hien('manVao', false); hien('manBai', true); hien('manXong', false);
  CHI_SO = 0;
  veSlide();
  if (PHIEN.khach) bao('Mã của bạn không có trong danh sách lớp — vẫn làm bài được, điểm ghi dạng khách.', 'nhac');
  if (PHIEN.conLaiGiay != null) chayDongHo(PHIEN.conLaiGiay);
}

function slides() { return (PHIEN.de && PHIEN.de.slides) || []; }

function veSlide() {
  const ds = slides();
  const sl = ds[CHI_SO];
  $('sanKhau').innerHTML = (sl && sl.html) || '<div class="sl"><p>Slide trống</p></div>';
  $('dauCau').textContent = 'Slide ' + (CHI_SO + 1) + '/' + ds.length;
  $('btTruoc').disabled = CHI_SO === 0;
  $('btSau').disabled = CHI_SO >= ds.length - 1;
  veDen();
  // ⚠ Nút "Chấm điểm" của app (nếu app render kèm) phải BỎ — trên web chỉ có "Nộp bài" một lần
  // cho cả deck (§41.9). Để lại sẽ gọi rmcqSubmit của app, mà hàm đó cần đáp án trong DOM.
  $('sanKhau').querySelectorAll('.sl-check, .rmcq-submit').forEach(b => b.remove());
}

/* Đèn báo tiến độ: đặc = slide đã làm xong hết câu */
function veDen() {
  $('denBao').innerHTML = slides().map((sl, i) => {
    const xong = daLamXong(i);
    return '<i class="cham' + (i === CHI_SO ? ' nay' : '') + (xong ? ' xong' : '') + '"></i>';
  }).join('');
}

/* Bài làm của MỘT slide. Đọc từ DOM nếu đang xem, còn lại lấy từ bộ nhớ tạm. */
const NHO = {};   // slideIdx → baiLam
function thuSlideDangXem() {
  const sl = slides()[CHI_SO];
  if (!sl) return;
  const el = $('sanKhau').querySelector('.sl') || $('sanKhau');
  const bl = ChamDiem.thuHoach(el, sl.layout);
  if (bl) NHO[CHI_SO] = bl;
}
function daLamXong(i) {
  const sl = slides()[i];
  if (!sl || ChamDiem.LAYOUT_CO_BAI.indexOf(sl.layout) < 0) return true;   // slide không có bài
  const bl = (i === CHI_SO) ? (() => { thuSlideDangXem(); return NHO[i]; })() : NHO[i];
  return !!bl && ChamDiem.soCauChuaLam(bl) === 0;
}

function chuyen(buoc) {
  thuSlideDangXem();
  const ds = slides();
  CHI_SO = Math.max(0, Math.min(ds.length - 1, CHI_SO + buoc));
  veSlide();
}
$('btTruoc').addEventListener('click', () => chuyen(-1));
$('btSau').addEventListener('click', () => chuyen(1));
document.addEventListener('keydown', e => {
  if ($('manBai').classList.contains('an')) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') chuyen(-1);
  if (e.key === 'ArrowRight') chuyen(1);
});
// bấm chọn đáp án → cập nhật đèn báo
$('sanKhau').addEventListener('click', () => setTimeout(veDen, 0));

/* ── Đồng hồ ─────────────────────────────────────────────────────────────────────────────── */
function chayDongHo(giay) {
  clearInterval(DONG_HO);
  let conLai = giay;
  const ve = () => {
    const m = Math.floor(conLai / 60), s = conLai % 60;
    $('dauGio').textContent = '⏱ ' + m + ':' + String(s).padStart(2, '0');
    $('dauGio').classList.toggle('gap', conLai <= 60);
  };
  ve();
  DONG_HO = setInterval(() => {
    conLai--;
    if (conLai <= 0) {
      clearInterval(DONG_HO);
      $('dauGio').textContent = '⏱ hết giờ';
      bao('Hết giờ — đang nộp bài của bạn.', 'nhac');
      nop(true);
      return;
    }
    ve();
  }, 1000);
}

/* ── Nộp bài ─────────────────────────────────────────────────────────────────────────────── */
$('btNop').addEventListener('click', () => nop(false));

async function nop(tuDong) {
  thuSlideDangXem();
  const ds = slides();
  const baiLam = [];
  let conThieu = 0;
  ds.forEach((sl, i) => {
    if (ChamDiem.LAYOUT_CO_BAI.indexOf(sl.layout) < 0) return;
    const bl = NHO[i] || [];
    conThieu += ChamDiem.soCauChuaLam(bl.length ? bl : new Array(1).fill(null));
    baiLam.push({ slideIdx: i, baiLam: bl });
  });

  // Bắt làm hết mới nộp (§32.4) — trừ khi hết giờ, lúc đó nộp nguyên trạng
  if (!tuDong && conThieu > 0) {
    bao('Còn ' + conThieu + ' câu chưa làm — hãy làm hết rồi nộp.', 'nhac');
    return;
  }

  clearInterval(DONG_HO);
  $('btNop').disabled = true;
  $('btNop').textContent = 'Đang nộp…';
  const goi = { luotId: PHIEN.luotId, baiLam };
  try {
    const kq = await goiFn('nop', goi);
    xong(kq);
  } catch (e) {
    // ⚠ Mất mạng: KHÔNG để học viên mất bài. Cất vào hàng đợi, tự gửi lại khi có mạng.
    catVaoHangDoi(goi);
    xong(null, e.message);
  }
}

function xong(kq, loi) {
  hien('manBai', false); hien('manXong', true);
  if (kq) {
    $('xongDiem').textContent = kq.soDung + ' / ' + kq.tong;
    /* `qs` chỉ có khi GV cho xem đáp án. Khi answer_visibility = NONE, máy chủ CỐ Ý không gửi
       đúng/sai từng câu về (chống dò đáp án bằng cách nộp nhiều lượt) ⇒ chỉ hiện tổng điểm. */
    $('xongQs').innerHTML = (kq.qs || []).map(d => '<i class="' + (d ? 'd' : 's') + '"></i>').join('');
    $('xongNhan').textContent = kq.quaGio
      ? 'Bài nộp sau khi hết giờ, vẫn được ghi nhận.'
      : 'Giáo viên sẽ chữa bài trên lớp.';
  } else {
    $('xongDiem').textContent = '—';
    $('xongQs').innerHTML = '';
    $('xongNhan').textContent = 'Chưa gửi được (' + loi + '). Bài của bạn đã được lưu và sẽ tự gửi khi có mạng — đừng đóng trang.';
  }
}

$('btVeDau').addEventListener('click', () => {
  PHIEN = null;
  Object.keys(NHO).forEach(k => delete NHO[k]);
  hien('manXong', false); hien('manVao', true);
  $('oMaPhien').value = '';
  $('btNop').disabled = false;
  $('btNop').textContent = 'Nộp bài';
});

/* ── Hàng đợi gửi lại ────────────────────────────────────────────────────────────────────── */
function docHangDoi() {
  try { return JSON.parse(localStorage.getItem(KHOA_HANG_DOI) || '[]'); } catch { return []; }
}
function ghiHangDoi(ds) {
  try { localStorage.setItem(KHOA_HANG_DOI, JSON.stringify(ds)); } catch { /* hết chỗ — bỏ qua */ }
}
function catVaoHangDoi(goi) {
  const ds = docHangDoi();
  if (!ds.some(x => x.luotId === goi.luotId)) ds.push(goi);
  ghiHangDoi(ds);
}
async function guiLaiHangDoi() {
  const ds = docHangDoi();
  if (!ds.length) return;
  const conLai = [];
  for (const goi of ds) {
    try { await goiFn('nop', goi); }
    catch (e) {
      // 409 = lượt đã nộp rồi (gửi trùng) → bỏ khỏi hàng đợi, không giữ mãi
      if (!/đã nộp rồi/.test(e.message)) conLai.push(goi);
    }
  }
  ghiHangDoi(conLai);
  const daGui = ds.length - conLai.length;
  if (daGui > 0) bao('Đã gửi được ' + daGui + ' bài đang chờ.', 'ok');
}
window.addEventListener('online', guiLaiHangDoi);
guiLaiHangDoi();

/* Cảnh báo khi rời trang lúc đang làm dở */
window.addEventListener('beforeunload', e => {
  if (PHIEN && $('manBai') && !$('manBai').classList.contains('an')) { e.preventDefault(); e.returnValue = ''; }
});
