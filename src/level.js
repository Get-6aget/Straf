import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World } from './physics.js';

// Map registry. Geometry, colliders and baked lighting come from
// tools/blender/map_<id>.py → public/assets/maps/<id>.{glb,json,_lm.png}.
export const MAPS = [
  {
    id: 'vodokachka', name: { ru: 'Водокачка', en: 'Water Tower' }, light: 'overcast',
    weapons: ['kochegar', 'shilo', 'strizh', 'pompa', 'zhuravl', 'tesak', 'limonka', 'baraban', 'hlopushka', 'otboinik', 'klinok'],
  },
];

// Runtime look per lighting preset: fog, grade, and lights for dynamic objects
// (characters, weapons) so they sit in the baked environment.
export const LIGHTING = {
  overcast: {
    fog: 0x8d9a86, fogDensity: 0.017, bgIntensity: 0.85, envIntensity: 0.55,
    sun: 1.6, sunColor: 0xf2eedc, hemiSky: 0xcfd8c4, hemiGround: 0x4a4c40, hemi: 0.9,
    grade: [0.93, 1.0, 0.9], sat: 0.8,
  },
};

const BASE = import.meta.env.BASE_URL + 'assets/';
const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
const levelCache = new Map();

function albedo(texId, aniso) {
  if (texCache.has(texId)) return texCache.get(texId);
  const t = texLoader.load(`${BASE}tex/${texId}_diff.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = aniso;
  texCache.set(texId, t);
  return t;
}

async function lightmap(url) {
  const t = await texLoader.loadAsync(url);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.channel = 1;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const TINTS = {
  pavers: [0.82, 0.85, 0.78], tiles: [0.95, 0.97, 0.92], wall: [0.84, 0.88, 0.8], wall2: [0.82, 0.86, 0.78], trim: [0.85, 0.87, 0.82],
  stone: [0.95, 0.97, 0.9], cast: [0.95, 0.97, 0.92], plaster: [0.92, 0.95, 0.88], corr: [0.62, 0.6, 0.56], wood: [0.92, 0.9, 0.84],
  crate: [0.9, 0.86, 0.78], plate: [0.9, 0.9, 0.86], rust: [0.85, 0.85, 0.82], pipe: [0.8, 0.8, 0.76], worn: [0.9, 0.92, 0.86],
  moss: [0.95, 0.98, 0.9], dark: [0.035, 0.038, 0.036], lamp: [1, 0.92, 0.75],
};

export async function loadLevel(def, renderer) {
  if (levelCache.has(def.id)) return levelCache.get(def.id);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const [gltf, meta, lmLevel, lmBg] = await Promise.all([
    gltfLoader.loadAsync(`${BASE}maps/${def.id}.glb`),
    fetch(`${BASE}maps/${def.id}.json`).then((r) => r.json()),
    lightmap(`${BASE}maps/${def.id}_lm.png`),
    lightmap(`${BASE}maps/${def.id}_bg_lm.png`).catch(() => null),
  ]);
  // baked values were stored as (linear * lmScale); MeshBasic divides by π
  const lmIntensity = Math.PI / (meta.lmScale || 1);
  const mats = new Map();
  const material = (key, lm) => {
    const k = key + (lm === lmBg ? ':bg' : '');
    if (mats.has(k)) return mats.get(k);
    const entry = meta.materials[key];
    const texId = Array.isArray(entry) ? entry[0] : entry;
    const tint = (Array.isArray(entry) && entry[1]) || TINTS[key] || [1, 1, 1];
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint[0], tint[1], tint[2]),
      map: texId ? albedo(texId, aniso) : null,
      lightMap: key === 'lamp' ? null : lm,
      lightMapIntensity: lmIntensity,
    });
    if (key === 'lamp') m.color.setRGB(2.2, 1.9, 1.4);
    mats.set(k, m);
    return m;
  };
  const group = gltf.scene;
  group.traverse((o) => {
    if (!o.isMesh) return;
    let p = o, bg = false;
    while (p) { if (p.name === 'background') bg = true; p = p.parent; }
    o.material = material(o.material.name, bg ? (lmBg || lmLevel) : lmLevel);
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });

  const world = new World();
  world.killY = meta.killY ?? -25;
  for (const c of meta.colliders) {
    if (c.t === 'cyl') world.addCyl(c.x, c.z, c.r, c.y0, c.y1);
    else if (c.t === 'ramp') world.add(c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2], 'solid', { axis: c.axis, dir: c.dir });
    else world.add(c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2], c.kind || 'solid');
  }
  const pt = (a) => ({ x: a[0], y: a[1], z: a[2] });
  const sun = new THREE.Vector3(...(meta.sun || [0.5, 0.8, 0.3])).normalize();
  const level = { def, group, world, spawns: meta.spawns.map(pt), weapons: meta.weapons.map(pt), sun };
  levelCache.set(def.id, level);
  return level;
}
