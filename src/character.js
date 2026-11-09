import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { knitTexture } from './assets.js';
import { buildWeaponModel } from './gunmodels.js';

// Stylised lanky bald worker with an oversized smooth head and procedural textures.
const HIP_Y = 0.92, THIGH = 0.42, SHIN = 0.39, UARM = 0.3, LARM = 0.29, HEAD_C = 0.155;

// merge indexed and non-indexed geometries alike
function mergeGeometries(list, groups) {
  const mixed = list.some((g) => !g.index) && list.some((g) => g.index);
  return mergeRaw(mixed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list, groups);
}

const rng = (seed) => { let a = (Math.imul(seed + 1, 2654435761)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const css = (c) => `#${new THREE.Color(c).getHexString()}`;
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
const mixc = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

// ---------- canvas helpers ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texOf(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const enc = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055));
// Twill weave fill; THREE.Color holds linear values so re-encode to sRGB.
function fabric(g, w, h, color, weave, rnd) {
  const c = new THREE.Color(color);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const k = 1 - weave + (((x + y) & 3) === 0 ? weave : 0) + (((x - y + 400) & 3) === 0 ? weave * 0.6 : 0) + (rnd() - 0.5) * 0.05;
    img.data[i] = enc(Math.min(1, c.r * k)); img.data[i + 1] = enc(Math.min(1, c.g * k)); img.data[i + 2] = enc(Math.min(1, c.b * k)); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
const line = (g, x1, y1, x2, y2, col, wd = 1, dash) => { g.strokeStyle = col; g.lineWidth = wd; g.setLineDash(dash || []); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };
const rrect = (g, x, y, w, h, r, fill, stroke, lw = 1) => {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
};

// ---------- geometry helpers ----------
const SEG = 28, N = 24, CAP = 5;
// Lathe from y=0..h with elliptical end caps; v coordinate follows vertex index (see vOf)
function lathe(fn, h, capK = 0.8) {
  const pts = [];
  const r0 = fn(0), r1 = fn(1);
  for (let i = 0; i < CAP; i++) { const a = (i / CAP) * Math.PI / 2; pts.push(new THREE.Vector2(r0 * Math.sin(a), -r0 * capK * Math.cos(a))); }
  for (let i = 0; i < N; i++) { const t = i / (N - 1); pts.push(new THREE.Vector2(fn(t), t * h)); }
  for (let i = 1; i <= CAP; i++) { const a = (i / CAP) * Math.PI / 2; pts.push(new THREE.Vector2(r1 * Math.cos(a), h + r1 * capK * Math.sin(a))); }
  return new THREE.LatheGeometry(pts, SEG);
}
const vOf = (t) => (CAP + t * (N - 1)) / (N + 2 * CAP - 1);
function ell(sx, sy, sz, x, y, z, seg = 18) { const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(sx, sy, sz); g.translate(x, y, z); return g; }
function bar(p1, p2, th) {
  const a = new THREE.Vector3(...p1), b = new THREE.Vector3(...p2);
  const g = new THREE.BoxGeometry(th, th, a.distanceTo(b));
  g.applyMatrix4(new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)).setPosition(0, 0, 0));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// ---------- static geometry shared by all characters ----------
let G = null;
function geos() {
  if (G) return G;
  G = {};
  G.torso = lathe((t) => lerp(0.125, 0.165, sm(0, 0.6, t)) * lerp(1, 0.5, sm(0.88, 1, t)), 0.5);
  G.torso.scale(1.2, 1, 0.74); G.torso.translate(0, -0.03, 0);
  G.pelvis = lathe((t) => 0.135 + 0.015 * Math.sin(t * 3), 0.15, 0.7);
  G.pelvis.scale(1.18, 1, 0.8); G.pelvis.translate(0, -0.09, 0);
  G.uarm = lathe((t) => lerp(0.043, 0.056, sm(0, 1, t)), UARM, 1.0); G.uarm.translate(0, -UARM, 0);
  const lar = lathe((t) => lerp(0.04, 0.046, t), LARM, 0.5); lar.translate(0, -LARM, 0);
  G.thigh = lathe((t) => lerp(0.066, 0.092, sm(0, 1, t)), THIGH, 1.0); G.thigh.translate(0, -THIGH, 0);
  const shin = lathe((t) => lerp(0.052, 0.066, sm(0, 1, t)), SHIN, 0.8); shin.translate(0, -SHIN, 0);
  const hand = (s) => mergeGeometries([
    ell(0.036, 0.05, 0.03, 0, -0.025, 0, 14),
    ell(0.033, 0.045, 0.026, 0, -0.075, -0.003, 14),
    ell(0.017, 0.032, 0.02, s * 0.036, -0.04, -0.016, 10),
  ]);
  const hl = hand(1), hr = hand(-1); hl.translate(0, -LARM + 0.02, 0); hr.translate(0, -LARM + 0.02, 0);
  G.lowerL = mergeGeometries([lar, hl], true);
  G.lowerR = mergeGeometries([lar.clone(), hr], true);
  // shoe: lathe along z (toe at -z) + sole
  const up = lathe((t) => 0.05 * lerp(1, 0.55, sm(0.5, 1, t)), 0.24, 0.9);
  up.rotateX(-Math.PI / 2); up.rotateZ(Math.PI); up.scale(1, 0.75, 1); up.translate(0, -0.012, 0.12);
  const sole = new RoundedBoxGeometry(0.105, 0.034, 0.28, 2, 0.015); sole.translate(0, -0.02, -0.01);
  const at = (g) => { const c = g.clone(); c.translate(0, -SHIN - 0.025, 0); return c; };
  G.shin = mergeGeometries([shin, at(up), at(sole)], true);
  // head: slight jaw taper
  const head = new THREE.SphereGeometry(1, 48, 34);
  const p = head.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const k = 1 - 0.2 * Math.pow(-y, 1.6); x *= k; z *= k; }
    p.setXYZ(i, x * 0.155, y * 0.172, z * 0.165);
  }
  G.head = head;
  G.features = mergeGeometries([
    ell(0.019, 0.026, 0.03, 0, -0.024, -0.158, 12),
    ell(0.012, 0.034, 0.024, 0.152, -0.01, 0.004, 10), ell(0.012, 0.034, 0.024, -0.152, -0.01, 0.004, 10),
  ]);
  G.neck = new THREE.CylinderGeometry(0.048, 0.056, 0.11, 14); G.neck.translate(0, 0.02, 0);
  return G;
}

// ---------- palettes ----------
const SKINS = [0xf0c8a8, 0xe3b08c, 0xcf9870, 0xb57a52, 0x8d5a3a, 0xf4d3bc];
const TROUSERS = [0x33363d, 0x5b5546, 0x2b3345, 0x4a3b30, 0x3d4538];
const SHOES = [0x2a2a2e, 0xb9b5a8, 0x6a3f28, 0x35404a, 0x9c9686];
const SHIRTS = [0xc4bfaf, 0xa5adb2, 0x8d957d, 0xb3a285, 0xc9c7c0];
const VARIANTS = ['jacket', 'hoodie', 'vest', 'overalls', 'jacket', 'vest'];
const EYES = ['#4a6f8c', '#5b4a32', '#4d7a54', '#6a5a78'];

// ---------- texture painters ----------
function faceTexture(skin, eye, rnd) {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const sk = new THREE.Color(skin);
  g.fillStyle = css(sk); g.fillRect(0, 0, W, H);
  // soft skin variation
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? "255,235,215" : "150,90,70"},${0.012 + rnd() * 0.012})`;
    g.beginPath(); g.arc(rnd() * W, rnd() * H, 4 + rnd() * 14, 0, 6.3); g.fill();
  }
  const cx = 384, cy = 126;
  const blob = (x, y, rx, ry, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, 6.3); g.fill(); g.restore(); };
  // cheeks + nose + chin warmth, brow-ridge / eye-socket shade
  blob(cx - 30, cy + 16, 18, 12, 'rgba(225,110,100,A)', 0.4); blob(cx + 30, cy + 16, 18, 12, 'rgba(225,110,100,A)', 0.4);
  blob(cx, cy + 6, 8, 12, 'rgba(225,120,100,A)', 0.25);
  blob(cx - 26, cy - 1, 20, 12, 'rgba(120,70,60,A)', 0.2); blob(cx + 26, cy - 1, 20, 12, 'rgba(120,70,60,A)', 0.2);
  // nose side shading
  blob(cx - 10, cy + 8, 4, 12, 'rgba(110,60,50,A)', 0.28); blob(cx + 10, cy + 8, 4, 12, 'rgba(110,60,50,A)', 0.28);
  // eyes
  for (const s of [-1, 1]) {
    const ex = cx + s * 27, ey = cy;
    g.fillStyle = '#f7f3ea'; g.beginPath(); g.ellipse(ex, ey, 11, 7, 0, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(80,45,35,0.55)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = eye; g.beginPath(); g.arc(ex - s * 0.5, ey + 0.5, 5.2, 0, 6.3); g.fill();
    g.fillStyle = '#16120f'; g.beginPath(); g.arc(ex - s * 0.5, ey + 0.5, 2.6, 0, 6.3); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(ex - s * 0.5 - 1.6, ey - 1.6, 1.4, 0, 6.3); g.fill();
    // upper lid + lash line, lower lid hint
    g.strokeStyle = '#3a2418'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(ex, ey + 0.5, 11.5, 7.2, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.strokeStyle = 'rgba(120,70,55,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(ex, ey + 2, 11, 7, 0, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    // brow
    g.strokeStyle = 'rgba(70,48,34,0.85)'; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath();
    g.moveTo(ex - s * 12, ey - 14 + 1.5); g.quadraticCurveTo(ex, ey - 19, ex + s * 12, ey - 15.5); g.stroke();
  }
  // nostrils + mouth
  g.fillStyle = 'rgba(90,40,35,0.55)'; g.beginPath(); g.ellipse(cx - 4.5, cy + 17, 2.2, 1.4, 0, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(cx + 4.5, cy + 17, 2.2, 1.4, 0, 0, 6.3); g.fill();
  g.strokeStyle = '#7a3a34'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 13, cy + 30); g.quadraticCurveTo(cx, cy + 35, cx + 13, cy + 30); g.stroke();
  g.fillStyle = 'rgba(190,100,95,0.5)'; g.beginPath(); g.ellipse(cx, cy + 36, 8, 3, 0, 0, 3.14); g.fill();
  g.strokeStyle = 'rgba(110,60,50,0.3)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(cx - 16, cy + 29); g.quadraticCurveTo(cx - 18, cy + 26, cx - 16, cy + 24); g.stroke();
  g.beginPath(); g.moveTo(cx + 16, cy + 29); g.quadraticCurveTo(cx + 18, cy + 26, cx + 16, cy + 24); g.stroke();
  // chin crease
  blob(cx, cy + 50, 14, 5, 'rgba(110,60,50,A)', 0.16);
  return texOf(c);
}

// torso (front = centre of canvas); y of canvas = 1 - v
function torsoTexture(v, main, shirt, trouser, rnd) {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const Y = (t) => (1 - vOf(t)) * H, mid = W / 2;
  const dark = css(shade(main, 0.62)), light = css(shade(main, 1.35));
  const col = (v === 'vest' || v === 'overalls') ? shirt : main;
  fabric(g, W, H, col, 0.07, rnd);
  const zip = (x, t0, t1) => { line(g, x, Y(t0), x, Y(t1), '#2b2b2b', 4); line(g, x, Y(t0), x, Y(t1), '#bfc2c4', 2.4, [2, 2]); };
  const stitch = (x1, y1, x2, y2) => line(g, x1, y1, x2, y2, 'rgba(0,0,0,0.35)', 1, [3, 3]);
  // hem band + side seams
  const hem = css(shade(col, 0.82));
  g.fillStyle = hem; g.fillRect(0, Y(0.1), W, Y(0) - Y(0.1) + 8);
  for (let x = 0; x < W; x += 3) line(g, x, Y(0.1), x, Y(0), 'rgba(0,0,0,0.12)', 1);
  if (v === 'jacket') {
    // collar, yoke, pockets, zipper
    g.fillStyle = css(shade(main, 0.8)); g.fillRect(0, Y(1), W, Y(0.86) - Y(1));
    line(g, 0, Y(0.86), W, Y(0.86), 'rgba(0,0,0,0.35)', 2);
    line(g, mid, Y(0.9), mid - 22, Y(0.8), 'rgba(0,0,0,0.3)', 2); line(g, mid, Y(0.9), mid + 22, Y(0.8), 'rgba(0,0,0,0.3)', 2);
    zip(mid, 0.1, 0.9);
    for (const s of [-1, 1]) {
      const x = mid + s * 44;
      rrect(g, x - 17, Y(0.34), 34, Y(0.12) - Y(0.34) - 4, 3, css(shade(main, 0.9)), 'rgba(0,0,0,0.5)', 1.5);
      line(g, x - 17, Y(0.3), x + 17, Y(0.3), 'rgba(0,0,0,0.5)', 2);
      stitch(x - 14, Y(0.31), x - 14, Y(0.14)); stitch(x + 14, Y(0.31), x + 14, Y(0.14));
      rrect(g, mid + s * 40 - 13, Y(0.74), 26, 12, 2, css(shade(main, 1.1)), 'rgba(0,0,0,0.4)', 1);
    }
    line(g, mid - 90, Y(0.9), mid - 80, Y(0.12), 'rgba(0,0,0,0.3)', 2); line(g, mid + 90, Y(0.9), mid + 80, Y(0.12), 'rgba(0,0,0,0.3)', 2);
    // reflective strip across the back
    g.fillStyle = 'rgba(225,225,215,0.55)'; g.fillRect(0, Y(0.45), 40, 6); g.fillRect(W - 40, Y(0.45), 40, 6); g.fillRect(70, Y(0.45), 120, 0);
  } else if (v === 'hoodie') {
    g.fillStyle = css(shade(main, 0.75)); g.fillRect(0, Y(1), W, Y(0.84) - Y(1));
    // hood bunched at the collar
    for (let x = 0; x < W; x += 6) line(g, x, Y(1), x + 3, Y(0.84), 'rgba(0,0,0,0.15)', 2);
    line(g, 0, Y(0.84), W, Y(0.84), 'rgba(0,0,0,0.3)', 2);
    // drawstrings
    for (const s of [-1, 1]) { line(g, mid + s * 8, Y(0.84), mid + s * 9, Y(0.55), '#e8e4da', 3); g.fillStyle = '#c9c5ba'; g.fillRect(mid + s * 9 - 2, Y(0.55), 4, 8); }
    // kangaroo pocket
    g.beginPath(); g.moveTo(mid - 58, Y(0.4)); g.lineTo(mid + 58, Y(0.4)); g.lineTo(mid + 70, Y(0.12)); g.lineTo(mid - 70, Y(0.12)); g.closePath();
    g.fillStyle = css(shade(main, 0.93)); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.stroke();
    stitch(mid - 56, Y(0.37), mid - 66, Y(0.14)); stitch(mid + 56, Y(0.37), mid + 66, Y(0.14));
    // small chest print
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(mid + 24, Y(0.7), 22, 5); g.fillRect(mid + 24, Y(0.7) + 9, 14, 3);
  } else if (v === 'vest') {
    const armhole = 26;
    g.fillStyle = css(main); g.fillRect(0, Y(0.9), W, Y(0.1) - Y(0.9));
    fabricRect(g, 0, Y(0.9), W, Y(0.1) - Y(0.9), main, rnd);
    // shirt shows under the arms
    for (const sx of [64, 192]) { g.fillStyle = css(shirt); g.fillRect(sx - armhole, Y(0.9), armhole * 2, Y(0.35) - Y(0.9)); line(g, sx - armhole, Y(0.9), sx - armhole, Y(0.35), 'rgba(0,0,0,0.35)', 2); line(g, sx + armhole, Y(0.9), sx + armhole, Y(0.35), 'rgba(0,0,0,0.35)', 2); }
    g.fillStyle = css(shade(shirt, 0.9)); g.fillRect(0, Y(1), W, Y(0.9) - Y(1)); // shirt collar
    line(g, mid, Y(1), mid - 18, Y(0.88), 'rgba(0,0,0,0.35)', 2); line(g, mid, Y(1), mid + 18, Y(0.88), 'rgba(0,0,0,0.35)', 2);
    zip(mid, 0.1, 0.9);
    for (const s of [-1, 1]) {
      rrect(g, mid + s * 42 - 18, Y(0.32), 36, 12, 2, css(shade(main, 0.85)), 'rgba(0,0,0,0.5)', 1.5);
      rrect(g, mid + s * 42 - 13, Y(0.74), 26, 22, 3, css(shade(main, 1.1)), 'rgba(0,0,0,0.45)', 1.5);
      line(g, mid + s * 42 - 13, Y(0.69), mid + s * 42 + 13, Y(0.69), 'rgba(0,0,0,0.4)', 2);
    }
    g.fillStyle = css(light); g.fillRect(mid - 70, Y(0.12), 140, 5); // piping
    // badge
    g.fillStyle = '#f2efe3'; g.fillRect(mid + 16, Y(0.78), 14, 7);
  } else { // overalls: shirt + denim-ish bib & straps
    g.fillStyle = css(shade(shirt, 0.92)); g.fillRect(0, Y(1), W, Y(0.92) - Y(1));
    const bw = 40;
    fabricRect(g, mid - bw, Y(0.68), bw * 2, Y(0.0) - Y(0.68), main, rnd);
    for (const s of [-1, 1]) {
      fabricRect(g, mid + s * 28 - 6, Y(1), 12, Y(0.68) - Y(1), main, rnd); // straps up front
      fabricRect(g, mid + s * 44 - 6 + 128 * 0, 0, 0, 0, main, rnd);
      g.fillStyle = '#b8b2a0'; g.fillRect(mid + s * 28 - 5, Y(0.68) + 1, 10, 10); g.fillStyle = '#6b665a'; g.fillRect(mid + s * 28 - 2, Y(0.68) + 4, 4, 4);
    }
    rrect(g, mid - 18, Y(0.58), 36, 24, 3, css(shade(main, 1.12)), 'rgba(0,0,0,0.5)', 1.5);
    stitch(mid - 15, Y(0.55), mid + 15, Y(0.55));
    line(g, mid - bw, Y(0.68), mid - bw, Y(0), 'rgba(0,0,0,0.5)', 2); line(g, mid + bw, Y(0.68), mid + bw, Y(0), 'rgba(0,0,0,0.5)', 2);
    line(g, mid - bw, Y(0.68), mid + bw, Y(0.68), 'rgba(0,0,0,0.5)', 2);
    // back straps cross
    for (const bx of [0, W]) { line(g, bx + 40, Y(1), bx - 40 + 0, Y(0.2), css(main), 12); }
    g.fillStyle = css(main); g.fillRect(0, Y(0.38), 40, Y(0.0) - Y(0.38)); g.fillRect(W - 40, Y(0.38), 40, Y(0.0) - Y(0.38));
  }
  // side seams + back centre seam
  for (const sx of [64, 192]) stitch(sx, Y(0.88), sx, Y(0.1));
  line(g, 1, 0, 1, H, 'rgba(0,0,0,0.25)', 2); line(g, W - 1, 0, W - 1, H, 'rgba(0,0,0,0.25)', 2);
  return texOf(c);
}
function fabricRect(g, x, y, w, h, color, rnd) {
  if (w <= 0 || h <= 0) return;
  const cc = canvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))), cg = cc.getContext('2d');
  fabric(cg, cc.width, cc.height, color, 0.07, rnd); g.drawImage(cc, x, y);
}

function sleeveTexture(color, cuff, rnd, elbow) {
  const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
  fabric(g, W, H, color, 0.07, rnd);
  line(g, 1, 0, 1, H, 'rgba(0,0,0,0.3)', 2); line(g, W - 1, 0, W - 1, H, 'rgba(0,0,0,0.3)', 2);
  line(g, 32, 0, 32, H, 'rgba(0,0,0,0.12)', 1, [3, 3]); line(g, 96, 0, 96, H, 'rgba(0,0,0,0.12)', 1, [3, 3]);
  if (cuff) {
    const y0 = (1 - vOf(0.14)) * H;
    g.fillStyle = css(shade(color, 0.8)); g.fillRect(0, y0, W, H - y0);
    for (let x = 0; x < W; x += 3) line(g, x, y0, x, H, 'rgba(0,0,0,0.14)', 1);
    line(g, 0, y0, W, y0, 'rgba(0,0,0,0.4)', 2);
  } else if (elbow) {
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(W / 2 + 0, H * 0.78, 26, 12, 0, 0, 6.3); g.fill();
  }
  return texOf(c);
}

function trouserTexture(color, kind, rnd) {
  const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
  fabric(g, W, H, color, 0.08, rnd);
  line(g, 1, 0, 1, H, 'rgba(0,0,0,0.32)', 2); line(g, W - 1, 0, W - 1, H, 'rgba(0,0,0,0.32)', 2);
  line(g, 64, 0, 64, H, 'rgba(0,0,0,0.18)', 3); line(g, 66, 0, 66, H, 'rgba(255,255,255,0.08)', 2); // front crease
  line(g, 0, 0, 0, 0, '#000');
  if (kind === 'thigh') {
    g.fillStyle = 'rgba(0,0,0,0.14)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(20 + i * 22, (1 - vOf(0.05)) * H, 8, 14, 0.5, 0, 6.3); g.fill(); }
    // wrinkles near the knee
    for (let i = 0; i < 4; i++) line(g, 30, (1 - vOf(0.1)) * H - i * 5, 100, (1 - vOf(0.1)) * H - i * 5 + 3, 'rgba(0,0,0,0.12)', 2);
  } else {
    const y0 = (1 - vOf(0.08)) * H;
    g.fillStyle = css(shade(color, 0.8)); g.fillRect(0, y0, W, H - y0);
    line(g, 0, y0, W, y0, 'rgba(0,0,0,0.4)', 2);
    for (let i = 0; i < 3; i++) line(g, 30, (1 - vOf(0.9)) * H + i * 5, 100, (1 - vOf(0.9)) * H + i * 5 + 3, 'rgba(0,0,0,0.12)', 2);
  }
  return texOf(c);
}

function pelvisTexture(color, belt, rnd) {
  const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
  fabric(g, W, H, color, 0.08, rnd);
  const y0 = (1 - vOf(1.0)) * H, y1 = (1 - vOf(0.7)) * H;
  if (belt) {
    g.fillStyle = '#2a2018'; g.fillRect(0, y0, W, y1 - y0);
    g.fillStyle = '#c4b27a'; g.fillRect(58, y0 - 1, 12, y1 - y0 + 2); g.fillStyle = '#2a2018'; g.fillRect(62, y0 + 3, 4, y1 - y0 - 6);
    for (let x = 0; x < W; x += 12) line(g, x, y0 + 2, x, y0 + 2, '#000');
    for (let i = 0; i < 10; i++) { g.fillStyle = '#2a2018'; g.fillRect(i * 13, y0 - 3, 4, 4); }
  } else { line(g, 0, y1, W, y1, 'rgba(0,0,0,0.3)', 2); }
  line(g, 64, y1, 64, H, 'rgba(0,0,0,0.3)', 2); // fly
  line(g, 1, 0, 1, H, 'rgba(0,0,0,0.3)', 2);
  return texOf(c);
}

function shoeTexture(color, rnd) {
  const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
  fabric(g, W, H, color, 0.05, rnd);
  const lace = new THREE.Color(color).getHSL({}).l > 0.6 ? '#8a8576' : '#e6e3da';
  // laces across the top (u = 0.5 is the top after rotation), tongue + eyelets
  g.fillStyle = css(shade(color, 0.85)); g.fillRect(48, 20, 32, 84);
  for (let i = 0; i < 6; i++) { const y = 28 + i * 11; line(g, 48, y, 80, y + 5, lace, 3); line(g, 80, y, 48, y + 5, lace, 3); }
  line(g, 0, 118, W, 118, 'rgba(0,0,0,0.25)', 2);
  return texOf(c);
}

// ---------- cosmetics ----------
function cosmetics(kind, rnd, accent) {
  const lits = [];
  const hc = HEAD_C;
  if (kind === 'sunglasses') {
    const gl = [];
    for (const s of [-1, 1]) {
      const l = ell(0.046, 0.03, 0.007, s * 0.056, 0.006 + hc, -0.159, 16); l.rotateY(0); 
      l.translate(-s * 0.056, -(0.006 + hc), 0.159); l.rotateY(-s * 0.38); l.translate(s * 0.056, 0.006 + hc, -0.159);
      gl.push(l);
    }
    gl.push(bar([-0.016, hc + 0.012, -0.166], [0.016, hc + 0.012, -0.166], 0.006));
    for (const s of [-1, 1]) gl.push(bar([s * 0.09, hc + 0.008, -0.14], [s * 0.153, hc + 0.008, -0.01], 0.007));
    return [{ geo: mergeGeometries(gl), mat: new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.18, metalness: 0.2 }) }];
  }
  if (kind === 'beanie') {
    const col = new THREE.Color(accent);
    const dome = new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(0.168, 0.15, 0.178); dome.translate(0, hc + 0.1, 0.005);
    const cuff = new THREE.TorusGeometry(1, 0.13, 10, 36); cuff.rotateX(Math.PI / 2); cuff.scale(0.165, 1, 0.175); cuff.scale(1, 0.18, 1); cuff.translate(0, hc + 0.1, 0.005);
    const pom = ell(0.03, 0.03, 0.03, 0, hc + 0.25, 0.005, 12);
    const m = new THREE.MeshStandardMaterial({ color: col, map: knitTexture(), roughness: 1 });
    return [{ geo: mergeGeometries([dome, cuff, pom]), mat: m }];
  }
  if (kind === 'cap') {
    const col = new THREE.Color(accent);
    const dome = new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(0.162, 0.14, 0.172); dome.translate(0, hc + 0.1, 0.005);
    const brim = ell(0.11, 0.008, 0.095, 0, hc + 0.105, -0.17, 18); brim.rotateX(0.0);
    const btn = ell(0.012, 0.01, 0.012, 0, hc + 0.24, 0.005, 8);
    return [{ geo: mergeGeometries([dome, brim, btn]), mat: new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }) }];
  }
  if (kind === 'hardhat') {
    const dome = new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(0.175, 0.145, 0.19); dome.translate(0, hc + 0.095, 0.005);
    const rim = ell(0.2, 0.012, 0.215, 0, hc + 0.095, -0.005, 24);
    const ridge = ell(0.02, 0.012, 0.11, 0, hc + 0.237, 0.005, 12);
    return [{ geo: mergeGeometries([dome, rim, ridge]), mat: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.45 }) }];
  }
  if (kind === 'headphones') {
    const band = new THREE.TorusGeometry(0.175, 0.011, 8, 28, Math.PI); band.translate(0, hc, 0.0);
    const parts = [band];
    for (const s of [-1, 1]) { const cup = new THREE.CylinderGeometry(0.048, 0.048, 0.035, 18); cup.rotateZ(Math.PI / 2); cup.translate(s * 0.165, hc - 0.01, 0.005); parts.push(cup); }
    return [{ geo: mergeGeometries(parts), mat: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.5, metalness: 0.15 }) }];
  }
  return lits;
}

const cache = new Map();
function look(color, seed) {
  const key = `${color}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rnd = rng(seed * 977 + 13);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const skin = pick(SKINS), eye = pick(EYES), shirt = pick(SHIRTS), shoe = pick(SHOES);
  const variant = VARIANTS[seed % VARIANTS.length];
  const main = new THREE.Color(color);
  const trouser = variant === 'overalls' ? shade(main, 0.9) : pick(TROUSERS);
  const roll = rnd();
  const hat = roll < 0.28 ? 'none' : pick(['beanie', 'cap', 'hardhat', 'headphones', 'beanie', 'cap']);
  const glasses = rnd() < 0.55;
  const accent = mixc(main, 0x222222, 0.35).offsetHSL(0.5 * 0, 0, 0);
  const sleeveCol = (variant === 'vest' || variant === 'overalls') ? new THREE.Color(shirt) : main;
  const std = (map, r = 0.9) => new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: r, metalness: 0 });
  const L = {
    variant, hat, glasses,
    skin: new THREE.MeshStandardMaterial({ color: skin, roughness: 0.72 }),
    face: std(faceTexture(skin, pick(EYES) || eye, rnd), 0.7),
    torso: std(torsoTexture(variant, main, shirt, trouser, rnd)),
    pelvis: std(pelvisTexture(trouser, variant !== 'overalls', rnd)),
    uarm: std(sleeveTexture(sleeveCol, false, rnd, true)),
    larm: std(sleeveTexture(sleeveCol, true, rnd)),
    thigh: std(trouserTexture(trouser, 'thigh', rnd)),
    shin: std(trouserTexture(trouser, 'shin', rnd)),
    shoe: std(shoeTexture(shoe, rnd), 0.7),
    sole: new THREE.MeshStandardMaterial({ color: shoe === 0xb9b5a8 || shoe === 0x9c9686 ? 0xc8c6bc : 0x151515, roughness: 0.9 }),
  };
  L.cosm = [];
  if (hat !== 'none') L.cosm.push(...cosmetics(hat, rnd, accent));
  if (glasses && hat !== 'headphones' || (glasses && hat === 'headphones')) L.cosm.push(...cosmetics('sunglasses', rnd, accent));
  cache.set(key, L);
  return L;
}

// ---------- character ----------
export class CharacterModel {
  constructor(color, seed = 0) {
    const g = geos(), L = look(color, seed);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const pivot = (x, y, z, parent) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };

    this.hips = pivot(0, HIP_Y, 0, this.body);
    mesh(g.pelvis, L.pelvis, this.hips);
    this.spine = pivot(0, 0.05, 0, this.hips);
    mesh(g.torso, L.torso, this.spine);
    this.neck = pivot(0, 0.49, 0, this.spine);
    mesh(g.neck, L.skin, this.neck);
    this.head = pivot(0, 0.04, 0, this.neck);
    mesh(g.head, L.face, this.head, 0, HEAD_C, 0).rotation.y = 0; // sphere u=0.75 faces -Z
    mesh(g.features, L.skin, this.head, 0, HEAD_C, 0);
    for (const c of L.cosm) mesh(c.geo, c.mat, this.head);

    const arm = (s, geoLower) => {
      const upper = pivot(s * 0.225, 0.41, 0, this.spine);
      mesh(g.uarm, L.uarm, upper);
      const lower = pivot(0, -UARM, 0, upper);
      mesh(geoLower, [L.larm, L.skin], lower);
      return { upper, lower };
    };
    this.armL = arm(-1, g.lowerL);
    this.armR = arm(1, g.lowerR);
    const leg = (s) => {
      const upper = pivot(s * 0.085, -0.05, 0, this.hips);
      mesh(g.thigh, L.thigh, upper);
      const lower = pivot(0, -THIGH, 0, upper);
      mesh(g.shin, [L.shin, L.shoe, L.sole], lower);
      return { upper, lower };
    };
    this.legL = leg(-1);
    this.legR = leg(1);
    this.handR = pivot(0, -LARM + 0.0, -0.02, this.armR.lower);
    this.handL = pivot(0, -LARM + 0.0, -0.02, this.armL.lower);
    this.weaponR = null; this.weaponL = null; this.idR = null; this.idL = null;
    this.phase = Math.random() * 6;
    this.deadT = 0;
    this.fallDir = { x: 0, z: 1 };
  }

  setWeapons(f) {
    const r = f.hands.R ? f.hands.R.id : null, l = f.hands.L ? f.hands.L.id : null;
    const swap = (side, id, hand) => {
      if (this['weapon' + side]) hand.remove(this['weapon' + side]);
      const w = id ? buildWeaponModel(id) : null;
      if (w) { w.rotation.x = -Math.PI / 2; w.scale.setScalar(1.2); hand.add(w); }
      this['weapon' + side] = w; this['id' + side] = id;
    };
    if (r !== this.idR) swap('R', r, this.handR);
    if (l !== this.idL) swap('L', l, this.handL);
  }

  update(dt, f) {
    const k = Math.min(1, dt * 14);
    const L = (o, prop, v, kk = k) => { o[prop] += (v - o[prop]) * kk; };
    this.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    this.setWeapons(f);

    if (!f.alive) {
      // topple in the direction of the killing blow
      this.deadT += dt;
      const t = Math.min(1, this.deadT * 2.6);
      const e = t * t;
      this.body.rotation.x = e * (Math.PI / 2) * 0.96;
      this.body.position.y = 0.05 * e;
      L(this.armL.upper.rotation, 'x', -2.4, dt * 5); L(this.armR.upper.rotation, 'x', -2.0, dt * 5);
      L(this.armL.upper.rotation, 'z', 0.6, dt * 5); L(this.armR.upper.rotation, 'z', -0.5, dt * 5);
      L(this.legL.lower.rotation, 'x', 0.4, dt * 5); L(this.head.rotation, 'x', -0.4, dt * 5);
      this.root.visible = this.deadT < 6;
      return;
    }
    this.deadT = 0;
    this.root.visible = true;
    this.body.position.y = 0;

    const hs = f.horizSpeed;
    let face = f.yaw;
    if (f.state === 'slide' && hs > 0.5) face = Math.atan2(-f.vel.x, -f.vel.z);
    let dy = face - this.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.root.rotation.y += dy * Math.min(1, dt * 12);

    // pose targets
    const P = { bodyX: 0, bodyZ: 0, hipsY: HIP_Y, spineX: 0, headX: Math.max(-0.7, Math.min(0.7, f.pitch)) * 0.7,
      lu: 0, ll: 0, ru: 0, rl: 0, aLu: 0, aLl: -0.3, aLz: 0.1, aRu: 0.05, aRl: -0.2, aRz: 0 };
    const armed = !!(f.hands.R);
    const twoH = armed && f.hands.R.def.hands === 2;

    if (f.state === 'slide') {
      // lean back, lead leg straight out, trailing knee bent, hand dragging on the floor
      P.hipsY = 0.4; P.bodyX = 0; P.spineX = 0.55; P.headX = -0.35 + f.pitch * 0.5;
      P.lu = -1.45; P.ll = 0.05; P.ru = -0.55; P.rl = 1.6;
      P.aLu = 0.6; P.aLl = -0.2; P.aLz = 0.9;
      P.bodyZ = Math.sin(f.stateT * 40) * 0.015;
    } else if (f.state === 'wallrun') {
      // body tilts off the wall, legs keep running on it
      this.phase += dt * 14;
      const s = Math.sin(this.phase);
      const side = Math.sign(f.wallNormal.x * Math.cos(this.root.rotation.y) - f.wallNormal.z * Math.sin(this.root.rotation.y)) || 1;
      P.bodyZ = 0.45 * side; P.spineX = -0.25;
      P.lu = -0.9 + s * 0.8; P.ll = 0.9 + Math.max(0, -s); P.ru = -0.9 - s * 0.8; P.rl = 0.9 + Math.max(0, s);
      P.aLu = -0.6; P.aLz = 1.1 * side;
    } else if (f.state === 'mantle') {
      P.aLu = -2.9; P.aRu = -2.9; P.aLl = -0.6; P.aRl = -0.6; P.lu = -1.4; P.ll = 1.6; P.ru = -0.4; P.rl = 0.6; P.spineX = -0.4;
    } else if (f.wallKick > 0) {
      const t = Math.sin((1 - f.wallKick / 0.35) * Math.PI);
      P.lu = -1.6 * t; P.ll = 0.1; P.ru = 0.5 * t; P.rl = 1.2 * t; P.spineX = -0.3 * t; P.aLu = -1.8 * t; P.aLz = 0.8 * t;
    } else if (!f.onGround) {
      P.lu = -0.9; P.ll = 1.3; P.ru = -0.25; P.rl = 0.7; P.aLu = -0.8; P.aLz = 0.5; P.spineX = -0.1;
    } else if (f.crouching) {
      this.phase += hs * dt * 2.2;
      const s = Math.sin(this.phase) * Math.min(1, hs / 2.5);
      P.hipsY = 0.56; P.spineX = -0.35;
      P.lu = -1.3 + s * 0.4; P.ll = 1.8 - s * 0.3; P.ru = -1.3 - s * 0.4; P.rl = 1.8 + s * 0.3;
    } else {
      this.phase += hs * dt * (f.sprinting ? 1.55 : 1.9);
      const a = Math.min(1, hs / 7.4);
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      P.lu = s * 0.95 * a; P.ru = -s * 0.95 * a;
      P.ll = Math.max(0, -c) * 1.4 * a + 0.05; P.rl = Math.max(0, c) * 1.4 * a + 0.05;
      P.aLu = -s * 0.8 * a; P.aLl = -0.4 - 0.5 * a; P.aRu = s * 0.8 * a; P.aRl = -0.4 - 0.5 * a;
      P.spineX = -0.22 * a * (f.sprinting ? 1.4 : 1);
      P.hipsY = HIP_Y - Math.abs(c) * 0.06 * a;
    }
    // weapon arms
    if (armed && f.state !== 'mantle') {
      P.aRu = -1.35 - f.pitch * 0.9; P.aRl = -0.15; P.aRz = 0.05;
      if (twoH) { P.aLu = -1.2 - f.pitch * 0.9; P.aLl = -0.7; P.aLz = -0.55; }
      if (f.hands.L) { P.aLu = -1.35 - f.pitch * 0.9; P.aLl = -0.15; P.aLz = -0.05; }
    }

    L(this.body.rotation, 'x', P.bodyX); L(this.body.rotation, 'z', P.bodyZ + f.lean * 0.3);
    L(this.hips.position, 'y', P.hipsY);
    L(this.spine.rotation, 'x', P.spineX);
    L(this.head.rotation, 'x', P.headX);
    L(this.legL.upper.rotation, 'x', -P.lu); L(this.legL.lower.rotation, 'x', -P.ll);
    L(this.legR.upper.rotation, 'x', -P.ru); L(this.legR.lower.rotation, 'x', -P.rl);
    L(this.armL.upper.rotation, 'x', -P.aLu); L(this.armL.lower.rotation, 'x', -P.aLl); L(this.armL.upper.rotation, 'z', -P.aLz);
    L(this.armR.upper.rotation, 'x', -P.aRu); L(this.armR.lower.rotation, 'x', -P.aRl); L(this.armR.upper.rotation, 'z', P.aRz);
  }
}
