import * as THREE from 'three';

// Procedural single-mesh character: rings are stitched into tubes that share the skeleton and a
// texture atlas. Everything is authored in world rest pose (feet at y=0, facing -Z, arms hanging).

export const ATLAS = 1024;
export const REG = {
  torso: { x: 0, y: 0, w: 512, h: 512, y0: 0.7, y1: 1.5 },
  head: { x: 512, y: 0, w: 512, h: 448, y0: 1.486, y1: 1.864 },
  neck: { x: 512, y: 448, w: 512, h: 64, y0: 1.46, y1: 1.64 },
  legs: { x: 0, y: 512, w: 256, h: 512, y0: 0.06, y1: 0.93 },
  arms: { x: 256, y: 512, w: 256, h: 512, y0: 0.8, y1: 1.45 },
  hands: { x: 512, y: 512, w: 256, h: 512, y0: 0.6, y1: 0.87 },
  shoes: { x: 768, y: 512, w: 256, h: 512, y0: -0.25, y1: 0.12 },
};
// head u is stretched around the face so the front gets most of the texels
export const FACE_HALF = 0.23, FACE_U = 0.32;
export const headWarp = (u) => {
  const d = u - 0.5, a = Math.abs(d);
  const k = a <= FACE_HALF ? a * (FACE_U / FACE_HALF) : FACE_U + (a - FACE_HALF) * ((0.5 - FACE_U) / (0.5 - FACE_HALF));
  return 0.5 + Math.sign(d) * k;
};

export const BONE_DEF = [
  ['hips', null, [0, 0.92, 0]], ['spine', 'hips', [0, 0.97, 0]], ['chest', 'spine', [0, 1.17, 0]],
  ['neck', 'chest', [0, 1.46, 0]], ['head', 'neck', [0, 1.5, 0]],
  ['uarmL', 'chest', [-0.25, 1.38, 0]], ['larmL', 'uarmL', [-0.25, 1.08, 0]], ['handL', 'larmL', [-0.25, 0.79, 0]],
  ['uarmR', 'chest', [0.25, 1.38, 0]], ['larmR', 'uarmR', [0.25, 1.08, 0]], ['handR', 'larmR', [0.25, 0.79, 0]],
  ['ulegL', 'hips', [-0.1, 0.87, 0]], ['llegL', 'ulegL', [-0.1, 0.45, 0]], ['footL', 'llegL', [-0.1, 0.06, 0]],
  ['ulegR', 'hips', [0.1, 0.87, 0]], ['llegR', 'ulegR', [0.1, 0.45, 0]], ['footR', 'llegR', [0.1, 0.06, 0]],
];
const BI = Object.fromEntries(BONE_DEF.map((b, i) => [b[0], i]));

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- noise ----------
function hash(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}

// ---------- tube builder ----------
class Builder {
  constructor() { this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; this.seams = []; }
  vert(p, u, v, region, wl) {
    const m = new Map();
    for (const [b, w] of wl) if (w > 1e-4) m.set(b, (m.get(b) || 0) + w);
    const s = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = s.reduce((a, e) => a + e[1], 0) || 1;
    while (s.length < 4) s.push([0, 0]);
    this.pos.push(p.x, p.y, p.z);
    const g = 3, r = region;
    this.uv.push((r.x + g + u * (r.w - 2 * g)) / ATLAS, 1 - (r.y + g + (1 - v) * (r.h - 2 * g)) / ATLAS);
    for (const e of s) { this.si.push(e[0]); this.sw.push(e[1] / tot); }
    return this.pos.length / 3 - 1;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (const [a, b] of this.seams) {
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    return g;
  }
}

// ring: { c:[x,y,z], rx, rz, n?, v }; o: { N, region, weights(p), n, noise:{amp,freq,seed}, axis, mirrorU, warp, poles }
function tube(B, rings, o) {
  const N = o.N || 12, axis = o.axis || 'y', V = new THREE.Vector3();
  const first = B.pos.length / 3;
  const rowIdx = [];
  const centers = [];
  const nz = o.noise;
  const tri = [];
  for (const rg of rings) {
    const n = rg.n || o.n || 2, gx = o.g || 1;
    const pts = [];
    for (let j = 0; j <= N; j++) {
      const a = Math.PI + (j / N) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      pts.push([Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * rg.rx * gx, -Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * rg.rz * gx]);
    }
    const cum = [0];
    for (let j = 1; j <= N; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    const P = cum[N] || 1;
    const row = [];
    for (let j = 0; j <= N; j++) {
      let u = cum[j] / P; if (o.warp) u = o.warp(u); if (o.mirrorU) u = 1 - u;
      let [px, pz] = pts[j];
      let k = 1;
      const [cx, cy, cz] = rg.c;
      if (nz) {
        const wx = cx + px, wy = axis === 'y' ? cy : cy + pz, wz = axis === 'y' ? cz + pz : cz;
        k += nz.amp * (vnoise(wx * nz.freq + nz.seed, wy * nz.freq, wz * nz.freq) - 0.5) * 2;
      }
      px *= k; pz *= k;
      if (o.bump) { const d = o.bump(px + cx, rg, j, N); px += d[0]; pz += d[1]; }
      V.set(cx + px, axis === 'y' ? cy : cy + pz, axis === 'y' ? cz + pz : cz);
      row.push(B.vert(V, u, rg.v, o.region, o.weights(V)));
    }
    rowIdx.push(row); centers.push(new THREE.Vector3(...rg.c));
    B.seams.push([row[0], row[N]]);
  }
  const R = rings.length;
  const P = (i) => new THREE.Vector3(B.pos[i * 3], B.pos[i * 3 + 1], B.pos[i * 3 + 2]);
  const main = [];
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < N; j++) {
    const a = rowIdx[i][j], b = rowIdx[i][j + 1], c = rowIdx[i + 1][j], d = rowIdx[i + 1][j + 1];
    main.push([a, b, c, i], [b, d, c, i]);
  }
  const outward = (t, ci) => {
    const p0 = P(t[0]), p1 = P(t[1]), p2 = P(t[2]);
    const nrm = new THREE.Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0));
    return nrm.dot(p0.clone().add(p1).add(p2).divideScalar(3).sub(centers[ci]));
  };
  let sum = 0; for (const t of main) sum += Math.sign(outward(t, t[3]));
  const flip = sum < 0;
  for (const t of main) { if (flip) B.idx.push(t[0], t[2], t[1]); else B.idx.push(t[0], t[1], t[2]); }
  if (o.poles !== false) {
    for (const end of [0, 1]) {
      const rg = rings[end ? R - 1 : 0], row = rowIdx[end ? R - 1 : 0];
      const c = new THREE.Vector3(...rg.c);
      const pv = B.vert(c, 0.5, rg.v, o.region, o.weights(c));
      const away = c.clone().sub(centers[end ? R - 2 : 1]);
      for (let j = 0; j < N; j++) {
        const t = [pv, row[j], row[j + 1]];
        const p0 = P(t[0]), p1 = P(t[1]), p2 = P(t[2]);
        const nrm = new THREE.Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0));
        if (nrm.dot(away) >= 0) B.idx.push(t[0], t[1], t[2]); else B.idx.push(t[0], t[2], t[1]);
      }
    }
  }
  void first; void tri;
}

// ---------- weights ----------
const W = (list) => list;
function torsoW(p) {
  const y = p.y, ax = Math.abs(p.x), side = p.x < 0 ? 'L' : 'R';
  const wh = 1 - ss(0.92, 1.06, y), wc = ss(1.1, 1.26, y);
  const wn = ss(1.44, 1.5, y) * wc;
  let l = [['hips', wh], ['spine', clamp01(1 - wh - wc)], ['chest', wc - wn], ['neck', wn]];
  const sh = ss(0.13, 0.23, ax) * ss(1.28, 1.38, y) * 0.5;
  const lg = (1 - ss(0.74, 0.9, y)) * ss(0.01, 0.12, ax) * 0.65;
  l = l.map(([b, w]) => [b, w * (1 - sh - lg)]);
  l.push(['uarm' + side, sh], ['uleg' + side, lg]);
  return l.map(([b, w]) => [BI[b], w]);
}
function legW(side) {
  return (p) => {
    const y = p.y, wh = ss(0.8, 0.93, y), wl = 1 - ss(0.38, 0.52, y), wf = (1 - ss(0.05, 0.13, y)) * 0.85;
    return W([[BI.hips, wh], [BI['uleg' + side], clamp01(1 - wh - wl)], [BI['lleg' + side], wl * (1 - wf)], [BI['foot' + side], wl * wf]]);
  };
}
function armW(side) {
  return (p) => {
    const y = p.y, wc = ss(1.3, 1.42, y) * 0.55, wl = 1 - ss(1.03, 1.13, y), wh = (1 - ss(0.78, 0.83, y)) * 0.35;
    const wu = clamp01(1 - wc - wl);
    return W([[BI.chest, wc], [BI['uarm' + side], wu], [BI['larm' + side], wl * (1 - wh)], [BI['hand' + side], wh]]);
  };
}
const one = (b) => () => [[BI[b], 1]];

// ---------- parts ----------
const T = (y0, y1) => (y) => (y - y0) / (y1 - y0);
const ring = (y, rx, rz, cx = 0, cz = 0, rr, extra = {}) => ({ c: [cx, y, cz], rx, rz, ...extra });
const withV = (rings, r) => rings.map((g) => ({ ...g, v: (g.c[1] - r.y0) / (r.y1 - r.y0) }));

function addTorso(B) {
  const rings = withV([
    ring(0.7, 0.09, 0.07, 0, 0), ring(0.74, 0.135, 0.095, 0, -0.005), ring(0.8, 0.165, 0.11, 0, -0.006), ring(0.87, 0.18, 0.12, 0, -0.008),
    ring(0.96, 0.182, 0.124, 0, -0.012), ring(1.05, 0.18, 0.128, 0, -0.016), ring(1.13, 0.176, 0.122, 0, -0.008),
    ring(1.21, 0.19, 0.118, 0, -0.004), ring(1.29, 0.205, 0.115, 0, -0.002), ring(1.36, 0.212, 0.108, 0, 0.004),
    ring(1.415, 0.18, 0.095, 0, 0.004), ring(1.455, 0.11, 0.08, 0, 0), ring(1.485, 0.085, 0.072, 0, 0), ring(1.5, 0.078, 0.07, 0, 0),
  ], REG.torso);
  tube(B, rings, { N: 16, n: 2.3, g: 1.1, region: REG.torso, weights: torsoW, noise: { amp: 0.035, freq: 7, seed: 3 } });
}

function addLeg(B, s) {
  const cx = s * 0.1;
  const rings = withV([
    ring(0.93, 0.05, 0.05, cx), ring(0.9, 0.098, 0.094, cx, 0.004), ring(0.8, 0.094, 0.09, cx, 0.006), ring(0.65, 0.082, 0.079, cx, 0.004),
    ring(0.52, 0.074, 0.073, cx, 0), ring(0.45, 0.073, 0.073, cx, -0.004), ring(0.36, 0.07, 0.07, cx, 0), ring(0.24, 0.07, 0.07, cx, 0.004),
    ring(0.15, 0.076, 0.075, cx, 0.004), ring(0.09, 0.08, 0.079, cx, 0.003), ring(0.05, 0.074, 0.074, cx, 0.003),
  ], REG.legs);
  tube(B, rings, { N: 12, g: 1.06, region: REG.legs, mirrorU: s > 0, weights: legW(s < 0 ? 'L' : 'R'), noise: { amp: 0.04, freq: 6, seed: s * 7 + 11 } });
}

function addArm(B, s) {
  const cx = s * 0.255;
  const rings = withV([
    ring(1.445, 0.03, 0.03, cx), ring(1.42, 0.062, 0.06, cx), ring(1.37, 0.07, 0.066, cx, 0.003), ring(1.28, 0.066, 0.063, cx, 0.004),
    ring(1.17, 0.06, 0.058, cx, 0.003), ring(1.08, 0.057, 0.055, cx, 0.004), ring(0.97, 0.053, 0.053, cx, 0.006), ring(0.89, 0.05, 0.05, cx, 0.006),
    ring(0.845, 0.048, 0.048, cx, 0.004), ring(0.808, 0.041, 0.041, cx, 0.004), ring(0.8, 0.034, 0.034, cx, 0.004),
  ], REG.arms);
  tube(B, rings, { N: 12, g: 1.14, region: REG.arms, mirrorU: s > 0, weights: armW(s < 0 ? 'L' : 'R'), noise: { amp: 0.04, freq: 7, seed: s * 5 + 2 } });
}

function addHand(B, s) {
  const bone = s < 0 ? 'handL' : 'handR', w = one(bone);
  const cx = s * 0.255, wy = 0.79, inward = -s;
  const R = REG.hands, vv = (y) => (y - R.y0) / (R.y1 - R.y0);
  // palm: thin in x (faces the thigh), wide in z
  const palm = [ring(0.855, 0.02, 0.03, cx, 0.003), ring(0.8, 0.021, 0.036, cx, 0.003), ring(0.755, 0.021, 0.04, cx + inward * 0.002, 0), ring(0.715, 0.018, 0.039, cx + inward * 0.004, -0.002), ring(0.69, 0.015, 0.034, cx + inward * 0.005, -0.002)]
    .map((g) => ({ ...g, v: vv(g.c[1]) }));
  tube(B, palm, { N: 8, n: 2.4, g: 1.2, region: R, weights: (p) => [[BI['larm' + (s < 0 ? 'L' : 'R')], (1 - ss(0.78, 0.83, p.y)) * 0.6 + 0.0], [BI[bone], 1]], noise: { amp: 0.02, freq: 14, seed: s } });
  const fing = [[-0.027, 0.078, 1], [-0.009, 0.088, 1], [0.009, 0.082, 1], [0.027, 0.066, 0.9]];
  fing.forEach(([fz, len, k], i) => {
    const y0 = 0.715, rr = [];
    const segs = 4;
    for (let m = 0; m <= segs; m++) {
      const t = m / segs, curl = t * t;
      const r = 0.0105 - t * 0.0035;
      rr.push({ c: [cx + inward * (0.006 + curl * 0.04 * k), y0 - t * len * 0.95, fz + 0.002 * t - 0.0006 * i], rx: r, rz: r, v: vv(y0 - t * len) });
    }
    tube(B, rr, { N: 6, g: 1.15, region: R, weights: w });
  });
  // thumb: forward and inward along the side of the palm
  const th = [];
  for (let m = 0; m <= 3; m++) {
  const t = m / 3;
    th.push({ c: [cx + inward * (0.012 + t * 0.026), 0.775 - t * 0.075, -0.042 - t * 0.014], rx: 0.0125 - t * 0.003, rz: 0.0125 - t * 0.003, v: vv(0.775 - t * 0.075) });
  }
  tube(B, th, { N: 6, g: 1.2, region: R, weights: w });
  void wy;
}

function addShoe(B, s) {
  const bone = s < 0 ? 'footL' : 'footR', cx = s * 0.1;
  const R = REG.shoes;
  const zs = (z) => (R.y1 - z) / (R.y1 - R.y0);
  // rings along z from heel (+z) to toe (-z); rx = half width, rz = half height; y centre lifted so soles sit on y=0
  const defs = [[0.115, 0.04, 0.034], [0.1, 0.05, 0.05], [0.05, 0.056, 0.058], [-0.02, 0.058, 0.056], [-0.1, 0.06, 0.048], [-0.17, 0.056, 0.04], [-0.225, 0.042, 0.03], [-0.245, 0.018, 0.016]];
  const rings = defs.map(([z, rx, rz]) => ({ c: [cx, rz, z], rx, rz, v: zs(z) }));
  tube(B, rings, { N: 10, n: 2.6, axis: 'z', region: R, weights: one(bone), noise: { amp: 0.03, freq: 10, seed: s * 3 } });
}

function addNeck(B) {
  const R = REG.neck, rings = [ring(1.46, 0.064, 0.06), ring(1.52, 0.058, 0.057), ring(1.58, 0.06, 0.059), ring(1.64, 0.068, 0.066)].map((g) => ({ ...g, v: (g.c[1] - R.y0) / (R.y1 - R.y0) }));
  tube(B, rings, { N: 10, region: R, weights: (p) => [[BI.neck, 1 - ss(1.5, 1.6, p.y)], [BI.head, ss(1.5, 1.6, p.y)]] });
}

function addHead(B) {
  const R = REG.head;
  const y0 = 1.488;
  const rs = [
    [1.488, 0.04, 0.04, 0, -0.01, 2.2], [1.5, 0.085, 0.082, 0, -0.012, 2.4], [1.525, 0.114, 0.104, 0, -0.016, 2.8], [1.56, 0.134, 0.119, 0, -0.012, 3.2],
    [1.6, 0.146, 0.128, 0, -0.006, 3.4], [1.64, 0.152, 0.133, 0, -0.002, 3.5], [1.68, 0.155, 0.136, 0, 0, 3.5], [1.72, 0.156, 0.137, 0, 0.002, 3.5],
    [1.76, 0.154, 0.136, 0, 0.004, 3.5], [1.8, 0.145, 0.13, 0, 0.004, 3.3], [1.83, 0.128, 0.118, 0, 0.004, 3], [1.851, 0.09, 0.085, 0, 0.004, 2.6], [1.862, 0.04, 0.04, 0, 0.004, 2.2],
  ];
  const rings = rs.map(([y, rx, rz, cx, cz, n]) => ({ c: [cx, y, cz], rx, rz, n, v: (y - R.y0) / (R.y1 - R.y0) }));
  // relief on the flat front: brow, nose, sunken eye sockets, mouth
  const g2 = (d, s) => Math.exp(-(d * d) / (2 * s * s));
  const bump = (wx, rg, j, N) => {
    const y = rg.c[1];
    const front = Math.exp(-Math.pow((j - N / 2) / (N / 5), 2));
    if (front < 0.05) return [0, 0];
    let d = 0;
    d += 0.03 * g2(wx, 0.016) * g2(y - 1.665, 0.04) * (y < 1.7 ? 1 : 0.5);
    d += 0.012 * g2(y - 1.725, 0.012) * g2(wx, 0.09);
    for (const sx of [-1, 1]) d -= 0.017 * g2(wx - sx * 0.055, 0.025) * g2(y - 1.7, 0.02);
    d += 0.007 * g2(y - 1.585, 0.012) * g2(wx, 0.04);
    d -= 0.006 * g2(y - 1.57, 0.01) * g2(wx, 0.05);
    return [0, -d * front];
  };
  tube(B, rings, { N: 24, region: R, warp: headWarp, weights: (p) => [[BI.head, 1], [BI.neck, (1 - ss(1.49, 1.56, p.y)) * 0.5]], noise: { amp: 0.012, freq: 9, seed: 9 }, bump });
}

let cache = null;
export function bodyGeometry() {
  if (cache) return cache;
  const B = new Builder();
  addTorso(B); addLeg(B, -1); addLeg(B, 1); addArm(B, -1); addArm(B, 1);
  addNeck(B); addHead(B); addHand(B, -1); addHand(B, 1); addShoe(B, -1); addShoe(B, 1);
  cache = B.geometry();
  return cache;
}

// team-colour armbands on both upper arms (skinned to the same skeleton)
let bandCache = null;
export function armbandGeometry() {
  if (bandCache) return bandCache;
  const B = new Builder(), R = { x: 0, y: 0, w: 16, h: 16 };
  for (const s of [-1, 1]) {
    const cx = s * 0.255, side = s < 0 ? 'L' : 'R';
    const rings = [[1.25, 0.062, 0.059, 0.003], [1.24, 0.068, 0.065, 0.005], [1.2, 0.067, 0.064, 0.006], [1.19, 0.062, 0.059, 0.006]]
      .map(([y, rx, rz, cz], i) => ({ c: [cx, y, cz], rx: rx + 0.002, rz: rz + 0.002, v: i / 3 }));
    tube(B, rings, { N: 14, g: 1.14, region: { ...R, x: 0, y: 0, w: ATLAS, h: ATLAS }, weights: () => [[BI['uarm' + side], 1]], noise: { amp: 0.03, freq: 11, seed: s }, poles: false });
  }
  bandCache = B.geometry();
  return bandCache;
}

// ---------- cosmetics (static meshes parented to the head bone, authored around the head) ----------
const HEAD_Y = 1.5;
function plain(rings, o) {
  const B = new Builder(), R = { x: 0, y: 0, w: ATLAS, h: ATLAS };
  tube(B, rings.map((g, i) => ({ ...g, v: i / (rings.length - 1) })), { N: 20, region: R, weights: () => [[0, 1]], ...o });
  const g = B.geometry(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.translate(0, -HEAD_Y + 0.035, 0);
  return g;
}
export function cosmeticGeometry(kind) {
  if (kind === 'beanie') {
    return plain([ring(1.7, 0.168, 0.15, 0, 0.012, 0, { n: 2.8 }), ring(1.745, 0.175, 0.156, 0, 0.012, 0, { n: 3 }), ring(1.79, 0.17, 0.153, 0, 0.012, 0, { n: 3 }), ring(1.84, 0.15, 0.14, 0, 0.012, 0, { n: 2.6 }), ring(1.88, 0.1, 0.095, 0, 0.012, 0, { n: 2.3 }), ring(1.905, 0.045, 0.045, 0, 0.012, 0, { n: 2 })], { noise: { amp: 0.02, freq: 18, seed: 5 } });
  }
  if (kind === 'cap') {
    const dome = plain([ring(1.72, 0.162, 0.145, 0, 0.008, 0, { n: 3 }), ring(1.76, 0.167, 0.15, 0, 0.008, 0, { n: 3 }), ring(1.81, 0.158, 0.143, 0, 0.008, 0, { n: 2.8 }), ring(1.85, 0.12, 0.115, 0, 0.008, 0, { n: 2.4 }), ring(1.872, 0.05, 0.05, 0, 0.008, 0, { n: 2 })], { noise: { amp: 0.012, freq: 12, seed: 6 } });
    const brim = plain([ring(1.725, 0.07, 0.06, 0, -0.17), ring(1.735, 0.085, 0.085, 0, -0.17), ring(1.745, 0.085, 0.085, 0, -0.17)].map((g, i) => ({ ...g, c: [0, g.c[1] + i * 0.002, -0.15 - i * 0.03] })), { axis: 'y', n: 4 });
    return mergeSimple([dome, brim]);
  }
  if (kind === 'hardhat') {
    const dome = plain([ring(1.715, 0.175, 0.158, 0, 0.004, 0, { n: 3 }), ring(1.75, 0.172, 0.155, 0, 0.004, 0, { n: 3 }), ring(1.8, 0.162, 0.148, 0, 0.004, 0, { n: 2.8 }), ring(1.85, 0.125, 0.118, 0, 0.004, 0, { n: 2.4 }), ring(1.885, 0.055, 0.055, 0, 0.004, 0, { n: 2 })], { noise: { amp: 0.01, freq: 10, seed: 7 } });
    const rim = plain([ring(1.712, 0.2, 0.188, 0, -0.012, 0, { n: 3 }), ring(1.722, 0.2, 0.188, 0, -0.012, 0, { n: 3 })], { noise: { amp: 0.01, freq: 10, seed: 8 } });
    return mergeSimple([dome, rim]);
  }
  // sunglasses: two lenses, bridge and temple arms
  const lens = (x) => plain([ring(1.7, 0.034, 0.012, x, -0.152, 0, { n: 3 }), ring(1.712, 0.04, 0.012, x, -0.154, 0, { n: 3 }), ring(1.724, 0.036, 0.012, x, -0.152, 0, { n: 3 })].map((g) => ({ ...g, rz: 0.018 })), {});
  return mergeSimple([lens(-0.05), lens(0.05)]);
}
function mergeSimple(list) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = []; let off = 0;
  for (const s of list) {
    pos.push(...s.attributes.position.array); nor.push(...s.attributes.normal.array); uv.push(...s.attributes.uv.array);
    for (const i of s.index.array) idx.push(i + off);
    off += s.attributes.position.count;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export { BI };
