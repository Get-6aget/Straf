import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr } from './assets.js';

// Shared material codes for weapons (all photo-textured, matte, no plastic sheen).
const mats = new Map();
export function gunMat(code, paint = 0x777777) {
  const k = code + '|' + paint;
  if (mats.has(k)) return mats.get(k);
  let m;
  switch (code) {
    case 'rust': m = pbr('rust', { tint: 0xb8a595, rough: 0.85, metal: 0.4 }); break;
    case 'dark': m = pbr('rust', { tint: 0x817a72, rough: 0.8, metal: 0.3 }); break;
    case 'steel': m = pbr('rust', { tint: 0xb4aea6, rough: 0.55, metal: 0.8, normal: 0.5 }); break;
    case 'paint': m = pbr('paint', { tint: new THREE.Color(paint).multiplyScalar(2.2).getHex(), rough: 0.9, metal: 0.15 }); break;
    case 'wood': m = pbr('wood', { tint: 0x7d5538, rough: 0.9, metal: 0 }); break;
    case 'grip': m = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95, metalness: 0 }); break;
    case 'brass': m = new THREE.MeshStandardMaterial({ color: 0x9a7a38, roughness: 0.55, metalness: 0.8 }); break;
    case 'cord': m = new THREE.MeshStandardMaterial({ color: 0x3b2f27, roughness: 1, metalness: 0 }); break;
    default: m = pbr('rust');
  }
  mats.set(k, m);
  return m;
}

// Per-triangle box projection so photo textures keep a fixed real-world scale (~0.3 m per tile).
function boxUV(g, scale = 1 / 0.3) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.crossVectors(b.sub(a), c.sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
      let u, v;
      if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
      uv[(i + j) * 2] = u * scale; uv[(i + j) * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Closed outline with optionally rounded corners ([u, y, radius?]).
function trace(path, pts, rDef) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const r = p[2] ?? rDef;
    if (r <= 0) { i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1]); continue; }
    const d1 = Math.hypot(a[0] - p[0], a[1] - p[1]), d2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const x1 = p[0] + (a[0] - p[0]) / d1 * rr, y1 = p[1] + (a[1] - p[1]) / d1 * rr;
    const x2 = p[0] + (b[0] - p[0]) / d2 * rr, y2 = p[1] + (b[1] - p[1]) / d2 * rr;
    i ? path.lineTo(x1, y1) : path.moveTo(x1, y1);
    path.quadraticCurveTo(p[0], p[1], x2, y2);
  }
  path.closePath();
}

// Collects geometry per material and emits one merged mesh per material.
export class Parts {
  constructor(paint) { this.paint = paint; this.b = new Map(); }

  put(code, geo) {
    if (!this.b.has(code)) this.b.set(code, []);
    this.b.get(code).push(boxUV(geo, code === 'wood' ? 1 / 0.75 : 1 / 0.3));
    return this;
  }

  // Side-profile slab: pts are [u (toward the muzzle), y, cornerRadius?], width is across X.
  side(code, pts, width, { x = 0, bevel = 0.002, r = 0.004, holes = [], bulge = 0 } = {}) {
    const sh = new THREE.Shape();
    trace(sh, pts, r);
    for (const h of holes) { const hp = new THREE.Path(); trace(hp, h, 0.004); sh.holes.push(hp); }
    const depth = Math.max(0.001, width - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 5 });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, 0);
    return this.put(code, g);
  }

  box(code, w, h, l, x, y, z, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, l);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return this.put(code, g);
  }

  // Cylinder along Z: rf at the front (-Z) end, rb at the back.
  cyl(code, rf, rb, len, x, y, zc, seg = 14) {
    const g = new THREE.CylinderGeometry(rb, rf, len, seg).rotateX(Math.PI / 2);
    g.translate(x, y, zc);
    return this.put(code, g);
  }

  // Cylinder along X (screws, pins, drum).
  cylX(code, r, len, x, y, z, seg = 12) {
    const g = new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return this.put(code, g);
  }

  // Cylinder along Y.
  cylY(code, r, len, x, y, z, seg = 12, rTop = r) {
    const g = new THREE.CylinderGeometry(rTop, r, len, seg);
    g.translate(x, y, z);
    return this.put(code, g);
  }

  // Revolved profile along Z: pts are [radius, u] with u growing toward the muzzle.
  lathe(code, pts, x, y, seg = 16) {
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg).rotateX(-Math.PI / 2);
    g.translate(x, y, 0);
    return this.put(code, g);
  }

  sphere(code, r, x, y, z, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, 14, 10);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return this.put(code, g);
  }

  torus(code, R, r, x, y, z, rx = 0, ry = 0) {
    const g = new THREE.TorusGeometry(R, r, 8, 18);
    g.rotateX(rx); g.rotateY(ry);
    g.translate(x, y, z);
    return this.put(code, g);
  }

  build() {
    const grp = new THREE.Group();
    for (const [code, list] of this.b) {
      const mesh = new THREE.Mesh(mergeGeometries(list), gunMat(code, this.paint));
      mesh.castShadow = true;
      grp.add(mesh);
    }
    return grp;
  }
}

// ---------- first-person glove hands ----------
// Built for a right hand; the viewmodel mirrors it for the left.
const GLOVE = 0xa3ab6a;
export const gloveMat = new THREE.MeshStandardMaterial({ color: GLOVE, roughness: 0.75, metalness: 0 });

function tube(pts, r) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
  const g = new THREE.TubeGeometry(curve, 12, r, 8, false);
  const e = curve.getPoint(1);
  const s = new THREE.SphereGeometry(r, 8, 6).translate(e.x, e.y, e.z);
  const s0 = curve.getPoint(0);
  const s2 = new THREE.SphereGeometry(r, 8, 6).translate(s0.x, s0.y, s0.z);
  return [g, s, s2];
}

function ellipsoid(cx, cy, cz, rx, ry, rz) {
  return new THREE.SphereGeometry(1, 14, 10).scale(rx, ry, rz).translate(cx, cy, cz);
}

// pose: 'grip' wraps a vertical grip (origin at its centre), 'under' cups a fore-end from below.
export function buildGlove(pose) {
  const parts = [];
  if (pose === 'under') {
    parts.push(ellipsoid(0.034, -0.038, 0.0, 0.024, 0.02, 0.05));
    for (const z of [-0.037, -0.0125, 0.0125, 0.037]) {
      parts.push(...tube([[0.034, -0.04, z], [0.005, -0.046, z], [-0.026, -0.04, z], [-0.04, -0.015, z], [-0.036, 0.012, z], [-0.02, 0.03, z - 0.003]], 0.0108));
    }
    parts.push(...tube([[0.04, -0.03, 0.045], [0.046, -0.01, 0.025], [0.042, 0.012, -0.01], [0.036, 0.024, -0.045], [0.03, 0.028, -0.075]], 0.0135));
    parts.push(ellipsoid(0.042, -0.01, 0.048, 0.02, 0.026, 0.026));
  } else {
    parts.push(ellipsoid(0.034, -0.035, 0.016, 0.017, 0.05, 0.036));
    for (const y of [0.0, -0.0245, -0.049, -0.0725]) {
      parts.push(...tube([[0.032, y, 0.02], [0.033, y, -0.008], [0.025, y, -0.028], [0.003, y, -0.035], [-0.018, y, -0.029], [-0.024, y, -0.016]], 0.0106));
    }
    parts.push(...tube([[0.03, 0.02, 0.03], [0.004, 0.03, 0.033], [-0.026, 0.034, 0.016], [-0.03, 0.035, -0.016], [-0.028, 0.04, -0.045]], 0.0122));
    parts.push(ellipsoid(0.034, -0.008, 0.04, 0.018, 0.03, 0.026));
  }
  const g = mergeGeometries(parts);
  return g;
}

// Forearm along +Z from the wrist: glove cuff, then a cream sleeve running off-screen.
export function buildArm(sleeveMat, len = 0.7) {
  const grp = new THREE.Group();
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.07, 14).rotateX(Math.PI / 2).translate(0, 0, 0.025), gloveMat);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, len, 18, 1, false).rotateX(Math.PI / 2).translate(0, 0, 0.06 + len / 2), sleeveMat);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.009, 8, 20).translate(0, 0, 0.065), sleeveMat);
  grp.add(cuff, sleeve, band);
  return grp;
}
