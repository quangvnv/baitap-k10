/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TRANG LÀM BÀI CỦA HỌC VIÊN (§41)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   Trang này CHỈ hiển thị + thu bài làm. KHÔNG chấm, KHÔNG biết đáp án — mọi thứ đó ở Edge
   Function `nop` (§41.1). Mở DevTools cũng không tìm thấy đáp án ở đâu.

   ⚠ KHÔNG render slide ở đây: app đã render sẵn (rồi SCRUB sạch đáp án — ChamDiem.bocHtml) và lưu
     HTML vào bai_tap.de.slides[i].html ⇒ trang chỉ gán innerHTML rồi để engine.js lo tương tác.
     Nhờ vậy KHÔNG có bản sao thứ hai của renderSlide phải giữ khớp (bài học §32.4).

   ⚠ MỖI SLIDE GIỮ KHUNG DOM RIÊNG, KHÔNG vẽ lại khi chuyển qua chuyển lại. Bản đầu gán
     `innerHTML = sl.html` mỗi lần chuyển slide ⇒ quay lại slide cũ là MẤT SẠCH bài đang làm.
     Với nhóm trắc nghiệm còn cứu được bằng cách nhớ mảng đáp án, nhưng với KÉO-THẢ / Ô CHỮ thì
     không: vị trí từng chip, từng chữ trong lưới không dựng lại từ một mảng số được. Nên: dựng
     khung một lần rồi ẩn/hiện (`.an`) — trạng thái tương tác tự nó còn nguyên.

   ⚠ HÀNG ĐỢI KHI MẤT MẠNG (§41.8 — bắt buộc có): Wi-Fi lớp học không tin cậy được. Nộp hỏng thì
     bài làm nằm trong localStorage và tự gửi lại khi có mạng; học viên không mất bài.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

const KHOA_MA_HV = 'bt_ma_hv';          // nhớ mã học viên, buổi sau chỉ gõ mã phiên
const KHOA_HANG_DOI = 'bt_hang_doi';    // bài đã làm nhưng chưa gửi được

let PHIEN = null;      // { luotId, de, soCau, conLaiGiay, ... } — trả về từ batDau
let CHI_SO = 0;        // slide đang xem
let DONG_HO = null;    // id setInterval
let KET_QUA = null;    // kết quả server trả về (giữ để bấm "Xem lại bài")
const KHUNG = {};      // slideIdx → phần tử DOM của slide đó (dựng một lần, sau đó chỉ ẩn/hiện)

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
/* engine.js trích từ app có gọi toast()/mirrorPush() — cấp bản thay thế (cùng cách §32.24.1 làm). */
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
  CHI_SO = 0; KET_QUA = null;
  $('lopSlide').innerHTML = '';
  Object.keys(KHUNG).forEach(k => delete KHUNG[k]);
  $('menuTen').textContent = (PHIEN && PHIEN.ten) || 'Bài tập';
  veSlide();
  if (PHIEN.khach) bao('Mã của bạn không có trong danh sách lớp — vẫn làm bài được, điểm ghi dạng khách.', 'nhac');
  if (PHIEN.conLaiGiay != null) chayDongHo(PHIEN.conLaiGiay);
}

function slides() { return (PHIEN && PHIEN.de && PHIEN.de.slides) || []; }
function layoutCua(i) { const s = slides()[i]; return (s && s.layout) || ''; }
function coBaiTap(i) { return ChamDiem.LAYOUT_CO_BAI.indexOf(layoutCua(i)) >= 0; }

/* Dựng khung DOM của slide (một lần duy nhất) rồi gắn engine tương tác. */
function khungCua(i) {
  if (KHUNG[i]) return KHUNG[i];
  const sl = slides()[i];
  const d = document.createElement('div');
  d.className = 'khung an';
  d.innerHTML = (sl && sl.html) || '<div class="sl"><p>Slide trống</p></div>';
  /* ⚠ Nút "Chấm điểm" của app phải BỎ — trên web chỉ có "Nộp bài" MỘT LẦN cho cả deck (§41.9),
     và hàm *Submit của app cần đáp án trong DOM, thứ đã bị scrub sạch.
     ⚠ `.sl-clock` (đồng hồ góc phải header slide) cũng BỎ: app có ticker cập nhật 15 s/lần
     (baigiang-soan.js), trang web KHÔNG có ⇒ nó đứng chết ở giờ lúc GV bấm đẩy bài lên, học
     viên nhìn tưởng đồng hồ hỏng. */
  d.querySelectorAll('.sl-check, .rmcq-submit, .sl-clock').forEach(b => b.remove());
  $('lopSlide').appendChild(d);
  ganEngine(d);
  KHUNG[i] = d;
  return d;
}

/* Engine kéo-thả / ô chữ của app (engine.js). Mỗi hàm tự dò lớp `.*-live` của layout tương ứng
   và tự đánh dấu đã gắn, nên gọi thừa cũng vô hại — không cần rẽ nhánh theo layout ở đây. */
function ganEngine(root) {
  [window.wireWordWeb, window.wireKp7, window.wireReorder, window.wireMatching]
    .forEach(f => { if (typeof f === 'function') { try { f(root); } catch (e) { console.warn(e); } } });
}

function veSlide() {
  const ds = slides();
  Object.keys(KHUNG).forEach(k => KHUNG[k].classList.add('an'));
  khungCua(CHI_SO).classList.remove('an');
  $('dauCau').textContent = 'Slide ' + (CHI_SO + 1) + '/' + ds.length;
  $('btTruoc').disabled = CHI_SO === 0;
  $('btSau').disabled = CHI_SO >= ds.length - 1;
  veMucLuc();
  vuaKhung();
}

/* ── SCALE slide cho VỪA vùng trống ───────────────────────────────────────────────────────
   Slide của app là khung CỨNG 960×540. Trước đây trang web để nguyên cỡ gốc (biến `--ty-le`
   khai trong CSS nhưng KHÔNG có gì đặt nó) ⇒ màn rộng thì slide bé tí giữa khoảng trắng, màn
   vừa thì bị cắt. Nay tính tỉ lệ theo đúng chỗ còn lại.
   ⚠ `transform` KHÔNG đổi hộp bố cục ⇒ phải đặt kích thước THẬT cho khung ngoài, nếu không
     khung 960×540 vẫn đòi chỗ và `.san` đẻ thanh cuộn dù nhìn đã vừa. Cùng cách `fitScale()`
     của trang tự học (§32.24.1) đang dùng. */
function vuaKhung() {
  const san = $('sanKhau'), khung = $('khungTyLe'), lop = $('lopSlide');
  if (!san || !khung || !lop) return;
  if (window.matchMedia('(max-width: 700px)').matches) {   // màn hẹp: bỏ khung cứng (§41.7)
    khung.style.width = khung.style.height = '';
    lop.style.transform = '';
    return;
  }
  const cs = getComputedStyle(san);
  const w = san.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 80; // 80 = chỗ cho 2 nút ‹ ›
  const h = san.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
  const sc = Math.max(0.3, Math.min(Math.max(120, w) / 960, Math.max(120, h) / 540, 2));
  khung.style.width = Math.round(960 * sc) + 'px';
  khung.style.height = Math.round(540 * sc) + 'px';
  lop.style.transform = 'scale(' + sc + ')';
}
window.addEventListener('resize', vuaKhung);

/* Mục lục slide bên menu trái — THAY dải chấm tiến độ cũ. ✓ = đã làm xong · ○ = còn dở. */
function veMucLuc() {
  const el = $('dsSlide');
  if (!el) return;
  el.innerHTML = slides().map((sl, i) => {
    const co = coBaiTap(i), xong = daLamXong(i);
    const tt = !co ? '' : (xong ? '<span class="sl-muc-tt xong">✓</span>' : '<span class="sl-muc-tt dang">○</span>');
    return '<button type="button" class="sl-muc' + (i === CHI_SO ? ' nay' : '') + '" data-i="' + i + '">'
      + '<span class="sl-muc-so">' + (i + 1) + '.</span>'
      + '<span class="sl-muc-ten">' + tenSlide(sl, i) + '</span>' + tt + '</button>';
  }).join('');
}
/* Tên hiển thị trong mục lục = tiêu đề slide nếu có, không thì "Slide n".
   ⚠ Đọc từ CHÍNH HTML đã render (app không gửi kèm tiêu đề rời) — dựng DOM tạm để lấy chữ,
     KHÔNG regex: tiêu đề có thể chứa thẻ con (<b>, <br>…). */
function tenSlide(sl, i) {
  try {
    const d = document.createElement('div');
    d.innerHTML = (sl && sl.html) || '';
    const t = d.querySelector('.sl-head-txt, .sl-title');
    const chu = t ? (t.textContent || '').trim() : '';
    if (chu) return chu.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  } catch (e) { /* bỏ qua */ }
  return 'Slide ' + (i + 1);
}
$('dsSlide').addEventListener('click', (e) => {
  const b = e.target.closest('.sl-muc');
  if (!b) return;
  CHI_SO = Number(b.dataset.i) || 0;
  dongMenu();
  veSlide();
});

/* ── Ngăn kéo menu (chỉ màn hẹp) ─────────────────────────────────────────────────────────── */
function moMenu(on) {
  $('menuTrai').classList.toggle('mo', on);
  $('menuNen').classList.toggle('mo', on);
}
const dongMenu = () => moMenu(false);
$('btMenu').addEventListener('click', () => moMenu(!$('menuTrai').classList.contains('mo')));
$('menuNen').addEventListener('click', dongMenu);

/* Bài làm của MỘT slide — đọc THẲNG từ khung DOM của nó (khung luôn còn, xem đầu file). */
function baiLamCua(i) {
  if (!coBaiTap(i) || !KHUNG[i]) return null;
  return ChamDiem.thuHoach(KHUNG[i].querySelector('.sl') || KHUNG[i], layoutCua(i));
}
function daLamXong(i) {
  if (!coBaiTap(i)) return true;                 // slide chỉ để đọc
  if (!KHUNG[i]) return false;                   // chưa mở tới ⇒ chưa làm
  return ChamDiem.soCauChuaLam(baiLamCua(i), layoutCua(i)) === 0;
}

function chuyen(buoc) {
  const ds = slides();
  CHI_SO = Math.max(0, Math.min(ds.length - 1, CHI_SO + buoc));
  veSlide();
}
$('btTruoc').addEventListener('click', () => chuyen(-1));
$('btSau').addEventListener('click', () => chuyen(1));
document.addEventListener('keydown', e => {
  if ($('manBai').classList.contains('an')) return;
  if (e.key === 'Escape') { dongMenu(); return; }
  /* ⚠ Ô chữ và ô điền từ dùng phím mũi tên để đi trong lưới — đừng cướp mất. */
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if (e.key === 'ArrowLeft') chuyen(-1);
  if (e.key === 'ArrowRight') chuyen(1);
});
/* Bấm/thả chuột trong slide → cập nhật dấu ✓ trong mục lục (chọn đáp án, thả chip, gõ ô chữ). */
['click', 'pointerup', 'input', 'change'].forEach(ev =>
  $('sanKhau').addEventListener(ev, () => setTimeout(veMucLuc, 0)));

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
  const ds = slides();
  const baiLam = [];
  let conThieu = 0;
  ds.forEach((sl, i) => {
    if (!coBaiTap(i)) return;
    khungCua(i);                        // slide chưa mở tới vẫn phải dựng để đếm đúng số câu còn thiếu
    const bl = baiLamCua(i) || [];
    conThieu += ChamDiem.soCauChuaLam(bl, layoutCua(i));
    baiLam.push({ slideIdx: i, baiLam: bl });
  });
  veSlide();                            // khungCua() ở trên có thể vừa dựng thêm khung → ẩn lại cho đúng

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
  KET_QUA = kq;
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
  // Nút "Xem lại bài" chỉ có nghĩa khi GV cho xem đáp án (server mới gửi khóa về).
  hien('btXemLai', !!(kq && kq.dapAn));
}

/* Xem lại bài đã chấm — tô xanh/đỏ ngay trên chính khung slide học viên vừa làm.
   ⚠ Chỉ chạy được khi server GỬI KHÓA ĐÁP ÁN về (answer_visibility ≠ NONE). Máy học viên KHÔNG
     tự quyết định chuyện hé lộ: không có khóa thì không có gì để tô. */
$('btXemLai').addEventListener('click', () => {
  const theoSlide = (KET_QUA && KET_QUA.dapAn) || null;
  if (!theoSlide) return;
  slides().forEach((sl, i) => {
    const da = theoSlide[i];
    if (!da || !KHUNG[i]) return;
    const el = KHUNG[i].querySelector('.sl') || KHUNG[i];
    const kq = ChamDiem.soDapAn(sl.layout, baiLamCua(i), da);
    ChamDiem.toMau(el, sl.layout, kq, { dapAn: da });
  });
  hien('manXong', false); hien('manBai', true);
  $('btNop').textContent = 'Đã nộp';
  bao('Bài đã chấm — xanh là đúng, đỏ là sai.', 'ok');
});

$('btVeDau').addEventListener('click', () => {
  PHIEN = null; KET_QUA = null;
  $('lopSlide').innerHTML = '';
  Object.keys(KHUNG).forEach(k => delete KHUNG[k]);
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
  if (PHIEN && !KET_QUA && $('manBai') && !$('manBai').classList.contains('an')) { e.preventDefault(); e.returnValue = ''; }
});
