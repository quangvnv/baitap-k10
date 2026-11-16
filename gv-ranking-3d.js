/* ══════════════════════════════════════════════════════════════════════════════════════════════
   MÀN RANKING 3D — nhân vật + bục 3D bằng Three.js (§41.32.1)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   gv-ranking.js là "bộ não" (xếp hạng, ai lên/xuống bục, tâm trạng); file này chỉ VẼ. Nạp LƯỜI
   bằng import() khi bật Ranking. Lỗi (máy không có WebGL, tải mô hình hỏng) ⇒ trả false và
   gv-ranking.js giữ bản 2D SVG làm dự phòng.

   • Nhân vật + động tác: ADOBE MIXAMO (2026-11-15, thay Quaternius) — mo-hinh/mixamo/ dựng bằng
     tools/dung-mixamo (mo-hinh/NGUON.txt). Mọi nhân vật Mixamo dùng CHUNG bộ xương mixamorig* ⇒
     động tác nào cũng chạy thẳng trên nhân vật nào. Mỗi học viên một nhân vật theo mã (giữ suốt buổi).
     dong-tac.json: { fps, nhanVat:[khoá], clips:{ khoá:{dur, q:{khớp:[quaternion…]}, hip:[độ lệch]} } };
     vị trí hông = độ lệch / chiều cao hông lúc nghỉ ⇒ dựng lại theo chiều cao từng nhân vật.
     Thiếu động tác đứng chờ ('idle') ⇒ lấy khung đầu của động tác khác làm tư thế đứng.
     `?rkdt=<khoá>` = ép mọi nhân vật vui/ăn mừng dùng một động tác (để xem thử, vd ?rkdt=cheering).
   • Bục 3D; tên/điểm/số hạng vẫn là thẻ HTML .rk-buc của gv-ranking.js, file này chỉ đặt lại vị
     trí thẻ trùng mặt trước bục (chiếu toạ độ 3D ra màn hình) ⇒ chữ nét, xuống dòng được.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';
import { clone as cloneSkel } from './vendor/three/SkeletonUtils.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';

const THU_MUC = 'mo-hinh/mixamo/', PHIEN_BAN = 'v=3';
let MO_HINH = [];                                      // khoá nhân vật (đọc từ dong-tac.json)
const CAO_NV = 1.6;                                   // chiều cao nhân vật (đơn vị cảnh)
const BUC = [                                          // hạng 1, 2, 3
  { x: 0, h: 1.3, mau: 0xf6c33a },
  { x: -2.25, h: 1.0, mau: 0xc9d1d9 },
  { x: 2.25, h: 0.78, mau: 0xd98a4e },
];
const BUC_RONG = 2.1, BUC_SAU = 1.5;
const EP_DT = new URLSearchParams(location.search).get('rkdt') || '';
/* Động tác theo tâm trạng (khoá = tên file FBX Mixamo, chữ thường, dấu cách → '-'). Chọn ngẫu nhiên
   trong những động tác ĐANG CÓ. ĐÃ BỎ (2026-11-15, người dùng): dang hai tay chữ V khi ăn mừng; vỗ tay IK. */
const DT_TAM = {
  '': ['idle', 'breathing-idle', 'happy-idle'],
  vui: ['cheering', 'rallying', 'clapping', 'standing-clap', 'victory-idle', 'waving', 'happy-idle'],
  mung: ['cheering', 'rallying', 'standing-clap', 'clapping', 'victory-idle', 'hip-hop-dancing', 'hip-hop-dancing-2', 'bboy-hip-hop-move', 'salsa-dancing', 'samba-dancing', 'flair', 'breakdance-1990', 'breakdance-ending-1', 'breakdance-freeze-var-2'],
  lo: ['nervous', 'nervously-look-around', 'idle'],
  nhin: ['idle'],
  buon: ['defeated', 'sad-idle', 'angry', 'disappointed'],
};
/* Chỉnh khớp theo tâm trạng (chỉ khi đang ĐỨNG CHỜ 'idle' — động tác riêng đã đủ dáng): [x,y,z] radian,
   NHÂN SAU tư thế clip. Khớp Mixamo: trục Y dọc xương ⇒ X = gật/cúi, Y = quay đầu. */
const TU_THE = {
  lo: { mixamorigHead: [0.12, 0, 0] },
  nhin: { mixamorigHead: [0.18, 0, 0] },
  buon: { mixamorigNeck: [0.35, 0, 0], mixamorigHead: [0.45, 0, 0], mixamorigSpine2: [0.2, 0, 0] },
};

let renderer, scene, camera, host, nhanBuc = [], san;
const NV = new Map();                                  // id → nhân vật
let MAU = null, RAW = null, idTiep = 1, dongHo = new THREE.Clock(), dangChay = false;

export async function khoiTao(el) {
  host = el;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) { console.warn('[rk3d] không có WebGL:', e.message); return false; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'rk3-canvas';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a5a, 2.1));
  const den = new THREE.DirectionalLight(0xffffff, 2.2);
  den.position.set(3, 7, 6);
  den.castShadow = true;
  den.shadow.mapSize.set(2048, 2048);
  Object.assign(den.shadow.camera, { left: -6, right: 6, top: 6, bottom: -2, near: 1, far: 20 });
  den.shadow.bias = -0.0005;
  scene.add(den);
  const den2 = new THREE.DirectionalLight(0xfff1d6, 0.6); den2.position.set(-4, 3, 4); scene.add(den2);

  // Sân khấu: nền cỏ + bục bo tròn
  const dat = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: 0x6cc070, roughness: 1 }));
  dat.rotation.x = -Math.PI / 2; dat.receiveShadow = true; scene.add(dat);
  const tham = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0x9b2c3c, roughness: .8 }));
  tham.position.y = 0.04; tham.receiveShadow = true; scene.add(tham);
  san = [];
  BUC.forEach(b => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(BUC_RONG, b.h, BUC_SAU, 4, 0.08),
      new THREE.MeshStandardMaterial({ color: b.mau, roughness: .45, metalness: .15 }));
    m.position.set(b.x, b.h / 2 + 0.08, 0);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m); san.push(m);
  });
  host.prepend(renderer.domElement);
  nhanBuc = [...host.querySelectorAll('.rk-buc')];

  try {
    const r = await fetch(THU_MUC + 'dong-tac.json?' + PHIEN_BAN);
    if (!r.ok) throw new Error('dong-tac.json HTTP ' + r.status);
    RAW = await r.json();
    MO_HINH = RAW.nhanVat || [];
    if (!MO_HINH.length) throw new Error('chưa có nhân vật');
    MAU = await Promise.all(MO_HINH.map(k => new GLTFLoader().loadAsync(THU_MUC + 'nv-' + k + '.glb?' + PHIEN_BAN)));
  } catch (e) { console.warn('[rk3d] không tải được nhân vật / động tác:', e.message); renderer.domElement.remove(); return false; }

  new ResizeObserver(doiCo).observe(host);
  doiCo();
  dangChay = true;
  renderer.setAnimationLoop(veKhung);
  window.Ranking3D = {
    add, place, mood, fall, remove, clear, _nv: NV, _tuThe: TU_THE,
    pause(on) { dangChay = !on; renderer.setAnimationLoop(on ? null : veKhung); if (!on) dongHo.getDelta(); },
  };
  return true;
}

/* Camera vừa khít cả 3 bục + người đứng trên, đặt nhãn HTML trùng mặt trước bục */
function doiCo() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const nuaRong = 3.7, tren = 3.15, duoi = -0.3;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const tamY = (tren + duoi) / 2;
  const dDoc = (tren - duoi) / 2 / Math.tan(fov / 2);
  const dNgang = nuaRong / (Math.tan(fov / 2) * camera.aspect);
  const d = Math.max(dDoc, dNgang) + BUC_SAU / 2;
  camera.position.set(0, tamY + 0.7, d);
  camera.lookAt(0, tamY, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  datNhan();
}
function chieu(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { x: (v.x + 1) / 2 * host.clientWidth, y: (1 - v.y) / 2 * host.clientHeight };
}
function datNhan() {
  BUC.forEach((b, i) => {
    const el = nhanBuc[i]; if (!el) return;
    const z = BUC_SAU / 2 + 0.01;
    const tl = chieu(b.x - BUC_RONG / 2 + 0.06, b.h + 0.08, z), br = chieu(b.x + BUC_RONG / 2 - 0.06, 0.1, z);
    Object.assign(el.style, { left: tl.x + 'px', top: tl.y + 'px', width: (br.x - tl.x) + 'px', height: (br.y - tl.y) + 'px', bottom: 'auto' });
  });
}

/* Dựng AnimationClip cho MỘT nhân vật (vị trí hông theo chiều cao hông lúc nghỉ của nhân vật đó).
   Nhớ theo loại nhân vật. Không có 'idle' ⇒ tạo tư thế đứng tĩnh từ khung đầu của động tác khác. */
const _clip = {};
function clipCua(loai, goc) {
  if (_clip[loai]) return _clip[loai];
  const hip = goc.getObjectByName('mixamorigHips');
  const p0 = hip ? hip.position.clone() : new THREE.Vector3(), cao = Math.abs(p0.y) || 1;
  const fps = RAW.fps, kq = {};
  const dung = (key, c) => {
    /* ⚠ Số khung lấy từ CHÍNH dữ liệu, đừng tính lại từ dur×fps: dur đã làm tròn 3 chữ số ⇒ lệch 1 khung
       (clapping 1,1666 s → 18 khung, 1,167 s → 19) ⇒ mốc thời gian dài hơn mảng giá trị ⇒ bộ nội suy của
       Three.js chạy MÃI, trang treo cứng khi đổi sang động tác đó (đã gặp 15/11/2026). */
    const n = c.hip ? c.hip.length / 3 : (Object.values(c.q).find(v => v.length > 8) || [0, 0, 0, 0, 0, 0, 0, 0]).length / 4;
    const tg = Float32Array.from({ length: n }, (_, i) => Math.min(i / fps, c.dur)), tg2 = Float32Array.of(0, c.dur);
    const tr = Object.entries(c.q).filter(([, v]) => v.length === 8 || v.length === n * 4)
      .map(([b, v]) => new THREE.QuaternionKeyframeTrack(b + '.quaternion', v.length === 8 ? tg2 : tg, v));
    if (hip && c.hip) tr.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', tg,
      c.hip.map((v, i) => p0.getComponent(i % 3) + v * cao * (i % 3 === 1 ? 1 : 0.5))));   // đi ngang ít thôi, đứng trên bục
    return new THREE.AnimationClip(key, c.dur, tr);
  };
  for (const [key, c] of Object.entries(RAW.clips)) kq[key] = dung(key, c);
  if (!kq.idle) {
    const nguon = ['look-over-shoulder', 'clapping', ...Object.keys(RAW.clips)].find(k => RAW.clips[k]);
    if (nguon) {
      const c = RAW.clips[nguon], q = {};
      for (const [b, v] of Object.entries(c.q)) q[b] = v.slice(0, 4).concat(v.slice(0, 4));
      const tinh = { dur: 1, q, hip: null };
      kq.idle = dung('idle', tinh);
    }
  }
  return (_clip[loai] = kq);
}
/* Chọn động tác theo tâm trạng, khác động tác đang chạy. Trả TÊN clip trong nv.hd. */
function chonKieu(nv, m, cu) {
  if (EP_DT && nv.hd[EP_DT] && (m === 'vui' || m === 'mung')) return EP_DT;
  const co = (DT_TAM[m] || DT_TAM['']).filter(k => nv.hd[k]);
  const ds = co.filter(k => k !== cu);
  return (ds.length ? ds : co)[Math.floor(Math.random() * Math.max(1, (ds.length ? ds : co).length))] || 'idle';
}

/* ── Nhân vật ──────────────────────────────────────────────────────────────────────────────── */
function bam(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function add(ma, dauTien) {
  const h = bam(ma);
  /* Mỗi người trên bục một nhân vật KHÁC nhau (3 bục ↔ 3 mẫu): ưu tiên mẫu theo mã, trùng thì lấy mẫu
     còn trống; người đang rơi khỏi bục không tính. Hết mẫu trống ⇒ theo mã. */
  const dung = new Set([...NV.values()].filter(n => !n.roi).map(n => n.loai));
  let loai = h % MAU.length;
  if (dung.has(loai)) { const trong = MAU.map((_, i) => i).filter(i => !dung.has(i)); if (trong.length) loai = trong[h % trong.length]; }
  const g = MAU[loai];
  const goc = cloneSkel(g.scene);
  const xuong = {};
  goc.traverse(o => {
    if (o.isBone) xuong[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
    }
  });
  // chuẩn hoá chiều cao
  const { cao, day } = chuanCao(loai, goc);
  const vo = new THREE.Group();
  const tile = new THREE.Group();
  tile.add(goc);
  goc.scale.multiplyScalar(CAO_NV / cao);
  goc.position.y = -day * CAO_NV / cao;
  vo.add(tile);
  scene.add(vo);
  const mixer = new THREE.AnimationMixer(goc);
  const hd = {};
  const cl = clipCua(loai, goc);
  for (const key in cl) hd[key] = mixer.clipAction(cl[key]);
  const nv = {
    id: idTiep++, ma, loai, vo, tile, mixer, hd, xuong, clipDang: null, mood: '', tre: (h % 1000) / 1000 * 6,
    w: {}, goc: {}, pos: new THREE.Vector3(BUC[2].x, 0, 0), tu: null, den: null, tg0: 0, tg: 0, scale: 1,
    vao: dauTien ? 0 : 1, roi: 0, nhay: 0, quay: 0, quayDich: 0,
  };
  vo.position.set(0, dauTien ? 0 : 6, 0);
  vo.visible = false;                                  // hiện khi place lần đầu
  choiClip(nv, 'idle', 0);
  mixer.setTime(nv.tre);
  NV.set(nv.id, nv);
  return nv.id;
}

/* Chiều cao + đáy của MỖI mô hình đo MỘT lần. ⚠ Box3 "precise" trên SkinnedMesh có thể ra Infinity
   (mô hình nv-xanh có lưới phụ) ⇒ nhân vật biến mất vì scale NaN — rơi về hộp thường. */
const _do = {};
function chuanCao(loai, goc) {
  if (_do[loai]) return _do[loai];
  goc.updateMatrixWorld(true);
  let hop = new THREE.Box3().setFromObject(goc, true);
  let cao = hop.max.y - hop.min.y;
  if (!isFinite(cao) || cao <= 0) { hop = new THREE.Box3().setFromObject(goc); cao = hop.max.y - hop.min.y; }
  if (!isFinite(cao) || cao <= 0) { hop = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)); cao = 1; }
  return (_do[loai] = { cao, day: hop.min.y });
}

function choiClip(nv, ten, mo = 0.35) {
  const a = nv.hd[ten] || nv.hd.idle;
  if (!a) return;
  if (nv.clipDang === a) return;
  a.reset().setEffectiveWeight(1).play();
  if (nv.clipDang) nv.clipDang.crossFadeTo(a, mo, false);
  nv.clipDang = a;
}

function viTri(hang, k, n) {
  const b = BUC[hang];
  const rong = BUC_RONG * 0.86;
  const x = n <= 1 ? b.x : b.x - rong / 2 + rong * (k + .5) / n;
  return new THREE.Vector3(x, b.h + 0.08, 0.05 - (k % 2) * 0.25 * (n > 2 ? 1 : 0));
}

function place(id, hang, k, n, chuyen) {
  const nv = NV.get(id); if (!nv) return;
  const dich = viTri(hang, k, n);
  const sc = n > 2 ? Math.max(.55, 2.3 / n) : 1;
  if (!nv.vo.visible) {                               // lần đầu
    nv.vo.visible = true;
    nv.pos.copy(dich); nv.scale = sc;
    nv.vo.position.set(dich.x, nv.vao ? dich.y + 6 : dich.y, dich.z);
    nv.tile.scale.setScalar(sc);
    nv.tu = null; nv.den = null;
    if (nv.vao) { nv.roiXuong = { t0: performance.now(), tu: dich.y + 6, den: dich.y }; }
    return;
  }
  if (dich.distanceTo(nv.pos) < 1e-3 && Math.abs(sc - nv.scale) < 1e-3) return;
  nv.tu = nv.vo.position.clone(); nv.den = dich.clone(); nv.tg0 = performance.now(); nv.tg = chuyen ? 1000 : 600;
  nv.nhay = chuyen ? 1 : 0;
  nv.pos.copy(dich);
  nv.scaleTu = nv.tile.scale.x; nv.scale = sc;
}

function mood(id, m, huong) {
  const nv = NV.get(id); if (!nv || nv.roi) return;
  nv.mood = m;
  // mỗi tâm trạng một động tác ngẫu nhiên trong danh sách DT_TAM; ăn mừng đổi động tác sau mỗi lượt clip
  nv.kieu = chonKieu(nv, m);
  if (m === 'mung') nv.doiMung = performance.now() + hanDoi(nv);
  choiClip(nv, nv.kieu);
  nv.huong = huong || 1;
  nv.quayDich = m === 'nhin' ? nv.huong * 0.25 : 0;
}

function fall(id) {
  const nv = NV.get(id); if (!nv) return;
  mood(id, 'buon');
  nv.roi = performance.now();
  setTimeout(() => remove(id), 2600);
}
function remove(id) {
  const nv = NV.get(id); if (!nv) return;
  scene.remove(nv.vo);
  nv.mixer.stopAllAction();
  // ⚠ KHÔNG dispose vật liệu: các nhân vật cùng loại dùng CHUNG vật liệu/texture của GLB
  NV.delete(id);
}
function clear() { [...NV.keys()].forEach(remove); }

/* Ăn mừng: giữ động tác ít nhất một lượt clip (tối thiểu 3,5 s) rồi mới đổi */
function hanDoi(nv) {
  const a = nv.hd[nv.kieu];
  const dur = a ? a.getClip().duration * 1000 : 0;
  return Math.max(3500, dur * Math.ceil(3500 / Math.max(dur, 1))) + Math.random() * 1500;
}

/* ── Vòng vẽ ──────────────────────────────────────────────────────────────────────────────── */
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function veKhung() {
  if (!dangChay) return;
  const dt = Math.min(dongHo.getDelta(), 0.05);
  const now = performance.now(), t = now / 1000;
  NV.forEach(nv => {
    /* ⚠ Khớp mà clip đang chạy KHÔNG có kênh xoay thì mixer không ghi đè ⇒ phép nhân tư thế ở dưới
       sẽ CỘNG DỒN mỗi khung (đầu gập 90°). Trả các khớp đã chỉnh về góc gốc trước khi mixer chạy. */
    for (const k in nv.goc) nv.xuong[k] && nv.xuong[k].quaternion.copy(nv.goc[k]);
    nv.mixer.update(dt);
    for (const k in nv.w) if (nv.xuong[k]) (nv.goc[k] = nv.goc[k] || new THREE.Quaternion()).copy(nv.xuong[k].quaternion);
    for (const k of ['mixamorigNeck']) if (nv.xuong[k]) (nv.goc[k] = nv.goc[k] || new THREE.Quaternion()).copy(nv.xuong[k].quaternion);
    // trọng số tư thế mượt dần về tâm trạng hiện tại
    const dich = nv.kieu === 'idle' ? (TU_THE[nv.mood] || {}) : {};   // động tác riêng tự đủ dáng, không chỉnh thêm
    const ten = new Set([...Object.keys(nv.w), ...Object.keys(dich)]);
    ten.forEach(k => {
      const cu = nv.w[k] || [0, 0, 0], mu = dich[k] || [0, 0, 0];
      const a = 1 - Math.pow(0.002, dt);
      nv.w[k] = cu.map((v, i) => v + (mu[i] - v) * a);
    });
    // lo lắng: ngoái trái phải; ăn mừng: hai tay vẫy
    const them = {};
    if (nv.mood === 'lo' && nv.kieu === 'idle') them.mixamorigNeck = [0, Math.sin(t * 3.2 + nv.tre) * 0.45, 0];
    if (nv.mood === 'nhin') them.mixamorigNeck = [0, nv.huong * 0.6, 0];
    for (const k in nv.w) {
      const b = nv.xuong[k]; if (!b) continue;
      const w = nv.w[k], x = them[k] || [0, 0, 0];
      _e.set(w[0] + x[0], w[1] + x[1], w[2] + x[2]);
      b.quaternion.multiply(_q.setFromEuler(_e));
    }
    for (const k in them) {
      if (k in nv.w) continue;
      const b = nv.xuong[k]; if (!b) continue;
      _e.set(...them[k]); b.quaternion.multiply(_q.setFromEuler(_e));
    }
    // ăn mừng: đổi sang động tác khác
    if (nv.mood === 'mung' && now > nv.doiMung && !EP_DT) {
      nv.kieu = chonKieu(nv, 'mung', nv.kieu);
      choiClip(nv, nv.kieu);
      nv.doiMung = now + hanDoi(nv);
    }
    // xoay người khi nhìn sang bên
    nv.quay += (nv.quayDich - nv.quay) * (1 - Math.pow(0.01, dt));
    nv.tile.rotation.y = nv.quay;
    // di chuyển giữa các bục (nhảy vòng cung)
    let y0 = null;
    if (nv.den) {
      const p = Math.min(1, (now - nv.tg0) / nv.tg), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      nv.vo.position.lerpVectors(nv.tu, nv.den, e);
      if (nv.nhay) nv.vo.position.y += Math.sin(p * Math.PI) * 1.2;
      nv.tile.scale.setScalar(nv.scaleTu + (nv.scale - nv.scaleTu) * e);
      if (p >= 1) nv.den = null;
    } else if (nv.roiXuong) {
      const r = nv.roiXuong; r.t = (now - r.t0) / 1000;   // theo thời gian thật, máy chậm cũng rơi đúng 0,7 s
      const p = Math.min(1, r.t / 0.7);
      const nay = p < 1 ? 1 - p * p : 0;
      nv.vo.position.y = r.den + (r.tu - r.den) * nay;
      if (p >= 1) nv.roiXuong = null;
    } else if (!nv.roi) {
      y0 = nv.pos.y;
    }
    // nhảy tại chỗ khi vui / ăn mừng
    if (y0 !== null) {
      let hop = 0;
      if (nv.mood === 'vui') hop = Math.abs(Math.sin(t * 3.4 + nv.tre)) * 0.12;
      nv.vo.position.y = y0 + hop;
    }
    // rơi khỏi bục: run lên rồi ngã nhào xuống phía trước
    if (nv.roi) {
      const s = (now - nv.roi) / 1000;
      if (s < 0.8) nv.tile.rotation.z = Math.sin(s * 40) * 0.05;
      else {
        const p = Math.min(1, (s - .8) / 1.2);
        nv.tile.rotation.x = p * 1.2;
        nv.vo.position.y = nv.pos.y - p * p * 3;
        nv.vo.position.z = nv.pos.z + p * 1.5;
      }
    }
  });
  renderer.render(scene, camera);
}
