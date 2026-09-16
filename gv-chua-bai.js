/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CHỮA BÀI — chiếu lên bảng, đi từng câu, hiện đáp án đúng + phân bố lựa chọn của cả lớp.
   Mở từ nút "Chữa bài" ở chi tiết phiên (gv.html). Hoàn toàn CHỈ-ĐỌC.

   ⚠ CHỈ CHỦ BÀI TẬP (và CB quản trị) dùng được — không phải chọn lựa giao diện mà là RLS:
     policy `da_chu` trên `bai_tap_dap_an` cố ý KHÔNG cho cả bài đã chia sẻ đọc đáp án ("chia sẻ
     là để dạy, không phải để xem đáp án" — web/sql/01-schema.sql). Nút mờ kèm lý do thay vì để
     GV bấm vào rồi nhận bảng trống không hiểu vì sao.

   ⚠ PHÂN BỐ LỰA CHỌN chỉ có với 4 layout trắc nghiệm (reading-mcq · mcq-list · quiz ·
     spk-dialogue) — các layout khác không có "phương án" để chia phần trăm, nên chỉ hiện
     "N/M học viên làm đúng" (đã chốt với người dùng 2026-09-16).

   ⚠ KHÔNG tự đếm câu theo kiểu riêng: đơn vị "câu" lấy NGUYÊN của `ChamDiem` (§41.6) qua
     `chamDeck().viTri` — cùng đơn vị với cột "Từng câu" trên bảng theo dõi và với `luot.qs`.
     Tự đếm lại là đẻ ra con số thứ hai lệch với mọi chỗ khác mà không ai nhìn ra.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { api, esc, $, hien } = window.WebGV;

  /* 4 layout dùng chung markup .question-item + .option-item[data-oi] (§32.2) */
  const LAYOUT_TN = ['reading-mcq', 'mcq-list', 'quiz', 'spk-dialogue'];
  const TEN_LAYOUT = {
    'reading-mcq': 'Đọc hiểu · trắc nghiệm', 'mcq-list': 'Trắc nghiệm', 'quiz': 'Trắc nghiệm',
    'spk-dialogue': 'Hoàn thành hội thoại', 'spk-reading-part3': 'Đọc hiểu Đúng/Sai',
    'reading-cloze': 'Điền chỗ trống (chọn)', 'ket-reading-part7': 'Điền từ vào đoạn',
    'gap-fill': 'Điền từ (kéo thả)', 'pic-match': 'Nối từ với hình', 'word-web': 'Sơ đồ từ',
    'word-select': 'Chọn mục từ', 'reorder': 'Sắp xếp thứ tự', 'matching': 'Nối cột',
    'word-choice': 'Chọn phương án đúng', 'crossword': 'Ô chữ',
  };

  let CAU = [];          // danh sách câu đã tổng hợp
  let I = 0;             // câu đang xem
  let HIEN_DA = true;    // có hiện đáp án đúng không

  /* ── Mở màn chữa bài ─────────────────────────────────────────────────────────────────────── */
  async function mo(p) {
    if (!p) return;
    CAU = []; I = 0; HIEN_DA = true;
    hien('manCT', false); hien('manCB', true);
    $('cbTen').textContent = (p.bai_tap ? p.bai_tap.ten : 'Bài tập') + ' · ' + p.ma_lop;
    $('cbDai').innerHTML = '';
    $('cbThan').innerHTML = '<p class="trong">Đang tải…</p>';
    $('cbSo').textContent = '—';

    let de, khoa, luot;
    try {
      /* 3 lời gọi song song. `de` và `dap_an` nằm ở 2 bảng khác nhau CÓ CHỦ Ý (§41.3) — đáp án
         không bao giờ đi cùng đề xuống máy học viên. */
      [de, khoa, luot] = await Promise.all([
        api('/rest/v1/bai_tap?select=de&id=eq.' + p.bai_tap_id),
        api('/rest/v1/bai_tap_dap_an?select=dap_an&bai_tap_id=eq.' + p.bai_tap_id),
        api('/rest/v1/luot?select=ma_hv,lan,bai_lam,qs,diem,nop_luc&phien_id=eq.' + p.id
          + '&nop_luc=not.is.null&order=lan.asc'),
      ]);
    } catch (e) { loi(e.message); return; }

    const slides = (de && de[0] && de[0].de && de[0].de.slides) || [];
    const theoSlide = (khoa && khoa[0] && khoa[0].dap_an && khoa[0].dap_an.theoSlide) || null;
    if (!slides.length) { loi('Không đọc được nội dung đề của bài tập này.'); return; }
    if (!theoSlide) {
      /* RLS trả về mảng RỖNG chứ không báo lỗi khi không có quyền — phải tự nhận ra và nói rõ,
         nếu không màn hình chỉ hiện "0 câu" và trông y như bài chưa có câu hỏi. */
      loi('Không đọc được đáp án của bài tập này. Đáp án chỉ chủ bài tập và cán bộ quản trị xem được.');
      return;
    }

    /* Mỗi học viên chỉ tính LƯỢT CAO NHẤT (§41.9) — đúng con số đang hiện ở mọi bảng khác */
    const tot = {};
    luot.forEach(l => { if (!tot[l.ma_hv] || (+l.diem) > (+tot[l.ma_hv].diem)) tot[l.ma_hv] = l; });
    const bai = Object.values(tot);

    try { CAU = tongHop(slides, theoSlide, bai); }
    catch (e) { loi(e.message); return; }

    if (!CAU.length) { loi('Bài tập này không có câu nào chấm được.'); return; }
    $('cbSoHV').textContent = bai.length ? bai.length + ' học viên đã nộp' : 'Chưa ai nộp bài';
    veDai(); ve();
  }

  function loi(chu) {
    $('cbThan').innerHTML = '<p class="trong">' + esc(chu) + '</p>';
    $('cbSo').textContent = '—';
    $('cbSoHV').textContent = '';
    CAU = [];
  }

  /* ── Tổng hợp: mỗi câu một dòng, kèm phân bố lựa chọn ────────────────────────────────────── */
  function tongHop(slides, theoSlide, bai) {
    const CD = window.ChamDiem;
    const map = new Map();                       // "slideIdx:cau" → bản ghi
    const lay = (v) => {
      const k = v.slideIdx + ':' + v.cau;
      let o = map.get(k);
      if (!o) {
        const sl = slides[v.slideIdx] || {};
        o = {
          slideIdx: v.slideIdx, cau: v.cau, layout: sl.layout || '',
          lam: 0, dung: 0, chon: new Map(),      // chỉ số phương án → số học viên chọn
        };
        map.set(k, o);
      }
      return o;
    };

    /* Lượt "rỗng" để có ĐỦ danh sách câu kể cả câu chưa ai làm.
       ⚠ word-web (kiểu `tapHop`) là ngoại lệ: số ô chấm được phụ thuộc chính bài làm nên lượt
         rỗng cho ra 0 câu — vì thế còn gộp thêm khóa từ bài của từng học viên bên dưới. */
    CD.chamDeck(slides, [], theoSlide).viTri.forEach(lay);

    bai.forEach(l => {
      const r = CD.chamDeck(slides, l.bai_lam || [], theoSlide);
      r.viTri.forEach((v, j) => {
        const o = lay(v);
        o.lam++;
        if (r.qs[j]) o.dung++;
      });
    });

    const ds = [...map.values()].sort((a, b) => a.slideIdx - b.slideIdx || a.cau - b.cau);

    /* Với layout trắc nghiệm: gắn thêm câu hỏi, các phương án và phân bố lựa chọn.
       Chỉ số ô THÔ trong `answers` ≠ số thứ tự câu khi có ô không tính điểm, nên phải dựng bản đồ
       riêng thay vì coi hai con số là một. */
    slides.forEach((sl, si) => {
      if (LAYOUT_TN.indexOf(sl.layout) < 0) return;
      const da = theoSlide[si];
      if (!da || da.kieu !== 'chiSo') return;
      const hoi = docCauHoi(sl.html);            // đọc từ HTML đã bóc đáp án
      let cau = 0;
      da.answers.forEach((a, oThuc) => {
        if (a === null) return;                  // không phải một câu — không tăng số thứ tự
        const o = map.get(si + ':' + cau);
        cau++;
        if (!o) return;
        o.dapAn = a;
        o.hoi = hoi[oThuc] || null;
        bai.forEach(l => {
          const bl = (l.bai_lam || []).find(x => x && x.slideIdx === si);
          const v = bl && Array.isArray(bl.baiLam) ? bl.baiLam[oThuc] : null;
          const k = (v === null || v === undefined || v === '') ? 'trong' : String(v);
          o.chon.set(k, (o.chon.get(k) || 0) + 1);
        });
      });
    });

    ds.forEach((o, i) => { o.stt = i + 1; });
    return ds;
  }

  /* Đọc câu hỏi + phương án từ HTML của slide (HTML này ĐÃ bị bóc đáp án — chỉ còn chữ). */
  function docCauHoi(html) {
    const hop = document.createElement('div');
    hop.innerHTML = String(html || '');
    return [...hop.querySelectorAll('.question-item')].map(it => {
      const t = it.querySelector('.question-text');
      const pa = [...it.querySelectorAll('.option-item')].map(o => {
        const sp = o.querySelector('span');
        return { oi: +o.dataset.oi, chu: (sp ? sp.textContent : o.textContent).trim() };
      });
      /* spk-dialogue để câu hỏi ở khối hội thoại bên trái, không có .question-text */
      const dl = it.querySelector('.spk-dialog');
      return { chu: (t ? t.textContent : (dl ? dl.textContent : '')).trim(), pa };
    });
  }

  /* ── Dải ô từng câu — bấm để nhảy, màu theo % lớp đúng ───────────────────────────────────── */
  function veDai() {
    $('cbDai').innerHTML = CAU.map((o, i) => {
      const pc = o.lam ? Math.round(o.dung / o.lam * 100) : null;
      const mau = pc === null ? ' chua' : (pc < 50 ? ' kem' : (pc < 80 ? ' vua' : ''));
      return '<button class="cb-o' + mau + '" type="button" data-i="' + i + '"'
        + ' title="Câu ' + (i + 1) + (pc === null ? ' — chưa ai làm' : ' — ' + pc + '% đúng') + '">'
        + (i + 1) + '</button>';
    }).join('');
    $('cbDai').querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => { I = +b.dataset.i; ve(); };
    });
  }

  /* ── Vẽ một câu ──────────────────────────────────────────────────────────────────────────── */
  function ve() {
    if (!CAU.length) return;
    I = Math.max(0, Math.min(I, CAU.length - 1));
    const o = CAU[I];
    $('cbSo').textContent = 'Câu ' + (I + 1) + '/' + CAU.length;
    $('cbTruoc').disabled = I === 0;
    $('cbSau').disabled = I === CAU.length - 1;
    $('cbAn').textContent = HIEN_DA ? 'Ẩn đáp án' : 'Hiện đáp án';
    $('cbDai').querySelectorAll('[data-i]').forEach(b => b.classList.toggle('dang', +b.dataset.i === I));

    const pc = o.lam ? Math.round(o.dung / o.lam * 100) : 0;
    const nhan = TEN_LAYOUT[o.layout] || o.layout || '—';
    let h = '<div class="cb-dau"><span class="cb-nhan">' + esc(nhan)
      + ' · slide ' + (o.slideIdx + 1) + '</span>'
      + '<span class="cb-tk' + (o.lam && pc < 50 ? ' kem' : '') + '">'
      + o.dung + '/' + o.lam + ' học viên đúng' + (o.lam ? ' · ' + pc + '%' : '') + '</span></div>';

    if (o.hoi) {
      h += '<div class="cb-hoi">' + esc(o.hoi.chu || '(câu hỏi không có chữ)') + '</div>';
      h += '<div class="cb-pa">' + o.hoi.pa.map(p => phuongAn(o, p)).join('') + '</div>';
      const trong = o.chon.get('trong') || 0;
      if (trong) h += '<p class="cb-phu">Không trả lời: ' + trong + '</p>';
    } else {
      /* Layout không phải trắc nghiệm: không có "phương án" để chia phần trăm (đã chốt) */
      h += '<div class="cb-thanh"><i style="width:' + pc + '%"></i></div>'
        + '<p class="cb-phu">Dạng bài này không có phương án để thống kê lựa chọn — '
        + 'mở bài giảng trong ứng dụng để chữa chi tiết.</p>';
    }
    $('cbThan').innerHTML = h;
  }

  function phuongAn(o, p) {
    const n = o.chon.get(String(p.oi)) || 0;
    const pc = o.lam ? Math.round(n / o.lam * 100) : 0;
    const dung = HIEN_DA && p.oi === o.dapAn;
    return '<div class="cb-dong' + (dung ? ' dung' : '') + '">'
      + '<span class="cb-dau-tich">' + (dung ? '✓' : '') + '</span>'
      + '<span class="cb-chu">' + esc(p.chu) + '</span>'
      + '<span class="cb-bar"><i style="width:' + pc + '%"></i></span>'
      + '<span class="cb-dem">' + n + '/' + o.lam + '</span>'
      + '<span class="cb-pc">' + pc + '%</span></div>';
  }

  /* ── Điều hướng ──────────────────────────────────────────────────────────────────────────── */
  function di(b) { if (!CAU.length) return; I += b; ve(); }
  $('cbTruoc').addEventListener('click', () => di(-1));
  $('cbSau').addEventListener('click', () => di(1));
  $('cbAn').addEventListener('click', () => { HIEN_DA = !HIEN_DA; ve(); });
  $('cbVe').addEventListener('click', () => window.WebGV.veChiTiet());

  /* Phím ← → để GV bấm từ xa khi đang đứng lớp. Chỉ bắt khi màn chữa bài đang mở và con trỏ
     không nằm trong ô nhập nào (trang có nhiều ô lọc ở màn khác). */
  document.addEventListener('keydown', (e) => {
    if ($('manCB').classList.contains('an')) return;
    const t = e.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { di(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { di(1); e.preventDefault(); }
    else if (e.key === 'Escape') window.WebGV.veChiTiet();
  });

  window.ChuaBai = { mo };
})();
