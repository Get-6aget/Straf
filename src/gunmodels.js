import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WEAPONS } from './weapons.js';
import { pbr } from './assets.js';

const rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
const cylZ = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);
const cylX = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2);
const cylY = new THREE.CylinderGeometry(1, 1, 1, 14);
const sph = new THREE.SphereGeometry(1, 18, 12);

const weaponMats = new Map();
function weaponMat(code, paint) {
  const k = code + paint;
  if (weaponMats.has(k)) return weaponMats.get(k);
  let m;
  switch (code) {
    case 'rust': m = pbr('rust', { tint: 0xd9c2b0 }); break;
    case 'dark': m = pbr('rust', { tint: 0x4a4440, rough: 0.9 }); break;
    case 'paint': m = pbr('paint', { tint: paint }); break;
    case 'wood': m = pbr('wood', { tint: 0xc08c62, metal: 0 }); break;
    case 'grip': m = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.95 }); break;
    case 'brass': m = new THREE.MeshStandardMaterial({ color: 0xa8823a, roughness: 0.4, metalness: 0.9 }); break;
    case 'glow': m = new THREE.MeshBasicMaterial({ color: paint }); break;
    default: m = pbr('rust');
  }
  // Weapons are small, so tile the photo textures densely.
  weaponMats.set(k, m);
  return m;
}

export function buildWeaponModel(id) {
  const def = WEAPONS[id];
  const g = new THREE.Group();
  if (!def) return g;
  for (const [s, x, y, z, sx, sy, sz, m, rx = 0] of def.model) {
    let geo, sc;
    if (s === 'b') { geo = rbox; sc = [sx, sy, sz]; }
    else if (s === 'c') { geo = cylZ; sc = [sx, sx, sz]; }
    else if (s === 'x') { geo = cylX; sc = [sz || sx * 0.6, sx, sx]; }
    else if (s === 'y') { geo = cylY; sc = [sx, sy, sx]; }
    else { geo = sph; sc = [sx, sx * 1.15, sx]; }
    const mesh = new THREE.Mesh(geo, weaponMat(m, def.paint));
    mesh.scale.set(...sc);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

export function buildProjectileMesh(type, paint) {
  const g = new THREE.Group();
  const add = (geo, m, sx, sy, sz, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.scale.set(sx, sy, sz); me.position.set(x, y, z); g.add(me); return me; };
  switch (type) {
    case 'rocket':
      add(cylZ, weaponMat('paint', paint), 0.065, 0.065, 0.5);
      add(sph, weaponMat('rust', 0), 0.065, 0.065, 0.12, 0, 0, -0.25);
      add(cylZ, new THREE.MeshBasicMaterial({ color: 0xffc06a }), 0.05, 0.05, 0.12, 0, 0, 0.3);
      break;
    case 'grenade':
      add(sph, weaponMat('paint', paint), 0.075, 0.085, 0.075);
      add(cylY, weaponMat('rust', 0), 0.022, 0.05, 0.022, 0, 0.09, 0);
      break;
    default: add(sph, weaponMat('rust', 0), 0.08, 0.08, 0.08);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
