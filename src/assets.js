import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Photo-scanned CC0 materials (Poly Haven). Each set: diffuse, OpenGL normal, ARM (AO/rough/metal).
export const TEXTURE_SETS = {
  concrete: 'concrete_wall_008',
  floor: 'concrete_floor_worn_001',
  moss: 'concrete_moss',
  cracked: 'cracked_concrete_wall',
  rust: 'rusty_metal_02',
  paint: 'rusty_painted_metal',
  wood: 'brown_planks_05',
  brick: 'brick_wall_10',
  grass: 'aerial_grass_rock',
  tiles: 'dirty_tiles',
};

const base = import.meta.env.BASE_URL + 'assets/';
const texLoader = new THREE.TextureLoader();
const cache = new Map();
let maxAniso = 4;

export function setAnisotropy(renderer) { maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }

function load(url, srgb) {
  if (cache.has(url)) return cache.get(url);
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(url, t);
  return t;
}

export function textureSet(key) {
  const id = TEXTURE_SETS[key];
  return {
    map: load(`${base}tex/${id}_diff.jpg`, true),
    normalMap: load(`${base}tex/${id}_nor.jpg`, false),
    arm: load(`${base}tex/${id}_arm.jpg`, false),
  };
}

const matCache = new Map();
// World-space UVs are baked into geometry, so one material instance per (set, tint) is enough.
export function pbr(key, { tint = 0xffffff, rough = 1, metal = null, normal = 1 } = {}) {
  const k = `${key}|${tint}|${rough}|${metal}|${normal}`;
  if (matCache.has(k)) return matCache.get(k);
  const s = textureSet(key);
  const m = new THREE.MeshStandardMaterial({
    color: tint, map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(normal, normal),
    aoMap: s.arm, aoMapIntensity: 1, roughnessMap: s.arm, roughness: rough,
    metalnessMap: metal === null ? s.arm : null, metalness: metal === null ? 1 : metal,
  });
  matCache.set(k, m);
  return m;
}

export function preloadAll() {
  const all = [];
  for (const key of Object.keys(TEXTURE_SETS)) {
    const s = textureSet(key);
    for (const t of [s.map, s.normalMap, s.arm]) all.push(new Promise((r) => { if (t.image) r(); else { const prev = t.onUpdate; t.onUpdate = () => { prev?.(); r(); }; setTimeout(r, 8000); } }));
  }
  return Promise.all(all);
}

let envCache = null;
// Overcast sky: HDR for image-based lighting, a sharper tonemapped JPG for the backdrop.
export async function loadSky(renderer) {
  if (envCache) return envCache;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = await new HDRLoader().loadAsync(`${base}sky/kloofendal_overcast_puresky_1k.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  pmrem.dispose();
  const bg = await texLoader.loadAsync(`${base}sky/overcast_bg.jpg`);
  bg.mapping = THREE.EquirectangularReflectionMapping;
  bg.colorSpace = THREE.SRGBColorSpace;
  envCache = { env, bg };
  return envCache;
}

// Procedural fabric/knit texture for characters (no external character assets).
let knit = null;
export function knitTexture() {
  if (knit) return knit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    for (let x = 0; x < 128; x += 4) {
      const v = 150 + ((x * 7 + y * 13) % 5) * 10 + Math.random() * 40;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.ellipse(x + 2, y + 2, 1.6, 2.2, (x / 4) % 2 ? 0.5 : -0.5, 0, Math.PI * 2); g.fill();
    }
  }
  knit = new THREE.CanvasTexture(c);
  knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
  knit.repeat.set(3, 3);
  knit.colorSpace = THREE.SRGBColorSpace;
  return knit;
}

let canvasCloth = null;
export function clothTexture() {
  if (canvasCloth) return canvasCloth;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    const weave = ((x + y) % 3 === 0 ? 14 : 0) + ((x - y + 300) % 4 === 0 ? 10 : 0);
    const v = 200 + weave + Math.random() * 30 - 15;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // grime streaks
  for (let k = 0; k < 18; k++) {
    g.fillStyle = `rgba(40,35,25,${0.05 + Math.random() * 0.1})`;
    g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 14, 3 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  canvasCloth = new THREE.CanvasTexture(c);
  canvasCloth.wrapS = canvasCloth.wrapT = THREE.RepeatWrapping;
  canvasCloth.repeat.set(2, 2);
  canvasCloth.colorSpace = THREE.SRGBColorSpace;
  return canvasCloth;
}
