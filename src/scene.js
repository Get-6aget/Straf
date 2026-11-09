import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { World } from './physics.js';
import { pbr, textureSet } from './assets.js';
import { LIGHTING } from './maps.js';

const TILE = { concrete: 3, floor: 3, moss: 2.5, cracked: 3, rust: 2, brick: 2.4, grass: 4, tiles: 1.5, wood: 2, paint: 2 };
const MAT_OPTS = {
  concrete: { tint: 0xb4b8aa }, floor: { tint: 0x9fa295 }, moss: { tint: 0xb8c0a8 }, cracked: { tint: 0x9a9c8e },
  rust: { tint: 0xc0b0a0 }, brick: { tint: 0xffffff, metal: 0 }, grass: { tint: 0x9aa284, metal: 0 }, tiles: { tint: 0xc8c8c0 },
};

function solidGeometry(b, world) {
  const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  const pos = geo.attributes.position;
  if (b.ramp) {
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > b.minY + 1e-4) pos.setY(i, Math.max(b.minY + 0.001, world.topAt(b, pos.getX(i), pos.getZ(i))));
    }
    geo.computeVertexNormals();
  }
  worldUV(geo, TILE[b.mat] || 3);
  return geo;
}

// Box-projected UVs in world space keep texel density constant across all solids.
function worldUV(geo, tile) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
    else if (ax >= az) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
}

const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
const rbox = new RoundedBoxGeometry(1, 1, 1, 3, 0.1);

function addMesh(group, geo, mat, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}

function buildDecor(group, d) {
  const rust = pbr('rust', MAT_OPTS.rust);
  switch (d.t) {
    case 'pipe': {
      const r = d.r;
      if (d.axis === 'y') addMesh(group, cyl, rust, r, d.len, r, d.x, d.y + d.len / 2, d.z);
      else if (d.axis === 'x') addMesh(group, cyl, rust, r, d.len, r, d.x, d.y, d.z, 0, 0, Math.PI / 2);
      else addMesh(group, cyl, rust, r, d.len, r, d.x, d.y, d.z, 0, Math.PI / 2);
      // flanges
      const n = Math.floor(d.len / 4);
      for (let i = 0; i <= n; i++) {
        const t = -d.len / 2 + (i * d.len) / Math.max(1, n);
        if (d.axis === 'x') addMesh(group, cyl, rust, r * 1.35, 0.08, r * 1.35, d.x + t, d.y, d.z, 0, 0, Math.PI / 2);
        else if (d.axis === 'z') addMesh(group, cyl, rust, r * 1.35, 0.08, r * 1.35, d.x, d.y, d.z + t, 0, Math.PI / 2);
      }
      break;
    }
    case 'rail': {
      const alongX = Math.abs(d.x1 - d.x0) > Math.abs(d.z1 - d.z0);
      const len = alongX ? Math.abs(d.x1 - d.x0) : Math.abs(d.z1 - d.z0);
      const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
      for (const hy of [0.5, 1.0]) addMesh(group, cyl, rust, 0.03, len, 0.03, cx, d.y + hy, cz, 0, alongX ? 0 : Math.PI / 2, alongX ? Math.PI / 2 : 0);
      const posts = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= posts; i++) {
        const t = -len / 2 + (i * len) / posts;
        addMesh(group, cyl, rust, 0.035, 1.05, 0.035, alongX ? cx + t : cx, d.y + 0.52, alongX ? cz : cz + t);
      }
      break;
    }
    case 'barrel': {
      const paint = pbr('rust', { tint: [0x7a9a6a, 0xc06a4a, 0x6a8aa0][Math.floor(d.rot) % 3] });
      addMesh(group, cyl, paint, 0.3, 0.88, 0.3, d.x, d.y + 0.44, d.z, d.rot);
      for (const hy of [0.18, 0.7]) addMesh(group, cyl, rust, 0.31, 0.04, 0.31, d.x, d.y + hy, d.z);
      break;
    }
    case 'car': {
      const g = new THREE.Group();
      const body = new THREE.MeshStandardMaterial({ color: 0x8c9182, roughness: 0.55, metalness: 0.35, normalMap: textureSet('rust').normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
      const dark = new THREE.MeshStandardMaterial({ color: 0x1e1f1d, roughness: 0.6 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x2a3330, roughness: 0.15, metalness: 0.3 });
      addMesh(g, rbox, body, 1.8, 0.6, 4.1, 0, 0.55, 0);
      addMesh(g, rbox, body, 1.65, 0.55, 2.1, 0, 1.08, 0.2);
      addMesh(g, rbox, glass, 1.5, 0.42, 2.0, 0, 1.1, 0.2);
      for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) addMesh(g, cyl, dark, 0.32, 0.22, 0.32, x, 0.3, z, 0, 0, Math.PI / 2);
      g.position.set(d.x, -0.08, d.z); g.rotation.set(0.03, d.rot, -0.05);
      group.add(g);
      break;
    }
    case 'lamp': {
      const dark = pbr('rust', { tint: 0x7a7470 });
      addMesh(group, cyl, dark, 0.07, 4.6, 0.07, d.x, 2.3, d.z);
      addMesh(group, cyl, dark, 0.04, 1.2, 0.04, d.x, 4.5, d.z - 0.5, 0, Math.PI / 2);
      addMesh(group, rbox, dark, 0.4, 0.15, 0.6, d.x, 4.45, d.z - 1.05);
      const bulb = new THREE.Mesh(rbox, new THREE.MeshBasicMaterial({ color: 0xfff1cc }));
      bulb.scale.set(0.3, 0.05, 0.45); bulb.position.set(d.x, 4.36, d.z - 1.05);
      group.add(bulb);
      break;
    }
    default: break;
  }
}

export function buildSpawnerPad() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(cyl, pbr('rust', { tint: 0x8a8a80 }));
  base.scale.set(0.6, 0.08, 0.6); base.position.y = 0.04; base.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: 0x7dff6a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.09;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x5ee860, transparent: true, opacity: 0.25, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.085;
  g.add(base, ring, disc);
  g.userData.ring = ring;
  return g;
}

export function buildMapScene(def, data, quality, sky) {
  const L = LIGHTING[def.light] || LIGHTING.overcast;
  const group = new THREE.Group();
  const world = new World();
  world.killY = def.killY ?? -25;
  const byMat = {};
  for (const b of data.solids) {
    const wb = world.add(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, b.type, b.ramp || null);
    if (b.mat === 'none') continue;
    (byMat[b.mat] ||= []).push(solidGeometry(wb, world));
  }
  for (const [m, geos] of Object.entries(byMat)) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, pbr(m, MAT_OPTS[m] || {}));
    mesh.castShadow = quality > 0;
    mesh.receiveShadow = quality > 0;
    group.add(mesh);
  }
  for (const d of data.decor) buildDecor(group, d);

  // Overcast lighting: the HDR sky provides the soft fill, a weak diffuse key adds gentle shadows.
  const hemi = new THREE.HemisphereLight(0xdfe6d8, 0x4a4a40, L.hemi);
  group.add(hemi);
  const key = new THREE.DirectionalLight(L.sunColor, L.sun);
  const [sx, sy, sz] = L.sunDir;
  key.position.set(sx * 40, sy * 40, sz * 40);
  if (quality > 0) {
    key.castShadow = true;
    const s = key.shadow;
    s.mapSize.set(quality > 1 ? 4096 : 2048, quality > 1 ? 4096 : 2048);
    Object.assign(s.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
    s.bias = -0.0004; s.normalBias = 0.04; s.radius = 6; s.blurSamples = 16;
    s.intensity = 0.75;
  }
  group.add(key, key.target);

  return {
    group, world,
    fog: new THREE.FogExp2(L.fog, L.fogDensity),
    env: sky.env, bg: sky.bg, light: L,
  };
}
