/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TAB "DUNG LƯỢNG" của gv.html (§41.23) — theo dõi dung lượng Supabase + GitHub, dọn dữ liệu cũ
   ──────────────────────────────────────────────────────────────────────────────────────────────
   CHỈ CB (vai_tro='admin'). Tab ẩn với GV, và các hàm RPC tự chặn bằng la_admin() — tab chỉ là
   giao diện, đừng coi việc ẩn nút là phân quyền.

   ⚠ NẠP SAU gv.js, dùng lại `window.WebGV` — KHÔNG khai lại TOKEN/api/$ ở cấp cao nhất.

   ⚠ NGUỒN SỐ LIỆU:
     · Supabase → RPC `dung_luong()` (security definer). KHÔNG lấy được băng thông (egress): số đó
       chỉ có qua Management API bằng Personal Access Token, mà token đó TUYỆT ĐỐI không được
       xuống trình duyệt (§41.16).
     · GitHub → API công khai, không token (repo public). Giới hạn 60 lượt/giờ theo IP ⇒ nhớ kết
       quả 10 phút trong sessionStorage, nút ↻ mới hỏi lại. Băng thông Pages GitHub không công khai.
     · "Repo" (size của API) là dung lượng GIT ĐÃ NÉN, gồm cả lịch sử commit; "Trang web" là tổng
       các tệp ở commit mới nhất = đúng thứ GitHub Pages phát hành. Hai số khác nhau là bình thường.

   ⚠ XOÁ Ở GITHUB KHÔNG làm ở đây (cần token ghi) — chỉ theo dõi.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { api, bao, esc, $, hien } = window.WebGV;

  /* Hạn mức gói miễn phí — đổi gói thì sửa ở đây. */
  const GIOI_HAN = {
    db: 500 * 1024 * 1024,         // Supabase Free: CSDL 500 MB
    storage: 1024 * 1024 * 1024,   // Supabase Free: File Storage 1 GB
    repo: 1024 * 1024 * 1024,      // GitHub: khuyến nghị repo < 1 GB
    pages: 1024 * 1024 * 1024,     // GitHub Pages: trang phát hành tối đa 1 GB
  };
  const NGUONG_CANH_BAO = 0.8;     // chấm đỏ trên nút tab
  const GH_CACHE_MS = 10 * 60 * 1000;
  const SO_TEP_LON = 10;

  /* owner/repo suy từ địa chỉ trang (quangvnv.github.io/baitap-k10/…); chạy thử cục bộ thì rơi về
     hằng số. */
  const GH = (() => {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (m && seg && !/\.html?$/i.test(seg)) return { owner: m[1], repo: seg };
    return { owner: 'quangvnv', repo: 'baitap-k10' };
  })();

  const S = { sb: null, gh: null, luc: null };

  /* ── Tiện ích ─────────────────────────────────────────────────────────────────────────── */
  function coByte(n) {
    n = +n || 0;
    if (n < 1024) return n + ' B';
    const dv = ['KB', 'MB', 'GB']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < dv.length - 1);
    return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace('.', ',') + ' ' + dv[i];
  }
  const gio7 = (s) => s ? new Date(s).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '—';
  const ngayISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const mucMau = (tile) => tile >= 0.9 ? 'kem' : tile >= 0.7 ? 'vua' : 'tot';

  function thanh(nhan, dung, tran, phu) {
    const tile = tran ? dung / tran : 0;
    const pt = Math.min(100, tile * 100);
    return `<div class="dl-dong">
      <div class="dl-nhan">${esc(nhan)}${phu ? `<span class="dl-phu">${esc(phu)}</span>` : ''}</div>
      <div class="dl-thanh"><i class="${mucMau(tile)}" style="width:${pt.toFixed(1)}%"></i></div>
      <div class="dl-so"><b>${coByte(dung)}</b> / ${coByte(tran)} <span class="mo-nhat">(${(tile * 100).toFixed(1).replace('.', ',')}%)</span></div>
    </div>`;
  }

  /* ── Lấy số liệu ──────────────────────────────────────────────────────────────────────── */
  const rpc = (ten, than) => api('/rest/v1/rpc/' + ten, { method: 'POST', body: JSON.stringify(than || {}) });

  async function layGH(epMoi) {
    const khoa = 'dl_gh_' + GH.owner + '/' + GH.repo;
    if (!epMoi) {
      try {
        const c = JSON.parse(sessionStorage.getItem(khoa) || 'null');
        if (c && Date.now() - c.t < GH_CACHE_MS) return c.v;
      } catch { }
    }
    const goc = 'https://api.github.com/repos/' + GH.owner + '/' + GH.repo;
    const lay = async (url) => {
      const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (r.status === 403 || r.status === 429) throw new Error('GitHub tạm chặn vì hỏi quá nhiều (60 lượt/giờ). Thử lại sau ít phút.');
      if (!r.ok) throw new Error('GitHub trả lỗi ' + r.status);
      return r.json();
    };
    const repo = await lay(goc);
    const cay = await lay(goc + '/git/trees/' + encodeURIComponent(repo.default_branch) + '?recursive=1');
    const tep = (cay.tree || []).filter(x => x.type === 'blob').map(x => ({ path: x.path, size: x.size || 0 }));
    const v = {
      repoByte: (repo.size || 0) * 1024,     // API trả KB
      pushedAt: repo.pushed_at,
      nhanh: repo.default_branch,
      soTep: tep.length,
      trangByte: tep.reduce((a, x) => a + x.size, 0),
      tepLon: tep.sort((a, b) => b.size - a.size).slice(0, SO_TEP_LON),
      catBot: !!cay.truncated,
    };
    try { sessionStorage.setItem(khoa, JSON.stringify({ t: Date.now(), v })); } catch { }
    return v;
  }

  /* Tỉ lệ dùng lớn nhất trong 4 thước đo — cho chấm đỏ trên nút tab. */
  function tileMax() {
    const ds = [];
    if (S.sb) ds.push(S.sb.db_byte / GIOI_HAN.db, S.sb.storage_byte / GIOI_HAN.storage);
    if (S.gh) ds.push(S.gh.repoByte / GIOI_HAN.repo, S.gh.trangByte / GIOI_HAN.pages);
    return ds.length ? Math.max(...ds) : 0;
  }
  function capNhatCham() {
    const t = $('tabDungLuong'); if (!t) return;
    const vuot = tileMax() >= NGUONG_CANH_BAO;
    t.classList.toggle('co-canh', vuot);
    t.title = vuot ? 'Có hạn mức đã dùng từ ' + Math.round(NGUONG_CANH_BAO * 100) + '% trở lên' : '';
  }

  /* ── Vẽ ───────────────────────────────────────────────────────────────────────────────── */
  function veSB(loi) {
    if (loi) { $('dlSB').innerHTML = `<p class="loi-nho">${esc(loi)}</p>`; $('dlBangBody').innerHTML = ''; return; }
    const x = S.sb;
    $('dlSB').innerHTML = thanh('Cơ sở dữ liệu', x.db_byte, GIOI_HAN.db)
      + thanh('File Storage', x.storage_byte, GIOI_HAN.storage, x.storage_tep + ' tệp');
    const bang = x.bang || [];
    $('dlBangBody').innerHTML = bang.map((b, i) => `<tr>
        <td class="giua mo-nhat">${i + 1}</td>
        <td class="ma">${esc(b.ten)}</td>
        <td class="giua">${(+b.dong).toLocaleString('vi-VN')}</td>
        <td class="giua">${coByte(b.byte)}</td>
        <td><div class="dl-thanh dl-thanh-nho"><i class="tot" style="width:${(x.db_byte ? b.byte / x.db_byte * 100 : 0).toFixed(1)}%"></i></div></td>
      </tr>`).join('')
      + `<tr class="dl-khac"><td></td><td>(hệ thống Supabase: auth, storage, realtime…)</td><td class="giua">—</td>
         <td class="giua">${coByte(x.he_thong_byte)}</td>
         <td><div class="dl-thanh dl-thanh-nho"><i class="vua" style="width:${(x.db_byte ? x.he_thong_byte / x.db_byte * 100 : 0).toFixed(1)}%"></i></div></td></tr>`;
  }

  function veGH(loi) {
    $('dlGHTen').textContent = GH.owner + '/' + GH.repo;
    if (loi) { $('dlGH').innerHTML = `<p class="loi-nho">${esc(loi)}</p>`; $('dlTepBody').innerHTML = ''; return; }
    const x = S.gh;
    $('dlGH').innerHTML = thanh('Repo (kèm lịch sử git)', x.repoByte, GIOI_HAN.repo)
      + thanh('Trang web phát hành', x.trangByte, GIOI_HAN.pages, x.soTep + ' tệp')
      + `<div class="dl-chu">Đẩy lên gần nhất: <b>${gio7(x.pushedAt)}</b> · nhánh <span class="ma">${esc(x.nhanh)}</span>`
      + `${x.catBot ? ' · <span class="dang-lam">danh sách tệp bị GitHub cắt bớt</span>' : ''}</div>`;
    $('dlTepBody').innerHTML = x.tepLon.map((t, i) => `<tr>
        <td class="giua mo-nhat">${i + 1}</td>
        <td class="ma dl-cat" title="${esc(t.path)}">${esc(t.path)}</td>
        <td class="giua">${coByte(t.size)}</td>
      </tr>`).join('');
  }

  async function taiNhatKy() {
    try {
      const ds = await api('/rest/v1/nhat_ky_don?select=*&order=luc.desc&limit=100');
      hien('dlNkTrong', !ds.length);
      $('dlNkBody').innerHTML = ds.map((n, i) => `<tr>
          <td class="giua mo-nhat">${i + 1}</td>
          <td class="giua">${gio7(n.luc)}</td>
          <td>${esc(n.nguoi_ten || '—')}</td>
          <td class="giua">${n.viec === 'xoa_phien' ? 'Xoá phiên đã đóng' : 'Xoá bài tập không dùng'}</td>
          <td class="giua">${n.moc ? n.moc.split('-').reverse().join('/') : '—'}</td>
          <td class="giua">${n.viec === 'xoa_phien' ? n.so_phien + ' phiên · ' + n.so_luot + ' lượt' : n.so_bai_tap + ' bài tập'}</td>
          <td class="giua">${coByte(n.uoc_byte)}</td>
        </tr>`).join('');
    } catch (e) { $('dlNkBody').innerHTML = ''; hien('dlNkTrong', true); $('dlNkTrong').textContent = e.message; }
  }

  /* ── Dọn dữ liệu ─────────────────────────────────────────────────────────────────────── */
  let XEM = null;
  async function xemTruoc() {
    const moc = $('dlMoc').value;
    XEM = null;
    $('btDonPhien').disabled = $('btDonBT').disabled = true;
    if (!moc) { $('dlXemPhien').textContent = $('dlXemBT').textContent = 'Chọn mốc ngày.'; return; }
    $('dlXemPhien').textContent = $('dlXemBT').textContent = 'Đang tính…';
    try {
      XEM = await rpc('don_xem', { p_truoc: moc });
      $('dlXemPhien').innerHTML = `<b>${XEM.so_phien}</b> phiên · <b>${XEM.so_luot}</b> lượt làm bài · ~${coByte(XEM.phien_byte)}`;
      $('dlXemBT').innerHTML = `<b>${XEM.so_bai_tap}</b> bài tập (kèm đáp án) · ~${coByte(XEM.bai_tap_byte)}`;
      $('btDonPhien').disabled = !XEM.so_phien;
      $('btDonBT').disabled = !XEM.so_bai_tap;
    } catch (e) { $('dlXemPhien').textContent = $('dlXemBT').textContent = e.message; }
  }

  /* §26 — gõ đúng "OK" mới bật nút Xoá. Trang web dùng popup riêng (không native prompt) để
     nút Xoá disabled tới khi gõ đúng. */
  let viecXoa = null;
  function hoiXoa(viec) {
    if (!XEM) return;
    viecXoa = viec;
    const moc = $('dlMoc').value.split('-').reverse().join('/');
    $('dxThan').innerHTML = viec === 'phien'
      ? `Xoá VĨNH VIỄN <b>${XEM.so_phien}</b> phiên đã đóng trước ngày <b>${moc}</b> cùng <b>${XEM.so_luot}</b> lượt làm bài.<br>
         Kết quả của các phiên này sẽ mất và <b>không khôi phục được</b>. Nếu cần giữ điểm, hãy “Tải kết quả” từng phiên trước.`
      : `Xoá VĨNH VIỄN <b>${XEM.so_bai_tap}</b> bài tập (kèm đáp án) tạo trước ngày <b>${moc}</b> và không còn phiên nào dùng.<br>
         Muốn giao lại bài đó thì phải đẩy lên web lại từ ứng dụng.`;
    $('dxO').value = ''; $('dxOk').disabled = true; $('dxLoi').textContent = '';
    hien('hopXoa', true);
    setTimeout(() => $('dxO').focus(), 50);
  }
  const dongXoa = () => { hien('hopXoa', false); viecXoa = null; };
  $('dxHuy').addEventListener('click', dongXoa);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('hopXoa').classList.contains('an')) dongXoa(); });
  $('dxO').addEventListener('input', () => { $('dxOk').disabled = $('dxO').value.trim().toUpperCase() !== 'OK'; });
  $('dxOk').addEventListener('click', async () => {
    if (!viecXoa || $('dxOk').disabled) return;
    const b = $('dxOk'); b.disabled = true; b.textContent = 'Đang xoá…';
    try {
      const moc = $('dlMoc').value;
      if (viecXoa === 'phien') {
        const r = await rpc('don_phien', { p_truoc: moc });
        bao('Đã xoá ' + r.so_phien + ' phiên, ' + r.so_luot + ' lượt.', 'ok');
      } else {
        const r = await rpc('don_bai_tap', { p_truoc: moc });
        bao('Đã xoá ' + r.so_bai_tap + ' bài tập.', 'ok');
      }
      dongXoa();
      await Promise.all([taiSB(), taiNhatKy(), xemTruoc()]);
    } catch (e) { $('dxLoi').textContent = e.message; }
    finally { b.textContent = 'Xoá'; }
  });

  $('dlMoc').addEventListener('change', xemTruoc);
  $('btDonPhien').addEventListener('click', () => hoiXoa('phien'));
  $('btDonBT').addEventListener('click', () => hoiXoa('bai_tap'));

  /* ── Mở tab / làm mới ────────────────────────────────────────────────────────────────── */
  async function taiSB() {
    try { S.sb = await rpc('dung_luong'); veSB(); }
    catch (e) { S.sb = null; veSB(e.message); }
  }
  async function taiGH(epMoi) {
    try { S.gh = await layGH(epMoi); veGH(); }
    catch (e) { veGH(e.message); }
  }

  async function mo(epMoi) {
    if (!$('dlMoc').value) {
      const d = new Date(); d.setMonth(d.getMonth() - 6);   // mặc định: cũ hơn 6 tháng
      $('dlMoc').value = ngayISO(d);
    }
    $('dlLuc').textContent = 'Đang tải…';
    await Promise.all([taiSB(), taiGH(epMoi), taiNhatKy(), xemTruoc()]);
    S.luc = new Date();
    $('dlLuc').textContent = 'Cập nhật ' + gio7(S.luc);
    capNhatCham();
  }
  $('dlMoi').addEventListener('click', () => mo(true));

  /* Gọi từ gv.js ngay sau khi CB đăng nhập để bật chấm đỏ trên nút tab mà không cần mở tab.
     Lỗi thì im lặng — chỉ là đèn báo. */
  async function kiemNen() {
    try { S.sb = await rpc('dung_luong'); } catch { }
    try { S.gh = await layGH(false); } catch { }
    capNhatCham();
  }

  window.DungLuong = { mo: () => mo(false), kiemNen };
})();
