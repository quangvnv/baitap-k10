/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TAB "THEO DÕI LỚP" — trạng thái học tập của học viên XUYÊN NHIỀU PHIÊN (§41.22)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   Khác tab "Phiên bài tập" (một phiên, theo dõi lớp đang làm bài theo thời gian thực): tab này
   là bức tranh TỔNG KẾT — ma trận Học viên × Phiên, để GV thấy ai đã làm những bài nào, ai còn
   nợ, ai điểm kém.

   ⚠ NẠP SAU gv.js và dùng lại `window.WebGV` (api/bao/esc/$/hien) — KHÔNG khai lại TOKEN hay
     hàm api ở đây; hai file cùng khai `const TOKEN` cấp cao nhất là cả trang chết (xem gv.js).

   ⚠ HÀNG CỦA BẢNG LẤY TỪ `lop_hv`, KHÔNG phải từ `luot`. Đây là điểm cốt lõi: học viên KHÔNG
     vào bài thì không có lượt nào, dựng bảng từ `luot` là em đó biến mất — đúng người mà tab
     này sinh ra để phát hiện.

   ⚠ KHÔNG có họ tên (§41.3) — CSDL cloud chỉ lưu mã định danh. Đây là chủ ý, không phải thiếu sót.

   ⚠ KHÔNG hỏi lại máy chủ theo nhịp (khác tab Phiên): đây là màn xem tổng kết, không phải theo
     dõi lớp đang làm bài ⇒ tải một lần, muốn mới thì bấm ↻. Đỡ hàng trăm lời gọi vô ích.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { api, bao, esc, $, hien } = window.WebGV;

  const KHOA_LOP = 'td_lop', KHOA_KIEU = 'td_kieu';
  const NGAY_MAC_DINH = 30;                 // khoảng ngày mở sẵn khi vào tab

  const TD = {
    dsLopChon: null,     // danh sách lớp cho dropdown (nạp một lần)
    phien: [],           // phiên trong khoảng, đã lọc theo lớp + kiểu
    trongLop: [],        // mã học viên của lớp (nguồn HÀNG của bảng)
    tot: {},             // tot[phienId][maHv] = lượt điểm CAO NHẤT đã nộp
    dangLam: {},         // dangLam[phienId][maHv] = true khi có lượt chưa nộp
    soLan: {},           // soLan[phienId][maHv] = số lượt ĐÃ NỘP
    hvXem: null,         // mã học viên đang mở màn chi tiết
  };

  /* ── Tiện ích ─────────────────────────────────────────────────────────────────────────── */
  const ngayISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const ddmm = (s) => { const d = new Date(s); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
  const ddmmhh = (s) => { const d = new Date(s); return ddmm(s) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const mauDiem = (d) => (d < 5 ? 'kem' : (d < 7 ? 'vua' : 'tot'));
  const soDep = (n) => (Math.round(n * 10) / 10).toFixed(1);
  // ⚠ Rút gọn tên bài Ở ĐÂY, KHÔNG dùng text-overflow:ellipsis của CSS: ô tiêu đề căn giữa nên
  //   chuỗi dài bị cắt CẢ HAI ĐẦU ("U3 — Reading" hiện thành "J3 — Readin…"). Tên đủ ở tooltip.
  const rutGon = (s, n = 15) => (s = String(s || ''), s.length > n ? s.slice(0, n - 1) + '…' : s);

  /* ── Mở tab ───────────────────────────────────────────────────────────────────────────── */
  async function mo() {
    hien('manTD', true); hien('manHV', false);
    if (!TD.dsLopChon) await napLop();
    if (!$('tdTu').value) {
      const nay = new Date(), truoc = new Date(Date.now() - NGAY_MAC_DINH * 86400000);
      $('tdTu').value = ngayISO(truoc);
      $('tdDen').value = ngayISO(nay);
    }
    await tai();
  }

  async function napLop() {
    let ds = [];
    try { ds = await api('/rest/v1/lop?select=ma_lop&order=ma_lop.asc'); } catch (e) { bao(e.message, 'nhac'); }
    TD.dsLopChon = ds.map(x => x.ma_lop);
    const nho = localStorage.getItem(KHOA_LOP);
    $('tdLop').innerHTML = TD.dsLopChon.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('')
      || '<option value="">(chưa có lớp nào)</option>';
    if (nho && TD.dsLopChon.indexOf(nho) >= 0) $('tdLop').value = nho;
    const nhoK = localStorage.getItem(KHOA_KIEU);
    if (nhoK) $('tdKieu').value = nhoK;
  }

  /* ── Tải dữ liệu ──────────────────────────────────────────────────────────────────────── */
  async function tai() {
    const lop = $('tdLop').value, kieu = $('tdKieu').value;
    const tu = $('tdTu').value, den = $('tdDen').value;
    try { localStorage.setItem(KHOA_LOP, lop); localStorage.setItem(KHOA_KIEU, kieu); } catch { }
    if (!lop) { $('tdBody').innerHTML = ''; $('tdTom').textContent = 'Chưa có lớp nào trên hệ thống.'; return; }
    if (tu && den && tu > den) { bao('Khoảng ngày không hợp lệ: ngày bắt đầu sau ngày kết thúc.', 'nhac'); return; }

    // `mo_luc` là timestamptz ⇒ chặn trên phải là 00:00 của NGÀY KẾ TIẾP, không thì mất trọn
    // các phiên mở trong chính ngày "đến".
    const denSau = den ? ngayISO(new Date(new Date(den + 'T00:00:00').getTime() + 86400000)) : '';
    let q = '/rest/v1/v_phien_bang?select=*&ma_lop=eq.' + encodeURIComponent(lop) + '&order=mo_luc.asc';
    if (tu) q += '&mo_luc=gte.' + tu;
    if (denSau) q += '&mo_luc=lt.' + denSau;
    if (kieu) q += '&kieu=eq.' + kieu;

    $('tdTom').textContent = 'Đang tải…';
    let phien = [], dsLop = [], luot = [];
    try {
      [phien, dsLop] = await Promise.all([
        api(q),
        api('/rest/v1/lop_hv?select=ma_hv&ma_lop=eq.' + encodeURIComponent(lop)),
      ]);
      if (phien.length) {
        const ids = phien.map(p => p.id).join(',');
        luot = await api('/rest/v1/luot?select=phien_id,ma_hv,khach,diem,so_dung,tong,qs,lan,bat_dau,nop_luc'
          + '&phien_id=in.(' + ids + ')');
      }
    } catch (e) { bao(e.message, 'nhac'); $('tdTom').textContent = '—'; return; }

    TD.phien = phien;
    TD.trongLop = dsLop.map(x => x.ma_hv);
    TD.tot = {}; TD.dangLam = {}; TD.soLan = {};
    luot.forEach(l => {
      if (!l.nop_luc) { (TD.dangLam[l.phien_id] || (TD.dangLam[l.phien_id] = {}))[l.ma_hv] = true; return; }
      const t = TD.tot[l.phien_id] || (TD.tot[l.phien_id] = {});
      // §41.9: điểm chính thức = LƯỢT CAO NHẤT. Điểm 0 là điểm hợp lệ, đừng coi như "chưa có".
      if (t[l.ma_hv] == null || (+l.diem || 0) > (+t[l.ma_hv].diem || 0)) t[l.ma_hv] = l;
      const s = TD.soLan[l.phien_id] || (TD.soLan[l.phien_id] = {});
      s[l.ma_hv] = (s[l.ma_hv] || 0) + 1;
    });
    ve();
  }

  /* ── Vẽ ma trận ───────────────────────────────────────────────────────────────────────── */
  function ve() {
    const P = TD.phien;
    // Mã xuất hiện trong lượt nhưng KHÔNG có trong lop_hv = khách (§41.9)
    const daGap = {};
    P.forEach(p => {
      Object.keys(TD.tot[p.id] || {}).forEach(m => daGap[m] = 1);
      Object.keys(TD.dangLam[p.id] || {}).forEach(m => daGap[m] = 1);
    });
    const khach = Object.keys(daGap).filter(m => TD.trongLop.indexOf(m) < 0).sort();
    const trong = TD.trongLop.slice().sort();

    // Tiêu đề cột: mỗi phiên một cột, bấm vào mở chi tiết phiên bên tab "Phiên bài tập"
    $('tdHead').innerHTML = `<tr>
      <th class="td-s td-c1">Mã học viên</th>
      <th class="td-s td-c2">Đã làm</th>
      <th class="td-s td-c3">TB</th>
      ${P.map(p => `<th class="td-p co-tro" data-pid="${p.id}" title="${esc(p.ten_bai || '')} · mã ${esc(p.ma_phien)}">
          <span class="td-pt">${esc(rutGon(p.ten_bai) || '—')}</span>
          <span class="td-pd">${ddmm(p.mo_luc)} · ${p.kieu === 'tai_lop' ? 'lớp' : 'nhà'}</span>
        </th>`).join('')}
      <th class="td-hut"></th></tr>`;
    $('tdHead').querySelectorAll('th[data-pid]').forEach(th => {
      const p = P.find(x => x.id === th.dataset.pid);
      th.onclick = () => window.WebGV.moPhien(p.id, p.ten_bai, p.so_cau);
    });

    const hangHtml = (ma, laKhach) => {
      let daLam = 0, tongD = 0;
      const o = P.map(p => {
        const l = (TD.tot[p.id] || {})[ma];
        if (l) {
          daLam++; tongD += (+l.diem || 0);
          const n = (TD.soLan[p.id] || {})[ma] || 1;
          return `<td class="giua o-diem ${mauDiem(+l.diem || 0)}" title="${l.so_dung}/${l.tong} câu · lượt ${n}">${soDep(+l.diem || 0)}</td>`;
        }
        if ((TD.dangLam[p.id] || {})[ma]) return '<td class="giua dang-lam" title="đang làm dở">⏳</td>';
        return '<td class="giua mo-nhat">──</td>';
      }).join('');
      const tb = daLam ? tongD / daLam : null;
      // "Cần chú ý" = chưa làm bài nào, hoặc điểm trung bình dưới 5
      const nhac = P.length && (daLam === 0 || (tb != null && tb < 5));
      return `<tr class="co-tro${nhac ? ' td-nhac' : ''}" data-hv="${esc(ma)}">
        <td class="td-s td-c1 ma">${nhac ? '<span class="td-canh">⚠</span>' : ''}${esc(ma)}${laKhach ? ' <i class="nhan-khach">khách</i>' : ''}</td>
        <td class="td-s td-c2 giua${daLam === 0 && P.length ? ' mo-nhat' : ''}">${daLam}/${P.length}</td>
        <td class="td-s td-c3 giua diem-o">${tb == null ? '<span class="mo-nhat">–</span>' : soDep(tb)}</td>
        ${o}<td class="td-hut"></td></tr>`;
    };

    const nhomKhach = khach.length
      ? `<tr class="td-nhom"><td colspan="${P.length + 4}">KHÁCH — mã không có trong danh sách lớp</td></tr>`
      : '';
    $('tdBody').innerHTML = trong.map(m => hangHtml(m, false)).join('')
      + nhomKhach + khach.map(m => hangHtml(m, true)).join('');
    $('tdBody').querySelectorAll('tr[data-hv]').forEach(tr => {
      tr.onclick = () => moHV(tr.dataset.hv);
    });

    ghimCot();
    hien('tdTrong', !P.length);

    // Dải tóm tắt
    const dsD = [];
    let duHet = 0, con = 0;
    trong.forEach(m => {
      let n = 0, t = 0;
      P.forEach(p => { const l = (TD.tot[p.id] || {})[m]; if (l) { n++; t += (+l.diem || 0); } });
      if (P.length && n === P.length) duHet++; else if (P.length) con++;
      if (n) dsD.push(t / n);
    });
    const tbLop = dsD.length ? soDep(dsD.reduce((a, b) => a + b, 0) / dsD.length) : '–';
    $('tdTom').innerHTML = P.length
      ? `Sĩ số <b>${trong.length}</b> · <b>${P.length}</b> phiên · Đã làm đủ <b>${duHet}</b>`
        + ` · Còn nợ <b class="${con ? 'canh' : ''}">${con}</b> · Điểm TB lớp <b>${tbLop}</b>`
        + (khach.length ? ` · Khách <b>${khach.length}</b>` : '')
      : `Sĩ số <b>${trong.length}</b> · không có phiên nào trong khoảng ngày đã chọn`;
  }

  /* ⚠ Vị trí ghim của 2 cột giữa phải ĐO từ bề rộng THẬT, không đặt số cứng trong CSS: bảng
     dùng table-layout:auto nên cột co theo nội dung (mã học viên dài/ngắn, số phiên…). Lệch vài
     px là cột ghim ĐÈ LÊN tiêu đề cột phiên đầu tiên và nuốt mất chữ đầu — nhìn như lỗi phông. */
  function ghimCot() {
    const t = document.querySelector('.td-bang');
    const a = $('tdHead').querySelector('.td-c1'), b = $('tdHead').querySelector('.td-c2');
    if (!t || !a || !b) return;
    t.style.setProperty('--td-l2', a.offsetWidth + 'px');
    t.style.setProperty('--td-l3', (a.offsetWidth + b.offsetWidth) + 'px');
  }
  window.addEventListener('resize', ghimCot);

  /* ── Chi tiết một học viên (dựng từ dữ liệu đã tải, KHÔNG gọi lại máy chủ) ─────────────── */
  function moHV(ma) {
    TD.hvXem = ma;
    hien('manTD', false); hien('manHV', true);
    const laKhach = TD.trongLop.indexOf(ma) < 0;
    $('hvMa').innerHTML = esc(ma) + (laKhach ? ' <i class="nhan-khach">khách</i>' : '');
    $('hvLop').textContent = $('tdLop').value;

    let n = 0, t = 0, lanCuoi = 0;
    const dong = TD.phien.map(p => {
      const l = (TD.tot[p.id] || {})[ma];
      const dang = (TD.dangLam[p.id] || {})[ma];
      const nLuot = (TD.soLan[p.id] || {})[ma] || 0;
      const kieu = p.kieu === 'tai_lop' ? 'Tại lớp' : 'Về nhà';
      if (l) {
        n++; t += (+l.diem || 0);
        const x = new Date(l.nop_luc).getTime(); if (x > lanCuoi) lanCuoi = x;
        const qs = l.qs || [];
        return `<tr><td>${esc(p.ten_bai || '—')}</td><td class="giua">${kieu}</td>
          <td class="giua">${nLuot}/${p.so_luot_toi_da || 3}</td>
          <td class="giua diem-o o-diem ${mauDiem(+l.diem || 0)}">${soDep(+l.diem || 0)}</td>
          <td class="giua">${l.so_dung}/${l.tong}</td>
          <td class="giua">${ddmmhh(l.nop_luc)}</td>
          <td class="o-qs">${qs.map(d => '<i class="' + (d ? 'd' : 's') + '"></i>').join('')}</td></tr>`;
      }
      return `<tr><td>${esc(p.ten_bai || '—')}</td><td class="giua">${kieu}</td>
        <td class="giua mo-nhat">${dang ? nLuot : '–'}</td>
        <td class="giua ${dang ? 'dang-lam' : 'mo-nhat'}">${dang ? '⏳' : '──'}</td>
        <td class="giua mo-nhat">–</td>
        <td class="giua ${dang ? 'dang-lam' : 'mo-nhat'}">${dang ? 'đang làm' : 'chưa làm'}</td>
        <td></td></tr>`;
    }).join('');

    $('hvBody').innerHTML = dong || '<tr><td colspan="7" class="trong">Không có phiên nào trong khoảng ngày.</td></tr>';
    $('hvTom').innerHTML = `Đã làm <b>${n}/${TD.phien.length}</b>`
      + ` · Điểm TB <b>${n ? soDep(t / n) : '–'}</b>`
      + (lanCuoi ? ` · Lần gần nhất <b>${ddmmhh(new Date(lanCuoi).toISOString())}</b>` : '');
  }

  /* ── Nối sự kiện ──────────────────────────────────────────────────────────────────────── */
  $('tdLop').addEventListener('change', tai);
  $('tdKieu').addEventListener('change', tai);
  $('tdTu').addEventListener('change', tai);
  $('tdDen').addEventListener('change', tai);
  $('tdMoi').addEventListener('click', tai);
  $('hvVe').addEventListener('click', () => { hien('manHV', false); hien('manTD', true); });

  window.TheoDoi = { mo };
})();
