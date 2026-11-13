/* ══════════════════════════════════════════════════════════════════════════════════════════════
   MÀN RANKING 3D — nhân vật + bục 3D bằng Three.js (§41.32.1)
   ──────────────────────────────────────────────────────────────────────────────────────────────
   gv-ranking.js là "bộ não" (xếp hạng, ai lên/xuống bục, tâm trạng); file này chỉ VẼ. Nạp LƯỜI
   bằng import() khi bật Ranking. Lỗi (máy không có WebGL, tải mô hình hỏng) ⇒ trả false và
   gv-ranking.js giữ bản 2D SVG làm dự phòng.

   • Mô hình: Quaternius (CC0) — mo-hinh/NGUON.txt. 3 mô hình dùng chung bộ xương, mỗi học viên
     chọn 1 mô hình + đổi màu tóc/da/áo theo mã ⇒ giữ một ngoại hình suốt buổi.
   • Động tác = clip có sẵn (Idle, Idle_Neutral, Wave, HitRecieve) + CHỈNH KHỚP thủ tục sau mỗi
     nhịp mixer (bảng TU_THE): cúi đầu, ngoái nhìn, giơ hai tay ăn mừng…
   • Bục 3D; tên/điểm/số hạng vẫn là thẻ HTML .rk-buc của gv-ranking.js, file này chỉ đặt lại vị
     trí thẻ trùng mặt trước bục (chiếu toạ độ 3D ra màn hình) ⇒ chữ nét, xuống dòng được.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';
import { clone as cloneSkel } from './vendor/three/SkeletonUtils.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';

const MO_HINH = ['mo-hinh/nv-vest.glb?v=1', 'mo-hinh/nv-thuong.glb?v=1', 'mo-hinh/nv-xanh.glb?v=1'];
const CAO_NV = 1.6;                                   // chiều cao nhân vật (đơn vị cảnh)
const BUC = [                                          // hạng 1, 2, 3
  { x: 0, h: 1.3, mau: 0xf6c33a },
  { x: -2.25, h: 1.0, mau: 0xc9d1d9 },
  { x: 2.25, h: 0.78, mau: 0xd98a4e },
];
const BUC_RONG = 2.1, BUC_SAU = 1.5;

/* Chỉnh khớp theo tâm trạng: [x, y, z] radian, NHÂN SAU tư thế của clip (hệ trục cục bộ khớp).
   Đo bằng ảnh chụp thử với 3 mô hình (cùng bộ xương). */
const TU_THE = {
  vui: {},
  lo: { Head: [0.12, 0, 0], UpperArmL: [2.35, 0, 0], UpperArmR: [2.35, 0, 0], LowerArmL: [1.9, 0, 0], LowerArmR: [1.9, 0, 0] },
  nhin: { Neck: [0.25, 0, 0], Head: [0.3, 0, 0] },
  buon: { Neck: [0.35, 0, 0], Head: [0.45, 0, 0], Chest: [0.2, 0, 0] },
  mung: { UpperArmL: [2.5, 0, 0], UpperArmR: [2.5, 0, 0], LowerArmL: [0.25, 0, 0], LowerArmR: [0.25, 0, 0] },
};
const CLIP = { vui: 'Wave', lo: 'Idle_Neutral', nhin: 'Idle', buon: 'Idle', mung: 'Idle', '': 'Idle' };

let renderer, scene, camera, host, nhanBuc = [], san;
const NV = new Map();                                  // id → nhân vật
let MAU = null, idTiep = 1, dongHo = new THREE.Clock(), dangChay = false;

function mauTu(h, ds) { return ds[h % ds.length]; }
const TOC = [0x1b1b1b, 0x2b2118, 0x3a2a1e, 0x4a4a4a, 0x707070];
const DA = [0xc98f63, 0xb57a50, 0xd8a47c, 0x9c6a45];
const VEST = [0x1f2a3a, 0x2f3b2f, 0x3a3a3a, 0x3b2f4a, 0x22303f, 0x5a4a3a];
const CA_VAT = [0x8b1e2d, 0x1d3557, 0x6b4f1d, 0x2a6f4f];
const AO = [0xe8e8e8, 0x9fb8d0, 0xc9b88f, 0xb7c9a8, 0xd9c2c2, 0x8a9aa8];
const AO_XANH = [0x4a5d3a, 0x3d5a4a, 0x5a5a3a, 0x3a4a5a];

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

  try { MAU = await Promise.all(MO_HINH.map(u => new GLTFLoader().loadAsync(u))); }
  catch (e) { console.warn('[rk3d] không tải được mô hình:', e.message); renderer.domElement.remove(); return false; }

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

/* ── Nhân vật ──────────────────────────────────────────────────────────────────────────────── */
function bam(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function add(ma, dauTien) {
  const h = bam(ma);
  const loai = h % MAU.length, g = MAU[loai];
  const goc = cloneSkel(g.scene);
  const xuong = {};
  goc.traverse(o => {
    if (o.isBone) xuong[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      [].concat(o.material).forEach(m => doiMau(m, h, loai));
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
  g.animations.forEach(c => { hd[c.name] = mixer.clipAction(c); });
  const nv = {
    id: idTiep++, ma, vo, tile, mixer, hd, xuong, clipDang: null, mood: '', tre: (h % 1000) / 1000 * 6,
    w: {}, goc: {}, pos: new THREE.Vector3(BUC[2].x, 0, 0), tu: null, den: null, tg0: 0, tg: 0, scale: 1,
    vao: dauTien ? 0 : 1, roi: 0, nhay: 0, quay: 0, quayDich: 0,
  };
  vo.position.set(0, dauTien ? 0 : 6, 0);
  vo.visible = false;                                  // hiện khi place lần đầu
  choiClip(nv, 'Idle', 0);
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

function doiMau(m, h, loai) {
  const n = m.name;
  const dat = (hex) => m.color && m.color.setHex(hex);
  if (n === 'Hair' || n === 'Eyebrows') dat(mauTu(h >>> 3, TOC));
  else if (n === 'Skin') dat(mauTu(h >>> 6, DA));
  else if (n === 'Skin_Darker') { dat(mauTu(h >>> 6, DA)); m.color.multiplyScalar(.85); }
  else if (loai === 0 && n === 'Suit') dat(mauTu(h >>> 9, VEST));
  else if (loai === 0 && n === 'Tie') dat(mauTu(h >>> 12, CA_VAT));
  else if (loai === 1 && n === 'White') dat(mauTu(h >>> 9, AO));
  else if (loai === 2 && n === 'Green') dat(mauTu(h >>> 9, AO_XANH));
}

function choiClip(nv, ten, mo = 0.35) {
  const a = nv.hd[ten] || nv.hd.Idle;
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
    if (nv.vao) { nv.roiXuong = { t: 0, tu: dich.y + 6, den: dich.y }; }
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
  choiClip(nv, CLIP[m] || 'Idle');
  nv.hd.Wave && (nv.hd.Wave.timeScale = m === 'mung' ? 1.6 : 1);
  if (nv.hd.Idle) nv.hd.Idle.timeScale = m === 'buon' ? .6 : 1;
  nv.quayDich = m === 'nhin' ? (huong || 1) * 0.55 : 0;
  if (m === 'buon' && nv.hd.HitRecieve) {
    const a = nv.hd.HitRecieve;
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.play();
    nv.clipDang && nv.clipDang.crossFadeTo(a, .15, false);
    const sau = nv.clipDang;
    setTimeout(() => { if (nv.mood === 'buon' && !nv.roi) { a.crossFadeTo(sau, .4, false); nv.clipDang = sau; sau.reset().play(); } }, 650);
  }
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
  nv.vo.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => m.dispose()); });
  NV.delete(id);
}
function clear() { [...NV.keys()].forEach(remove); }

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
    for (const k of ['Neck', 'UpperArmL', 'UpperArmR']) if (nv.xuong[k]) (nv.goc[k] = nv.goc[k] || new THREE.Quaternion()).copy(nv.xuong[k].quaternion);
    // trọng số tư thế mượt dần về tâm trạng hiện tại
    const dich = TU_THE[nv.mood] || {};
    const ten = new Set([...Object.keys(nv.w), ...Object.keys(dich)]);
    ten.forEach(k => {
      const cu = nv.w[k] || [0, 0, 0], mu = dich[k] || [0, 0, 0];
      const a = 1 - Math.pow(0.002, dt);
      nv.w[k] = cu.map((v, i) => v + (mu[i] - v) * a);
    });
    // lo lắng: ngoái trái phải; ăn mừng: hai tay vẫy
    const them = {};
    if (nv.mood === 'lo') them.Neck = [0, Math.sin(t * 3.2 + nv.tre) * 0.45, 0];
    if (nv.mood === 'mung') {
      const v = Math.sin(t * 9 + nv.tre) * 0.25;
      them['UpperArmL'] = [v, 0, 0]; them['UpperArmR'] = [-v, 0, 0];
    }
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
      const r = nv.roiXuong; r.t += dt;
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
      if (nv.mood === 'mung') hop = Math.abs(Math.sin(t * 4.2 + nv.tre)) * 0.45;
      else if (nv.mood === 'vui') hop = Math.abs(Math.sin(t * 3.4 + nv.tre)) * 0.12;
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
