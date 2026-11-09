import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { knitTexture, clothTexture } from './assets.js';
import { buildWeaponModel } from './gunmodels.js';

const rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
const cylY = new THREE.CylinderGeometry(1, 1, 1, 14);
const sph = new THREE.SphereGeometry(1, 18, 12);
// ---------------- character ----------------
const capsule = new THREE.CapsuleGeometry(1, 1, 6, 12);
const HATS = ['none', 'beanie', 'hardhat', 'cap', 'none'];

function clothMat(color) { return new THREE.MeshStandardMaterial({ color, map: clothTexture(), roughness: 0.92 }); }

// Lanky worker in overalls with an oversized knitted balaclava head.
export class CharacterModel {
  constructor(color, seed = 0) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const overall = clothMat(color);
    const shirt = clothMat(0x5e5a50);
    const boot = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.8 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x3b3a33, roughness: 0.85 });
    const knit = new THREE.MeshStandardMaterial({ color: [0x3c3f36, 0x5a4636, 0x2f3438, 0x4e4a3a][seed % 4], map: knitTexture(), roughness: 1 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.35, emissive: 0x2a2a20 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9b49a, roughness: 0.7 });

    const part = (geo, m, sx, sy, sz, x, y, z, parent) => {
      const me = new THREE.Mesh(geo, m); me.scale.set(sx, sy, sz); me.position.set(x, y, z);
      me.castShadow = true; me.receiveShadow = true; parent.add(me); return me;
    };
    const pivot = (x, y, z, parent) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };

    this.hips = pivot(0, 0.95, 0, this.body);
    part(rbox, overall, 0.38, 0.2, 0.24, 0, 0.02, 0, this.hips);
    this.spine = pivot(0, 0.08, 0, this.hips);
    part(capsule, overall, 0.2, 0.17, 0.15, 0, 0.27, 0, this.spine); // torso
    part(rbox, overall, 0.3, 0.2, 0.06, 0, 0.32, -0.12, this.spine); // bib
    part(rbox, shirt, 0.42, 0.12, 0.22, 0, 0.5, 0, this.spine); // shoulders
    this.neck = pivot(0, 0.6, 0, this.spine);
    part(cylY, knit, 0.06, 0.1, 0.06, 0, 0.04, 0, this.neck);
    this.head = pivot(0, 0.1, 0, this.neck);
    part(sph, knit, 0.2, 0.25, 0.21, 0, 0.2, 0, this.head);
    part(rbox, skin, 0.27, 0.075, 0.08, 0, 0.25, -0.16, this.head); // eye slit
    part(sph, eyeMat, 0.035, 0.03, 0.02, -0.06, 0.25, -0.2, this.head);
    part(sph, eyeMat, 0.035, 0.03, 0.02, 0.06, 0.25, -0.2, this.head);
    this.buildHat(HATS[seed % HATS.length], knit);

    const limb = (x, y, parent, len, r, m, m2, foot) => {
      const upper = pivot(x, y, 0, parent);
      part(capsule, m, r, len * 0.35, r, 0, -len * 0.25, 0, upper);
      const lower = pivot(0, -len * 0.5, 0, upper);
      part(capsule, m, r * 0.88, len * 0.35, r * 0.88, 0, -len * 0.25, 0, lower);
      const end = foot
        ? part(rbox, m2, 0.13, 0.09, 0.26, 0, -len * 0.5 - 0.02, -0.05, lower)
        : part(sph, m2, 0.055, 0.065, 0.055, 0, -len * 0.5 - 0.02, 0, lower);
      return { upper, lower, end };
    };
    this.armL = limb(-0.26, 0.48, this.spine, 0.66, 0.065, shirt, glove, false);
    this.armR = limb(0.26, 0.48, this.spine, 0.66, 0.065, shirt, glove, false);
    this.legL = limb(-0.11, -0.03, this.hips, 0.9, 0.095, overall, boot, true);
    this.legR = limb(0.11, -0.03, this.hips, 0.9, 0.095, overall, boot, true);
    this.handR = pivot(0, -0.36, -0.02, this.armR.lower);
    this.handL = pivot(0, -0.36, -0.02, this.armL.lower);
    this.weaponR = null; this.weaponL = null; this.idR = null; this.idL = null;
    this.phase = Math.random() * 6;
    this.deadT = 0;
    this.fallDir = { x: 0, z: 1 };
  }

  buildHat(type, knit) {
    const add = (geo, m, sx, sy, sz, x, y, z) => { const me = new THREE.Mesh(geo, m); me.scale.set(sx, sy, sz); me.position.set(x, y, z); me.castShadow = true; this.head.add(me); };
    if (type === 'beanie') { add(sph, new THREE.MeshStandardMaterial({ color: 0x8a3a2a, map: knitTexture(), roughness: 1 }), 0.215, 0.16, 0.22, 0, 0.33, 0); add(sph, knit, 0.05, 0.05, 0.05, 0, 0.5, 0); }
    else if (type === 'hardhat') { const m = new THREE.MeshStandardMaterial({ color: 0xc8a032, roughness: 0.5 }); add(sph, m, 0.23, 0.15, 0.24, 0, 0.36, 0); add(cylY, m, 0.28, 0.015, 0.29, 0, 0.33, -0.02); }
    else if (type === 'cap') { const m = clothMat(0x3a4a5a); add(sph, m, 0.215, 0.13, 0.22, 0, 0.36, 0); add(rbox, m, 0.2, 0.02, 0.14, 0, 0.36, -0.2); }
  }

  setWeapons(f) {
    const r = f.hands.R ? f.hands.R.id : null, l = f.hands.L ? f.hands.L.id : null;
    if (r !== this.idR) {
      if (this.weaponR) this.handR.remove(this.weaponR);
      this.weaponR = r ? buildWeaponModel(r) : null;
      if (this.weaponR) { this.weaponR.rotation.x = -Math.PI / 2; this.weaponR.scale.setScalar(1.2); this.handR.add(this.weaponR); }
      this.idR = r;
    }
    if (l !== this.idL) {
      if (this.weaponL) this.handL.remove(this.weaponL);
      this.weaponL = l ? buildWeaponModel(l) : null;
      if (this.weaponL) { this.weaponL.rotation.x = -Math.PI / 2; this.weaponL.scale.setScalar(1.2); this.handL.add(this.weaponL); }
      this.idL = l;
    }
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
    const P = { bodyX: 0, bodyZ: 0, hipsY: 0.95, spineX: 0, headX: Math.max(-0.7, Math.min(0.7, f.pitch)) * 0.7,
      lu: 0, ll: 0, ru: 0, rl: 0, aLu: 0, aLl: -0.3, aLz: 0.1, aRu: -1.3, aRl: -0.2, aRz: 0 };
    const armed = !!(f.hands.R);
    const twoH = armed && f.hands.R.def.hands === 2;

    if (f.state === 'slide') {
      // lean back, lead leg straight out, trailing knee bent, hand dragging on the floor
      P.hipsY = 0.42; P.bodyX = 0; P.spineX = 0.55; P.headX = -0.35 + f.pitch * 0.5;
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
      P.hipsY = 0.6; P.spineX = -0.35;
      P.lu = -1.3 + s * 0.4; P.ll = 1.8 - s * 0.3; P.ru = -1.3 - s * 0.4; P.rl = 1.8 + s * 0.3;
    } else {
      this.phase += hs * dt * (f.sprinting ? 1.55 : 1.9);
      const a = Math.min(1, hs / 7.4);
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      P.lu = s * 0.95 * a; P.ru = -s * 0.95 * a;
      P.ll = Math.max(0, -c) * 1.4 * a + 0.05; P.rl = Math.max(0, c) * 1.4 * a + 0.05;
      P.aLu = -s * 0.8 * a; P.aLl = -0.4 - 0.5 * a;
      P.spineX = -0.22 * a * (f.sprinting ? 1.4 : 1);
      P.hipsY = 0.95 - Math.abs(c) * 0.06 * a;
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
    L(this.legL.upper.rotation, 'x', P.lu); L(this.legL.lower.rotation, 'x', P.ll);
    L(this.legR.upper.rotation, 'x', P.ru); L(this.legR.lower.rotation, 'x', P.rl);
    L(this.armL.upper.rotation, 'x', P.aLu); L(this.armL.lower.rotation, 'x', P.aLl); L(this.armL.upper.rotation, 'z', -P.aLz);
    L(this.armR.upper.rotation, 'x', P.aRu); L(this.armR.lower.rotation, 'x', P.aRl); L(this.armR.upper.rotation, 'z', P.aRz);
  }
}
