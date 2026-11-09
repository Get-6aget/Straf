import * as THREE from 'three';
import { buildWeaponModel } from './gunmodels.js';
import { BONE_DEF, GRIP_C, bodyGeometry, armbandGeometry, cosmeticGeometry } from './charmesh.js';
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
    materials.set(variant, new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.95, metalness: 0 }));
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
    this.handR = new THREE.Group(); this.handR.position.set(-GRIP_C.x, GRIP_C.y - 0.79, 0); this.armR.hand.add(this.handR);
    this.handL = new THREE.Group(); this.handL.position.set(GRIP_C.x, GRIP_C.y - 0.79, 0); this.armL.hand.add(this.handL);
    this.weaponR = null; this.weaponL = null; this.idR = null; this.idL = null;
    this.phase = Math.random() * 6;
    this.deadT = 0;
    this.fallDir = { x: 0, z: 1 };
    this.fk = { ux: 0, uz: 0.14, lx: 0.3 }; this.ik = 0;
  }

  setWeapons(f) {
    const r = f.hands.R ? f.hands.R.id : null, l = f.hands.L ? f.hands.L.id : null;
    const swap = (side, id, hand) => {
      if (this['weapon' + side]) hand.remove(this['weapon' + side]);
      const w = id ? buildWeaponModel(id) : null;
      if (w) {
        const bx = new THREE.Box3().setFromObject(w);
        w.userData.fore = new THREE.Vector3(0, bx.min.y + (bx.max.y - bx.min.y) * 0.4, bx.min.z * 0.38);
        w.rotation.x = -Math.PI / 2; w.scale.setScalar(1.2); hand.add(w);
      }
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
      this.ik = 0; Object.assign(this.fk, { ux: this.armL.upper.rotation.x, uz: this.armL.upper.rotation.z, lx: this.armL.lower.rotation.x });
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
      chestY: 0, lu: 0, ll: 0, ru: 0, rl: 0, aLu: 0, aLl: -0.3, aLz: 0.14, aRu: 0.05, aRl: -0.2, aRz: 0.12, handLx: 0, handRx: 0 };
    const armed = !!(f.hands.R);
    const twoH = armed && f.hands.R.def.hands === 2;

    if (f.state === 'slide') {
      // lean back on the hips, lead leg stretched along the ground, trailing knee tucked, a hand trailing behind for balance
      P.hipsY = 0.4; P.spineX = 0.6; P.headX = -0.4 + f.pitch * 0.5;
      P.lu = -1.2; P.ll = -0.05; P.ru = -0.9; P.rl = 2.2;
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
      const lean = f.state === 'slide' ? P.spineX : 0;
      P.aRu = -1.35 + lean - f.pitch * 0.9; P.aRl = -0.15; P.aRz = 0.05;
      if (twoH) { P.aRz = -0.22; P.chestY = -0.2; P.aLu = -1.2 + lean - f.pitch * 0.9; P.aLl = -0.7; P.aLz = -0.55; }
      if (f.hands.L) { P.aLu = -1.35 - f.pitch * 0.9; P.aLl = -0.15; P.aLz = -0.05; }
    }

    L(this.body.rotation, 'x', P.bodyX); L(this.body.rotation, 'z', P.bodyZ + f.lean * 0.3);
    L(this.hips.position, 'y', P.hipsY);
    L(this.chest.rotation, 'y', P.chestY); L(this.spine.rotation, 'x', P.spineX * 0.55); L(this.chest.rotation, 'x', P.spineX * 0.45);
    L(this.neck.rotation, 'x', P.headX * 0.35 - P.spineX * 0.2); L(this.head.rotation, 'x', P.headX * 0.65 - P.spineX * 0.15);
    L(this.legL.upper.rotation, 'x', -P.lu); L(this.legL.lower.rotation, 'x', -P.ll);
    L(this.legR.upper.rotation, 'x', -P.ru); L(this.legR.lower.rotation, 'x', -P.rl);
    // left arm keeps its own FK state so the fore-end IK can overwrite the bones without feeding back
    const fk = this.fk;
    L(fk, 'ux', -P.aLu); L(fk, 'lx', -P.aLl); L(fk, 'uz', -P.aLz);
    this.armL.upper.rotation.set(fk.ux, 0, fk.uz); this.armL.lower.rotation.set(fk.lx, 0, 0); this.armL.hand.rotation.set(0, 0, 0);
    L(this.armR.upper.rotation, 'x', -P.aRu); L(this.armR.lower.rotation, 'x', -P.aRl); L(this.armR.upper.rotation, 'z', P.aRz);
    // feet stay roughly level while the legs swing
    for (const lg of [this.legL, this.legR]) lg.foot.rotation.x = -(lg.upper.rotation.x + lg.lower.rotation.x) * 0.5;

    const reach = twoH && !f.hands.L && f.state !== 'mantle' && this.weaponR;
    L(this, 'ik', reach ? 1 : 0, Math.min(1, dt * 10));
    if (this.ik > 0.01 && this.weaponR) this.reachForeEnd(this.ik);
  }

  // left hand wraps the weapon's fore-end: 2-bone IK for the arm, palm up, fingers across the barrel
  reachForeEnd(w) {
    const W = this.weaponR, up = this.armL.upper, lo = this.armL.lower, hand = this.armL.hand, chest = this.chest;
    this.root.updateMatrixWorld(true);
    const m = W.matrixWorld.elements;
    const back = V1.set(m[8], m[9], m[10]).normalize();
    const wup = V2.set(m[4], m[5], m[6]).normalize();
    const hz = back.clone(), hx = wup.clone().addScaledVector(hz, -wup.dot(hz)).normalize(), hy = hz.clone().cross(hx);
    const qH = new THREE.Quaternion().setFromRotationMatrix(M1.makeBasis(hx, hy, hz));
    const target = W.localToWorld(W.userData.fore.clone());
    target.addScaledVector(V3.set(GRIP_C.x, GRIP_C.y - 0.79, 0).applyQuaternion(qH), -1);
    const S = up.getWorldPosition(new THREE.Vector3());
    const cq = chest.getWorldQuaternion(new THREE.Quaternion());
    const L1 = 0.3, L2 = 0.29, d = target.clone().sub(S);
    const D = Math.min(L1 + L2 - 0.005, Math.max(0.12, d.length())), u = d.normalize();
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = new THREE.Vector3(-1, -1.2, 0.2).applyQuaternion(cq);
    pole.addScaledVector(u, -pole.dot(u)).normalize();
    const E = S.clone().addScaledVector(u, a).addScaledVector(pole, h);
    const T = S.clone().addScaledVector(u, D);
    const rest = new THREE.Vector3(0, -1, 0), icq = cq.clone().invert();
    const qU = new THREE.Quaternion().setFromUnitVectors(rest, E.clone().sub(S).normalize().applyQuaternion(icq));
    const wU = cq.clone().multiply(qU);
    const qL = new THREE.Quaternion().setFromUnitVectors(rest, T.clone().sub(E).normalize().applyQuaternion(wU.clone().invert()));
    const wL = wU.clone().multiply(qL);
    const qHl = wL.clone().invert().multiply(qH);
    up.quaternion.slerp(qU, w); lo.quaternion.slerp(qL, w); hand.quaternion.slerp(qHl, w);
  }
}
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), M1 = new THREE.Matrix4();
