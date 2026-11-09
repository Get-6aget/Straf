import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { World } from './physics.js';
import { pbr, textureSet } from './assets.js';
import { LIGHTING } from './maps.js';

// Metres per texture repeat, chosen so bricks/blocks/planks read at real-world size.
const TILE = {
  concrete: 3, floor: 3, moss: 2.5, cracked: 3, rust: 2, brick: 2.4, grass: 4, tiles: 1.5, wood: 2, paint: 2,
  blocks: 3, stone: 4.2, corr: 2.2, slab: 4, panels: 4, plaster: 3, plate: 1.5, gtiles: 3,
  iron: 1.2, woodDark: 1.6, corrRoof: 2.2, roof: 2.2,
};

// Mean sRGB albedo of each photo set (measured), used to pull every surface toward
// one muted olive-grey palette so mixed sources don't clash (bright orange stone, black floors).
const MEAN = {
  concrete: [141, 133, 112], floor: [86, 86, 84], cracked: [187, 174, 155], blocks: [146, 133, 104], stone: [172, 135, 106],
  slab: [170, 163, 155], panels: [151, 131, 111], plaster: [142, 129, 108], gtiles: [132, 126, 115], brick: [68, 53, 47], tiles: [68, 34, 16],
};
const normCache = new Map();
function normalized(key, target) {
  const k = key + target;
  if (normCache.has(k)) return normCache.get(k);
  const m = pbr(key, { tint: 0xffffff }).clone();
  const mean = MEAN[key];
  const lin = (v) => Math.pow(v / 255, 2.2);
  m.color.setRGB(...[0, 1, 2].map((i) => Math.min(3, lin(target[i]) / lin(mean[i]))));
  normCache.set(k, m);
  return m;
}
const WALL = [128, 130, 118], GROUND = [112, 114, 104], WARM = [134, 128, 112];

// Material slots used by maps/kit. Each resolves to a cached photo-textured material.
function matFor(key) {
  switch (key) {
    case 'concrete': return normalized('concrete', WALL);
    case 'floor': return normalized('floor', [98, 100, 92]);
    case 'moss': return pbr('moss', { tint: 0xb8c0a8 });
    case 'cracked': return normalized('cracked', GROUND);
    case 'brick': return normalized('brick', [120, 100, 88]);
    case 'grass': return pbr('grass', { tint: 0x9aa284 });
    case 'tiles': return normalized('tiles', [120, 112, 100]);
    case 'blocks': return normalized('blocks', WARM);
    case 'stone': return normalized('stone', [120, 120, 106]);
    case 'slab': return normalized('slab', WALL);
    case 'panels': return normalized('panels', [124, 124, 114]);
    case 'plaster': return normalized('plaster', [146, 146, 132]);
    case 'gtiles': return normalized('gtiles', GROUND);
    case 'plate': return pbr('plate', { tint: 0x9a968e });
    case 'corr': return pbr('corr', { tint: 0xb8a898 });
    case 'corrRoof': case 'roof': return pbr('corr', { tint: 0x9c8878 });
    case 'rust': return pbr('rust', { tint: 0xc0b0a0 });
    case 'iron': return pbr('rust', { tint: 0x6a605a, metal: 0.45 });
    case 'paint': return pbr('paint', { tint: 0xffffff });
    case 'wood': return pbr('wood', { tint: 0xc09a72 });
    case 'woodDark': return pbr('wood', { tint: 0x6e5a46 });
    case 'dark': return darkMat ||= new THREE.MeshStandardMaterial({ color: 0x0d0e0b, roughness: 1 });
    case 'cable': return cableMat ||= new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
    default: return pbr(key);
  }
}
let darkMat = null, cableMat = null;

// Box-projected UVs in world space keep texel density constant across all solids.
function worldUV(geo, tile) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
    else if (ax >= az) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
}

// Cylindrical UVs around (cx, cz) for towers and drums; caps fall back to planar.
function cylUV(geo, tile, cx, cz) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i += 3) {
    // per-triangle so the atan2 seam doesn't smear across one face
    const angs = [0, 1, 2].map((k) => Math.atan2(pos.getZ(i + k) - cz, pos.getX(i + k) - cx));
    if (Math.max(...angs) - Math.min(...angs) > Math.PI) for (let k = 0; k < 3; k++) if (angs[k] < 0) angs[k] += Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const j = i + k, x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
      if (Math.abs(nor.getY(j)) > 0.7) { uv.setXY(j, x / tile, z / tile); continue; }
      const r = Math.hypot(x - cx, z - cz);
      uv.setXY(j, (angs[k] * r) / tile, y / tile);
    }
  }
  uv.needsUpdate = true;
}

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
  return geo.toNonIndexed();
}

const cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
const rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.1);

function addMesh(group, geo, mat, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}

function buildDecor(group, d) {
  const rust = matFor('rust');
  switch (d.t) {
    case 'barrel': {
      const paint = pbr('paint', { tint: [0x7a8a6a, 0xb06a4a, 0x6a7a8a][Math.floor(d.rot) % 3] });
      addMesh(group, cyl, paint, 0.3, 0.88, 0.3, d.x, d.y + 0.44, d.z, d.rot);
      for (const hy of [0.02, 0.3, 0.6, 0.87]) addMesh(group, cyl, rust, 0.312, 0.035, 0.312, d.x, d.y + hy, d.z);
      addMesh(group, cyl, matFor('iron'), 0.04, 0.03, 0.04, d.x + 0.15, d.y + 0.89, d.z + 0.08);
      break;
    }
    case 'lamp': {
      const dark = matFor('iron');
      const h = d.h;
      addMesh(group, cyl, dark, 0.11, 0.5, 0.11, d.x, d.y + 0.25, d.z);
      addMesh(group, cyl, dark, 0.06, h, 0.05, d.x, d.y + h / 2, d.z);
      addMesh(group, cyl, dark, 0.035, 1.2, 0.035, d.x, d.y + h - 0.1, d.z - 0.55, 0, Math.PI / 2 - 0.15);
      addMesh(group, rbox, dark, 0.34, 0.14, 0.55, d.x, d.y + h - 0.05, d.z - 1.1);
      const bulb = new THREE.Mesh(rbox, new THREE.MeshBasicMaterial({ color: 0xfff1cc }));
      bulb.scale.set(0.26, 0.04, 0.42); bulb.position.set(d.x, d.y + h - 0.13, d.z - 1.1);
      group.add(bulb);
      break;
    }
    case 'bulb': {
      const dark = matFor('iron');
      addMesh(group, cyl, dark, 0.02, 0.3, 0.02, d.x, d.y + 0.15, d.z);
      addMesh(group, cyl, dark, 0.16, 0.08, 0.16, d.x, d.y, d.z);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
      b.position.set(d.x, d.y - 0.07, d.z); group.add(b);
      break;
    }
    case 'statue': {
      // stylised bald figure, same silhouette family as the player characters
      const m = matFor('plaster');
      const g = new THREE.Group();
      const sph = new THREE.SphereGeometry(1, 20, 14);
      const cap = new THREE.CapsuleGeometry(1, 1, 6, 14);
      addMesh(g, sph, m, 0.2, 0.23, 0.21, 0, 1.62, 0);
      addMesh(g, cyl, m, 0.06, 0.12, 0.06, 0, 1.4, 0);
      addMesh(g, cap, m, 0.19, 0.2, 0.13, 0, 1.12, 0);
      addMesh(g, cap, m, 0.17, 0.08, 0.12, 0, 0.84, 0);
      for (const s of [-1, 1]) {
        addMesh(g, cap, m, 0.06, 0.22, 0.06, s * 0.26, 1.08, 0, 0, 0, s * 0.12);
        addMesh(g, cap, m, 0.05, 0.2, 0.05, s * 0.3, 0.75, -0.04, 0, 0.15, 0);
        addMesh(g, cap, m, 0.08, 0.3, 0.08, s * 0.1, 0.52, 0);
        addMesh(g, cap, m, 0.065, 0.28, 0.065, s * 0.1, 0.18, s > 0 ? 0.05 : -0.02);
      }
      g.position.set(d.x, d.y, d.z); g.rotation.y = d.rot;
      group.add(g);
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
  // faint light column the floating weapon hangs in
  const beamGeo = new THREE.CylinderGeometry(0.3, 0.44, 1.9, 24, 1, true);
  beamGeo.translate(0, 0.95, 0);
  const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(0x6aff5a) }, on: { value: 1 } },
    vertexShader: 'varying float vY; void main(){ vY = position.y / 1.9; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float on; varying float vY; void main(){ gl_FragColor = vec4(color * pow(1.0 - vY, 2.2) * 0.32 * on, 1.0); }',
  }));
  g.add(base, ring, disc, beam);
  g.userData.ring = ring;
  g.userData.beam = beam;
  return g;
}

export function buildMapScene(def, data, quality, sky) {
  const L = LIGHTING[def.light] || LIGHTING.overcast;
  const group = new THREE.Group();
  const world = new World();
  world.killY = def.killY ?? -25;
  const byMat = {};
  const push = (mat, geo) => (byMat[mat] ||= []).push(geo);
  for (const b of data.solids) {
    const wb = world.add(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, b.type, b.ramp || null);
    if (b.mat === 'none') continue;
    const geo = solidGeometry(wb, world);
    worldUV(geo, TILE[b.mat] || 3);
    push(b.mat, geo);
  }
  for (const e of data.geos) {
    if (e.uv === 'cyl') cylUV(e.geo, TILE[e.mat] || 3, e.cx, e.cz);
    else worldUV(e.geo, TILE[e.mat] || 3);
    push(e.mat, e.geo);
  }
  for (const [m, geos] of Object.entries(byMat)) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) { console.warn('merge failed', m); continue; }
    const mesh = new THREE.Mesh(merged, matFor(m));
    mesh.castShadow = quality > 0 && m !== 'dark';
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
    s.mapSize.set(2048, 2048);
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
