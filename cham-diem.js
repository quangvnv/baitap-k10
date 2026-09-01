/* ⚠⚠⚠ FILE TỰ SINH — ĐỪNG SỬA Ở ĐÂY ⚠⚠⚠
   Nguồn: src/shared/cham-diem.js
   Sửa ở nguồn rồi chạy: node tools/dong-bo-web.js   (§41.10) */
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CHẤM ĐIỂM BÀI TẬP — NGUỒN DUY NHẤT, CHẠY ĐƯỢC CẢ TRÌNH DUYỆT LẪN NODE (§41.2)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   VÌ SAO CÓ FILE NÀY: mô hình web (§41) chấm bài Ở SERVER để đáp án KHÔNG BAO GIỜ rời khỏi
   Firestore xuống máy học viên (bài học §41.1 — Quizizz/Wayground gửi đáp án xuống client nên bị
   moi; YourHomework thì không). Cloud Function chạy Node, player chạy trình duyệt ⇒ hàm so đáp án
   phải chạy được ở CẢ HAI mà KHÔNG đẻ ra bản sao thứ hai.

   BỐN LỚP — chỉ 2 lớp giữa là THUẦN (chạy được ở Node):
     bocDe(slide)          → { de, dapAn }   THUẦN   ← app gọi khi ĐẨY BÀI LÊN WEB
     thuHoach(sl)          → baiLam          DOM     ← máy học viên, lúc bấm Nộp bài
     soDapAn(...)          → ketQua          THUẦN   ← Cloud Function chấm  ★ TIM CỦA FILE NÀY
     toMau(sl, ketQua)     → (vẽ)            DOM     ← máy học viên, sau khi server trả kết quả

   ⚠ HAI LỚP THUẦN TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỤNG `document`/`window` — đụng là Cloud Function chết.
     Có test canh chuyện này: tools/kiem-tra-cham-diem.js

   ⚠ ĐƠN VỊ "CÂU" KHÔNG ĐƯỢC TỰ ĐỊNH NGHĨA LẠI (§41.6): dùng đúng quy ước `qs` của mirror LAN
     (§32.30) — mỗi layout đã tự quy định đơn vị câu của mình từ trước (word-select chỉ tính từ
     ĐÚNG, matching bỏ ô nhiễu, crossword mỗi Ô LƯỚI = 1 câu…). Sai chỗ này thì điểm trên web lệch
     với điểm trong lớp qua mirror LAN, mà lệch ÂM THẦM.

   ⚠ THỨ TỰ ĐÁP ÁN ĐÃ XÁO KHÔNG LÀM HỎNG VIỆC CHẤM: renderSlide xáo `optList` nhưng vẫn ghi
     `data-oi="<chỉ số GỐC>"` lên từng lựa chọn (baigiang-soan.js ~dòng 787). Học viên gửi về chỉ
     số GỐC ⇒ server so thẳng, KHÔNG cần gửi kèm bảng ánh xạ. Đây đúng là cơ chế `{id,text}` của
     YourHomework (§41.1). ĐỪNG đổi `data-oi` thành chỉ số sau khi xáo.

   TRẠNG THÁI: bản chạy thử (§41.8) mới phủ NHÓM TRẮC NGHIỆM — 'reading-mcq' · 'mcq-list' · 'quiz'
   (cùng dùng bộ hàm rmcq* nên chấm chung một nhánh). 11 layout còn lại: xem BẢNG CÒN THIẾU ở cuối.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // Node (Cloud Function)
  else root.ChamDiem = api;                                                 // trình duyệt (classic script)
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Layout đã hỗ trợ chấm trên web. Layout NGOÀI danh sách này vẫn hiển thị được nhưng không
     đóng góp câu nào vào điểm (slide bìa, một cột, pptx… cũng rơi vào đây — đúng ý đồ §41.6). */
  const LAYOUT_CO_BAI = ['reading-mcq', 'mcq-list', 'quiz'];

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     LỚP 1 — bocDe(slide) → { de, dapAn }            [THUẦN]
     Tách slide làm hai nửa: `de` gửi xuống máy học viên, `dapAn` ở lại Firestore (§41.3).
     ⚠ KHÔNG sửa slide gốc — app còn dùng chính đối tượng đó để trình chiếu trong lớp.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  function bocDe(slide) {
    const layout = slide && slide.layout;
    const S = (slide && slide.slots) || {};
    if (LAYOUT_CO_BAI.indexOf(layout) < 0) {
      return { de: deepCopy(slide), dapAn: null, soCau: 0 };   // slide không có bài tập
    }

    if (layout === 'quiz') {
      // quiz: S.options = [{t, correct}] — đáp án là CỜ `correct` nằm ngay trong option.
      const opts = S.options || [];
      const ansIdx = opts.findIndex(o => o && o.correct);
      const de = deepCopy(slide);
      // ⚠ phải xoá cờ `correct` khỏi TỪNG option, không chỉ xoá field cấp trên
      de.slots.options = opts.map(o => ({ t: (o && o.t) || '' }));
      return { de, dapAn: { kieu: 'quiz', answer: ansIdx }, soCau: ansIdx >= 0 ? 1 : 0 };
    }

    // reading-mcq / mcq-list: S.questions = [{stem, options:[chuỗi], answer:<chỉ số>, explanation}]
    const qs = S.questions || [];
    const de = deepCopy(slide);
    de.slots.questions = qs.map(q => ({
      stem: (q && q.stem) || '',
      options: (q && q.options) || []
      // ⚠ BỎ `answer` VÀ `explanation` — giải thích thường lộ luôn đáp án ("chọn A vì…")
    }));
    return {
      de,
      dapAn: {
        kieu: 'mcq',
        answers: qs.map(q => (q && typeof q.answer === 'number') ? q.answer : -1),
        explanations: qs.map(q => (q && q.explanation) || '')
      },
      soCau: qs.length
    };
  }

  /* bocDeck(slides) → { de, dapAn, soCau } — bóc CẢ DECK, đây là thứ app gọi khi đẩy bài lên web.
     `de`    = { slides: [...] }        → vào bảng `bai_tap.de`      (HV nhận được)
     `dapAn` = { theoSlide: [...|null] } → vào bảng `bai_tap_dap_an`  (HV KHÔNG BAO GIỜ nhận)
     ⚠ `theoSlide` phải giữ ĐÚNG chỉ số slide (slide không có bài tập = null) — `chamDeck` và Edge
       Function `nop` đều tra theo chỉ số này. Lọc bỏ phần tử null sẽ làm lệch toàn bộ bài chấm. */
  function bocDeck(slides) {
    const ds = slides || [], de = [], theoSlide = [];
    let soCau = 0;
    ds.forEach(sl => {
      const r = bocDe(sl);
      de.push(r.de); theoSlide.push(r.dapAn); soCau += r.soCau;
    });
    return { de: { slides: de }, dapAn: { theoSlide }, soCau };
  }

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     LỚP 3 — soDapAn(layout, baiLam, dapAn) → { dung:bool[], soDung, tong }     [THUẦN] ★
     Đây là toàn bộ phần "so đáp án" đã bóc khỏi 14 hàm *Submit của app. Mỗi layout thực chất chỉ
     một dòng (§41.2) — phần cồng kềnh của các hàm cũ là tô màu, nay nằm ở lớp 4.
     `baiLam` cho nhóm trắc nghiệm = mảng chỉ số GỐC học viên đã chọn; chưa chọn = null.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  function soDapAn(layout, baiLam, dapAn) {
    if (!dapAn) return { dung: [], soDung: 0, tong: 0 };
    const bl = Array.isArray(baiLam) ? baiLam : [];

    if (dapAn.kieu === 'quiz') {
      return ketQua([khop(bl[0], dapAn.answer)]);
    }
    if (dapAn.kieu === 'mcq') {
      return ketQua((dapAn.answers || []).map((a, i) => khop(bl[i], a)));
    }
    throw new Error('ChamDiem.soDapAn: chưa hỗ trợ kiểu "' + (dapAn.kieu || layout) + '"');
  }

  /* So sánh chỉ số lựa chọn: chuẩn hoá về số, mọi thứ không phải số hữu hạn → null (chưa trả lời).
     ⚠ Dùng hàm riêng thay vì `+x` trực tiếp: `+null` = 0 và `+'' ` = 0, mà 0 lại là một chỉ số
     lựa chọn HỢP LỆ ⇒ câu bỏ trống sẽ bị chấm thành "chọn phương án đầu tiên". */
  function chiSo(x) {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /* Một câu đúng khi: học viên CÓ trả lời, GV ĐÃ gán đáp án, và hai chỉ số bằng nhau.
     ⚠ Đáp án < 0 nghĩa là GV CHƯA gán (bocDe trả -1, quiz không option nào có cờ correct).
       Không chặn riêng thì học viên gửi về -1 sẽ được chấm ĐÚNG cho mọi câu bỏ ngỏ — test
       "câu chưa gán đáp án → luôn sai" bắt được đúng lỗi này. */
  function khop(bai, ans) {
    const a = chiSo(ans);
    if (a === null || a < 0) return false;
    const b = chiSo(bai);
    return b !== null && b === a;
  }

  function ketQua(dung) {
    return { dung, soDung: dung.filter(Boolean).length, tong: dung.length };
  }

  /* Tổng hợp cả deck. `luot` = [{slideIdx, layout, baiLam}], `dapAns` = theo slideIdx.
     Trả `qs` nối liền cả deck (§41.6) + `viTri` để dashboard bấm vào ô sai là biết chữa slide nào. */
  function chamDeck(slides, luot, dapAns) {
    const qs = [], viTri = [];
    let soDung = 0;
    (slides || []).forEach((sl, i) => {
      const da = dapAns && dapAns[i];
      if (!da) return;                                     // slide không có bài tập
      const bai = (luot || []).find(x => x.slideIdx === i);
      const kq = soDapAn(sl.layout, bai && bai.baiLam, da);
      kq.dung.forEach((d, j) => { qs.push(d ? 1 : 0); viTri.push({ slideIdx: i, cau: j }); });
      soDung += kq.soDung;
    });
    const tong = qs.length;
    return { qs, viTri, soDung, tong, diem: tong ? Math.round(soDung / tong * 100) / 10 : 0 };
  }

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     LỚP 2 — thuHoach(sl, layout) → baiLam                 [DOM — CHỈ trình duyệt]
     Bóc từ đầu các hàm *Submit cũ: chỉ giữ phần đọc dataset, bỏ hết phần so đáp án + tô màu.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  function thuHoach(sl, layout) {
    if (LAYOUT_CO_BAI.indexOf(layout) < 0) return null;
    // Cả 3 layout trắc nghiệm đều dùng .question-item[data-picked] (quiz chỉ có đúng 1 item)
    return [...sl.querySelectorAll('.question-item')]
      .map(it => it.dataset.picked === undefined ? null : Number(it.dataset.picked));
  }

  /* Còn bao nhiêu câu chưa làm — để chặn "Nộp bài" khi làm dở (§32.4: bắt làm hết mới chấm). */
  function soCauChuaLam(baiLam) {
    return (baiLam || []).filter(v => v === null || v === undefined).length;
  }

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     LỚP 4 — toMau(sl, layout, ketQua, opts)               [DOM — CHỈ trình duyệt]
     Phần đuôi của các hàm *Submit cũ. `ketQua.dung` do SERVER trả về.
     ⚠ CHỈ tô lựa chọn của học viên, KHÔNG hé lộ phương án đúng — trừ khi server cho phép
       (`opts.dapAn` chỉ có mặt khi answerVisibility ≠ NONE, §41.1). Máy học viên KHÔNG tự quyết
       định chuyện này: không có `opts.dapAn` thì không có gì để hé lộ.
     ──────────────────────────────────────────────────────────────────────────────────────────── */
  function toMau(sl, layout, ketQua, opts) {
    if (LAYOUT_CO_BAI.indexOf(layout) < 0) return;
    const items = [...sl.querySelectorAll('.question-item')];
    const dung = (ketQua && ketQua.dung) || [];
    const lo = (opts && opts.dapAn) || null;
    items.forEach((item, i) => {
      item.dataset.graded = '1';
      const picked = item.dataset.picked;
      item.querySelectorAll('.option-item').forEach(o => {
        const inp = o.querySelector('input'); if (inp) inp.disabled = true;
        if (chiSo(picked) === chiSo(o.dataset.oi)) o.classList.add(dung[i] ? 'correct' : 'incorrect');
        if (lo && chiSo(o.dataset.oi) === chiSo(lo.answers ? lo.answers[i] : lo.answer)) o.classList.add('correct');
      });
      if (lo && lo.explanations && lo.explanations[i]) {
        const ex = item.querySelector('.explanation-section');
        if (ex) ex.classList.add('show');
      }
    });
  }

  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* ────────────────────────────────────────────────────────────────────────────────────────────
     BẢNG CÒN THIẾU — 11 layout chưa đưa lên web (§41.8: mở dần sau bản chạy thử)
     Cột "so đáp án" chép từ chính hàm *Submit hiện có, để lần sau khỏi phải đi tìm lại:
       spk-dialogue        spkSubmit       +picked === ans                      (giống mcq)
       spk-reading-part3   p3Submit        select.value === data-answer
       reading-cloze       clozeSubmit     select.value === data-answer
       ket-reading-part7   kp7*Submit      ô thả: data-w === data-a  |  gõ: chuỗi thường hoá
       word-select         wsSubmit        tập từ đã chọn ∩ tập từ đúng (chọn sai KHÔNG trừ)
       word-choice         wcSubmit        data-picked === data-ans (bỏ chỗ chưa gán đáp án)
       word-web / gap-fill webSubmit/gapSubmit   chip trong ô === data-a
       pic-match           pmSubmit        chip trong ô === data-a
       reorder             reorderSubmit   thứ tự thẻ === thứ tự gốc (bỏ .ro-fixed)
       matching            mtSubmit        card.dataset.id === drop.dataset.ans (bỏ ô nhiễu)
       crossword           cwSubmit        value.normalize('NFC').toUpperCase() === data-a
     ⚠ Mỗi layout thêm vào phải làm ĐỦ 4 lớp + thêm vào LAYOUT_CO_BAI, và bổ sung test.
     ──────────────────────────────────────────────────────────────────────────────────────────── */

  return {
    LAYOUT_CO_BAI,
    bocDe, bocDeck, soDapAn, chamDeck,   // THUẦN — chạy được ở Node/Deno
    thuHoach, soCauChuaLam, toMau  // DOM — chỉ trình duyệt
  };
});
