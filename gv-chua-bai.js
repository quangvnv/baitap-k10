/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CHỮA BÀI — chiếu lên bảng, đi từng câu, hiện đáp án đúng + phân bố câu trả lời của cả lớp.
   Mở từ nút "Chữa bài" ở chi tiết phiên (gv.html). Hoàn toàn CHỈ-ĐỌC.

   ⚠ CHỈ CHỦ BÀI TẬP (và CB quản trị) dùng được — không phải chọn lựa giao diện mà là RLS:
     policy `da_chu` trên `bai_tap_dap_an` cố ý KHÔNG cho cả bài đã chia sẻ đọc đáp án ("chia sẻ
     là để dạy, không phải để xem đáp án" — web/sql/01-schema.sql). Nút mờ kèm lý do thay vì để
     GV bấm vào rồi nhận bảng trống không hiểu vì sao.

   ⚠ KHÔNG tự đếm câu theo kiểu riêng: đơn vị "câu" lấy NGUYÊN của `ChamDiem` (§41.6) qua
     `chamDeck().viTri` — cùng đơn vị với cột "Từng câu" trên bảng theo dõi và với `luot.qs`.
     Tự đếm lại là đẻ ra con số thứ hai lệch với mọi chỗ khác mà không ai nhìn ra.

   ⚠ ĐỌC ĐỀ TỪ HTML ĐÃ RENDER, KHÔNG từ slots — cùng lý do §41.15: thứ tự phần tử trên màn hình
     KHÔNG phải thứ tự mảng slots (reorder xếp lại, matching hoán vị, ô chữ do thuật toán sinh).
     HTML là sự thật duy nhất về thứ tự, và nó chính là thứ học viên đã nhìn thấy.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { api, esc, $, hien } = window.WebGV;

  const TEN_LAYOUT = {
    'reading-mcq': 'Đọc hiểu · trắc nghiệm', 'mcq-list': 'Trắc nghiệm', 'quiz': 'Trắc nghiệm',
    'spk-dialogue': 'Hoàn thành hội thoại', 'spk-reading-part3': 'Đọc hiểu Đúng/Sai',
    'reading-cloze': 'Điền chỗ trống (chọn)', 'ket-reading-part7': 'Điền từ vào đoạn',
    'gap-fill': 'Điền từ (kéo thả)', 'pic-match': 'Nối từ với hình', 'word-web': 'Sơ đồ từ',
    'word-select': 'Chọn mục từ', 'reorder': 'Sắp xếp thứ tự', 'matching': 'Nối cột',
    'word-choice': 'Chọn phương án đúng', 'crossword': 'Ô chữ',
  };

  /* Chuẩn hoá chuỗi PHẢI khớp `chuanChuoi` của src/shared/cham-diem.js — lệch là tô xanh/đỏ
     một đằng, máy chủ chấm một nẻo. */
  const chuan = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  const phuongAn = (a) => String(a == null ? '' : a).split('/').map(chuan).filter(Boolean);
  const chuanO = (s) => String(s == null ? '' : s).trim().normalize('NFC').toUpperCase();

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

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     ĐỌC ĐỀ CỦA MỘT SLIDE → mô tả từng câu
     Trả: [{ raw, nhan, ctx, pa, dungKeys, dungChu, web }] theo ĐÚNG thứ tự câu của ChamDiem.
       raw      — chỉ số Ô THÔ trong khoá đáp án (≠ số thứ tự câu khi có ô không tính điểm)
       pa       — danh sách phương án cố định [{k, chu}]; `null` = trả lời tự do (gõ chữ)
       dungKeys — tập khoá được tính là ĐÚNG (đã chuẩn hoá)
       web      — chỉ (wi, ci) của word-web, vì bài làm layout này là mảng LỒNG
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function docSlide(html, layout, da) {
    const hop = document.createElement('div');
    hop.innerHTML = String(html || '');
    const ds = (q, g) => [].slice.call((g || hop).querySelectorAll(q));
    const chu = (el, mac) => {
      const t = el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
      return t || (mac || '');
    };

    /* Ngữ cảnh: thay chính ô đang xét bằng "______" rồi cắt gọn quanh đó. Phải làm SAU khi đã
       đọc xong danh sách phương án — bước này phá nội dung ô. */
    const MK = '@@ocb@@';   // mốc tạm — KHÔNG dùng ký tự điều khiển, công cụ sửa file dễ nuốt
    function docNguCanh(khung, oList, quanh) {
      if (!khung) return [];
      oList.forEach((el, k) => { el.textContent = MK + k + MK; });
      const full = khung.textContent.replace(/\s+/g, ' ').trim();
      return oList.map((_, k) => {
        const tag = MK + k + MK;
        const i = full.indexOf(tag);
        if (i < 0) return '';
        const r = quanh || 60;
        let a = Math.max(0, i - r), b = Math.min(full.length, i + tag.length + r);
        return (a > 0 ? '…' : '') + full.slice(a, i) + '______'
          + full.slice(i + tag.length, b) + (b < full.length ? '…' : '');
      });
    }

    const paChip = (sel) => ds(sel).map(c => ({ k: c.dataset.w || '', chu: c.dataset.w || '' }));
    const rows = [];
    const answers = (da && da.answers) || [];
    /* Ô có đáp án `null` KHÔNG phải một câu (hàng nhiễu của nối cột, ô đặt sẵn của sắp xếp,
       chỗ giáo viên chưa gán đáp án) — ChamDiem bỏ qua, ở đây cũng phải bỏ qua. */
    const coCau = (i) => answers[i] !== null && answers[i] !== undefined;

    switch (layout) {

      /* ── Chọn 1 trong nhiều: .question-item + .option-item ──────────────────────────────── */
      case 'reading-mcq': case 'mcq-list': case 'quiz': case 'spk-dialogue': {
        const it = ds('.question-item');
        it.forEach((el, i) => {
          if (!coCau(i)) return;
          const t = el.querySelector('.question-text');
          const dl = el.querySelector('.spk-dialog');
          rows.push({
            raw: i,
            nhan: chu(t) || chu(dl) || ('Câu ' + (i + 1)),
            pa: ds('.option-item', el).map(o => ({
              k: String(o.dataset.oi), chu: chu(o.querySelector('span')) || chu(o),
            })),
            dungKeys: new Set([String(answers[i])]),
          });
        });
        break;
      }

      /* ── Đúng/Sai: dropdown .p3-select ──────────────────────────────────────────────────── */
      case 'spk-reading-part3': {
        const sel = ds('.p3-select');
        sel.forEach((s, i) => {
          if (!coCau(i)) return;
          const it = s.closest ? s.closest('.question-item') : null;
          rows.push({
            raw: i,
            nhan: chu(it && it.querySelector('.question-text')) || ('Nhận định ' + (i + 1)),
            pa: ds('option', s).filter(o => o.value !== '')
              .map(o => ({ k: String(o.value), chu: chu(o) })),
            dungKeys: new Set([String(answers[i])]),
          });
        });
        break;
      }

      /* ── Điền chỗ trống bằng dropdown: .cloze-blank trong một đoạn văn liền mạch ─────────── */
      case 'reading-cloze': {
        const bl = ds('.cloze-blank');
        const pa = bl.map(s => ds('option', s).filter(o => o.value !== '')
          .map(o => ({ k: String(o.value), chu: chu(o) })));
        const ctx = docNguCanh(hop.querySelector('.cloze-content'), bl);
        bl.forEach((_, i) => {
          if (!coCau(i)) return;
          rows.push({
            raw: i, nhan: 'Chỗ trống ' + (i + 1), ctx: ctx[i], pa: pa[i],
            dungKeys: new Set([String(answers[i])]),
          });
        });
        break;
      }

      /* ── Gạch chân phương án đúng: .wc-slot chứa các .wc-opt ────────────────────────────── */
      case 'word-choice': {
        const slot = ds('.wc-slot');
        const pa = slot.map(s => ds('.wc-opt', s).map(o => ({ k: String(o.dataset.oi), chu: chu(o) })));
        const ctx = slot.map((s, k) => {
          const dong = s.closest ? s.closest('.wc-line') : null;
          return dong ? docNguCanh(dong, [s], 70)[0] : '';
        });
        slot.forEach((_, i) => {
          if (!coCau(i)) return;
          rows.push({
            raw: i, nhan: 'Chỗ chọn ' + (i + 1), ctx: ctx[i], pa: pa[i],
            dungKeys: new Set([String(answers[i])]),
          });
        });
        break;
      }

      /* ── Sắp xếp thứ tự: mỗi ô là một vị trí, phương án = các thẻ ────────────────────────── */
      case 'reorder': {
        const the = ds('.ro-card[data-i]').map(c => ({
          k: String(c.dataset.i),
          chu: (chu(c.querySelector('.ro-lbl')) ? chu(c.querySelector('.ro-lbl')) + '. ' : '')
            + chu(c.querySelector('.ro-txt'), '(trống)'),
        }));
        /* Khử trùng: thẻ "đặt sẵn" nằm trong ô nên xuất hiện cả ở cột nguồn lẫn ô thả */
        const paAll = [];
        const daCo = new Set();
        the.forEach(o => { if (!daCo.has(o.k)) { daCo.add(o.k); paAll.push(o); } });
        ds('.ro-drop').forEach((d, i) => {
          if (!coCau(i)) return;
          rows.push({
            raw: i, nhan: 'Vị trí ' + (i + 1), pa: paAll,
            dungKeys: new Set([String(answers[i])]),
          });
        });
        break;
      }

      /* ── Nối cột: vế trái là câu hỏi, phương án = các thẻ bên phải ───────────────────────── */
      case 'matching': {
        const paAll = ds('.mt-drop .mt-card[data-id]').map(c => ({
          k: String(c.dataset.id), chu: chu(c.querySelector('.mt-ctxt'), '(ảnh)'),
        }));
        ds('.mt-row').forEach((r, i) => {
          if (!coCau(i)) return;
          const l = r.querySelector('.mt-lcard:not(.mt-lempty)');
          rows.push({
            raw: i,
            nhan: chu(l && l.querySelector('.mt-ctxt')) || ('Hàng ' + (i + 1)),
            pa: paAll, dungKeys: new Set([String(answers[i])]),
          });
        });
        break;
      }

      /* ── Chọn mục từ: mỗi TỪ ĐÚNG là một câu, chỉ có chọn / không chọn ───────────────────── */
      case 'word-select': {
        const dung = (da && da.dung) || [];
        ds('.ws-word').forEach((w, i) => {
          if (!dung[i]) return;                      // từ sai KHÔNG tính điểm (§32.10)
          rows.push({
            raw: i, nhan: chu(w),
            pa: [{ k: '1', chu: 'Có chọn' }, { k: '0', chu: 'Không chọn' }],
            dungKeys: new Set(['1']),
          });
        });
        break;
      }

      /* ── Kéo từ trong bảng vào chỗ trống: phương án = chính bảng từ ──────────────────────── */
      case 'gap-fill': case 'pic-match': case 'ket-reading-part7': {
        const drop = layout === 'gap-fill' ? ds('.gf-drop')
          : layout === 'pic-match' ? ds('.pm-box')
            : (ds('.kp7-drop').length ? ds('.kp7-drop') : ds('.kp7-blank'));
        const tuGo = layout === 'ket-reading-part7' && !ds('.kp7-drop').length;
        const pa = tuGo ? null
          : paChip(layout === 'ket-reading-part7' ? '.kp7-bank .ww-chip' : '.ww-bank .ww-chip');
        let ctx = [];
        if (layout === 'gap-fill') {
          ctx = drop.map(d => {
            /* Lấy .gf-txt chứ KHÔNG phải cả .gf-card: card còn chứa số thứ tự "1." dính liền
               chữ đầu câu (markup không có khoảng trắng giữa hai span). */
            const t = d.closest ? d.closest('.gf-txt') : null;
            return t ? docNguCanh(t, [d], 80)[0] : '';
          });
        } else if (layout === 'ket-reading-part7') {
          ctx = docNguCanh(hop.querySelector('.kp7-content'), drop);
        }
        drop.forEach((_, i) => {
          if (!coCau(i)) return;
          rows.push({
            raw: i,
            nhan: layout === 'pic-match' ? 'Ô ' + (i + 1) : 'Chỗ trống ' + (i + 1),
            ctx: ctx[i] || '',
            pa: pa,
            dungKeys: new Set(phuongAn(answers[i])),
            chuoi: true,
          });
        });
        break;
      }

      /* ── Sơ đồ từ: bài làm là mảng LỒNG [web][ô] ─────────────────────────────────────────── */
      case 'word-web': {
        const pa = paChip('.ww-bank .ww-chip');
        const webs = (da && da.webs) || [];
        ds('.ww-web').forEach((w, wi) => {
          const nhanWeb = chu(w.querySelector('.ww-label'), 'Sơ đồ ' + (wi + 1));
          const tap = (webs[wi] || []).map(chuan);
          ds('.ww-drop', w).forEach((_, ci) => {
            rows.push({
              raw: rows.length, web: { wi, ci },
              nhan: nhanWeb + ' · ô ' + (ci + 1),
              ctx: 'Đáp án của sơ đồ: ' + (webs[wi] || []).join(' · '),
              pa: pa, dungKeys: new Set(tap), chuoi: true, tapHop: true,
            });
          });
        });
        break;
      }

      /* ── Ô chữ: mỗi Ô LƯỚI là một câu (đúng đơn vị của ChamDiem) ─────────────────────────── */
      case 'crossword': {
        const goiY = {};
        ds('.cw-clue[data-k]').forEach(c => {
          goiY[c.dataset.k] = chu(c.querySelector('b')) + ' ' + chu(c.querySelector('span'));
        });
        const dem = {};
        ds('.cw-in').forEach((o, i) => {
          const phan = [];
          ['ac', 'dn'].forEach(d => {
            const id = o.dataset[d === 'ac' ? 'ac' : 'dn'];
            if (id === undefined) return;
            const key = d + '-' + id;
            dem[key] = (dem[key] || 0) + 1;
            const g = goiY[key] || '';
            phan.push((d === 'ac' ? 'Ngang ' : 'Dọc ') + (g || id) + ' · chữ ' + dem[key]);
          });
          rows.push({
            raw: i, nhan: 'Ô ' + (i + 1), ctx: phan.join('   •   '),
            pa: null, dungKeys: new Set([chuanO(answers[i])]), oChu: true,
          });
        });
        break;
      }
    }
    return rows;
  }

  /* Lấy câu trả lời THÔ của một học viên cho một câu */
  function layTraLoi(baiLam, slideIdx, row) {
    const bl = (baiLam || []).find(x => x && x.slideIdx === slideIdx);
    const m = bl && Array.isArray(bl.baiLam) ? bl.baiLam : null;
    if (!m) return null;
    if (row.web) {
      const w = m[row.web.wi];
      return Array.isArray(w) ? w[row.web.ci] : null;
    }
    return m[row.raw];
  }

  /* Khoá dùng để ĐẾM + so với `dungKeys` (phải cùng phép chuẩn hoá với ChamDiem) */
  function khoaCua(v, row) {
    if (v === null || v === undefined || v === '') return null;
    if (row.oChu) return chuanO(v);
    if (row.chuoi) return chuan(v);
    return String(v);
  }

  /* ── Tổng hợp: mỗi câu một dòng, kèm phân bố câu trả lời ─────────────────────────────────── */
  function tongHop(slides, theoSlide, bai) {
    const CD = window.ChamDiem;
    const map = new Map();                       // "slideIdx:cau" → bản ghi
    const lay = (v) => {
      const k = v.slideIdx + ':' + v.cau;
      let o = map.get(k);
      if (!o) {
        const sl = slides[v.slideIdx] || {};
        o = { slideIdx: v.slideIdx, cau: v.cau, layout: sl.layout || '', lam: 0, dung: 0 };
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

    /* Gắn mô tả đề vào từng câu. `docSlide` trả theo ĐÚNG thứ tự câu nên ghép theo vị trí. */
    slides.forEach((sl, si) => {
      const da = theoSlide[si];
      if (!da) return;
      let rows = [];
      try { rows = docSlide(sl.html, sl.layout, da); } catch (e) { rows = []; }
      rows.forEach((row, cau) => {
        const o = map.get(si + ':' + cau);
        if (!o) return;
        o.row = row;
        /* Đếm phân bố. Giữ NGUYÊN văn câu trả lời (không gộp hoa/thường) để giáo viên nhìn thấy
           đúng thứ học viên đã gõ; việc tô xanh/đỏ mới dùng bản chuẩn hoá. */
        const dem = new Map();
        let trong = 0;
        bai.forEach(l => {
          const v = layTraLoi(l.bai_lam, si, row);
          const k = khoaCua(v, row);
          if (k === null) { trong++; return; }
          const hien = row.pa ? k : String(v).trim();
          const cu = dem.get(hien) || { n: 0, k: k };
          cu.n++; dem.set(hien, cu);
        });
        o.dem = dem; o.trong = trong;
      });
    });

    const ds = [...map.values()].sort((a, b) => a.slideIdx - b.slideIdx || a.cau - b.cau);
    ds.forEach((o, i) => { o.stt = i + 1; });
    return ds;
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

    const row = o.row;
    if (!row) {
      /* Không đọc được mô tả đề (layout lạ / HTML đổi) — vẫn cho biết tỉ lệ đúng */
      h += '<div class="cb-thanh"><i style="width:' + pc + '%"></i></div>'
        + '<p class="cb-phu">Không đọc được nội dung câu này từ đề — chỉ thống kê được tỉ lệ đúng.</p>';
      $('cbThan').innerHTML = h;
      return;
    }

    h += '<div class="cb-hoi">' + esc(row.nhan || '(không có chữ)') + '</div>';
    if (row.ctx) h += '<div class="cb-ctx">' + esc(row.ctx) + '</div>';
    h += '<div class="cb-pa">' + mucList(o).map(m => dongHtml(o, m)).join('') + '</div>';
    if (o.trong) h += '<p class="cb-phu">Không trả lời: ' + o.trong + '</p>';
    if (!row.pa) h += '<p class="cb-phu">Dạng bài tự gõ — bảng trên là các câu trả lời học viên đã nhập.</p>';
    $('cbThan').innerHTML = h;
  }

  /* Danh sách mục để vẽ: phương án CỐ ĐỊNH giữ nguyên thứ tự đề; trả lời TỰ DO xếp theo số
     lượt nhiều → ít (câu sai phổ biến nổi lên đầu, đúng thứ giáo viên cần giảng lại). */
  function mucList(o) {
    const row = o.row, dem = o.dem || new Map();
    let ds;
    if (row.pa) {
      ds = row.pa.map(p => ({
        chu: p.chu, n: (dem.get(String(p.k)) || {}).n || 0,
        dung: row.dungKeys.has(row.chuoi ? chuan(p.k) : String(p.k)),
      }));
      /* Câu trả lời KHÔNG nằm trong danh sách phương án của đề (dữ liệu cũ / đề sửa sau khi học
         viên đã làm) vẫn phải hiện, nếu không tổng các dòng không khớp số học viên đã làm. */
      const co = new Set(row.pa.map(p => String(p.k)));
      dem.forEach((v, k) => {
        if (!co.has(k)) ds.push({ chu: k, n: v.n, dung: row.dungKeys.has(v.k), la: true });
      });
    } else {
      ds = [];
      dem.forEach((v, k) => ds.push({ chu: k, n: v.n, dung: row.dungKeys.has(v.k) }));
      ds.sort((a, b) => b.n - a.n || String(a.chu).localeCompare(String(b.chu), 'vi'));
    }
    /* ⚠ KHÔNG dòng nào được đánh ✓ thì phải CHÈN đáp án đúng vào. Xảy ra khi cả lớp làm sai, và
       cả khi đáp án nhiều phương án ngăn bằng "/" mà bảng từ để nguyên cụm làm MỘT thẻ — lúc đó
       không thẻ nào khớp luật chấm. Màn này sinh ra để giáo viên thấy đáp án; bỏ trống là mất
       hẳn lý do tồn tại của nó. */
    if (HIEN_DA && !ds.some(x => x.dung)) {
      [...row.dungKeys].forEach(k => ds.push({ chu: k, n: (dem.get(k) || {}).n || 0, dung: true }));
    }
    return ds;
  }

  function dongHtml(o, m) {
    const pc = o.lam ? Math.round(m.n / o.lam * 100) : 0;
    const dung = HIEN_DA && m.dung;
    return '<div class="cb-dong' + (dung ? ' dung' : '') + (m.la ? ' la' : '') + '">'
      + '<span class="cb-dau-tich">' + (dung ? '✓' : '') + '</span>'
      + '<span class="cb-chu">' + esc(m.chu) + '</span>'
      + '<span class="cb-bar"><i style="width:' + pc + '%"></i></span>'
      + '<span class="cb-dem">' + m.n + '/' + o.lam + '</span>'
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
