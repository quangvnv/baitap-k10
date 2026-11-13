/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   TRANG HỌC VIÊN — ĐÁM MÂY TỪ (§41.38). Ẩn danh: không mã học viên, chỉ mã thiết bị ngẫu nhiên
   (localStorage) để máy chủ chặn gửi lần 2. Mở bằng QR: k10.vn/tu/?m=123456
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TOI_DA = 40;
  let MA = '', SO = 3;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function thietBi() {
    let t = lsGet('tu_tb');
    if (!t || !/^[A-Za-z0-9-]{8,64}$/.test(t)) {
      t = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)));
      lsSet('tu_tb', t);
    }
    return t;
  }
  function man(id) {
    ['manMa', 'manTu', 'manXong'].forEach(m => $(m).classList.toggle('an', m !== id));
    $('dangTai').classList.add('an');
  }
  function loi(s) { $('loi').textContent = s || ''; }

  async function goi(than) {
    const r = await fetch(CAU_HINH.fnUrl('mayTu'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: CAU_HINH.anonKey, Authorization: 'Bearer ' + CAU_HINH.anonKey },
      body: JSON.stringify(than),
    });
    const kq = await r.json().catch(() => ({ loi: 'Máy chủ trả về dữ liệu không đọc được' }));
    if (!r.ok) { const e = new Error(kq.loi || ('Lỗi ' + r.status)); e.status = r.status; throw e; }
    return kq;
  }

  let NHIEU = false, DA_GUI = [];

  function chips(el, tu) {
    el.innerHTML = '';
    (tu || []).forEach(t => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = t; el.appendChild(s); });
  }
  function hienXong(tieuDe, tu, phu, coThem) {
    $('xongTt').textContent = tieuDe;
    chips($('xongTu'), tu);
    $('xongPhu').textContent = phu;
    $('btThem').classList.toggle('an', !coThem);
    man('manXong');
  }

  /* Dựng màn nhập: SO ô (1 lần) hoặc số ô CÒN LẠI (nhiều lần). Máy chủ là nguồn sự thật về
     "đã gửi" — mã tạo trước được xoá câu trả lời sau mỗi lượt trình chiếu, gửi lại được. */
  function hienNhap() {
    const con = NHIEU ? SO - DA_GUI.length : SO;
    if (NHIEU) {
      $('goiY').textContent = DA_GUI.length
        ? 'Bạn còn được gửi ' + con + ' từ nữa (tổng tối đa ' + SO + '). Gửi bao nhiêu cũng được, gửi tiếp lần sau.'
        : (SO === 1 ? 'Nhập 1 từ hoặc cụm từ.' : 'Gửi tối đa ' + SO + ' từ — gửi từng từ một hoặc nhiều từ một lần đều được.');
    } else {
      $('goiY').textContent = SO === 1 ? 'Nhập 1 từ hoặc cụm từ.' : 'Nhập tối đa ' + SO + ' từ hoặc cụm từ, mỗi ô một từ.';
    }
    chips($('daGuiTu'), DA_GUI);
    $('daGui').classList.toggle('an', !DA_GUI.length);
    const ds = $('dsO'); ds.innerHTML = '';
    for (let i = 0; i < con; i++) {
      const o = document.createElement('input');
      o.className = 'o o-tu'; o.maxLength = TOI_DA; o.autocomplete = 'off'; o.placeholder = 'Từ ' + (DA_GUI.length + i + 1);
      o.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const ke = ds.children[i + 1];
        if (ke) ke.focus(); else $('btGui').click();
      });
      ds.appendChild(o);
    }
    man('manTu');
    ds.firstChild && ds.firstChild.focus();
  }

  async function moMa(ma) {
    loi(''); MA = ma;
    $('dangTai').classList.remove('an');
    let kq;
    try { kq = await goi({ viec: 'xem', ma, thietBi: thietBi() }); }
    catch (e) { $('dangTai').classList.add('an'); man('manMa'); $('oMa').value = ma; loi(e.message); return; }
    SO = Math.max(1, Math.min(10, +kq.soTu || 3));
    NHIEU = !!kq.nhieu;
    DA_GUI = Array.isArray(kq.daGui) ? kq.daGui : [];
    $('cauHoi').textContent = kq.cauHoi || 'Nhập từ của bạn';
    const xem = 'Nhìn lên bảng để xem đám mây từ của cả lớp.';
    if (!kq.mo) { hienXong('Đã đóng nhận câu trả lời', DA_GUI, 'Giáo viên đã đóng phần gửi từ.'); return; }
    if (!NHIEU && DA_GUI.length) { hienXong('Bạn đã gửi', DA_GUI, 'Mỗi người chỉ gửi một lần. ' + xem); return; }
    if (NHIEU && DA_GUI.length >= SO) { hienXong('Bạn đã gửi đủ ' + SO + ' từ', DA_GUI, xem); return; }
    hienNhap();
  }

  $('btGui').addEventListener('click', async () => {
    loi('');
    const tu = [...document.querySelectorAll('.o-tu')].map(o => o.value.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!tu.length) { loi('Hãy nhập ít nhất một từ.'); return; }
    $('btGui').disabled = true; $('btGui').textContent = 'Đang gửi…';
    const xem = 'Nhìn lên bảng để xem đám mây từ của cả lớp.';
    try {
      const kq = await goi({ viec: 'gui', ma: MA, thietBi: thietBi(), tu });
      DA_GUI = kq.tatCa || DA_GUI.concat(kq.tu || tu);
      if (NHIEU && kq.conLai > 0) hienXong('Đã gửi — cảm ơn bạn!', DA_GUI, 'Bạn còn được gửi ' + kq.conLai + ' từ nữa. ' + xem, true);
      else hienXong('Đã gửi — cảm ơn bạn!', DA_GUI, xem);
    } catch (e) {
      if (e.status === 409) hienXong(NHIEU ? 'Bạn đã gửi đủ ' + SO + ' từ' : 'Bạn đã gửi', DA_GUI, e.message);
      else if (e.status === 403) hienXong('Đã đóng nhận câu trả lời', DA_GUI, e.message);
      else loi(e.message);
    } finally { $('btGui').disabled = false; $('btGui').textContent = 'Gửi'; }
  });
  $('btThem').addEventListener('click', () => moMa(MA));

  $('oMa').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
  $('oMa').addEventListener('keydown', e => { if (e.key === 'Enter') $('btMa').click(); });
  $('btMa').addEventListener('click', () => {
    const ma = $('oMa').value.trim();
    if (!/^\d{6}$/.test(ma)) { loi('Mã phải là 6 chữ số'); return; }
    moMa(ma);
  });

  const m = new URLSearchParams(location.search).get('m');
  if (m && /^\d{6}$/.test(m)) moMa(m); else { man('manMa'); $('oMa').focus(); }
})();
