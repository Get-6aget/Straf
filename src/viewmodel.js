import * as THREE from 'three';
import { buildWeaponModel, mat } from './models.js';
import { WEAPONS } from './weapons.js';

const box = new THREE.BoxGeometry(1, 1, 1);

// First-person weapon + hands, rendered in its own pass so it never clips into walls.
export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 2.2);
    this.scene.add(this.hemi);
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(1, 2, 1); this.scene.add(dl);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.holder = new THREE.Group();
    this.root.add(this.holder);
    this.weaponId = undefined;
    this.color = 0xe9e4d4;
    this.t = 0; this.bob = 0; this.recoil = 0; this.swap = 1; this.swing = 0; this.swingSide = 1;
    this.throwT = 0; this.kick = 0; this.lungeT = 0;
    this.sway = { x: 0, y: 0 };
  }

  setPalette(pal) {
    this.hemi.color.set(pal.sky);
    this.hemi.groundColor.set(pal.ground);
  }

  build(id) {
    this.holder.clear();
    this.weaponId = id;
    const skin = mat(this.color);
    const sleeve = mat(0x2e3135);
    const arm = (x, y, z, rx = 0) => {
      const g = new THREE.Group();
      const fore = new THREE.Mesh(box, sleeve); fore.scale.set(0.09, 0.09, 0.4); fore.position.z = 0.22; g.add(fore);
      const hand = new THREE.Mesh(box, skin); hand.scale.set(0.1, 0.1, 0.12); g.add(hand);
      g.position.set(x, y, z); g.rotation.x = rx;
      return g;
    };
    if (!id || id === 'fists') {
      this.fistL = arm(-0.16, -0.18, -0.35, 0.2);
      this.fistR = arm(0.16, -0.18, -0.35, 0.2);
      this.holder.add(this.fistL, this.fistR);
      this.model = null;
      return;
    }
    this.fistL = this.fistR = null;
    const m = buildWeaponModel(id);
    m.scale.setScalar(0.75);
    this.model = m;
    this.holder.add(m);
    const r = arm(0, -0.03, 0.04, 0.35);
    m.add(r);
    const def = WEAPONS[id];
    const long = def.model.some((p) => (p[0] === 'c' || p[0] === 'b') && p[6] > 0.45);
    if (long) { const l = arm(-0.03, 0.0, -0.28, 0.6); l.rotation.y = 0.5; m.add(l); }
    this.swap = 0;
  }

  onFire(kind) {
    const def = WEAPONS[this.weaponId || 'fists'];
    if (kind === 'throw') { this.throwT = 0.35; return; }
    if (kind === 'lunge') { this.lungeT = 0.3; this.swing = 1; return; }
    if (def.kind === 'melee') { this.swing = 1; this.swingSide = -this.swingSide; }
    else this.recoil = Math.min(1, this.recoil + 0.5 + (def.recoil || 0) * 5);
  }

  update(dt, f, look, opts) {
    const id = f.weapon ? f.weapon.id : 'fists';
    if (id !== this.weaponId) this.build(id);
    const def = WEAPONS[id];
    this.camera.aspect = opts.aspect;
    this.camera.updateProjectionMatrix();
    this.t += dt;
    const hs = f.horizSpeed;
    const moving = f.onGround && f.state === 'normal' && hs > 1;
    if (moving) this.bob += dt * hs * 1.25;
    const ba = moving ? Math.min(1, hs / 7) : 0;
    this.sway.x += (-look.dx * 0.0006 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (look.dy * 0.0006 - this.sway.y) * Math.min(1, dt * 10);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.swap = Math.min(1, this.swap + dt * 4);
    this.swing = Math.max(0, this.swing - dt * (def.kind === 'melee' ? 1 / 0.28 : 4));
    this.throwT = Math.max(0, this.throwT - dt);
    this.lungeT = Math.max(0, this.lungeT - dt);

    const zoomed = f.weapon && f.weapon.zoomed;
    let x = 0.24, y = -0.22, z = -0.5, rx = 0, ry = 0, rz = 0;
    if (zoomed) { x = 0; y = -0.14; z = -0.42; }
    x += Math.cos(this.bob) * 0.012 * ba + this.sway.x;
    y += -Math.abs(Math.sin(this.bob)) * 0.014 * ba + this.sway.y + Math.sin(this.t * 1.6) * 0.003;
    // movement poses
    if (f.state === 'slide') { rz += 0.35; x -= 0.04; y -= 0.03; }
    if (f.state === 'roll') { const t = Math.min(1, f.stateT / 0.5); y -= Math.sin(t * Math.PI) * 0.35; rx -= Math.sin(t * Math.PI) * 0.9; }
    if (f.state === 'dive') { rx += 0.25; y -= 0.05; }
    if (f.wallAnim > 0) { const k = Math.sin((1 - f.wallAnim / 0.4) * Math.PI); rz -= 0.3 * k; y -= 0.05 * k; }
    if (!f.onGround && f.state === 'normal') y += Math.max(-0.04, Math.min(0.04, -f.vel.y * 0.004));
    // recoil
    z += this.recoil * 0.07; rx += this.recoil * 0.22;
    // swap-in
    y -= (1 - this.swap) * 0.35; rx -= (1 - this.swap) * 0.6;
    // throw
    if (this.throwT > 0) { const k = Math.sin((1 - this.throwT / 0.35) * Math.PI); z -= k * 0.25; rx -= k * 0.8; y += k * 0.08; }

    this.holder.position.set(x, y, z);
    this.holder.rotation.set(rx, ry, rz);

    if (def.kind === 'melee' && this.model) {
      // diagonal slash
      const s = this.swing, k = Math.sin(s * Math.PI);
      this.model.rotation.set(-0.3 - k * 0.6, 0.4 * this.swingSide * (s - 0.5) * 2, -k * 1.4 * this.swingSide);
      this.model.position.set(-k * 0.15 * this.swingSide, k * 0.05, -k * 0.1);
      if (this.lungeT > 0) this.model.rotation.x = -1.2;
    } else if (this.model) {
      this.model.rotation.set(0, 0, 0); this.model.position.set(0, 0, 0);
      if (def.spinup && f.weapon) this.model.children[0] && (this.model.children[0].rotation.z += dt * f.weapon.spin * 40);
    }
    if (this.fistL) {
      const k = Math.sin(this.swing * Math.PI);
      const active = this.swingSide > 0 ? this.fistR : this.fistL;
      const idle = active === this.fistR ? this.fistL : this.fistR;
      active.position.z = -0.35 - k * 0.28; active.position.x = (active === this.fistR ? 0.16 : -0.16) * (1 - k * 0.6);
      idle.position.z = -0.35; idle.position.x = idle === this.fistR ? 0.16 : -0.16;
    }
    this.root.visible = !(zoomed && def.scope) && !opts.hidden;
  }
}

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, depthBuffer: true });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, time: { value: 0 }, damage: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, grain: { value: 0.035 }, flash: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float damage; uniform float grain; uniform float flash; uniform vec2 res; varying vec2 vUv;
        float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, 0.86);              // muted, overcast palette
          c = c * 0.94 + 0.025;                   // lifted blacks, soft contrast
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q, q) * 0.55;            // vignette
          float edge = smoothstep(0.25, 0.75, length(q) * 1.5);
          c = mix(c, vec3(0.55, 0.04, 0.04), damage * edge);
          c = mix(c, vec3(1.0), flash);
          c += (rand(floor(vUv * res) + fract(time) * 100.0) - 0.5) * grain;
          gl_FragColor = vec4(max(c, 0.0), 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(w, h, scale, samples) {
    const rw = Math.max(2, Math.floor(w * scale)), rh = Math.max(2, Math.floor(h * scale));
    if (this.rt.samples !== samples) { this.rt.dispose(); this.rt = new THREE.WebGLRenderTarget(rw, rh, { samples, depthBuffer: true }); this.mat.uniforms.tDiffuse.value = this.rt.texture; }
    this.rt.setSize(rw, rh);
    this.mat.uniforms.res.value.set(rw, rh);
  }

  render(scene, camera, vm, time, damage, flash) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.autoClear = false;
    r.clear(true, true, true);
    r.render(scene, camera);
    if (vm && vm.root.visible) {
      r.clearDepth();
      r.render(vm.scene, vm.camera);
    }
    r.setRenderTarget(null);
    this.mat.uniforms.time.value = time;
    this.mat.uniforms.damage.value = damage;
    this.mat.uniforms.flash.value = flash;
    r.clear(true, true, true);
    r.render(this.scene, this.cam);
  }
}
