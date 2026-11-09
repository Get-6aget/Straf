import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = opts.emissive
      ? new THREE.MeshBasicMaterial({ color, fog: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 })
      : new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
    matCache.set(key, m);
  }
  return matCache.get(key);
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2);
const sphGeo = new THREE.IcosahedronGeometry(1, 1);

function weaponMat(code, accent) {
  switch (code) {
    case 'm': return mat(0x2c2f33);
    case 'l': return mat(0x9aa0a6);
    case 'w': return mat(0x6b4a2e);
    case 'g': return mat(accent, { emissive: true });
    default: return mat(accent);
  }
}

export function buildWeaponModel(id) {
  const def = WEAPONS[id];
  const g = new THREE.Group();
  if (!def) return g;
  for (const [s, x, y, z, sx, sy, sz, m] of def.model) {
    let mesh;
    if (s === 'b') { mesh = new THREE.Mesh(boxGeo, weaponMat(m, def.color)); mesh.scale.set(sx, sy, sz); }
    else if (s === 'c') { mesh = new THREE.Mesh(cylGeo, weaponMat(m, def.color)); mesh.scale.set(sx, sx, sz); }
    else { mesh = new THREE.Mesh(sphGeo, weaponMat(m, def.color)); mesh.scale.setScalar(sx); }
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

export function buildProjectileMesh(type, color) {
  const g = new THREE.Group();
  const add = (geo, m, sx, sy, sz, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(geo, m); me.scale.set(sx, sy, sz); me.position.set(x, y, z); g.add(me); return me;
  };
  switch (type) {
    case 'rocket':
      add(cylGeo, mat(color), 0.07, 0.07, 0.45);
      add(cylGeo, mat(0xffc46b, { emissive: true }), 0.05, 0.05, 0.12, 0, 0, 0.28);
      break;
    case 'grenade': add(sphGeo, mat(color), 0.12, 0.12, 0.12); break;
    case 'mine':
      add(cylGeo, mat(color), 0.14, 0.14, 0.06);
      add(sphGeo, mat(0xff4b3a, { emissive: true }), 0.04, 0.04, 0.04, 0, 0, -0.04);
      break;
    case 'bolt': add(boxGeo, mat(0x8a6a3a), 0.025, 0.025, 0.6); break;
    case 'knife': add(boxGeo, mat(0xcfd3d6), 0.02, 0.05, 0.32); break;
    case 'harpoon':
      add(boxGeo, mat(0x9aa0a6), 0.03, 0.03, 0.8);
      add(boxGeo, mat(color), 0.12, 0.03, 0.08, 0, 0, -0.38);
      break;
    case 'ball': add(sphGeo, mat(color, { emissive: true }), 0.13, 0.13, 0.13); break;
    default: add(sphGeo, mat(color), 0.1, 0.1, 0.1);
  }
  return g;
}

// ---------------- Character ----------------
// Low-poly mannequin with procedural pose animation per movement state.
export class CharacterModel {
  constructor(color) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // pivot at hips
    this.root.add(this.body);
    const skin = mat(color);
    const dark = mat(0x26282b);
    const visor = mat(0x111214);

    const box = (m, sx, sy, sz, x, y, z, parent) => {
      const me = new THREE.Mesh(boxGeo, m); me.scale.set(sx, sy, sz); me.position.set(x, y, z);
      me.castShadow = true; parent.add(me); return me;
    };

    this.hips = new THREE.Group(); this.hips.position.y = 0.9; this.body.add(this.hips);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    box(skin, 0.5, 0.62, 0.28, 0, 0.33, 0, this.torso);
    box(dark, 0.52, 0.1, 0.3, 0, 0.05, 0, this.torso);
    this.head = new THREE.Group(); this.head.position.y = 0.72; this.torso.add(this.head);
    box(skin, 0.32, 0.32, 0.32, 0, 0.12, 0, this.head);
    box(visor, 0.26, 0.09, 0.05, 0, 0.15, -0.16, this.head);

    const limb = (x, y, parent, len, w) => {
      const piv = new THREE.Group(); piv.position.set(x, y, 0); parent.add(piv);
      box(skin, w, len, w, 0, -len / 2, 0, piv);
      return piv;
    };
    this.armL = limb(-0.33, 0.6, this.torso, 0.62, 0.15);
    this.armR = limb(0.33, 0.6, this.torso, 0.62, 0.15);
    this.legL = limb(-0.13, 0, this.hips, 0.9, 0.18);
    this.legR = limb(0.13, 0, this.hips, 0.9, 0.18);
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.58, -0.05); this.armR.add(this.hand);
    this.weaponId = null;
    this.weaponMesh = null;
    this.phase = 0;
    this.deadT = 0;
    this.rollAngle = 0;
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    this.weaponId = id;
    if (this.weaponMesh) this.hand.remove(this.weaponMesh);
    this.weaponMesh = null;
    if (id && id !== 'fists') {
      this.weaponMesh = buildWeaponModel(id);
      this.weaponMesh.rotation.x = -Math.PI / 2;
      this.weaponMesh.scale.setScalar(1.3);
      this.hand.add(this.weaponMesh);
    }
  }

  update(dt, f) {
    const L = (a, b, k) => a + (b - a) * Math.min(1, dt * k);
    this.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    this.setWeapon(f.weapon ? f.weapon.id : null);

    if (!f.alive) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT * 3);
      this.body.rotation.x = L(this.body.rotation.x, Math.PI / 2 * 0.98, 8);
      this.body.position.y = L(this.body.position.y, 0.15, 8);
      this.armL.rotation.x = L(this.armL.rotation.x, -2.6, 6);
      this.armR.rotation.x = L(this.armR.rotation.x, -2.4, 6);
      this.root.visible = this.deadT < 4 || Math.floor(this.deadT * 8) % 2 === 0 ? this.deadT < 5 : false;
      return t;
    }
    this.deadT = 0;
    this.root.visible = true;

    const hs = f.horizSpeed;
    // Facing: yaw of the fighter; while rolling/sliding face movement direction
    let face = f.yaw;
    if (f.state === 'roll' || f.state === 'dive') face = Math.atan2(-f.rollDir.x, -f.rollDir.z);
    else if (f.state === 'slide' && hs > 0.5) face = Math.atan2(-f.vel.x, -f.vel.z);
    let dy = face - this.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.root.rotation.y += dy * Math.min(1, dt * 14);

    let bodyX = 0, bodyY = 0, bodyZ = 0, hipsY = 0.9, torsoX = 0, legL = 0, legR = 0, armL = 0, armR = -1.3, headX = f.pitch;
    let kneeTuck = 0;

    if (f.state === 'roll') {
      // full forward roll around the hips
      const t = Math.min(1, f.stateT / 0.5);
      this.rollAngle = -t * Math.PI * 2;
      bodyX = this.rollAngle; bodyY = 0.45; hipsY = 0.45;
      legL = legR = -2.1; armL = -1.8; armR = -1.8; torsoX = -0.6; headX = 0;
      kneeTuck = 1;
    } else if (f.state === 'dive') {
      bodyX = -1.25; bodyY = 0.6; hipsY = 0.5; armL = -2.9; armR = -2.9; legL = 0.25; legR = 0.1; headX = 0.9;
    } else if (f.state === 'slide') {
      // lean back, lead leg forward, trailing hand on ground
      bodyX = 0.95; bodyY = -0.15; hipsY = 0.45; legL = -1.5; legR = -0.6; armL = 0.7; armR = -1.6; headX = f.pitch - 0.7;
      bodyZ = Math.sin(f.stateT * 30) * 0.02;
    } else if (f.wallAnim > 0) {
      // wall kick: twist away from the wall, kicking leg extended toward it
      const t = 1 - f.wallAnim / 0.4;
      const k = Math.sin(t * Math.PI);
      const n = f.wallNormal;
      const localX = n.x * Math.cos(this.root.rotation.y) - n.z * Math.sin(this.root.rotation.y);
      bodyZ = -localX * 0.6 * k;
      legL = -1.2 * k; legR = 0.6 * k; armL = -2.2 * k; torsoX = 0.2 * k;
      bodyY = 0;
    } else if (!f.onGround) {
      legL = -0.7; legR = 0.3; armL = -0.6;
    } else if (f.crouching) {
      hipsY = 0.55; legL = -1.2; legR = -1.0; torsoX = -0.3;
      this.phase += hs * dt * 2;
      legL += Math.sin(this.phase) * 0.3; legR -= Math.sin(this.phase) * 0.3;
    } else {
      this.phase += hs * dt * 1.7;
      const amp = Math.min(1, hs / 7) * 0.9;
      legL = Math.sin(this.phase) * amp; legR = -Math.sin(this.phase) * amp;
      armL = -Math.sin(this.phase) * amp * 0.8;
      hipsY = 0.9 + Math.abs(Math.cos(this.phase)) * 0.05 * amp;
    }
    if (f.state !== 'roll') this.rollAngle = 0;

    const k = f.state === 'roll' ? 40 : 14;
    this.body.rotation.x = f.state === 'roll' ? bodyX : L(this.body.rotation.x, bodyX, k);
    this.body.rotation.z = L(this.body.rotation.z, bodyZ + f.lean * 0.35, k);
    this.body.position.y = L(this.body.position.y, bodyY, k);
    this.hips.position.y = L(this.hips.position.y, hipsY, k);
    this.torso.rotation.x = L(this.torso.rotation.x, torsoX, k);
    this.legL.rotation.x = L(this.legL.rotation.x, legL, k);
    this.legR.rotation.x = L(this.legR.rotation.x, legR, k);
    this.armL.rotation.x = L(this.armL.rotation.x, armL, k);
    this.armR.rotation.x = L(this.armR.rotation.x, f.weapon && f.weapon.id !== 'fists' && f.state !== 'roll' ? -1.45 - f.pitch : armR, k);
    this.head.rotation.x = L(this.head.rotation.x, Math.max(-0.8, Math.min(0.8, headX)), k);
    this.legL.scale.y = this.legR.scale.y = L(this.legL.scale.y, kneeTuck ? 0.6 : 1, k);
  }
}
