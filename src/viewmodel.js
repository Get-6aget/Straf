import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildWeaponModel } from './models.js';
import { clothTexture } from './assets.js';
import { WEAPONS } from './weapons.js';

const rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.3);
const cap = new THREE.CapsuleGeometry(1, 1, 4, 10);
const cyl = new THREE.CylinderGeometry(1, 0.8, 1, 10);

// One first-person hand holding an optional weapon.
class Hand {
  constructor(side, sleeveMat, gloveMat) {
    this.side = side; // 1 right, -1 left
    this.root = new THREE.Group();
    this.arm = new THREE.Group();
    // forearm angles down and back so it leaves the screen through the bottom edge
    const fore = new THREE.Mesh(cyl, sleeveMat); fore.scale.set(0.038, 0.42, 0.038); fore.rotation.x = Math.PI / 2 - 0.75; fore.position.set(0, -0.15, 0.17);
    const glove = new THREE.Mesh(rbox, gloveMat); glove.scale.set(0.075, 0.045, 0.1); glove.position.set(0, -0.03, 0.02);
    this.arm.add(fore, glove);
    this.root.add(this.arm);
    this.id = undefined;
    this.model = null;
    this.recoil = 0; this.swing = 0; this.swap = 1; this.throwT = 0;
  }

  set(id) {
    if (id === this.id) return;
    if (this.model) this.root.remove(this.model);
    this.model = id ? buildWeaponModel(id) : null;
    if (this.model) { this.model.scale.setScalar(WEAPONS[id].hands === 2 ? 0.6 : 0.7); this.root.add(this.model); }
    this.id = id;
    this.swap = 0;
  }
}

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x5e5a50, map: clothTexture(), roughness: 0.95 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.75 });
    this.R = new Hand(1, sleeve, glove);
    this.L = new Hand(-1, sleeve, glove);
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

    for (const h of [this.R, this.L]) {
      h.recoil = Math.max(0, h.recoil - dt * 6);
      h.swing = Math.max(0, h.swing - dt * 3.2);
      h.swap = Math.min(1, h.swap + dt * 4);
      h.throwT = Math.max(0, h.throwT - dt);
      const w = h === this.R ? R : Lw;
      const def = w ? w.def : null;
      // left hand supports a two-handed gun, otherwise mirrors the right
      const visible = h === this.R || !!Lw;
      h.root.visible = visible || (twoH && h === this.L);
      let x = 0.2 * h.side, y = -0.2, z = -0.42, rx = 0, ry = 0, rz = 0;
      if (!w) { x = 0.2 * h.side; y = -0.27; z = -0.42; rx = 0.25; }
      if (twoH && h === this.L) {
        // support hand under the front of a two-handed gun
        x = 0.18; y = -0.2; z = -0.64; rx = 0.2; ry = 0.25;
        if (zoomed) { x = 0.0; y = -0.18; z = -0.62; }
      }
      if (zoomed && h === this.R) { x = 0; y = -0.15; z = -0.36; }
      if (def && def.hands === 2 && h === this.R) { y -= 0.02; z += 0.04; }
      z += h.recoil * 0.07; rx += h.recoil * 0.2;
      y -= (1 - h.swap) * 0.4; rx -= (1 - h.swap) * 0.6;
      if (h.throwT > 0) { const k = Math.sin((1 - h.throwT / 0.3) * Math.PI); z -= k * 0.3; rx -= k * 0.9; y += k * 0.1; }
      if (h.swing > 0 && (!def || def.kind === 'melee')) {
        const k = Math.sin(h.swing * Math.PI);
        if (def) { rz -= k * 1.3 * h.side; rx -= k * 0.5; x -= k * 0.18 * h.side; }
        else { z -= k * 0.3; x -= k * 0.08 * h.side; }
      }
      if (this.lungeT > 0 && h === this.R) { rx = -1.1; z -= 0.15; }
      h.root.position.set(x, y, z);
      h.root.rotation.set(rx, ry, rz);
      if (h.model && def && def.kind === 'melee') { h.model.rotation.set(0.5, 0, 0); h.model.position.set(0, 0.02, 0); }
      else if (h.model) { h.model.rotation.set(0, 0, 0); h.model.position.set(0, 0, 0); }
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
    this.gtao.blendIntensity = 0.5;
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
    this.gtao.enabled = q >= 2; // the level already has baked AO
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
