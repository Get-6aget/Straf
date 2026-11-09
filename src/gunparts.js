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
