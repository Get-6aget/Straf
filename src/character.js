import * as THREE from 'three';
import { buildWeaponModel } from './gunmodels.js';
import { BONE_DEF, bodyGeometry, armbandGeometry, cosmeticGeometry } from './charmesh.js';
import { characterTextures, clothTexture, VARIANTS } from './chartex.js';

// One continuous SkinnedMesh (see charmesh.js) with a painted atlas (chartex.js), in the spirit of
// STRAFTAT's baggy jumpsuit worker. Bone axes match the old rig: +rotation.x swings a limb forward.
const HIP_Y = 0.92;
const COSMETICS = ['none', 'beanie', 'cap', 'hardhat', 'shades', 'none'];
const COS_COLOR = { beanie: [0x2c3a2a, 0x3a2f2a, 0x4a4a44], cap: [0x55584a, 0x6a5a44, 0x3c4048], hardhat: [0xc9a22a, 0xb8541c, 0xc8c2b4], shades: [0x111111] };

const materials = new Map();
function bodyMaterial(variant) {
  if (!materials.has(variant)) {
    const t = characterTextures(variant);
    materials.set(variant, new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.92, metalness: 0 }));
  }
  return materials.get(variant);
}
const cosGeo = new Map(), cosMat = new Map();

export class CharacterModel {
  constructor(color, seed = 0) {
    const variant = ((seed % VARIANTS) + VARIANTS) % VARIANTS;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const bones = {}, list = [];
    for (const [name, parent, p] of BONE_DEF) {
      const b = new THREE.Bone(); b.name = name;
      const pp = parent ? BONE_DEF.find((d) => d[0] === parent)[2] : [0, 0, 0];
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      (parent ? bones[parent] : this.body).add(b);
      bones[name] = b; list.push(b);
    }
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(list);
    const mesh = new THREE.SkinnedMesh(bodyGeometry(), bodyMaterial(variant));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.body.add(mesh); mesh.bind(skeleton, new THREE.Matrix4());

    const tint = new THREE.Color(color); const hsl = {}; tint.getHSL(hsl);
    tint.setHSL(hsl.h, Math.min(hsl.s, 0.55) * 0.8, Math.min(0.5, Math.max(0.28, hsl.l * 0.85)));
    this.armbands = new THREE.SkinnedMesh(armbandGeometry(), new THREE.MeshStandardMaterial({ color: tint, map: clothTexture(), roughness: 0.95, metalness: 0 }));
    this.armbands.castShadow = true; this.armbands.frustumCulled = false;
    this.body.add(this.armbands); this.armbands.bind(skeleton, new THREE.Matrix4());

    const kind = COSMETICS[Math.abs(Math.imul(seed + 3, 2654435761) >>> 7) % COSMETICS.length];
    if (kind !== 'none') {
      if (!cosGeo.has(kind)) cosGeo.set(kind, cosmeticGeometry(kind));
      const cols = COS_COLOR[kind], c = cols[Math.abs(seed) % cols.length], key = kind + c;
      if (!cosMat.has(key)) cosMat.set(key, new THREE.MeshStandardMaterial({ color: c, map: kind === 'shades' ? null : clothTexture(), roughness: kind === 'hardhat' || kind === 'shades' ? 0.55 : 0.95, metalness: 0 }));
      const m = new THREE.Mesh(cosGeo.get(kind), cosMat.get(key)); m.castShadow = true;
      bones.head.add(m); this.cosmetic = m;
    }

    this.hips = bones.hips; this.spine = bones.spine; this.chest = bones.chest; this.neck = bones.neck; this.head = bones.head;
    this.armL = { upper: bones.uarmL, lower: bones.larmL, hand: bones.handL };
    this.armR = { upper: bones.uarmR, lower: bones.larmR, hand: bones.handR };
    this.legL = { upper: bones.ulegL, lower: bones.llegL, foot: bones.footL };
    this.legR = { upper: bones.ulegR, lower: bones.llegR, foot: bones.footR };
    // weapon grip sits in the palm
    this.handR = new THREE.Group(); this.handR.position.set(0, -0.055, -0.012); this.armR.hand.add(this.handR);
    this.handL = new THREE.Group(); this.handL.position.set(0, -0.055, -0.012); this.armL.hand.add(this.handL);
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
      this.body.position.y = 0.13 * e;
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
      lu: 0, ll: 0, ru: 0, rl: 0, aLu: 0, aLl: -0.3, aLz: 0.1, aRu: 0.05, aRl: -0.2, aRz: 0, handLx: 0, handRx: 0 };
    const armed = !!(f.hands.R);
    const twoH = armed && f.hands.R.def.hands === 2;

    if (f.state === 'slide') {
      // lean back on the hips, lead leg stretched along the ground, trailing knee tucked, a hand trailing behind for balance
      P.hipsY = 0.33; P.spineX = 0.75; P.headX = -0.5 + f.pitch * 0.5;
      P.lu = -1.38; P.ll = -0.05; P.ru = -0.2; P.rl = 1.85;
      P.aLu = 0.95; P.aLl = -0.25; P.aLz = 0.55; P.aRu = -0.5; P.aRl = -0.5; P.aRz = 0.25;
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
    L(this.spine.rotation, 'x', P.spineX * 0.55); L(this.chest.rotation, 'x', P.spineX * 0.45);
    L(this.neck.rotation, 'x', P.headX * 0.35 - P.spineX * 0.2); L(this.head.rotation, 'x', P.headX * 0.65 - P.spineX * 0.15);
    L(this.legL.upper.rotation, 'x', -P.lu); L(this.legL.lower.rotation, 'x', -P.ll);
    L(this.legR.upper.rotation, 'x', -P.ru); L(this.legR.lower.rotation, 'x', -P.rl);
    L(this.armL.upper.rotation, 'x', -P.aLu); L(this.armL.lower.rotation, 'x', -P.aLl); L(this.armL.upper.rotation, 'z', -P.aLz);
    L(this.armR.upper.rotation, 'x', -P.aRu); L(this.armR.lower.rotation, 'x', -P.aRl); L(this.armR.upper.rotation, 'z', P.aRz);
    // feet stay roughly level while the legs swing
    for (const lg of [this.legL, this.legR]) lg.foot.rotation.x = -(lg.upper.rotation.x + lg.lower.rotation.x) * 0.5;
  }
}
