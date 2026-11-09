import * as THREE from 'three';

// First-person arm: one skinned mesh (sleeve -> cuff -> wrist -> palm -> fingers/thumb),
// built from stitched cross-section rings with shared normals so there are no visible joints.
// Rest pose: right hand, palm down (-Y), fingers toward -Z, thumb toward -X, forearm toward +Z.

const TAU = Math.PI * 2;
const N = 36; // columns around every ring
const WRIST_Z = 0.05;

// ---------- procedural textures ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function noiseTile(size, cell, seed) {
  const r = rng(seed), g = [];
  for (let i = 0; i < cell * cell; i++) g.push(r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * cell, fy = y / size * cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(y0 % cell) * cell + (x0 % cell)], b = g[(y0 % cell) * cell + ((x0 + 1) % cell)];
    const c = g[((y0 + 1) % cell) * cell + (x0 % cell)], d = g[((y0 + 1) % cell) * cell + ((x0 + 1) % cell)];
    out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}

function fbm(size, seed, cells = [4, 8, 16, 32], amps = [0.5, 0.28, 0.14, 0.08]) {
  const out = new Float32Array(size * size);
  cells.forEach((c, i) => { const n = noiseTile(size, c, seed + i * 17); for (let k = 0; k < out.length; k++) out[k] += n[k] * amps[i]; });
  return out;
}

function normalFromHeight(h, size, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  const H = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function toTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// u wraps around the limb (u = 0 is the back of the hand), v runs along it:
// knuckle creases at v = .30/.60, nail near v = .8.
function skinMaps() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  const blot = fbm(S, 11, [3, 6, 12], [0.55, 0.3, 0.15]);
  const pores = fbm(S, 29, [48, 96], [0.6, 0.4]);
  const warm = fbm(S, 51, [2, 5], [0.6, 0.4]);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    // crease bands (darker on the back of the joint, fainter lines on the palm side)
    let crease = 0;
    for (const cv of [0.3, 0.6]) {
      const d = (v - cv + Math.sin(u * TAU * 3 + cv * 9) * 0.012) / 0.028;
      const back = Math.pow(Math.max(0, Math.cos(u * TAU)), 1.5);
      const line = Math.exp(-d * d);
      crease = Math.max(crease, line * (0.35 + 0.65 * back));
    }
    const knuck = Math.exp(-(((v - 0.3) / 0.07) ** 2) - ((Math.min(u, 1 - u)) / 0.15) ** 2) * 0.5;
    // nail
    const nd = ((v - 0.86) / 0.07) ** 2 + (Math.min(u, 1 - u) / 0.12) ** 2;
    const nail = nd < 1 ? 1 - nd : 0;
    const b = blot[i] - 0.5, w = warm[i] - 0.5;
    let r = 166 + b * 36 + w * 24, gg = 176 + b * 32 - w * 12, bl = 124 + b * 36 - w * 18;
    const sh = 1 - crease * 0.3 - knuck * 0.14 + (pores[i] - 0.5) * 0.12;
    r *= sh; gg *= sh; bl *= sh;
    if (nail > 0) { r += 12 * nail; gg += 8 * nail; bl += 10 * nail; }
    // fine dirt
    const dirt = Math.max(0, blot[(i * 7) % blot.length] - 0.72) * 0.9;
    r *= 1 - dirt; gg *= 1 - dirt; bl *= 1 - dirt * 1.1;
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = bl; img.data[i * 4 + 3] = 255;
    height[i] = 0.5 + (pores[i] - 0.5) * 0.25 - crease * 0.5 + nail * 0.06;
  }
  g.putImageData(img, 0, 0);
  return { map: toTexture(c), normal: normalFromHeight(height, S, 2.2) };
}

// Grey-beige twill with grime, oil spots and fold lines; v runs along the sleeve (cuff near v = .2).
function sleeveMaps() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  const blot = fbm(S, 71, [3, 6, 14], [0.5, 0.3, 0.2]);
  const grime = fbm(S, 93, [2, 4, 9], [0.5, 0.3, 0.2]);
  const fine = fbm(S, 5, [64, 128], [0.5, 0.5]);
  const r = rng(7);
  const height = new Float32Array(S * S);
  const lines = [];
  for (let k = 0; k < 26; k++) lines.push({ u: r(), v: r(), a: r() * 1.4 - 0.7, l: 0.12 + r() * 0.3, w: 0.006 + r() * 0.008 });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const twill = (((x + y) >> 1) % 4 < 2 ? 1 : 0) + ((x >> 1) % 2 ? 0.4 : 0);
    let fold = 0;
    for (const ln of lines) {
      let du = u - ln.u; du -= Math.round(du);
      let dv = v - ln.v; dv -= Math.round(dv);
      const along = du * Math.cos(ln.a) + dv * Math.sin(ln.a), across = -du * Math.sin(ln.a) + dv * Math.cos(ln.a);
      if (Math.abs(along) < ln.l) fold += Math.exp(-((across / ln.w) ** 2)) * (1 - Math.abs(along) / ln.l);
    }
    fold = Math.min(1, fold);
    const cuffDirt = Math.exp(-(((v - 0.2) / 0.08) ** 2)) * 0.5;
    const dirt = Math.min(1, Math.max(0, grime[i] - 0.42) * 2.4 + cuffDirt);
    const base = 138 + (blot[i] - 0.5) * 36 + (twill - 0.7) * 7 + (fine[i] - 0.5) * 22;
    const sh = (1 - fold * 0.22) * (1 - dirt * 0.38);
    img.data[i * 4] = base * 0.99 * sh; img.data[i * 4 + 1] = base * 0.955 * sh * (1 - dirt * 0.02); img.data[i * 4 + 2] = base * 0.85 * sh * (1 - dirt * 0.07); img.data[i * 4 + 3] = 255;
    height[i] = 0.5 + twill * 0.07 + (fine[i] - 0.5) * 0.15 - fold * 0.45;
  }
  g.putImageData(img, 0, 0);
  return { map: toTexture(c), normal: normalFromHeight(height, S, 2.4) };
}

let mats = null;
function materials() {
  if (mats) return mats;
  const s = skinMaps(), f = sleeveMaps();
  mats = [
    new THREE.MeshStandardMaterial({ map: f.map, normalMap: f.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.86, metalness: 0 }),
  ];
  return mats;
}

// ---------- geometry ----------
const SLEEVE = 0, SKIN = 1;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Rings of N points, with per-ring bone weights; strips between rings carry a material.
class Mesh {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.si = []; this.sw = [];
    this.idx = [[], []];
  }

  // rings: [{ pts: [[x,y,z]*N], bones: [[b, w]...], v: [vSleeve, vSkin] }], mats: material per strip (rings.length - 1)
  addGrid(rings, mats) {
    const R = rings.length;
    const nrm = rings.map(() => Array.from({ length: N }, () => new THREE.Vector3()));
    const P = (k, j) => rings[k].pts[j % N];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), fn = new THREE.Vector3();
    const addFace = (k, j) => {
      a.fromArray(P(k, j)); b.fromArray(P(k, j + 1)); c.fromArray(P(k + 1, j + 1)); d.fromArray(P(k + 1, j));
      fn.crossVectors(c.clone().sub(a), d.clone().sub(b));
      for (const [kk, jj] of [[k, j], [k, j + 1], [k + 1, j + 1], [k + 1, j]]) nrm[kk][jj % N].add(fn);
    };
    for (let k = 0; k < R - 1; k++) for (let j = 0; j < N; j++) addFace(k, j);
    // orient outward using a middle ring
    const mk = Math.floor(R / 2), cen = new THREE.Vector3();
    for (const p of rings[mk].pts) cen.add(a.fromArray(p));
    cen.multiplyScalar(1 / N);
    const flip = nrm[mk][0].dot(a.fromArray(rings[mk].pts[0]).sub(cen)) < 0 ? -1 : 1;
    for (const row of nrm) for (const n of row) n.normalize().multiplyScalar(flip);

    const keyed = new Map();
    const emit = (k, m, j) => {
      const key = k * 2 + m;
      if (!keyed.has(key)) {
        const base = this.pos.length / 3;
        for (let q = 0; q <= N; q++) {
          const p = rings[k].pts[q % N], n = nrm[k][q % N];
          this.pos.push(p[0], p[1], p[2]); this.nor.push(n.x, n.y, n.z);
          this.uv.push(q / N, rings[k].v[m]);
          const bs = rings[k].bones;
          for (let t = 0; t < 4; t++) { this.si.push(bs[t] ? bs[t][0] : 0); this.sw.push(bs[t] ? bs[t][1] : 0); }
        }
        keyed.set(key, base);
      }
      return keyed.get(key) + j;
    };
    for (let k = 0; k < R - 1; k++) {
      const m = mats[k];
      for (let j = 0; j < N; j++) {
        const A = emit(k, m, j), B = emit(k, m, j + 1), C = emit(k + 1, m, j + 1), D = emit(k + 1, m, j);
        if (flip > 0) this.idx[m].push(A, D, C, A, C, B); else this.idx[m].push(A, B, C, A, C, D);
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    const all = [...this.idx[0], ...this.idx[1]];
    g.setIndex(all);
    g.addGroup(0, this.idx[0].length, 0);
    g.addGroup(this.idx[0].length, this.idx[1].length, 1);
    return g;
  }
}

function ringPts(cx, cy, z, a, b, e = 2.2, fold = null) {
  const pts = [];
  for (let j = 0; j < N; j++) {
    const th = j / N * TAU, s = Math.sin(th), c = Math.cos(th);
    let k = 1;
    if (fold) k += fold(th, z);
    pts.push([cx + a * k * Math.sign(s) * Math.pow(Math.abs(s), 2 / e), cy + b * k * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), z]);
  }
  return pts;
}

const BONES = ['hand', 'fore'];
const FINGERS = [
  { name: 'i', x: -0.0295, z: -0.048, len: [0.04, 0.025, 0.021], r: 0.0096 },
  { name: 'm', x: -0.0098, z: -0.05, len: [0.044, 0.028, 0.022], r: 0.01 },
  { name: 'r', x: 0.0098, z: -0.048, len: [0.04, 0.026, 0.021], r: 0.0095 },
  { name: 'p', x: 0.029, z: -0.042, len: [0.032, 0.02, 0.018], r: 0.0085 },
];
const THUMB = { base: [-0.028, -0.004, -0.004], dir: new THREE.Vector3(-0.38, -0.28, -0.88).normalize(), len: [0.032, 0.027, 0.024], r: 0.0125 };
for (const f of FINGERS) for (const s of ['a', 'b', 'c']) BONES.push(f.name + s);
for (const s of ['0', '1', '2']) BONES.push('t' + s);
const bi = (n) => BONES.indexOf(n);

// A straight limb with joints: rings every 'step' along dir, tapered, hemispherical tip.
function limb(mesh, base, dir, lens, r0, r1, flat, boneNames, buried) {
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const nrm = new THREE.Vector3().crossVectors(side, dir).normalize(); // "back" direction of the limb
  const j1 = lens[0], j2 = lens[0] + lens[1], L = j2 + lens[2];
  const rings = [];
  const add = (s, rad, tipV) => {
    const pts = [];
    const bump = 1 + 0.07 * (Math.exp(-(((s - j1) / 0.007) ** 2)) + Math.exp(-(((s - j2) / 0.006) ** 2)));
    for (let j = 0; j < N; j++) {
      const th = j / N * TAU, cs = Math.cos(th), sn = Math.sin(th);
      const rr = rad * bump;
      const ox = side.clone().multiplyScalar(sn * rr).add(nrm.clone().multiplyScalar(cs * rr * flat));
      pts.push([base.x + dir.x * s + ox.x, base.y + dir.y * s + ox.y, base.z + dir.z * s + ox.z]);
    }
    const w = (a, b, x) => sstep(a, b, x);
    const t1 = w(j1 - 0.008, j1 + 0.008, s), t2 = w(j2 - 0.008, j2 + 0.008, s);
    const bones = [];
    const wa = 1 - t1, wb = t1 * (1 - t2), wc = t2;
    if (wa > 0) bones.push([bi(boneNames[0]), wa]);
    if (wb > 0) bones.push([bi(boneNames[1]), wb]);
    if (wc > 0) bones.push([bi(boneNames[2]), wc]);
    let v;
    if (tipV !== undefined) v = tipV;
    else if (s < j1) v = 0.3 * (s + buried) / (j1 + buried);
    else if (s < j2) v = 0.3 + 0.3 * (s - j1) / (j2 - j1);
    else v = 0.6 + 0.3 * (s - j2) / (L - j2);
    rings.push({ pts, bones, v: [v, v] });
  };
  const step = 0.006;
  for (let s = -buried; s < L; s += step) {
    const t = Math.max(0, s) / L;
    add(s, r0 + (r1 - r0) * t);
  }
  const rr = r0 + (r1 - r0);
  const cap = 5;
  for (let k = 0; k <= cap; k++) {
    const ph = k / cap * Math.PI / 2;
    const s = L + rr * flatTip(Math.sin(ph));
    const v = 0.9 + 0.1 * k / cap;
    add(Math.min(s, L + rr), Math.max(rr * Math.cos(ph), 0.0004), v);
  }
  mesh.addGrid(rings, rings.slice(1).map(() => SKIN));
}
const flatTip = (x) => x * 0.95;

function buildGeometry() {
  const mesh = new Mesh();
  // --- forearm: sleeve, cuff, wrist, palm in one ring strip ---
  const rings = [], mat = [];
  const boneW = (z) => {
    const k = sstep(0.03, 0.12, z);
    return k <= 0 ? [[0, 1]] : k >= 1 ? [[1, 1]] : [[0, 1 - k], [1, k]];
  };
  const fold = (th, z) => {
    const cuff = Math.exp(-(((z - 0.16) / 0.1) ** 2));
    const A = 0.012 + cuff * 0.035 + sstep(0.35, 0.7, z) * 0.012;
    return A * (Math.sin(3 * th + z * 38) * 0.5 + Math.sin(5 * th - z * 26 + 1.3) * 0.35 + Math.sin(2 * th + z * 14) * 0.4);
  };
  const sleeveV = (z) => (z - 0.04) / 0.5;
  const skinV = (z) => (z + 0.05) / 0.1;
  const sl = (z, a, b, extra) => rings.push({ pts: ringPts(0, extra || 0, z, a, b, 2.4, fold), bones: boneW(z), v: [sleeveV(z), 0] });
  const sk = (z, a, b, cy = 0, e = 2.4) => rings.push({ pts: ringPts(0, cy, z, a, b, e), bones: boneW(z), v: [0, skinV(z)] });
  // sleeve from the far end down to the cuff (z decreasing = toward fingers)
  const zs = [1.0, 0.82, 0.7, 0.58, 0.48, 0.4, 0.33, 0.27, 0.22, 0.18, 0.15, 0.13, 0.115, 0.1];
  zs.forEach((z) => {
    const f = z > 0.2 ? 1 + (z - 0.2) * 0.35 : 1 - (0.2 - z) * 0.5;
    sl(z, 0.052 * f, 0.049 * f);
  });
  sl(0.093, 0.046, 0.044); sl(0.086, 0.0445, 0.042); // rim, rolled inward
  sl(0.08, 0.04, 0.038); sl(0.077, 0.034, 0.031);
  const nSleeve = rings.length;
  sk(0.072, 0.031, 0.023); sk(0.06, 0.0295, 0.0215);
  sk(0.04, 0.03, 0.0205);
  sk(0.02, 0.0345, 0.021, 0, 2.6); sk(0.0, 0.038, 0.0205, 0, 2.8);
  sk(-0.02, 0.0405, 0.0195, 0, 3.0); sk(-0.04, 0.041, 0.0175, 0, 3.0);
  sk(-0.052, 0.04, 0.0145, 0, 3.0); sk(-0.06, 0.037, 0.0095, 0, 2.6);
  sk(-0.065, 0.025, 0.005, 0, 2.2); sk(-0.0675, 0.01, 0.002, 0, 2);
  // strips up to and including the rim-to-wrist step are sleeve material
  for (let k = 0; k < rings.length - 1; k++) mat.push(k < nSleeve - 1 ? SLEEVE : SKIN);
  // first skin strip connects hem ring (sleeve uv) to wrist ring: use skin material
  mesh.addGrid(rings, mat);

  // --- fingers + thumb ---
  const down = new THREE.Vector3(0, 0, -1);
  for (const f of FINGERS) {
    limb(mesh, new THREE.Vector3(f.x, 0.001, f.z), down, f.len, f.r, f.r * 0.8, 0.92, [f.name + 'a', f.name + 'b', f.name + 'c'], 0.03);
  }
  limb(mesh, new THREE.Vector3(...THUMB.base), THUMB.dir, THUMB.len, THUMB.r, THUMB.r * 0.72, 0.9, ['t0', 't1', 't2'], 0.03);
  return mesh.geometry();
}

let geo = null;

// ---------- skeleton & poses ----------
function makeSkeleton() {
  const bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  const by = (n) => bones[bi(n)];
  by('hand').position.set(0, 0, WRIST_Z);
  by('fore').position.set(0, 0, 0);
  by('hand').add(by('fore'));
  for (const f of FINGERS) {
    const a = by(f.name + 'a'), b = by(f.name + 'b'), c = by(f.name + 'c');
    a.position.set(f.x, 0.001, f.z - WRIST_Z);
    b.position.set(0, 0, -f.len[0]); c.position.set(0, 0, -f.len[1]);
    by('hand').add(a); a.add(b); b.add(c);
  }
  const t0 = by('t0'), t1 = by('t1'), t2 = by('t2');
  t0.position.set(THUMB.base[0], THUMB.base[1], THUMB.base[2] - WRIST_Z);
  t1.position.copy(THUMB.dir).multiplyScalar(THUMB.len[0]); t2.position.copy(THUMB.dir).multiplyScalar(THUMB.len[1]);
  by('hand').add(t0); t0.add(t1); t1.add(t2);
  return { bones, by };
}

// Euler rotations per bone (radians). Finger curl = negative X (toward the palm).
function fingerSet(curls, spread = 0) {
  const o = {};
  FINGERS.forEach((f, i) => {
    const [a, b, c] = curls[i] || curls[curls.length - 1];
    o[f.name + 'a'] = [a, spread * (i - 1.5), 0]; o[f.name + 'b'] = [b, 0, 0]; o[f.name + 'c'] = [c, 0, 0];
  });
  return o;
}
export const ARM_POSES = {
  // fingers wrapped around a pistol grip, thumb alongside
  grip: { ...fingerSet([[-1.15, -1.35, -0.85], [-1.2, -1.4, -0.9], [-1.25, -1.4, -0.9], [-1.3, -1.35, -0.85]]), t0: [0.1, -0.1, 0], t1: [-0.15, 0, 0], t2: [-0.1, 0, 0], fore: [0, 0, 0] },
  // palm up cupping a fore-end, fingers curling up around the far side
  under: { ...fingerSet([[-0.75, -1.0, -0.75], [-0.8, -1.05, -0.8], [-0.85, -1.05, -0.8], [-0.9, -1.0, -0.75]], 0.05), t0: [0.1, 0.2, 0.3], t1: [-0.25, 0.1, 0], t2: [-0.3, 0, 0], fore: [0, 0, 0] },
  // sword/handle grip
  handle: { ...fingerSet([[-1.2, -1.4, -0.9], [-1.25, -1.45, -0.9], [-1.3, -1.45, -0.9], [-1.35, -1.4, -0.85]]), t0: [0.1, 0.3, -0.2], t1: [-0.5, 0.2, 0], t2: [-0.4, 0, 0], fore: [0, 0, 0] },
  // relaxed fist
  fist: { ...fingerSet([[-1.35, -1.5, -1.0], [-1.4, -1.55, -1.0], [-1.45, -1.55, -1.0], [-1.5, -1.5, -0.95]]), t0: [0.25, 0.5, -0.2], t1: [-0.5, 0.3, 0], t2: [-0.5, 0, 0], fore: [0, 0, 0] },
};

export function buildFPArm(poseName = 'grip') {
  if (!geo) geo = buildGeometry();
  const { bones, by } = makeSkeleton();
  const mesh = new THREE.SkinnedMesh(geo, materials());
  mesh.frustumCulled = false;
  mesh.add(by('hand'));
  mesh.bind(new THREE.Skeleton(bones));
  const arm = {
    mesh,
    by,
    pose(name, trigger = 0) {
      const p = ARM_POSES[name] || ARM_POSES.grip;
      for (const n of BONES) {
        const r = p[n] || [0, 0, 0];
        by(n).rotation.set(r[0], r[1], r[2]);
      }
      // trigger finger squeeze on recoil
      if (trigger) by('ia').rotation.x += trigger * 0.12;
    },
  };
  arm.pose(poseName);
  return arm;
}
