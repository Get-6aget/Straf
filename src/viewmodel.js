import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWeaponModel } from './models.js';
import { clothTexture } from './assets.js';
import { WEAPONS } from './weapons.js';
import { buildGlove, buildArm, gloveMat } from './gunparts.js';

// Glove rigs: each pose is a right hand + sleeve; the left side is the same rig mirrored.
// wrist/dir place the forearm so it leaves the screen through the bottom edge.
const VM_SCALE = 1.45;
const RIGS = {
  grip: { glove: 'grip', pos: [0, 0.015, 0.01], rx: -0.28, wrist: [0.036, -0.03, 0.05], dir: [0.3, -0.5, 0.85] },
  under: { glove: 'under', pos: [0, 0, 0], rx: 0, wrist: [0.04, -0.04, 0.06], dir: [0.6, -0.3, 0.75] },
  handle: { glove: 'grip', pos: [0, 0, 0.08], rx: -Math.PI / 2, wrist: [0.03, -0.085, 0.0], dir: [0.35, -0.85, -0.35] },
};

// One first-person hand holding an optional weapon.
class Hand {
  constructor(side, sleeveMat) {
    this.side = side; // 1 right, -1 left
    this.sleeveMat = sleeveMat;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.x = side;
    this.holder = new THREE.Group();
    this.body.add(this.holder);
    this.root.add(this.body);
    this.rigs = {};
    this.pose = null;
    this.id = undefined;
    this.model = null;
    this.recoil = 0; this.swing = 0; this.swap = 1; this.throwT = 0;
  }

  setPose(pose, pos) {
    if (pose !== this.pose) {
      if (this.pose) this.rigs[this.pose].visible = false;
      this.pose = pose;
      if (!this.rigs[pose]) {
        const spec = RIGS[pose];
        const rig = new THREE.Group();
        const glove = new THREE.Mesh(buildGlove(spec.glove), gloveMat);
        glove.castShadow = true;
        const arm = buildArm(this.sleeveMat, 0.8);
        arm.position.set(...spec.wrist);
        arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...spec.dir).normalize());
        rig.add(glove, arm);
        rig.rotation.x = spec.rx;
        this.holder.add(rig);
        this.rigs[pose] = rig;
      }
      this.rigs[pose].visible = true;
    }
    this.rigs[pose].position.set(...(pos || RIGS[pose].pos));
  }

  set(id) {
    if (id === this.id) return;
    if (this.model) this.holder.remove(this.model);
    this.model = id ? buildWeaponModel(id) : null;
    if (this.model) this.holder.add(this.model);
    this.id = id;
    this.swap = 0;
  }
}

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, map: clothTexture(), roughness: 0.95 });
    this.R = new Hand(1, sleeve);
    this.L = new Hand(-1, sleeve);
    this.root.add(this.R.root, this.L.root);
    this.t = 0; this.bob = 0;
    this.sway = { x: 0, y: 0 };
    this.lungeT = 0;
  }

  setEnvironment(env) { this.scene.environment = env; this.scene.environmentIntensity = 0.9; }

  onFire(hand, kind, id) {
    const h = hand === 'L' ? this.L : this.R;
    if (kind === 'throw') { h.throwT = 0.3; return; }
    if (kind === 'lunge') { this.lungeT = 0.3; h.swing = 1; return; }
    const def = WEAPONS[id];
    if (!def || def.kind === 'melee') { h.swing = 1; return; }
    h.recoil = Math.min(1, h.recoil + 0.45 + (def.recoil || 0) * 5);
  }

  update(dt, f, look, aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const R = f.hands.R, Lw = f.hands.L;
    const twoH = R && R.def.hands === 2;
    this.R.set(R ? R.id : null);
    this.L.set(Lw ? Lw.id : null);
    this.t += dt;
    const hs = f.horizSpeed;
    const moving = f.onGround && f.state === 'normal' && hs > 1;
    if (moving) this.bob += dt * hs * (f.sprinting ? 1.05 : 1.25);
    const ba = moving ? Math.min(1, hs / 7.4) : 0;
    this.sway.x += (-look.dx * 0.0005 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (look.dy * 0.0005 - this.sway.y) * Math.min(1, dt * 10);
    this.lungeT = Math.max(0, this.lungeT - dt);
    const zoomed = R && R.zoomed;

    // shared body motion
    let gx = this.sway.x + Math.cos(this.bob) * 0.016 * ba;
    let gy = this.sway.y - Math.abs(Math.sin(this.bob)) * 0.02 * ba + Math.sin(this.t * 1.5) * 0.003;
    let groll = 0, gpitch = 0;
    if (f.sprinting && moving && !zoomed) { groll += 0.25; gpitch -= 0.18; gy -= 0.03; }
    if (f.state === 'slide') { groll -= 0.3; gy -= 0.05; }
    if (f.state === 'wallrun') { groll += 0.15 * Math.sign(f.wallNormal.x + f.wallNormal.z || 1); }
    if (f.state === 'mantle') { gy -= 0.25; gpitch -= 0.5; }
    if (!f.onGround && f.state === 'normal') gy += Math.max(-0.04, Math.min(0.04, -f.vel.y * 0.004));
    this.root.position.set(gx, gy, 0);
    this.root.rotation.set(gpitch, 0, groll);

    const support = twoH && !Lw ? R.def.fore : null;
    for (const h of [this.R, this.L]) {
      h.recoil = Math.max(0, h.recoil - dt * 6);
      h.swing = Math.max(0, h.swing - dt * 3.2);
      h.swap = Math.min(1, h.swap + dt * 4);
      h.throwT = Math.max(0, h.throwT - dt);
      const isSupport = h === this.L && !!support;
      // the support hand rides on the right-hand weapon's frame
      const src = isSupport ? this.R : h;
      const w = src === this.R ? R : Lw;
      const def = w ? w.def : null;
      h.root.visible = h === this.R || !!Lw || isSupport;
      const melee = !!def && def.kind === 'melee';
      if (isSupport) h.setPose(support[3], [support[0], support[1], support[2]]);
      else h.setPose(melee ? 'handle' : 'grip');
      const s = src.side;
      const big = def && def.hands === 2;
      let x = 0.23 * s, y = -0.24, z = -0.44, rx = 0.03, ry = 0.2 * s, rz = 0;
      if (big) { x = 0.23 * s; y = -0.26; z = -0.33; rx = 0.08; ry = 0.22 * s; }
      if (!def) { y = -0.3; z = -0.42; rx = 0.25; ry = 0; }
      if (melee) { x = 0.22 * s; y = -0.2; z = -0.45; ry = 0.1 * s; }
      if (def && def.view) { x = def.view[0] * s; y = def.view[1]; z = def.view[2]; ry = def.view[3] * s; rx = def.view[4]; }
      if (zoomed && R && h.root.visible) { x = 0; y = -0.15; z = -0.3; ry = 0; }
      z += src.recoil * 0.09; rx += src.recoil * 0.2;
      y -= (1 - src.swap) * 0.4; rx -= (1 - src.swap) * 0.6;
      if (src.throwT > 0) { const k = Math.sin((1 - src.throwT / 0.3) * Math.PI); z -= k * 0.3; rx -= k * 0.9; y += k * 0.1; }
      if (src.swing > 0 && (!def || melee)) {
        const k = Math.sin(src.swing * Math.PI);
        if (def) { rz -= k * 1.3 * s; rx -= k * 0.5; x -= k * 0.18 * s; }
        else { z -= k * 0.3; x -= k * 0.08 * s; }
      }
      if (this.lungeT > 0 && src === this.R) { rx = -1.1; z -= 0.15; }
      h.root.position.set(x, y, z);
      h.root.rotation.set(rx, ry, rz);
      h.holder.rotation.set(melee ? 0.85 : 0, 0, 0);
      h.root.scale.setScalar(VM_SCALE);
    }
    this.root.visible = !(zoomed && R.def.scope);
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, damage: { value: 0 }, flash: { value: 0 },
    tint: { value: new THREE.Vector3(0.94, 1.0, 0.93) }, sat: { value: 0.82 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, damage, flash, sat; uniform vec3 tint; varying vec2 vUv;
    void main(){
      vec4 s = texture2D(tDiffuse, vUv);
      vec3 c = s.rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat) * tint;              // muted olive-mint grade
      c = mix(c, c * vec3(0.92, 1.02, 0.95) + vec3(0.012, 0.02, 0.012), 0.6); // green-lifted shadows
      c = clamp((c - 0.45) * 1.12 + 0.45, 0.0, 10.0); // a touch more contrast
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.6;                   // vignette
      float edge = smoothstep(0.2, 0.75, length(q) * 1.55);
      c = mix(c, vec3(0.6, 0.02, 0.02), damage * (0.25 + 0.75 * edge));
      c = mix(c, vec3(1.0), flash);
      gl_FragColor = vec4(c, s.a);
    }`,
};

// Scene → (GTAO) → viewmodel overlay → bloom → grade → output (tone map + sRGB)
export class Post {
  constructor(renderer, scene, camera, vm) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.main = new RenderPass(scene, camera);
    this.composer.addPass(this.main);
    this.gtao = new GTAOPass(scene, camera, 4, 4);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
    this.composer.addPass(this.gtao);
    this.vmPass = new RenderPass(vm.scene, vm.camera);
    this.vmPass.clear = false;
    this.vmPass.clearDepth = true;
    this.composer.addPass(this.vmPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setQuality(q) {
    this.gtao.enabled = q >= 1;
    this.bloom.enabled = q >= 1;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  render(dt, { time, damage, flash, vmVisible, tint }) {
    const u = this.grade.uniforms;
    u.time.value = time; u.damage.value = damage; u.flash.value = flash;
    if (tint) u.tint.value.set(...tint);
    this.vmPass.enabled = vmVisible;
    this.composer.render(dt);
  }
}
