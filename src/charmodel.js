import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildWeaponModel } from './models.js';

// Skinned, animated character from tools/blender/build_character.py.
const BASE = import.meta.env.BASE_URL + 'assets/models/';
let asset = null;

export async function loadCharacterAsset() {
  try {
    const [gltf, mask] = await Promise.all([
      new GLTFLoader().loadAsync(BASE + 'character.glb'),
      new THREE.TextureLoader().loadAsync(BASE + 'character_mask.png').catch(() => null),
    ]);
    if (mask) { mask.flipY = false; mask.colorSpace = THREE.NoColorSpace; }
    asset = { gltf, mask, clips: new Map(gltf.animations.map((a) => [a.name, a])) };
  } catch (e) {
    asset = null;
  }
  return !!asset;
}

export function hasCharacterAsset() { return !!asset; }

const HATS = ['hat_beanie', 'hat_cap', 'hat_helmet', null];

function tintMaterial(src, color) {
  const m = src.clone();
  m.roughness = Math.max(0.85, m.roughness ?? 1);
  m.metalness = 0;
  m.userData.base = m.color.clone();
  if (asset.mask) {
    const tint = new THREE.Color(color);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.tintMask = { value: asset.mask };
      shader.uniforms.tintColor = { value: tint };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tintMask;\nuniform vec3 tintColor;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\n  float tm = texture2D(tintMask, vMapUv).r;\n  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tintColor * 2.2, tm);\n#endif');
    };
    m.customProgramCacheKey = () => 'tinted';
  }
  return m;
}

export class SkinnedCharacter {
  constructor(color, seed = 0) {
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(asset.gltf.scene);
    this.model.rotation.y = Math.PI; // asset faces +Z, fighters face -Z
    this.root.add(this.model);
    this.materials = [];
    const hat = HATS[seed % HATS.length];
    this.model.traverse((o) => {
      if (o.isBone) {
        if (o.name === 'chest') this.chest = o;
        if (o.name === 'neck') this.neck = o;
      }
      if (o.name === 'socket_R') this.socketR = o;
      if (o.name === 'socket_L') this.socketL = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = tintMaterial(o.material, color);
        this.materials.push(o.material);
      }
      if (o.name && o.name.startsWith('hat_')) o.visible = o.name === hat;
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [name, clip] of asset.clips) {
      const a = this.mixer.clipAction(clip);
      if (['jump', 'mantle', 'death'].includes(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    this.current = null;
    this.play('idle', 0);
    this.idR = null; this.idL = null; this.weaponR = null; this.weaponL = null;
    this.light = 1;
    this.deadT = 0;
  }

  play(name, fade = 0.15, speed = 1) {
    const a = this.actions[name] || this.actions.idle;
    if (!a) return;
    a.timeScale = speed;
    if (this.current === a) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
  }

  setWeapons(f) {
    const r = f.hands.R ? f.hands.R.id : null, l = f.hands.L ? f.hands.L.id : null;
    if (r !== this.idR && this.socketR) {
      if (this.weaponR) this.socketR.remove(this.weaponR);
      this.weaponR = r ? buildWeaponModel(r) : null;
      if (this.weaponR) this.socketR.add(this.weaponR);
      this.idR = r;
    }
    if (l !== this.idL && this.socketL) {
      if (this.weaponL) this.socketL.remove(this.weaponL);
      this.weaponL = l ? buildWeaponModel(l) : null;
      if (this.weaponL) this.socketL.add(this.weaponL);
      this.idL = l;
    }
  }

  // Sky visibility (0..1) dims the character in covered, dark areas.
  setLight(v) {
    if (Math.abs(v - this.light) < 0.01) return;
    this.light = v;
    for (const m of this.materials) m.color.copy(m.userData.base).multiplyScalar(v);
  }

  update(dt, f) {
    this.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    this.setWeapons(f);
    let face = f.yaw;
    const hs = f.horizSpeed;
    if (f.state === 'slide' && hs > 0.5) face = Math.atan2(-f.vel.x, -f.vel.z);
    let d = face - this.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.root.rotation.y += d * Math.min(1, dt * 14);

    if (!f.alive) {
      this.deadT += dt;
      this.play('death', 0.08);
      this.root.visible = this.deadT < 6;
    } else {
      this.deadT = 0;
      this.root.visible = true;
      if (f.state === 'slide') this.play('slide', 0.08);
      else if (f.state === 'wallrun') {
        const side = f.wallNormal.x * Math.cos(this.root.rotation.y) - f.wallNormal.z * Math.sin(this.root.rotation.y);
        this.play(side > 0 ? 'wallrun_L' : 'wallrun_R', 0.1);
      } else if (f.state === 'mantle') this.play('mantle', 0.05);
      else if (!f.onGround) this.play(f.vel.y > 1 && f.airT < 0.35 ? 'jump' : 'fall', 0.12);
      else if (f.crouching) this.play(hs > 0.5 ? 'crouch_walk' : 'crouch', 0.15, hs > 0.5 ? Math.max(0.6, hs / 2.6) : 1);
      else if (hs > 6.2) this.play('sprint', 0.15, hs / 7.4);
      else if (hs > 0.6) this.play('run', 0.15, Math.max(0.55, hs / 5.2));
      else this.play('idle', 0.2);
    }
    this.mixer.update(dt);
    // aim pitch on top of the animation
    if (this.chest && f.alive) this.chest.rotateX(-Math.max(-1.1, Math.min(1.1, f.pitch)) * 0.75);
    if (this.neck && f.alive) this.neck.rotateX(-Math.max(-1.1, Math.min(1.1, f.pitch)) * 0.25);
  }
}
