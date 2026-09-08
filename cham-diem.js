/* ⚠⚠⚠ FILE TỰ SINH — ĐỪNG SỬA Ở ĐÂY ⚠⚠⚠
   Nguồn: src/shared/cham-diem.js
   Sửa ở nguồn rồi chạy: node tools/dong-bo-web.js   (§41.10) */
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CHẤM ĐIỂM BÀI TẬP — NGUỒN DUY NHẤT, CHẠY ĐƯỢC CẢ TRÌNH DUYỆT LẪN NODE (§41.2)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   VÌ SAO CÓ FILE NÀY: mô hình web (§41) chấm bài Ở SERVER để đáp án KHÔNG BAO GIỜ rời khỏi cơ sở
   dữ liệu xuống máy học viên (bài học §41.1 — Quizizz/Wayground gửi đáp án xuống client nên bị
   moi; YourHomework thì không). Edge Function chạy Deno, player chạy trình duyệt ⇒ hàm so đáp án
   phải chạy được ở CẢ HAI mà KHÔNG đẻ ra bản sao thứ hai.

   ══ KHÓA ĐÁP ÁN LẤY TỪ HTML ĐÃ RENDER, KHÔNG TỪ SLOTS (chốt 2026-09-08) ══
   Bản đầu (chỉ có nhóm trắc nghiệm) dựng khóa từ `slots.questions[].answer`. Cách đó KHÔNG mở rộng
   được sang 11 layout còn lại, vì thứ tự phần tử trên màn hình KHÔNG phải thứ tự mảng slots:
     • reorder   — ô thả xếp theo roOrderIdx(S.order) chứ không theo S.items
     • matching  — thẻ bị mtDerange() hoán vị, ô nhiễu không có đáp án
     • crossword — lưới do CwGen sinh (thuật toán ~200 dòng, sống trong baigiang-crossword.js)
     • word-choice / ket-reading-part7 — số chỗ trống suy từ việc PHÂN TÍCH chuỗi body/passage
   Chép lại từng thuật toán đó vào đây = 4 bản sao phải "giữ khớp" — đúng thứ §32.4 đã trả giá.
   Nên: app render slide MỘT LẦN, rồi `bocHtml()` vừa MOI khóa đáp án ra khỏi HTML theo ĐÚNG thứ
   tự DOM, vừa XÓA nó khỏi HTML gửi xuống học viên. HTML là sự thật duy nhất về thứ tự, và thứ bị
   scrub chính là thứ được gửi đi ⇒ không còn khe hở "strip slots nhưng render vẫn lọt".

   BỐN LỚP — 3 lớp đầu THUẦN (chạy được ở Node/Deno):
     bocDe(slide)            → { de, giaiThich }      THUẦN  ← dọn rò rỉ mức VĂN BẢN trong slots
     bocHtml(html, layout)   → { html, dapAn }        THUẦN  ← moi khóa + scrub thuộc tính   ★
     bocDeck(slides, veHtml) → { de, dapAn, soCau }   THUẦN  (gọi callback render của app)
     soDapAn(...)            → ketQua                 THUẦN  ← Edge Function chấm            ★
     thuHoach(sl, layout)    → baiLam                 DOM    ← máy học viên, lúc bấm Nộp bài
     toMau(sl, layout, kq)   → (vẽ)                   DOM    ← máy học viên, sau khi server trả

   ⚠ CÁC LỚP THUẦN TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỤNG `document`/`window` — đụng là Edge Function chết.
     Có test canh chuyện này: tools/kiem-tra-cham-diem.js

   ⚠ ĐƠN VỊ "CÂU" KHÔNG ĐƯỢC TỰ ĐỊNH NGHĨA LẠI (§41.6): dùng đúng quy ước `qs` của mirror LAN
     (§32.30) — mỗi layout đã tự quy định đơn vị câu của mình từ trước (word-select chỉ tính từ
     ĐÚNG, matching bỏ ô nhiễu, crossword mỗi Ô LƯỚI = 1 câu…). Sai chỗ này thì điểm trên web lệch
     với điểm trong lớp qua mirror LAN, mà lệch ÂM THẦM.
     NGOẠI LỆ DUY NHẤT, có chủ đích: word-web tính theo Ô THẢ thay vì theo số đáp án — xem `tapHop`.

   ⚠ THỨ TỰ ĐÁP ÁN ĐÃ XÁO KHÔNG LÀM HỎNG VIỆC CHẤM: renderSlide xáo `optList` nhưng vẫn ghi
     `data-oi="<chỉ số GỐC>"` lên từng lựa chọn. Học viên gửi về chỉ số GỐC ⇒ server so thẳng,
     KHÔNG cần gửi kèm bảng ánh xạ. ĐỪNG đổi `data-oi` thành chỉ số sau khi xáo.

   ⚠ REGEX TRÊN HTML PHẢI KHỚP LỎNG (bài học §41.13 lỗi thứ sáu): app render
     `class="options-container opts-c4"` cho câu 4 lựa chọn ⇒ khớp chính xác chuỗi class là hỏng
     theo TỪNG BÀI, im lặng. Ở đây mọi phép dò đều tách class ra thành danh sách rồi so từng token.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // Node / Deno
  else root.ChamDiem = api;                                                 // trình duyệt (classic script)
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Layout đã hỗ trợ chấm trên web. Layout NGOÀI danh sách này vẫn HIỂN THỊ được nhưng không đóng
     góp câu nào vào điểm (slide bìa, một cột, pptx, verb-form, spk-writing-* … — đúng ý đồ §41.6:
     slide chỉ để đọc vẫn phải xem được). */
  const LAYOUT_CO_BAI = [
    'reading-mcq', 'mcq-list', 'quiz', 'spk-dialogue',       // chọn 1 trong nhiều (radio / bấm chip)
    'spk-reading-part3', 'reading-cloze',                    // dropdown
    'word-choice',                                           // gạch chân phương án
    'ket-reading-part7', 'gap-fill', 'pic-match',            // điền chuỗi / thả chip
    'word-web',                                              // thả chip theo TẬP đáp án
    'word-select',                                           // chọn nhiều từ đúng
    'reorder', 'matching',                                   // sắp thứ tự / nối cột
    'crossword',                                             // ô chữ
  ];

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     TIỆN ÍCH CHUỖI / HTML (thuần, không DOM)
     ══════════════════════════════════════════════════════════════════════════════════════════ */

  /* Bắt MỘT thẻ mở. Phần `(?:"[^"]*"|'[^']*'|[^>"'])*` cho phép dấu `>` NẰM TRONG giá trị thuộc
     tính (đáp án kiểu "a > b" là có thật) — dùng `[^>]*` là cắt nhầm giữa thẻ. */
  const RE_THE = /<[a-zA-Z][a-zA-Z0-9-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;

  function lopCua(the) {
    const m = /\sclass\s*=\s*"([^"]*)"/.exec(the);
    return m ? m[1].trim().split(/\s+/) : [];
  }
  function coLop(the, cls) { return lopCua(the).indexOf(cls) >= 0; }

  /* Giá trị thuộc tính (đã giải mã thực thể HTML); không có thuộc tính → undefined. */
  function docAttr(the, ten) {
    const m = new RegExp('\\s' + ten + '\\s*=\\s*"([^"]*)"').exec(the);
    return m ? giaiMaHtml(m[1]) : undefined;
  }
  function giaiMaHtml(s) {
    return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function maHoaAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

  /* Duyệt mọi thẻ mở mang class `cls`; `fn(the, i)` trả:
       undefined → giữ nguyên thẻ
       chuỗi     → thay thế cả thẻ
     Trả HTML mới. Đây là NGUỒN DUY NHẤT của mọi phép scrub bên dưới. */
  function quetThe(html, cls, fn) {
    let i = 0;
    return String(html).replace(RE_THE, (the) => {
      if (!coLop(the, cls)) return the;
      const ra = fn(the, i++);
      return ra === undefined ? the : ra;
    });
  }
  /* Vị trí + nội dung mọi thẻ mở mang class `cls` (cần khi phải dò cả phần tử CON bên trong ô). */
  function timThe(html, cls) {
    const ra = [];
    String(html).replace(RE_THE, (the, vt) => { if (coLop(the, cls)) ra.push({ the, vt }); return the; });
    return ra;
  }
  /* Đặt lại giá trị một thuộc tính trong thẻ (thuộc tính phải đã có sẵn).
     ⚠ `$` trong giá trị phải nhân đôi — chuỗi thay thế của String.replace hiểu `$1`, `$&`… */
  function datAttr(the, ten, giaTri) {
    const v = maHoaAttr(giaTri).replace(/\$/g, '$$$$');
    return the.replace(new RegExp('(\\s' + ten + '\\s*=\\s*")[^"]*(")'), '$1' + v + '$2');
  }

  /* Chuẩn hoá chuỗi đáp án: bỏ khoảng trắng thừa + không phân biệt hoa/thường.
     ⚠ PHẢI khớp với `norm` trong gapSubmit/pmSubmit/webSubmit và `kp7Hit` của app. */
  const chuanChuoi = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  /* ĐA ĐÁP ÁN ngăn bằng "/" — ket-reading-part7 (§32.11). Gõ trúng phương án nào cũng đúng. */
  const phuongAn = (a) => String(a == null ? '' : a).split('/').map(chuanChuoi).filter(Boolean);

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LỚP 1 — bocDe(slide) → { de, giaiThich }             [THUẦN]
     Dọn rò rỉ mức VĂN BẢN trong slots (thứ mà scrub thuộc tính KHÔNG với tới):
       • `explanation` — "chọn A vì…" là lộ đáp án; render ra .explanation-section chỉ bị CSS giấu,
         mở DevTools là đọc được.
     KHÔNG đụng các trường sinh ra ĐÁP ÁN dạng THUỘC TÍNH (q.answer, b.ans, w.c…): giữ lại để
     renderSlide dựng đúng số phần tử / đúng nội dung ngân hàng từ, rồi `bocHtml` xoá khỏi HTML.
     ⚠ KHÔNG sửa slide gốc — app còn dùng chính đối tượng đó để trình chiếu trong lớp.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function bocDe(slide) {
    const de = deepCopy(slide);
    const S = (de && de.slots) || {};
    const giaiThich = [];
    (S.questions || []).forEach((q, i) => {
      if (q && q.explanation) { giaiThich[i] = q.explanation; q.explanation = ''; }
    });
    return { de, giaiThich };
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LỚP 2 — bocHtml(html, layout) → { html, dapAn }      [THUẦN] ★
     Moi khóa đáp án ra khỏi HTML ĐÃ RENDER (theo ĐÚNG thứ tự DOM) rồi XOÁ khỏi HTML.
     `dapAn` = null nghĩa là slide không có bài tập chấm được.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function bocHtml(html, layout) {
    let h = String(html == null ? '' : html);
    if (LAYOUT_CO_BAI.indexOf(layout) < 0) return { html: h, dapAn: null };

    switch (layout) {

      /* ── Chọn 1 trong nhiều: .question-item[data-answer] (radio hoặc chip bấm) ─────────── */
      case 'reading-mcq': case 'mcq-list': case 'quiz': case 'spk-dialogue': {
        const answers = [];
        h = quetThe(h, 'question-item', (the) => {
          const v = docAttr(the, 'data-answer');
          if (v === undefined) return undefined;   // .question-item của layout khác — không mang đáp án
          answers.push(soHoacAm(v));
          return datAttr(the, 'data-answer', '');
        });
        return { html: h, dapAn: answers.length ? { kieu: 'chiSo', answers } : null };
      }

      /* ── Dropdown: .p3-select / .cloze-blank mang data-answer ─────────────────────────── */
      case 'spk-reading-part3': case 'reading-cloze': {
        const cls = layout === 'reading-cloze' ? 'cloze-blank' : 'p3-select';
        const answers = [];
        h = quetThe(h, cls, (the) => {
          answers.push(soHoacAm(docAttr(the, 'data-answer')));
          return datAttr(the, 'data-answer', '');
        });
        return { html: h, dapAn: answers.length ? { kieu: 'chiSo', answers } : null };
      }

      /* ── Gạch chân phương án đúng: .wc-slot[data-ans] ──────────────────────────────────
         ⚠ data-ans = "-1" nghĩa là GV CHƯA gán đáp án cho chỗ đó — wcSubmit BỎ QUA (không tính
         vào tổng). GIỮ NGUYÊN "-1" trong HTML (không lộ gì) để trang web biết chỗ nào không bắt
         buộc phải chọn — nếu xoá luôn thì học viên bị chặn nộp vì "còn chỗ chưa chọn" mà không
         có cách nào chọn cho đúng. Mọi giá trị khác bị xoá. */
      case 'word-choice': {
        const answers = [];
        h = quetThe(h, 'wc-slot', (the) => {
          const v = soHoacAm(docAttr(the, 'data-ans'));
          if (v < 0) { answers.push(null); return undefined; }
          answers.push(v);
          return datAttr(the, 'data-ans', '');
        });
        return { html: h, dapAn: answers.length ? { kieu: 'chiSo', answers } : null };
      }

      /* ── Điền chuỗi / thả chip: đáp án là CHỮ ở data-ans ──────────────────────────────── */
      case 'ket-reading-part7': case 'gap-fill': case 'pic-match': {
        const answers = [];
        const nhat = (cls) => {
          h = quetThe(h, cls, (the) => {
            answers.push(docAttr(the, 'data-ans') || '');
            return datAttr(the, 'data-ans', '');
          });
        };
        if (layout === 'gap-fill') nhat('gf-drop');
        else if (layout === 'pic-match') nhat('pm-box');
        else { nhat('kp7-drop'); if (!answers.length) nhat('kp7-blank'); }   // 2 chế độ, chỉ 1 có mặt
        return { html: h, dapAn: answers.length ? { kieu: 'chuoi', answers } : null };
      }

      /* ── Sơ đồ mạng từ: mỗi .ww-web mang TẬP đáp án "a||b||c" ────────────────────────────
         ⚠ ĐƠN VỊ CÂU = Ô THẢ, không phải số đáp án (ngoại lệ có chủ đích của §41.6). webSubmit
         của app đếm theo số đáp án; hai con số này chỉ lệch khi web bật `addOne` mà đã đủ 4 đáp
         án (leg thứ 4 thành ô tự viết nên không còn ô thả cho đáp án cuối) — lúc đó app tính là
         một câu KHÔNG THỂ đúng. Trên web tính theo ô để mỗi câu luôn tô màu được. */
      case 'word-web': {
        const webs = [];
        h = quetThe(h, 'ww-web', (the) => {
          const raw = docAttr(the, 'data-ans') || '';
          webs.push(raw.split('||').map(chuanChuoi).filter(Boolean));
          return datAttr(the, 'data-ans', '');
        });
        return { html: h, dapAn: webs.length ? { kieu: 'tapHop', webs } : null };
      }

      /* ── Chọn các từ đúng: .ws-word[data-c] ("1" = từ đúng) ────────────────────────────── */
      case 'word-select': {
        const dung = [];
        h = quetThe(h, 'ws-word', (the) => {
          dung.push(docAttr(the, 'data-c') === '1' ? 1 : 0);
          return datAttr(the, 'data-c', '0');            // đồng loạt "0" ⇒ không lộ gì
        });
        return { html: h, dapAn: dung.length ? { kieu: 'chonTu', dung } : null };
      }

      /* ── Sắp thứ tự: .ro-drop[data-ans] = chỉ số câu đúng của ô đó ──────────────────────
         Ô ĐẶT SẴN (prefillFirst) chứa thẻ .ro-fixed — reorderSubmit KHÔNG chấm ô đó. Từ thẻ mở
         không nhìn thấy phần tử con, nên dò trong đoạn HTML từ ô này tới ô .ro-drop kế tiếp. */
      case 'reorder': {
        const moc = timThe(h, 'ro-drop');
        const answers = moc.map((m, i) => {
          const doan = h.slice(m.vt, i + 1 < moc.length ? moc[i + 1].vt : h.length);
          return /\bro-fixed\b/.test(doan) ? null : soHoacAm(docAttr(m.the, 'data-ans'));
        });
        h = quetThe(h, 'ro-drop', (the) => datAttr(the, 'data-ans', ''));
        return { html: h, dapAn: answers.length ? { kieu: 'chiSo', answers } : null };
      }

      /* ── Nối cột: .mt-drop[data-ans] = id thẻ đúng; ô NHIỄU không có thuộc tính này ────── */
      case 'matching': {
        const answers = [];
        h = quetThe(h, 'mt-drop', (the) => {
          const v = docAttr(the, 'data-ans');
          if (v === undefined) { answers.push(null); return undefined; }   // hàng nhiễu — không chấm
          answers.push(soHoacAm(v));
          return datAttr(the, 'data-ans', '');
        });
        return { html: h, dapAn: answers.length ? { kieu: 'chiSo', answers } : null };
      }

      /* ── Ô chữ: mỗi .cw-in[data-a] = 1 chữ cái = 1 CÂU (§32.30) ────────────────────────
         Kèm theo: XOÁ RỖNG bảng "Danh sách từ" (.cw-bank) — trên máy GV đó là công cụ hé lộ bấm
         bằng nút .cw-bar (trang web đã ẩn hàng nút), nhưng chữ vẫn nằm trong HTML ⇒ mở DevTools
         là có nguyên danh sách từ cần điền. Bank chỉ chứa <span> nên `</div>` đầu tiên sau nó
         chính là thẻ đóng của bank. */
      case 'crossword': {
        const answers = [];
        h = quetThe(h, 'cw-in', (the) => {
          answers.push(String(docAttr(the, 'data-a') || '').normalize('NFC').toUpperCase());
          return datAttr(the, 'data-a', '');
        });
        h = h.replace(/(<div(?:"[^"]*"|'[^']*'|[^>"'])*\sclass="[^"]*\bcw-bank\b[^"]*"(?:"[^"]*"|'[^']*'|[^>"'])*>)[\s\S]*?(<\/div>)/, '$1$2');
        return { html: h, dapAn: answers.length ? { kieu: 'oChu', answers } : null };
      }
    }
    return { html: h, dapAn: null };
  }

  /* "3" → 3 · "" / "undefined" / thiếu → -1 (GV chưa gán đáp án ⇒ tính vào tổng nhưng luôn SAI). */
  function soHoacAm(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : -1;
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     bocDeck(slides, veHtml) → { de, dapAn, soCau }
     `veHtml(slideDaDonSlots, i)` — callback RENDER do app cấp (chỉ app mới có renderSlide).
     `de`    = { slides: [{layout, html}] }  → cột `bai_tap.de`      (HV nhận được)
     `dapAn` = { theoSlide: [...|null] }     → bảng `bai_tap_dap_an`  (HV KHÔNG BAO GIỜ nhận)
     ⚠ `theoSlide` phải giữ ĐÚNG chỉ số slide (slide không có bài tập = null) — `chamDeck` và Edge
       Function `nop` đều tra theo chỉ số này. Lọc bỏ phần tử null sẽ làm lệch toàn bộ bài chấm.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function bocDeck(slides, veHtml) {
    /* ⚠ THIẾU CALLBACK LÀ NÉM, KHÔNG ĐƯỢC ÂM THẦM TRẢ 0. Bản trước để `veHtml` rỗng thì html = ''
       ⇒ bocHtml không tìm thấy gì ⇒ `soCau = 0` cho MỌI bài, nhìn y hệt "bài chưa có câu hỏi".
       Đúng chuyện đã xảy ra: đổi API sang nhận callback nhưng sót một chỗ gọi cũ
       (`bocDeck(LESSON)` khi dựng hộp thoại), lại thêm `catch {}` bên ngoài nuốt lỗi ⇒ người dùng
       thấy "0 câu chấm được" trên bài có 6 câu (báo 2026-09-08). Ném thì lộ ra ngay. */
    if (typeof veHtml !== 'function') {
      throw new Error('ChamDiem.bocDeck: thiếu callback render — gọi bocDeck(slides, (slide, i) => renderSlide(slide, {live:true, idx:i}))');
    }
    const ds = slides || [], out = [], theoSlide = [];
    let soCau = 0;
    ds.forEach((sl, i) => {
      const layout = (sl && sl.layout) || '';
      const { de, giaiThich } = bocDe(sl);
      let html = '';
      try { html = String(veHtml(de, i) || ''); }
      catch (e) { html = '<div class="sl"><p>Không dựng được slide ' + (i + 1) + '</p></div>'; }
      const b = bocHtml(html, layout);
      if (b.dapAn && giaiThich.length) b.dapAn.giaiThich = giaiThich;
      out.push({ layout, html: b.html });
      theoSlide.push(b.dapAn);
      soCau += soCauCua(b.dapAn);
    });
    return { de: { slides: out }, dapAn: { theoSlide }, soCau };
  }

  /* Số câu (đơn vị `qs`) của một khóa đáp án — dùng để báo cho GV trước khi đẩy bài lên. */
  function soCauCua(da) {
    if (!da) return 0;
    switch (da.kieu) {
      case 'chiSo': case 'chuoi': return da.answers.filter(a => a !== null).length;
      case 'tapHop': return da.webs.reduce((s, w) => s + w.length, 0);   // ước lượng: số ô ≈ số đáp án
      case 'chonTu': return da.dung.filter(Boolean).length;
      case 'oChu': return da.answers.length;
    }
    return 0;
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LỚP 3 — soDapAn(layout, baiLam, dapAn) → { dung, soDung, tong }     [THUẦN] ★
     `dung[i]`: true/false = câu thứ i đúng/sai · null = KHÔNG tính (ô nhiễu, ô đặt sẵn, chỗ GV
     chưa gán đáp án). Giữ null để `toMau` tô đúng phần tử — chỉ số của `dung` khớp 1-1 với thứ tự
     phần tử `thuHoach` đọc ra. `qs` gửi lên dashboard thì bỏ null (xem chamDeck).
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function soDapAn(layout, baiLam, dapAn) {
    if (!dapAn) return ketQua([]);
    const bl = Array.isArray(baiLam) ? baiLam : [];

    switch (dapAn.kieu) {
      case 'chiSo':
        return ketQua(dapAn.answers.map((a, i) => a === null ? null : khopSo(bl[i], a)));

      case 'chuoi':
        return ketQua(dapAn.answers.map((a, i) => a === null ? null : khopChuoi(bl[i], a)));

      /* word-web: mỗi web có TẬP đáp án dùng chung cho các ô của web đó. Chấm GREEDY theo đúng
         webSubmit: mỗi đáp án chỉ khớp được MỘT ô (đáp án trùng chữ vẫn đủ số lượt). */
      case 'tapHop': {
        const dung = [];
        dapAn.webs.forEach((tap, wi) => {
          const conLai = tap.slice();
          const oThuc = Array.isArray(bl[wi]) ? bl[wi] : [];
          oThuc.forEach(o => {
            const k = conLai.indexOf(chuanChuoi(o));
            if (k >= 0) { conLai.splice(k, 1); dung.push(true); } else dung.push(false);
          });
        });
        return ketQua(dung);
      }

      /* word-select: CHỈ từ đúng mới là một câu; chọn sai KHÔNG trừ (§32.4, giữ đúng wsSubmit). */
      case 'chonTu':
        return ketQua(dapAn.dung.map((c, i) => c ? bl[i] === 1 : null));

      case 'oChu':
        return ketQua(dapAn.answers.map((a, i) => {
          const v = String(bl[i] == null ? '' : bl[i]).trim().normalize('NFC').toUpperCase();
          return !!a && v === a;
        }));
    }
    /* Gặp `kieu` lạ gần như LUÔN có nghĩa: app đã đẩy đề theo định dạng MỚI nhưng Edge Function
       trên máy chủ vẫn chạy bản cham-diem.js CŨ. Nói thẳng ra, đừng để người dùng đoán — lần đầu
       gặp (2026-09-08) mất khá lâu mới nhận ra là chưa deploy lại. */
    throw new Error('ChamDiem.soDapAn: chưa hỗ trợ kiểu "' + (dapAn.kieu || layout)
      + '". Thường là do Edge Function trên máy chủ còn chạy bản cũ — deploy lại `nop` và `batDau`'
      + ' (node tools/dong-bo-web.js → node tools/gop-edge-function.js → dán lại, hoặc'
      + ' npx supabase functions deploy batDau nop).');
  }

  /* Chuẩn hoá chỉ số: mọi thứ không phải số hữu hạn → null (chưa trả lời).
     ⚠ Dùng hàm riêng thay vì `+x`: `+null` = 0 và `+''` = 0, mà 0 lại là một chỉ số lựa chọn HỢP
     LỆ ⇒ câu bỏ trống sẽ bị chấm thành "chọn phương án đầu tiên". */
  function chiSo(x) {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  /* Đáp án < 0 = GV CHƯA gán (bocHtml trả -1). Không chặn riêng thì học viên gửi về -1 sẽ được
     chấm ĐÚNG cho mọi câu bỏ ngỏ. */
  function khopSo(bai, ans) {
    const a = chiSo(ans);
    if (a === null || a < 0) return false;
    const b = chiSo(bai);
    return b !== null && b === a;
  }
  function khopChuoi(bai, ans) {
    const ds = phuongAn(ans);
    if (!ds.length) return false;                     // GV để trống đáp án ⇒ luôn sai
    return ds.indexOf(chuanChuoi(bai)) >= 0;
  }

  function ketQua(dung) {
    const co = dung.filter(d => d !== null);
    return { dung, soDung: co.filter(Boolean).length, tong: co.length };
  }

  /* Tổng hợp cả deck. `luot` = [{slideIdx, baiLam}], `dapAns` = theo slideIdx.
     Trả `qs` nối liền cả deck (§41.6) + `viTri` để dashboard bấm vào ô sai là biết chữa slide nào. */
  function chamDeck(slides, luot, dapAns) {
    const qs = [], viTri = [];
    let soDung = 0;
    (slides || []).forEach((sl, i) => {
      const da = dapAns && dapAns[i];
      if (!da) return;                                     // slide không có bài tập
      const bai = (luot || []).find(x => x.slideIdx === i);
      const kq = soDapAn(sl && sl.layout, bai && bai.baiLam, da);
      let cau = 0;
      kq.dung.forEach(d => {
        if (d === null) return;                            // ô nhiễu / ô đặt sẵn — không phải một câu
        qs.push(d ? 1 : 0); viTri.push({ slideIdx: i, cau: cau++ });
      });
      soDung += kq.soDung;
    });
    const tong = qs.length;
    return { qs, viTri, soDung, tong, diem: tong ? Math.round(soDung / tong * 100) / 10 : 0 };
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LỚP 4 — thuHoach(sl, layout) → baiLam                 [DOM — CHỈ trình duyệt]
     Bóc từ ĐẦU các hàm *Submit của app: chỉ giữ phần đọc DOM, bỏ hết phần so đáp án + tô màu.
     ⚠ THỨ TỰ PHẦN TỬ Ở ĐÂY PHẢI KHỚP THỨ TỰ `bocHtml` MOI KHÓA — cả hai đều đi theo thứ tự xuất
       hiện trong HTML (querySelectorAll cũng trả theo thứ tự tài liệu) nên khớp tự nhiên, nhưng
       ĐỪNG sắp xếp lại hay lọc bớt ở một bên mà không sửa bên kia.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function thuHoach(sl, layout) {
    if (!sl || LAYOUT_CO_BAI.indexOf(layout) < 0) return null;
    const ds = (q) => [].slice.call(sl.querySelectorAll(q));
    const chip = (o) => { const c = o.querySelector('.ww-chip'); return c ? (c.dataset.w || '') : null; };

    switch (layout) {
      case 'reading-mcq': case 'mcq-list': case 'quiz': case 'spk-dialogue':
        return ds('.question-item').map(it => it.dataset.picked === undefined ? null : Number(it.dataset.picked));

      case 'spk-reading-part3':
        return ds('.p3-select').map(s => s.value === '' ? null : Number(s.value));

      case 'reading-cloze':
        return ds('.cloze-blank').map(s => s.value === '' ? null : Number(s.value));

      /* Chỗ GV chưa gán đáp án còn nguyên data-ans="-1" (bocHtml giữ lại) → trả -1 để nó KHÔNG bị
         đếm là "chưa làm"; server thấy answers[i]===null nên vẫn bỏ qua khi chấm. */
      case 'word-choice':
        return ds('.wc-slot').map(s => s.dataset.ans === '-1' ? -1
          : (s.dataset.picked === undefined ? null : Number(s.dataset.picked)));

      case 'ket-reading-part7': {
        const drops = ds('.kp7-drop');
        if (drops.length) return drops.map(chip);
        return ds('.kp7-blank').map(i => (i.value || '').trim() || null);
      }
      case 'gap-fill': return ds('.gf-drop').map(chip);
      case 'pic-match': return ds('.pm-box').map(chip);

      case 'word-web':
        return ds('.ww-web').map(web => [].slice.call(web.querySelectorAll('.ww-drop')).map(chip));

      case 'word-select':
        return ds('.ws-word').map(w => w.classList.contains('sel') ? 1 : 0);

      case 'reorder':
        return ds('.ro-drop').map(d => { const c = d.querySelector('.ro-card'); return c ? Number(c.dataset.i) : null; });

      case 'matching':
        return ds('.mt-drop').map(d => { const c = d.querySelector('.mt-card'); return c ? Number(c.dataset.id) : null; });

      case 'crossword':
        return ds('.cw-in').map(i => (i.value || '').trim() || null);
    }
    return null;
  }

  /* Còn bao nhiêu câu chưa làm — để chặn "Nộp bài" khi làm dở (§32.4: bắt làm hết mới chấm).
     ⚠ Máy học viên KHÔNG có khóa đáp án nên không biết ô nào là ô nhiễu / ô đặt sẵn. Với các
       layout đó, mọi ô đều đã có sẵn thẻ ngay từ lúc render (matching hoán vị đủ thẻ, reorder có
       thẻ đặt sẵn) nên không bao giờ là null ⇒ không đếm nhầm. */
  function soCauChuaLam(baiLam, layout) {
    if (!baiLam) return 0;
    if (layout === 'word-select') return baiLam.some(v => v === 1) ? 0 : 1;   // wsSubmit: cần ≥1 từ
    if (layout === 'word-web') {
      let n = 0;
      baiLam.forEach(web => (web || []).forEach(o => { if (o === null || o === undefined) n++; }));
      return n;
    }
    return baiLam.filter(v => v === null || v === undefined).length;
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LỚP 5 — toMau(sl, layout, ketQua, opts)               [DOM — CHỈ trình duyệt]
     Phần đuôi của các hàm *Submit. `ketQua.dung` do SERVER trả về (null = ô không chấm).
     ⚠ CHỈ tô bài làm của học viên, KHÔNG hé lộ phương án đúng — trừ khi server cho phép
       (`opts.dapAn` chỉ có mặt khi answerVisibility ≠ NONE, §41.1). Máy học viên KHÔNG tự quyết
       định chuyện này: không có `opts.dapAn` thì không có gì để hé lộ.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function toMau(sl, layout, kq, opts) {
    if (!sl || LAYOUT_CO_BAI.indexOf(layout) < 0) return;
    const dung = (kq && kq.dung) || [];
    const lo = (opts && opts.dapAn) || null;
    const ds = (q) => [].slice.call(sl.querySelectorAll(q));
    /* Tô chip nằm trong ô thả (word-web / gap-fill / pic-match / kp7 kéo-thả) */
    const toChip = (o, d) => {
      const c = o.querySelector('.ww-chip');
      o.dataset.graded = '1';
      if (c) { c.classList.remove('ok', 'bad'); if (d !== null && d !== undefined) c.classList.add(d ? 'ok' : 'bad'); c.classList.add('locked'); }
    };
    const toO = (s, d, okCls, badCls) => {
      s.dataset.graded = '1'; s.disabled = true;
      if (d !== null && d !== undefined) s.classList.add(d ? okCls : badCls);
    };

    switch (layout) {
      case 'reading-mcq': case 'mcq-list': case 'quiz': case 'spk-dialogue':
        ds('.question-item').forEach((item, i) => {
          item.dataset.graded = '1';
          const picked = item.dataset.picked;
          item.querySelectorAll('.option-item').forEach(o => {
            const inp = o.querySelector('input'); if (inp) inp.disabled = true;
            if (picked !== undefined && chiSo(picked) === chiSo(o.dataset.oi) && dung[i] != null) {
              o.classList.add(dung[i] ? 'correct' : 'incorrect');
            }
            if (lo && lo.answers && chiSo(o.dataset.oi) === chiSo(lo.answers[i])) o.classList.add('correct');
          });
          if (lo && lo.giaiThich && lo.giaiThich[i]) {
            const ex = item.querySelector('.explanation-section');
            if (ex) { ex.innerHTML = '💡 <b>Giải thích:</b> ' + lo.giaiThich[i]; ex.classList.add('show'); }
          }
        });
        break;

      case 'spk-reading-part3':
        ds('.p3-select').forEach((s, i) => toO(s, dung[i], 'p3-correct', 'p3-incorrect'));
        break;
      case 'reading-cloze':
        ds('.cloze-blank').forEach((s, i) => toO(s, dung[i], 'cloze-correct', 'cloze-incorrect'));
        break;

      case 'word-choice':
        ds('.wc-slot').forEach((s, i) => {
          s.classList.add('wc-graded'); s.dataset.graded = '1';
          if (dung[i] == null) return;
          const picked = s.dataset.picked;
          s.querySelectorAll('.wc-opt').forEach(o => {
            if (picked !== undefined && chiSo(o.dataset.oi) === chiSo(picked)) o.classList.add(dung[i] ? 'wc-ok' : 'wc-bad');
          });
        });
        break;

      case 'ket-reading-part7': {
        const drops = ds('.kp7-drop');
        if (drops.length) {
          drops.forEach((d, i) => toChip(d, dung[i]));
          ds('.kp7-bank .ww-chip').forEach(c => c.classList.add('used'));
        } else {
          ds('.kp7-blank').forEach((inp, i) => toO(inp, dung[i], 'kp7-correct', 'kp7-incorrect'));
        }
        break;
      }
      case 'gap-fill':
        ds('.gf-drop').forEach((d, i) => toChip(d, dung[i]));
        ds('.ww-chip').forEach(c => c.classList.add('locked'));
        break;
      case 'pic-match':
        ds('.pm-box').forEach((d, i) => toChip(d, dung[i]));
        break;

      case 'word-web': {
        let k = 0;
        ds('.ww-web').forEach(web => {
          [].slice.call(web.querySelectorAll('.ww-drop')).forEach(o => toChip(o, dung[k++]));
        });
        ds('.ww-chip').forEach(c => c.classList.add('locked'));
        ds('.ww-freein').forEach(i => { i.disabled = true; });
        break;
      }

      case 'word-select':
        ds('.ws-word').forEach((w, i) => {
          w.classList.add('graded'); w.dataset.graded = '1';
          if (!w.classList.contains('sel')) return;
          w.classList.add(dung[i] === true ? 'ok' : 'bad');    // chọn nhầm từ KHÔNG đúng ⇒ dung[i] === null
        });
        break;

      case 'reorder': {
        ds('.ro-drop').forEach((d, i) => {
          d.dataset.graded = '1';
          const c = d.querySelector('.ro-card'); if (!c || dung[i] == null) return;
          c.classList.remove('ok', 'bad'); c.classList.add(dung[i] ? 'ok' : 'bad');
        });
        ds('.ro-card').forEach(c => c.classList.add('locked'));
        const w = sl.querySelector('.ro-wrap'); if (w) w.classList.add('ro-graded');
        break;
      }

      case 'matching':
        ds('.mt-drop').forEach((d, i) => {
          const c = d.querySelector('.mt-card'); if (!c || dung[i] == null) return;
          d.dataset.graded = '1';
          c.classList.remove('mt-ok', 'mt-bad'); c.classList.add(dung[i] ? 'mt-ok' : 'mt-bad');
        });
        ds('.mt-card').forEach(c => c.classList.add('locked'));
        break;

      case 'crossword':
        ds('.cw-in').forEach((i, k) => {
          i.readOnly = true;
          if (dung[k] == null) return;
          i.classList.add(dung[k] ? 'cw-ok' : 'cw-bad');
          if (!dung[k] && i.parentElement) i.parentElement.classList.add('cw-wrong');
        });
        break;
    }
  }

  function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  return {
    LAYOUT_CO_BAI,
    bocDe, bocHtml, bocDeck, soDapAn, chamDeck, soCauCua,   // THUẦN — chạy được ở Node/Deno
    thuHoach, soCauChuaLam, toMau,                          // DOM — chỉ trình duyệt
  };
});
