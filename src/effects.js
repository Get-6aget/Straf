import * as THREE from 'three';

const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.IcosahedronGeometry(1, 2);
const matCache = new Map();
function basic(color, opacity = 1) {
  const k = color + ':' + opacity;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
  return matCache.get(k);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.decals = [];
    this.decalGeo = new THREE.PlaneGeometry(0.12, 0.12);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  }

  add(obj, life, update) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, update });
  }

  tracer(from, to, color = 0xfff2c0, width = 0.025) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    const m = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    m.scale.set(width, width, len);
    m.position.set(from.x + dx / 2, from.y + dy / 2, from.z + dz / 2);
    m.lookAt(to.x, to.y, to.z);
    this.add(m, 0.08, (it, k) => { m.material.opacity = 0.85 * k; m.scale.x = m.scale.y = width * k; });
  }

  lightning(points, color = 0x9fe8ff) {
    const g = new THREE.Group();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const segs = 6;
      let prev = a;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const j = s === segs ? 0 : 0.35;
        const p = { x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j, z: a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j };
        const dx = p.x - prev.x, dy = p.y - prev.y, dz = p.z - prev.z, len = Math.hypot(dx, dy, dz);
        const m = new THREE.Mesh(cube, basic(color));
        m.scale.set(0.05, 0.05, len);
        m.position.set(prev.x + dx / 2, prev.y + dy / 2, prev.z + dz / 2);
        m.lookAt(p.x, p.y, p.z);
        g.add(m);
        prev = p;
      }
    }
    this.add(g, 0.15, (it, k) => { g.visible = Math.random() < 0.3 + k; });
  }

  burst(pos, color, count = 8, speed = 4, size = 0.08, life = 0.5, gravity = 12) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(cube, basic(color));
      const s = size * (0.6 + Math.random() * 0.8);
      m.scale.setScalar(s);
      m.position.set(pos.x, pos.y, pos.z);
      const v = { x: (Math.random() - 0.5) * speed * 2, y: Math.random() * speed, z: (Math.random() - 0.5) * speed * 2 };
      this.add(m, life * (0.6 + Math.random() * 0.6), (it, k, dt) => {
        v.y -= gravity * dt;
        m.position.x += v.x * dt; m.position.y += v.y * dt; m.position.z += v.z * dt;
        m.scale.setScalar(s * k);
        m.rotation.x += dt * 8; m.rotation.y += dt * 6;
      });
    }
  }

  impact(pos, normal, color = 0x777777) {
    const p = { x: pos.x + normal.x * 0.05, y: pos.y + normal.y * 0.05, z: pos.z + normal.z * 0.05 };
    this.burst(p, color, 4, 2.5, 0.06, 0.35);
    this.decal(pos, normal);
  }

  decal(pos, n) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    m.position.set(pos.x + n.x * 0.01, pos.y + n.y * 0.01, pos.z + n.z * 0.01);
    m.lookAt(pos.x + n.x, pos.y + n.y, pos.z + n.z);
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 120) this.scene.remove(this.decals.shift());
  }

  explosion(pos, radius, color = 0xffb060) {
    const core = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 1, depthWrite: false }));
    core.position.set(pos.x, pos.y, pos.z);
    this.add(core, 0.35, (it, k) => { const s = radius * (1 - k * k) * 0.8 + 0.3; core.scale.setScalar(s); core.material.opacity = k; });
    const shell = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    shell.position.copy(core.position);
    this.add(shell, 0.5, (it, k) => { shell.scale.setScalar(radius * (1.1 - k * 0.6)); shell.material.opacity = 0.6 * k; });
    this.burst(pos, 0x3a3a3a, 14, 9, 0.22, 1.1, 6);
    this.burst(pos, color, 10, 7, 0.14, 0.6, 4);
  }

  ring(pos, dir, color = 0xc49cff, range = 10) {
    const geo = new THREE.TorusGeometry(1, 0.06, 4, 24);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(pos.x, pos.y, pos.z);
    m.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
    let d = 0;
    this.add(m, 0.35, (it, k, dt) => {
      d += dt * range * 3;
      m.position.set(pos.x + dir.x * d, pos.y + dir.y * d, pos.z + dir.z * d);
      m.scale.setScalar(0.3 + d * 0.55);
      m.material.opacity = 0.8 * k;
    });
  }

  nova(pos, radius, color = 0x9fe8ff) {
    const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, wireframe: true }));
    m.position.set(pos.x, pos.y, pos.z);
    this.add(m, 0.4, (it, k) => { m.scale.setScalar(radius * (1 - k) + 0.3); m.material.opacity = 0.5 * k; });
  }

  muzzle(pos, color = 0xffd27a) {
    const m = new THREE.Mesh(sphere, basic(color, 0.9));
    m.position.set(pos.x, pos.y, pos.z);
    m.scale.setScalar(0.12);
    this.add(m, 0.05, () => {});
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj.material && !matCache.has(it.obj.material) && it.obj.material.dispose) {
          /* per-effect materials are tiny; dispose to avoid leaks */
          if (![...matCache.values()].includes(it.obj.material)) it.obj.material.dispose();
        }
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
