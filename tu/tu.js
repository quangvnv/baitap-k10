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

  function hienXong(tieuDe, tu, phu) {
    $('xongTt').textContent = tieuDe;
    $('xongTu').innerHTML = '';
    (tu || []).forEach(t => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = t; $('xongTu').appendChild(s); });
    $('xongPhu').textContent = phu;
    man('manXong');
  }

  async function moMa(ma) {
    loi(''); MA = ma;
    const daGui = lsGet('tu_da_gui_' + ma);
    if (daGui) {
      let tu = []; try { tu = JSON.parse(daGui); } catch (e) { }
      hienXong('Bạn đã gửi', tu, 'Mỗi người chỉ gửi một lần. Nhìn lên bảng để xem đám mây từ của cả lớp.');
      return;
    }
    $('dangTai').classList.remove('an');
    let kq;
    try { kq = await goi({ viec: 'xem', ma }); }
    catch (e) { $('dangTai').classList.add('an'); man('manMa'); $('oMa').value = ma; loi(e.message); return; }
    if (!kq.mo) { hienXong('Đã đóng nhận câu trả lời', [], 'Giáo viên đã đóng phần gửi từ.'); return; }
    SO = Math.max(1, Math.min(10, +kq.soTu || 3));
    $('cauHoi').textContent = kq.cauHoi || 'Nhập từ của bạn';
    $('goiY').textContent = SO === 1 ? 'Nhập 1 từ hoặc cụm từ.' : 'Nhập tối đa ' + SO + ' từ hoặc cụm từ, mỗi ô một từ.';
    const ds = $('dsO'); ds.innerHTML = '';
    for (let i = 0; i < SO; i++) {
      const o = document.createElement('input');
      o.className = 'o o-tu'; o.maxLength = TOI_DA; o.autocomplete = 'off'; o.placeholder = 'Từ ' + (i + 1);
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

  $('btGui').addEventListener('click', async () => {
    loi('');
    const tu = [...document.querySelectorAll('.o-tu')].map(o => o.value.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!tu.length) { loi('Hãy nhập ít nhất một từ.'); return; }
    $('btGui').disabled = true; $('btGui').textContent = 'Đang gửi…';
    try {
      const kq = await goi({ viec: 'gui', ma: MA, thietBi: thietBi(), tu });
      lsSet('tu_da_gui_' + MA, JSON.stringify(kq.tu || tu));
      hienXong('Đã gửi — cảm ơn bạn!', kq.tu || tu, 'Nhìn lên bảng để xem đám mây từ của cả lớp.');
    } catch (e) {
      if (e.status === 409) { lsSet('tu_da_gui_' + MA, JSON.stringify(tu)); hienXong('Bạn đã gửi', [], e.message); }
      else if (e.status === 403) hienXong('Đã đóng nhận câu trả lời', [], e.message);
      else loi(e.message);
    } finally { $('btGui').disabled = false; $('btGui').textContent = 'Gửi'; }
  });

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
