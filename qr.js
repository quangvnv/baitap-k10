/* ══════════════════════════════════════════════════════════════════════════════════════════
   MÃ QR — bộ sinh TỰ VIẾT, KHÔNG thư viện ngoài.
   Trang này chạy trên GitHub Pages và phải mở được ở lớp có mạng yếu ⇒ không kéo thư viện
   từ CDN (đồng bộ tinh thần §1 offline của app, và cùng lối `assets/gen-qlg-icon.js` vốn
   tự sinh .ico bằng zlib có sẵn thay vì thêm dependency).

   PHẠM VI CỐ Ý HẸP — chỉ đủ cho một URL, không phải bộ mã QR đa năng:
     · chế độ BYTE (UTF-8)   · mức sửa lỗi M (~15%)   · phiên bản 1–10 (tối đa 213 byte)
   Chuỗi dài hơn thì NÉM lỗi, KHÔNG âm thầm cắt bớt (mã cắt bớt vẫn quét ra được — ra sai
   địa chỉ mà không ai biết).

   API:  QR.matrix(text) → mảng 2 chiều true/false (true = ô ĐEN, chưa có lề trắng)
         QR.svg(text, {oCo, vien}) → chuỗi <svg> tự chứa (mặc định lề trắng 4 ô đúng chuẩn)
   ══════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Trường hữu hạn GF(256), đa thức nguyên thuỷ 0x11D ──────────────────────────────────── */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const nhan = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* Đa thức sinh Reed-Solomon cho n từ mã sửa lỗi */
  function daThucSinh(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const q = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) {
        q[j] ^= p[j];                      // × 1
        q[j + 1] ^= nhan(p[j], EXP[i]);    // × α^i
      }
      p = q;
    }
    return p;
  }

  /* Phần dư khi chia dữ liệu cho đa thức sinh = các từ mã sửa lỗi */
  function suaLoi(duLieu, n) {
    const g = daThucSinh(n);
    const r = new Uint8Array(duLieu.length + n);
    r.set(duLieu);
    for (let i = 0; i < duLieu.length; i++) {
      const he = r[i];
      if (!he) continue;
      for (let j = 0; j < g.length; j++) r[i + j] ^= nhan(g[j], he);
    }
    return r.slice(duLieu.length);
  }

  /* ── Bảng tra theo phiên bản (MỨC M) ────────────────────────────────────────────────────────
     [ tổng từ mã, số từ mã sửa lỗi MỖI KHỐI, số khối nhóm 1, dữ liệu/khối nhóm 1,
       số khối nhóm 2, dữ liệu/khối nhóm 2 ]
     Đối chiếu được: tổng dữ liệu = n1*d1 + n2*d2, và tổng = dữ liệu + ec*(n1+n2).            */
  const BANG = {
    1:  [26,  10, 1, 16, 0, 0],
    2:  [44,  16, 1, 28, 0, 0],
    3:  [70,  26, 1, 44, 0, 0],
    4:  [100, 18, 2, 32, 0, 0],
    5:  [134, 24, 2, 43, 0, 0],
    6:  [172, 16, 4, 27, 0, 0],
    7:  [196, 18, 4, 31, 0, 0],
    8:  [242, 22, 2, 38, 2, 39],
    9:  [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44],
  };
  /* Toạ độ tâm ô căn chỉnh theo phiên bản (v1 không có) */
  const CAN_CHINH = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };
  /* 18 bit thông tin phiên bản — CHỈ v7 trở lên mới có vùng này trên lưới */
  const TT_PHIEN_BAN = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };
  /* 15 bit thông tin định dạng, mức M, theo số hiệu mặt nạ 0–7 */
  const TT_DINH_DANG = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];

  /* 8 mặt nạ chuẩn */
  const MAT_NA = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
  ];

  /* ── Dựng dòng bit dữ liệu ──────────────────────────────────────────────────────────────── */
  function dongBit(bytes, pb) {
    const [tong, ec, n1, d1, n2, d2] = BANG[pb];
    const soDuLieu = n1 * d1 + n2 * d2;
    const demBit = pb >= 10 ? 16 : 8;          // ⚠ v10 trở lên dùng 16 bit cho số ký tự

    const bit = [];
    const day = (v, n) => { for (let i = n - 1; i >= 0; i--) bit.push((v >> i) & 1); };
    day(0b0100, 4);                            // chế độ byte
    day(bytes.length, demBit);
    bytes.forEach(b => day(b, 8));
    for (let i = 0; i < 4 && bit.length < soDuLieu * 8; i++) bit.push(0);   // dấu kết thúc
    while (bit.length % 8) bit.push(0);

    const cw = new Uint8Array(soDuLieu);
    for (let i = 0; i < bit.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bit[i + j];
      cw[i / 8] = b;
    }
    for (let i = bit.length / 8, k = 0; i < soDuLieu; i++, k++) cw[i] = k % 2 ? 0x11 : 0xEC;

    /* Chia khối → tính sửa lỗi → ĐAN XEN (bắt buộc, không phải nối đuôi) */
    const khoiDL = [], khoiEC = [];
    let p = 0;
    for (let i = 0; i < n1 + n2; i++) {
      const len = i < n1 ? d1 : d2;
      const d = cw.slice(p, p + len); p += len;
      khoiDL.push(d); khoiEC.push(suaLoi(d, ec));
    }
    const ra = new Uint8Array(tong);
    let o = 0;
    for (let i = 0; i < Math.max(d1, d2); i++)
      for (const k of khoiDL) if (i < k.length) ra[o++] = k[i];
    for (let i = 0; i < ec; i++)
      for (const k of khoiEC) ra[o++] = k[i];
    return ra;
  }

  /* ── Dựng lưới ──────────────────────────────────────────────────────────────────────────── */
  function luoiTrong(pb) {
    const n = pb * 4 + 17;
    const m = [];
    for (let i = 0; i < n; i++) m.push(new Array(n).fill(null));   // null = ô chưa đặt

    const oDinh = (r, c) => {                  // mắt định vị 7×7 + vạch ngăn
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        const y = r + dr, x = c + dc;
        if (y < 0 || y >= n || x < 0 || x >= n) continue;
        const vien = (dr === 0 || dr === 6) && dc >= 0 && dc <= 6;
        const doc = (dc === 0 || dc === 6) && dr >= 0 && dr <= 6;
        const loi = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        m[y][x] = vien || doc || loi;
      }
    };
    oDinh(0, 0); oDinh(0, n - 7); oDinh(n - 7, 0);

    for (let i = 8; i < n - 8; i++) {          // vạch nhịp
      m[6][i] = i % 2 === 0;
      m[i][6] = i % 2 === 0;
    }

    const toa = CAN_CHINH[pb];                 // ô căn chỉnh 5×5, bỏ chỗ đè mắt định vị
    for (const r of toa) for (const c of toa) {
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
        m[r + dr][c + dc] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
    }

    for (let i = 0; i < 9; i++) {              // chỗ dành cho thông tin định dạng
      if (m[8][i] === null) m[8][i] = false;
      if (m[i][8] === null) m[i][8] = false;
    }
    for (let i = 0; i < 8; i++) {
      if (m[8][n - 1 - i] === null) m[8][n - 1 - i] = false;
      if (m[n - 1 - i][8] === null) m[n - 1 - i][8] = false;
    }
    m[n - 8][8] = true;                        // ô đen cố định

    if (pb >= 7) for (let i = 0; i < 18; i++) {   // chỗ dành cho thông tin phiên bản
      m[Math.floor(i / 3)][i % 3 + n - 11] = false;
      m[i % 3 + n - 11][Math.floor(i / 3)] = false;
    }
    return m;
  }

  /* Rải dữ liệu theo đường zigzag từ góc dưới-phải, áp mặt nạ ngay khi đặt */
  function raiDuLieu(m, data, mn) {
    const n = m.length, f = MAT_NA[mn];
    let hang = n - 1, huong = -1, iBit = 7, iByte = 0;
    for (let cot = n - 1; cot > 0; cot -= 2) {
      if (cot === 6) cot--;                    // cột 6 là vạch nhịp, bỏ qua
      for (;;) {
        for (let k = 0; k < 2; k++) {
          const c = cot - k;
          if (m[hang][c] !== null) continue;
          let den = iByte < data.length && ((data[iByte] >>> iBit) & 1) === 1;
          if (f(hang, c)) den = !den;
          m[hang][c] = den;
          if (--iBit < 0) { iBit = 7; iByte++; }
        }
        hang += huong;
        if (hang < 0 || hang >= n) { hang -= huong; huong = -huong; break; }
      }
    }
  }

  function datThongTin(m, pb, mn) {
    const n = m.length, bits = TT_DINH_DANG[mn];
    /* ⚠ Cả hai dải thông tin định dạng đều PHẢI NHẢY QUA vạch nhịp: dải dọc bỏ hàng 6
       (nên i=6,7 dùng m[i+1][8]), dải ngang bỏ cột 6 (nên i=8 rơi vào cột 7, KHÔNG phải
       cột 6). Viết gộp thành m[8][14-i] cho i≥8 là ghi đè lên vạch nhịp dọc — mã vẫn in ra
       nhìn bình thường nhưng máy quét từ chối. */
    for (let i = 0; i < 15; i++) {
      const b = ((bits >> i) & 1) === 1;
      if (i < 6) m[i][8] = b; else if (i < 8) m[i + 1][8] = b; else m[n - 15 + i][8] = b;
      if (i < 8) m[8][n - 1 - i] = b; else if (i === 8) m[8][7] = b; else m[8][14 - i] = b;
    }
    m[n - 8][8] = true;
    if (pb >= 7) {
      const v = TT_PHIEN_BAN[pb];
      for (let i = 0; i < 18; i++) {
        const b = ((v >> i) & 1) === 1;
        m[Math.floor(i / 3)][i % 3 + n - 11] = b;
        m[i % 3 + n - 11][Math.floor(i / 3)] = b;
      }
    }
  }

  /* Chấm điểm phạt để chọn mặt nạ dễ quét nhất (4 quy tắc chuẩn) */
  function diemPhat(m) {
    const n = m.length;
    let d = 0, den = 0;
    const chay = (lay) => {
      for (let i = 0; i < n; i++) {
        let dem = 1;
        for (let j = 1; j < n; j++) {
          if (lay(i, j) === lay(i, j - 1)) dem++;
          else { if (dem >= 5) d += 3 + (dem - 5); dem = 1; }
        }
        if (dem >= 5) d += 3 + (dem - 5);
      }
    };
    chay((i, j) => m[i][j]);                   // quy tắc 1 — dãy ≥5 ô cùng màu
    chay((i, j) => m[j][i]);
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {   // quy tắc 2 — khối 2×2
      const v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) d += 3;
    }
    const MAU = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];                      // quy tắc 3 — hình giống mắt định vị
    const khop = (lay, i, j) => {
      for (let k = 0; k < 11; k++) if ((lay(i, j + k) ? 1 : 0) !== MAU[k]) return false;
      return true;
    };
    for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) {
      if (khop((a, b) => m[a][b], i, j)) d += 40;
      if (khop((a, b) => m[b][a], i, j)) d += 40;
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (m[i][j]) den++;   // quy tắc 4 — tỉ lệ đen
    d += Math.floor(Math.abs(den * 100 / (n * n) - 50) / 5) * 10;
    return d;
  }

  function matrix(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let pb = 0;
    for (let v = 1; v <= 10; v++) {
      const [, , n1, d1, n2, d2] = BANG[v];
      const tuMa = n1 * d1 + n2 * d2;
      const thua = (v >= 10 ? 20 : 12);        // 4 bit chế độ + 8/16 bit số ký tự
      if (bytes.length * 8 + thua <= tuMa * 8) { pb = v; break; }
    }
    if (!pb) throw new Error('Chuỗi quá dài cho mã QR (tối đa 213 byte)');

    const data = dongBit(bytes, pb);
    let tot = null, diemTot = Infinity;
    for (let mn = 0; mn < 8; mn++) {
      const m = luoiTrong(pb);
      raiDuLieu(m, data, mn);
      datThongTin(m, pb, mn);
      const d = diemPhat(m);
      if (d < diemTot) { diemTot = d; tot = m; }
    }
    return tot.map(h => h.map(v => v === true));
  }

  /* ── Xuất SVG ───────────────────────────────────────────────────────────────────────────────
     Gộp các ô đen liền nhau trên cùng một dòng thành MỘT <rect>: mã v3 có ~1000 ô đen, mỗi ô
     một thẻ thì chuỗi SVG phình vô ích và trình duyệt vẽ chậm hơn hẳn.                        */
  function svg(text, opt) {
    const o = opt || {};
    const oCo = o.oCo || 6;                    // số điểm ảnh mỗi ô
    const vien = o.vien == null ? 4 : o.vien;  // lề trắng, chuẩn là 4 ô — ĐỪNG bỏ, máy quét cần
    const m = matrix(text);
    const n = m.length, canh = (n + vien * 2) * oCo;
    let d = '';
    for (let i = 0; i < n; i++) {
      let j = 0;
      while (j < n) {
        if (!m[i][j]) { j++; continue; }
        let k = j; while (k < n && m[i][k]) k++;
        d += '<rect x="' + (j + vien) * oCo + '" y="' + (i + vien) * oCo
          + '" width="' + (k - j) * oCo + '" height="' + oCo + '"/>';
        j = k;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + canh + '" height="' + canh + '" '
      + 'viewBox="0 0 ' + canh + ' ' + canh + '" shape-rendering="crispEdges" role="img" aria-label="Mã QR">'
      + '<rect width="' + canh + '" height="' + canh + '" fill="#fff"/><g fill="#000">' + d + '</g></svg>';
  }

  window.QR = { matrix, svg };
})();
