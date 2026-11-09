import * as THREE from 'three';

const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.IcosahedronGeometry(1, 2);
const plane = new THREE.PlaneGeometry(1, 1);
const shared = new Set();
function basic(color, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  shared.add(m);
  return m;
}
const MAT = { blood: basic(0x7a0a08), bloodDark: basic(0x4a0504), dust: basic(0x8a877a), spark: basic(0xffd890) };

function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(110,8,6,0.95)';
  for (let i = 0; i < 14; i++) {
    const r = 8 + Math.random() * 26, a = Math.random() * Math.PI * 2, d = Math.random() * 30;
    g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, r * (0.5 + Math.random() * 0.5), a, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 20; i++) {
    g.beginPath(); g.arc(64 + (Math.random() - 0.5) * 120, 64 + (Math.random() - 0.5) * 120, 1 + Math.random() * 4, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grd.addColorStop(0, 'rgba(10,10,8,1)'); grd.addColorStop(0.35, 'rgba(30,28,24,0.9)'); grd.addColorStop(1, 'rgba(30,28,24,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.world = null;
    this.items = [];
    this.decals = [];
    this.splatMat = new THREE.MeshBasicMaterial({ map: splatTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holeMat = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.8, depthWrite: false });
  }

  add(obj, life, update) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, update });
  }

  tracer(from, to, width = 0.02) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.6) return;
    const m = new THREE.Mesh(cube, this.tracerMat.clone());
    m.scale.set(width, width, len);
    m.position.set(from.x + dx / 2, from.y + dy / 2, from.z + dz / 2);
    m.lookAt(to.x, to.y, to.z);
    this.add(m, 0.07, (it, k) => { m.material.opacity = 0.8 * k; });
  }

  particles(pos, mat, count, speed, size, life, gravity, dir = null) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(cube, mat);
      const s = size * (0.5 + Math.random());
      m.scale.setScalar(s);
      m.position.set(pos.x, pos.y, pos.z);
      const v = { x: (Math.random() - 0.5) * speed * 2, y: Math.random() * speed, z: (Math.random() - 0.5) * speed * 2 };
      if (dir) { v.x += dir.x * speed; v.y += (dir.y || 0) * speed; v.z += dir.z * speed; }
      this.add(m, life * (0.6 + Math.random() * 0.6), (it, k, dt) => {
        v.y -= gravity * dt;
        m.position.x += v.x * dt; m.position.y += v.y * dt; m.position.z += v.z * dt;
        m.scale.setScalar(s * Math.min(1, k * 2));
      });
    }
  }

  blood(pos, dir) {
    const l = Math.hypot(dir.x, dir.y || 0, dir.z) || 1;
    const d = { x: dir.x / l, y: (dir.y || 0) / l, z: dir.z / l };
    this.particles(pos, MAT.blood, 7, 3, 0.05, 0.6, 14, d);
    this.particles(pos, MAT.bloodDark, 4, 2, 0.08, 0.5, 14, d);
    // splat on the floor behind the victim
    if (this.world) {
      const px = pos.x + d.x * 1.2, pz = pos.z + d.z * 1.2;
      const g = this.world.groundBelow(px, pos.y + 0.2, pz, 6);
      if (g !== null) this.decal({ x: px, y: g, z: pz }, { x: 0, y: 1, z: 0 }, this.splatMat, 0.9 + Math.random() * 0.9);
    }
  }

  dust(pos) { this.particles(pos, MAT.dust, 6, 1.5, 0.07, 0.6, 3); }

  impact(pos, n) {
    this.particles({ x: pos.x + n.x * 0.05, y: pos.y + n.y * 0.05, z: pos.z + n.z * 0.05 }, MAT.dust, 4, 2, 0.05, 0.4, 8, n);
    this.particles(pos, MAT.spark, 2, 3, 0.02, 0.15, 0, n);
    this.decal(pos, n, this.holeMat, 0.12);
  }

  decal(pos, n, mat, size) {
    const m = new THREE.Mesh(plane, mat);
    m.scale.setScalar(size);
    m.position.set(pos.x + n.x * 0.012, pos.y + n.y * 0.012, pos.z + n.z * 0.012);
    m.lookAt(pos.x + n.x, pos.y + n.y, pos.z + n.z);
    m.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 160) this.scene.remove(this.decals.shift());
  }

  explosion(pos, radius) {
    const core = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, depthWrite: false }));
    core.position.set(pos.x, pos.y, pos.z);
    this.add(core, 0.3, (it, k) => { core.scale.setScalar(radius * (1 - k * k) * 0.7 + 0.3); core.material.opacity = k; });
    const smoke = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: 0x55534c, transparent: true, opacity: 0.8, depthWrite: false, roughness: 1 }));
    smoke.position.copy(core.position);
    this.add(smoke, 1.4, (it, k, dt) => { smoke.scale.setScalar(radius * (1.1 - k * 0.6)); smoke.position.y += dt * 0.8; smoke.material.opacity = 0.7 * k; });
    this.particles(pos, MAT.dust, 14, 8, 0.16, 1.0, 9);
    this.particles(pos, MAT.spark, 10, 9, 0.05, 0.4, 6);
    if (this.world) {
      const g = this.world.groundBelow(pos.x, pos.y + 0.3, pos.z, 2);
      if (g !== null) this.decal({ x: pos.x, y: g, z: pos.z }, { x: 0, y: 1, z: 0 }, this.holeMat, radius * 0.7);
    }
  }

  muzzle(pos) {
    const m = new THREE.Mesh(sphere, MAT.spark);
    m.position.set(pos.x, pos.y, pos.z);
    m.scale.setScalar(0.1);
    this.add(m, 0.04, () => {});
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj.material && !shared.has(it.obj.material) && it.obj.material !== this.tracerMat) it.obj.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      it.update(it, it.life / it.max, dt);
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    for (const d of this.decals) this.scene.remove(d);
    this.items.length = 0;
    this.decals.length = 0;
  }
}
