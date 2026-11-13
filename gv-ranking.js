/* ══════════════════════════════════════════════════════════════════════════════════════════════
   MÀN RANKING — bục 3 thứ hạng hoạt hình 2D cho cửa sổ "Tiến độ lớp" (§41.32.1)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   Chỉ chạy ở chế độ chiếu (gv.html?chieu=…). Ô tick "Ranking" góc phải trên; `?rk=1` = bật sẵn
   (app gửi theo ô tick ở card "Đẩy lên web" của slide).

   ĐÃ CHỐT VỚI NGƯỜI DÙNG (2026-11-13):
   • Chỉ tính học viên ĐÃ NỘP, KHÔNG tính khách. Điểm = lượt CAO NHẤT (gv.js lamMoi đã gộp).
   • BẰNG ĐIỂM ⇒ ĐỨNG CHUNG một bục (xếp hạng theo 3 mức điểm cao nhất).
   • KẾT THÚC = mọi học viên của lớp ĐÃ VÀO làm bài đều đã nộp (hoặc phiên đã đóng) ⇒ ăn mừng.
     Có người vào muộn ⇒ quay lại trạng thái "tạm thời".
   • Không hiện hạng 4 trở đi. Tên in trên mặt bục, được xuống dòng.
   • Âm thanh tự tổng hợp (WebAudio, không tệp ngoài) — MẶC ĐỊNH TẮT, nút 🔇/🔊 cạnh ô tick.
   • Họ tên lấy từ window.__tenHV do app gửi sang qua main process (KHÔNG lên mạng, §41.3);
     mở trang bằng trình duyệt thường thì chỉ thấy mã định danh.
   Nhân vật vẽ bằng SVG + CSS animation (gv-ranking.css), ngoại hình sinh theo mã học viên nên
   mỗi em giữ một nhân vật suốt buổi.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const QS = new URLSearchParams(location.search);
  if (!QS.get('chieu')) return;                       // chỉ chế độ chiếu

  const KHOA_AM = 'rk_am';
  const BUC = [                                       // vị trí (% sân khấu) — thứ tự hạng 1, 2, 3
    { left: 37.5, w: 25, h: 40 },
    { left: 12, w: 25, h: 29 },
    { left: 63, w: 25, h: 20 },
  ];
  const SAN = 9;                                      // nền đất (% chiều cao) — đáy các bục
  const NV_CAO = 30;                                  // chiều cao nhân vật (% sân khấu)
  const TOI_DA_NV = 6;                                // tối đa nhân vật vẽ trên một bục

  let BAT = QS.get('rk') === '1';
  let AM = false; try { AM = localStorage.getItem(KHOA_AM) === '1'; } catch { }
  let DATA = null;                                    // lần cập nhật gần nhất
  let MA_PHIEN = '';
  let CU = null;                                      // { ma: hạng 0..2 } lần vẽ trước (null = vẽ lần đầu, không diễn biến)
  let XONG_CU = false;
  const NV = new Map();                               // ma → { el, hang, k, n, mood, den, ep, epDen }
  let nhipMood = null, nhipPhao = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tenCua = (ma) => {
    const t = window.__tenHV && window.__tenHV[String(ma).toLowerCase()];
    return t || ma;
  };
  const fmtDiem = (d) => (Math.round((+d || 0) * 100) / 100).toLocaleString('vi-VN') + ' điểm';
  function bam(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ── Khung giao diện ─────────────────────────────────────────────────────────────────────── */
  function dung() {
    const man = $('manCT');
    if (!man || $('rkMan')) return;
    const bar = document.createElement('div');
    bar.id = 'rkBar';
    bar.innerHTML = '<label title="Chuyển sang màn bảng xếp hạng (bục 3 thứ hạng)"><input type="checkbox" id="rkChk"> Ranking</label>'
      + '<button type="button" id="rkAm" title="Bật / tắt âm thanh"></button>';
    document.body.appendChild(bar);
    const s = document.createElement('div');
    s.id = 'rkMan';
    s.className = 'an';
    s.innerHTML = '<div class="rk-may m1"></div><div class="rk-may m2"></div><div class="rk-may m3"></div>'
      + '<div class="rk-tieude"><b id="rkTd">BẢNG XẾP HẠNG</b><span id="rkPhu"></span></div>'
      + '<div class="rk-san" id="rkSan"><div class="rk-tia"></div><div class="rk-dat"></div>'
      + BUC.map((b, i) => '<div class="rk-buc b' + (i + 1) + '" style="left:' + b.left + '%;width:' + b.w + '%;height:' + b.h + '%;bottom:' + SAN + '%">'
        + '<div class="rk-ngoi">' + (i + 1) + '</div><div class="rk-mat" id="rkMat' + i + '"></div></div>').join('')
      + '<div class="rk-nvs" id="rkNvs"></div><div class="rk-cho" id="rkCho">Chờ bài nộp đầu tiên<i>.</i><i>.</i><i>.</i></div></div>'
      + '<div class="rk-phao" id="rkPhao"></div>';
    man.appendChild(s);
    $('rkChk').checked = BAT;
    $('rkChk').addEventListener('change', e => bat(e.target.checked));
    $('rkAm').addEventListener('click', () => {
      AM = !AM; try { localStorage.setItem(KHOA_AM, AM ? '1' : '0'); } catch { }
      veNutAm(); if (AM) { amCtx(); amTieng('vao'); }
    });
    veNutAm();
    apBat();
  }
  function veNutAm() { const b = $('rkAm'); if (b) { b.textContent = AM ? '🔊' : '🔇'; b.classList.toggle('tat', !AM); } }

  function bat(on) {
    BAT = !!on;
    CU = null;                                         // bật lại = vẽ lần đầu, không diễn biến
    apBat();
    if (BAT && DATA) ve();
  }
  function apBat() {
    const man = $('manCT');
    if (man) man.classList.toggle('rk-on', BAT);
    $('rkMan').classList.toggle('an', !BAT);
    if (!BAT) { dungHet(); xoaNV(); }
  }

  /* ── Dữ liệu từ gv.js lamMoi ────────────────────────────────────────────────────────────── */
  function capNhat(d) {
    if (!$('rkMan')) dung();
    if (d.maPhien !== MA_PHIEN) { MA_PHIEN = d.maPhien; CU = null; XONG_CU = false; xoaNV(); dungHet(); }
    DATA = d;
    if (BAT) ve();
  }

  function tinh() {
    const { theoHV, trongLop, dong } = DATA;
    const lop = new Set(trongLop);
    const nop = [], vao = [];
    Object.keys(theoHV).forEach(ma => {
      if (!lop.has(ma)) return;                        // bỏ khách
      const l = theoHV[ma];
      vao.push(ma);
      if (l.nop_luc) nop.push({ ma, diem: +l.diem || 0, luc: l.nop_luc });
    });
    nop.sort((a, b) => b.diem - a.diem || String(a.luc).localeCompare(String(b.luc)));
    const nhom = [];
    nop.forEach(x => {
      const g = nhom[nhom.length - 1];
      if (g && g.diem === x.diem) g.ds.push(x);
      else if (nhom.length < 3) nhom.push({ diem: x.diem, ds: [x] });
    });
    const xong = nop.length > 0 && (dong || nop.length === vao.length);
    return { nhom, nop: nop.length, vao: vao.length, lop: trongLop.length, xong };
  }

  /* ── Vẽ ──────────────────────────────────────────────────────────────────────────────────── */
  function ve() {
    const r = tinh();
    $('rkCho').classList.toggle('an', r.nop > 0);
    $('rkTd').textContent = r.xong ? '🏆 KẾT QUẢ CHUNG CUỘC 🏆' : 'BẢNG XẾP HẠNG';
    $('rkMan').classList.toggle('xong', r.xong);
    const dangLam = r.vao - r.nop;
    $('rkPhu').textContent = 'Đã nộp ' + r.nop + '/' + r.lop + (dangLam > 0 ? ' · đang làm ' + dangLam : '')
      + (r.xong ? '' : ' · kết quả tạm thời');

    // Mặt bục: tên + điểm
    BUC.forEach((b, i) => {
      const g = r.nhom[i], m = $('rkMat' + i);
      if (!g) { m.innerHTML = ''; return; }
      const ds = g.ds, hien = ds.slice(0, 4).map(x => '<span>' + esc(tenCua(x.ma)) + '</span>').join('');
      const them = ds.length > 4 ? '<span class="rk-them">và ' + (ds.length - 4) + ' bạn khác</span>' : '';
      m.className = 'rk-mat n' + Math.min(ds.length, 5);
      m.innerHTML = '<div class="rk-ten">' + hien + them + '</div><div class="rk-diem">' + fmtDiem(g.diem) + '</div>';
    });

    // Nhân vật
    const moi = {};
    r.nhom.forEach((g, i) => g.ds.forEach(x => { moi[x.ma] = i; }));
    const dauTien = CU === null;
    const truoc = CU || {};
    let coRoi = false, coVao = false;
    // rời bục
    NV.forEach((o, ma) => { if (!(ma in moi)) { roiBuc(ma, o, !dauTien); coRoi = true; } });
    // đặt vị trí
    r.nhom.forEach((g, i) => {
      const ds = g.ds.slice(0, TOI_DA_NV);
      ds.forEach((x, k) => {
        let o = NV.get(x.ma);
        if (!o) { o = taoNV(x.ma, dauTien); NV.set(x.ma, o); coVao = true; }
        const cu = truoc[x.ma];
        o.hang = i; o.k = k; o.n = ds.length;
        datViTri(o);
        o.el.classList.toggle('top1', i === 0);
        if (!dauTien && cu !== undefined && cu !== i) {
          o.el.querySelector('.nv-o').classList.remove('chuyen'); void o.el.offsetWidth;
          o.el.querySelector('.nv-o').classList.add('chuyen');
          if (i > cu) epMood(o, 'buon', 5000); else epMood(o, 'vui', 3500);
          if (i > cu) amTieng('xuong');
        }
      });
      // quá TOI_DA_NV người cùng bục: người thừa không vẽ
      g.ds.slice(TOI_DA_NV).forEach(x => { const o = NV.get(x.ma); if (o) { o.el.remove(); NV.delete(x.ma); } });
    });
    if (!dauTien && coVao) amTieng('vao');
    if (!dauTien && coRoi) amTieng('xuong');
    CU = moi;

    if (r.xong && !XONG_CU) batDauMung(!dauTien);
    if (!r.xong && XONG_CU) dungMung();
    XONG_CU = r.xong;
    if (!nhipMood) nhipMood = setInterval(doiMood, 600);
    doiMood();
  }

  function datViTri(o) {
    const b = BUC[o.hang];
    const thu = o.n > 2 ? Math.max(.5, 2.2 / o.n) : 1;
    const x = b.left + (o.k + .5) / o.n * b.w;
    o.el.style.left = x + '%';
    o.el.style.bottom = (SAN + b.h) + '%';
    o.el.style.height = (NV_CAO * thu) + '%';
    o.el.style.zIndex = 10 - o.hang;
  }

  function roiBuc(ma, o, dien) {
    NV.delete(ma);
    if (!dien) { o.el.remove(); return; }
    o.el.className = o.el.className.replace(/\bm-\w+/g, '') + ' m-buon';
    o.el.querySelector('.nv-o').classList.add('roi');
    setTimeout(() => o.el.remove(), 2600);
  }

  /* ── Tâm trạng ───────────────────────────────────────────────────────────────────────────── */
  const MOOD_TAM = [                                  // trọng số theo hạng (vui, lo, nhin)
    [5, 2, 4], [3, 4, 3], [2, 5, 2],
  ];
  function epMood(o, m, ms) { o.ep = m; o.epDen = Date.now() + ms; o.den = 0; }
  function datMood(o, m) {
    if (o.mood === m) return;
    o.mood = m;
    o.el.classList.remove('m-vui', 'm-lo', 'm-nhin', 'm-buon', 'm-mung');
    o.el.classList.add('m-' + m);
    if (m === 'nhin') {
      const tr = o.hang === 1 ? 1 : o.hang === 2 ? -1 : (Math.random() < .5 ? -1 : 1);
      o.el.style.setProperty('--nghieng', (tr * 18) + 'deg');
      o.el.style.setProperty('--dx', (tr * 2.5) + 'px');
    }
  }
  function doiMood() {
    const now = Date.now();
    NV.forEach(o => {
      if (XONG_CU) { datMood(o, 'mung'); return; }
      if (o.ep && now < o.epDen) { datMood(o, o.ep); return; }
      o.ep = null;
      if (now < o.den) return;
      const w = MOOD_TAM[o.hang] || MOOD_TAM[2];
      let t = Math.random() * (w[0] + w[1] + w[2]);
      const m = (t -= w[0]) < 0 ? 'vui' : (t -= w[1]) < 0 ? 'lo' : 'nhin';
      datMood(o, m);
      o.den = now + 2600 + Math.random() * 2600;
    });
  }

  /* ── Ăn mừng ─────────────────────────────────────────────────────────────────────────────── */
  function batDauMung(am) {
    NV.forEach(o => { o.ep = null; datMood(o, 'mung'); });
    phao(160);
    clearInterval(nhipPhao);
    let lan = 0;
    nhipPhao = setInterval(() => { phao(50); if (++lan >= 8) { clearInterval(nhipPhao); nhipPhao = null; } }, 2200);
    if (am) amTieng('mung');
  }
  function dungMung() { clearInterval(nhipPhao); nhipPhao = null; NV.forEach(o => { o.mood = null; o.den = 0; }); }
  function dungHet() { dungMung(); clearInterval(nhipMood); nhipMood = null; const p = $('rkPhao'); if (p) p.innerHTML = ''; }
  function xoaNV() { NV.forEach(o => o.el.remove()); NV.clear(); }

  const MAU_PHAO = ['#ff4d6d', '#ffd60a', '#4cc9f0', '#80ed99', '#b388ff', '#ff9f1c', '#ffffff'];
  function phao(n) {
    const l = $('rkPhao'); if (!l) return;
    if (l.childElementCount > 400) return;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      const tg = 2.6 + Math.random() * 2.4;
      d.style.left = (Math.random() * 100) + '%';
      d.style.background = MAU_PHAO[i % MAU_PHAO.length];
      d.style.width = (6 + Math.random() * 7) + 'px';
      d.style.height = (9 + Math.random() * 9) + 'px';
      d.style.animationDuration = tg + 's, ' + (.6 + Math.random() * .8) + 's';
      d.style.animationDelay = (Math.random() * .9) + 's, 0s';
      d.style.setProperty('--troi', ((Math.random() - .5) * 160) + 'px');
      if (Math.random() < .3) d.style.borderRadius = '50%';
      l.appendChild(d);
      setTimeout(() => d.remove(), (tg + 1) * 1000);
    }
  }

  /* ── Nhân vật SVG (ngoại hình theo mã học viên) ─────────────────────────────────────────── */
  /* Học viên chủ yếu là NAM GIỚI 30–45 tuổi (người dùng chốt 2026-11-13) ⇒ nhân vật người lớn:
     đầu nhỏ so với thân, vai rộng, sơ mi có cổ (có/không cà vạt), thắt lưng; tóc ngắn kiểu nam
     (húi cua, rẽ ngôi, hói trán, cắt sát), tóc có thể điểm bạc; ria / râu lún phún; lông mày rậm;
     KHÔNG má hồng. Hạng 1 đeo HUY CHƯƠNG vàng trước ngực thay vương miện. */
  const DA = ['#f1c9a5', '#e5b48c', '#d49e74', '#b98159'];
  const AO = ['#2c3e50', '#556b2f', '#34495e', '#5d7fa3', '#7a8b99', '#7b2d3b', '#3f5d4f', '#8a7f5a', '#4a5a7a', '#5b4a6b', '#e9edf2', '#a8c3d8'];
  const QUAN = ['#1f2933', '#2f3640', '#3b3a36', '#26324a', '#4a4036'];
  const TOC = ['#1b1b1b', '#2b2118', '#3a2a1e', '#4a4a4a', '#6e6e6e'];
  const CA_VAT = ['#8b1e2d', '#1d3557', '#3a3a3a', '#6b4f1d'];
  function toi(hex, k) {                             // làm tối màu (cổ áo, cà vạt, sống mũi)
    const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.round(v * k));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function taoNV(ma, dauTien) {
    const h = bam(ma);
    const da = DA[h % 4], ao = AO[(h >>> 3) % AO.length], quan = QUAN[(h >>> 7) % QUAN.length];
    const toc = TOC[(h >>> 11) % TOC.length], kieu = (h >>> 14) % 4, kinh = ((h >>> 17) % 10) < 3;
    const rau = (h >>> 20) % 4;                       // 0,1 không · 2 ria mép · 3 râu lún phún
    const caVat = ((h >>> 23) % 3) === 0 ? CA_VAT[(h >>> 25) % CA_VAT.length] : '';
    const co = toi(ao, .78);
    const tocSvg = [
      `<path d="M33.5 32 Q32 13 50 12.5 Q68 13 66.5 32 Q64 22 57 20 Q50 22 42 20 Q36 22 33.5 32Z" fill="${toc}"/>`,
      `<path d="M33.5 33 Q31 12 52 11.5 Q69 13 66.5 31 Q64 20 54 19 L46 17 Q38 22 33.5 33Z" fill="${toc}"/>`,
      `<path d="M33.6 31 Q33 15 41 14 Q36.5 22 35.5 31Z M66.4 31 Q67 15 59 14 Q63.5 22 64.5 31Z" fill="${toc}"/>`
        + `<path d="M41 14.5 Q50 11 59 14.5 Q50 13.5 41 14.5Z" fill="${toc}" opacity=".6"/>`,
      `<path d="M33.5 30 Q33 14 50 13.5 Q67 14 66.5 30 Q60 18 50 18 Q40 18 33.5 30Z" fill="${toc}" opacity=".8"/>`,
    ][kieu];
    const rauSvg = rau === 2 ? `<path d="M44 41.5 Q50 38.8 56 41.5 Q50 42.6 44 41.5Z" fill="${toc}"/>`
      : rau === 3 ? `<path d="M35 37 Q36 52 50 53 Q64 52 65 37 Q61 46.5 50 47 Q39 46.5 35 37Z M44 41.5 Q50 39.5 56 41.5 Q50 42.4 44 41.5Z" fill="${toc}" opacity=".28"/>` : '';
    const svg = `<svg class="nv-svg" viewBox="0 0 100 140" aria-hidden="true">
      <ellipse class="nv-bong" cx="50" cy="136" rx="25" ry="4"/>
      <g class="nv-than">
        <g class="nv-chan"><rect x="37" y="102" width="11.5" height="30" rx="3" fill="${quan}"/><rect x="51.5" y="102" width="11.5" height="30" rx="3" fill="${quan}"/>
          <path d="M33 134 Q33 129.5 39 129.5 L48.5 129.5 L48.5 135.5 L34 135.5Z" fill="#1a1a1a"/>
          <path d="M67 134 Q67 129.5 61 129.5 L51.5 129.5 L51.5 135.5 L66 135.5Z" fill="#1a1a1a"/></g>
        <g class="nv-tay nv-tay-t"><rect x="23.5" y="58" width="10" height="35" rx="5" fill="${ao}"/><circle cx="28.5" cy="94" r="4.6" fill="${da}"/></g>
        <g class="nv-tay nv-tay-p"><rect x="66.5" y="58" width="10" height="35" rx="5" fill="${ao}"/><circle cx="71.5" cy="94" r="4.6" fill="${da}"/></g>
        <path d="M28 64 Q28 56 37 56 L63 56 Q72 56 72 64 L71 104 L29 104Z" fill="${ao}"/>
        <path d="M50 58 L50 102" stroke="${co}" stroke-width=".8"/>
        <circle cx="50" cy="70" r=".9" fill="${co}"/><circle cx="50" cy="80" r=".9" fill="${co}"/><circle cx="50" cy="90" r=".9" fill="${co}"/>
        ${caVat ? `<path d="M48.4 61 L51.6 61 L53.2 83 L50 87 L46.8 83Z" fill="${caVat}"/><path d="M47.6 58 L52.4 58 L51.6 61.5 L48.4 61.5Z" fill="${toi(caVat, .8)}"/>` : ''}
        <path d="M43 55.5 L50 61.5 L44.5 65Z M57 55.5 L50 61.5 L55.5 65Z" fill="${co}"/>
        <rect x="29" y="99" width="42" height="4.5" fill="#222"/><rect x="47.5" y="99.3" width="5" height="3.9" rx="1" fill="none" stroke="#c9a227" stroke-width="1"/>
        <g class="nv-mien"><path d="M45 56 L50 70 L55 56" fill="none" stroke="#c1121f" stroke-width="3"/>
          <circle cx="50" cy="73" r="5.6" fill="#ffd60a" stroke="#c99700" stroke-width="1.2"/><text x="50" y="75.6" text-anchor="middle" font-size="7" font-weight="700" fill="#8a6200">1</text></g>
        <rect x="45" y="47" width="10" height="10" fill="${da}"/>
        <g class="nv-dau">
          <circle cx="34" cy="34" r="3.6" fill="${da}"/><circle cx="66" cy="34" r="3.6" fill="${da}"/>
          <ellipse cx="50" cy="33" rx="16.5" ry="19.5" fill="${da}"/>
          ${tocSvg}
          ${rauSvg}
          <g class="nv-mat"><g class="nv-dongtu"><ellipse cx="43.5" cy="33" rx="2.1" ry="2.5" fill="#222"/><ellipse cx="56.5" cy="33" rx="2.1" ry="2.5" fill="#222"/>
            <circle cx="44.2" cy="32.1" r=".7" fill="#fff"/><circle cx="57.2" cy="32.1" r=".7" fill="#fff"/></g></g>
          ${kinh ? '<g fill="none" stroke="#2b2b2b" stroke-width="1.2"><rect x="38.5" y="29.5" width="10" height="7" rx="2.5"/><rect x="51.5" y="29.5" width="10" height="7" rx="2.5"/><path d="M48.5 32 L51.5 32"/></g>' : ''}
          <path class="nv-may may-thuong" d="M38.5 27.6 L47.5 26.6 M52.5 26.6 L61.5 27.6" stroke="${toc}" stroke-width="2.1" stroke-linecap="round"/>
          <path class="nv-may may-lo" d="M39 28.4 L47.5 25.6 M52.5 25.6 L61 28.4" stroke="${toc}" stroke-width="2.1" stroke-linecap="round"/>
          <path class="nv-may may-buon" d="M39 26 L47.5 28.6 M52.5 28.6 L61 26" stroke="${toc}" stroke-width="2.1" stroke-linecap="round"/>
          <path d="M50 33.5 Q48.2 38.5 50.6 39.4" fill="none" stroke="${toi(da, .72)}" stroke-width="1.1" stroke-linecap="round"/>
          <path class="nv-mieng mi-cuoi" d="M45 43.6 Q50 47.6 55 43.6" fill="none" stroke="#4a2418" stroke-width="1.7" stroke-linecap="round"/>
          <path class="nv-mieng mi-mo" d="M44.5 42.6 Q50 51.5 55.5 42.6Z" fill="#6b1d1d"/>
          <path class="nv-mieng mi-lo" d="M45.5 45 Q47.8 43 50 45 Q52.2 47 54.5 45" fill="none" stroke="#4a2418" stroke-width="1.7" stroke-linecap="round"/>
          <path class="nv-mieng mi-buon" d="M45.5 46.6 Q50 42.8 54.5 46.6" fill="none" stroke="#4a2418" stroke-width="1.7" stroke-linecap="round"/>
          <path class="nv-mieng mi-nhech" d="M46 45 Q51.5 46.4 55 42.6" fill="none" stroke="#4a2418" stroke-width="1.7" stroke-linecap="round"/>
          <path class="nv-mohoi" d="M66 19 Q69.5 25 66 27.5 Q62.5 25 66 19Z" fill="#7ec8ff"/>
          <path class="nv-nuocmat" d="M43.5 36 Q45.5 40 43.5 41.5 Q41.5 40 43.5 36Z" fill="#7ec8ff"/>
        </g>
      </g></svg>`;
    const el = document.createElement('div');
    el.className = 'rk-nv';
    el.innerHTML = '<div class="nv-o' + (dauTien ? ' vao-nhe' : ' vao') + '">' + svg + '</div>';
    el.style.setProperty('--tre', (h % 1000) / 1000 * -4 + 's');
    $('rkNvs').appendChild(el);
    return { el, hang: 0, k: 0, n: 1, mood: null, den: 0, ep: null, epDen: 0 };
  }

  /* ── Âm thanh tổng hợp (WebAudio) — mặc định TẮT ────────────────────────────────────────── */
  let CTX = null;
  function amCtx() {
    if (!CTX) { try { CTX = new (window.AudioContext || window.webkitAudioContext)(); } catch { CTX = null; } }
    if (CTX && CTX.state === 'suspended') CTX.resume().catch(() => { });
    return CTX;
  }
  function not(f, t0, dai, kieu, vol) {
    const c = CTX, o = c.createOscillator(), g = c.createGain();
    o.type = kieu || 'triangle'; o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || .18, t0 + .02);
    g.gain.exponentialRampToValueAtTime(.0005, t0 + dai);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dai + .05);
    return o;
  }
  function amTieng(loai) {
    if (!AM || !amCtx()) return;
    const t = CTX.currentTime + .02;
    if (loai === 'vao') { not(660, t, .12, 'sine', .15); not(990, t + .08, .16, 'sine', .15); }
    else if (loai === 'xuong') {                         // "bụp" trượt xuống
      const o = not(420, t, .35, 'sawtooth', .07); o.frequency.exponentialRampToValueAtTime(140, t + .32);
    } else if (loai === 'mung') {                        // kèn chiến thắng
      [[523, 0, .16], [659, .16, .16], [784, .32, .16], [1047, .48, .5], [784, .74, .14], [1047, .88, .7]]
        .forEach(([f, d, l]) => { not(f, t + d, l, 'square', .07); not(f / 2, t + d, l, 'triangle', .12); });
    }
  }

  window.Ranking = {
    capNhat, bat,
    coTen() { if (BAT && DATA) { CU = CU || null; ve(); } },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dung); else dung();
})();
