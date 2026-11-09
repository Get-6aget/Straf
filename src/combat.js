import * as THREE from 'three';
import { WEAPONS, newWeaponInstance } from './weapons.js';
import { buildProjectileMesh, buildWeaponModel } from './models.js';
import { rayAABB } from './physics.js';
import { sfx } from './audio.js';

const v3 = (x, y, z) => ({ x, y, z });

function spreadDir(d, s) {
  if (s <= 0) return { ...d };
  // random cone around d
  const ux = Math.abs(d.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let rx = d.y * ux.z - d.z * ux.y, ry = d.z * ux.x - d.x * ux.z, rz = d.x * ux.y - d.y * ux.x;
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  const upx = ry * d.z - rz * d.y, upy = rz * d.x - rx * d.z, upz = rx * d.y - ry * d.x;
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  const x = d.x + rx * ca + upx * sa, y = d.y + ry * ca + upy * sa, z = d.z + rz * ca + upz * sa;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.pickups = [];
  }

  get world() { return this.game.world; }
  get fx() { return this.game.effects; }

  clear() {
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    for (const p of this.pickups) this.game.scene.remove(p.mesh);
    this.projectiles.length = 0;
    this.pickups.length = 0;
  }

  isEnemy(a, b) { return a !== b && (a.team !== b.team); }

  muzzlePos(f) {
    const d = f.aimDir();
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
    return v3(f.pos.x + d.x * 0.6 + rx * 0.18, f.eyeY - 0.12 + d.y * 0.6, f.pos.z + d.z * 0.6 + rz * 0.18);
  }

  eye(f) { return v3(f.pos.x, f.eyeY, f.pos.z); }

  // ---------- per-fighter weapon logic ----------
  updateFighter(f, inp, dt) {
    if (!f.alive) return;
    if (!f.fists) f.fists = newWeaponInstance('fists');
    const w = f.weapon || f.fists;
    const def = w.def;
    w.cd -= dt; w.altCd -= dt;
    f.fists.cd -= dt;
    if (f.lunge > 0) this.updateLunge(f, dt);

    const busy = f.state === 'roll';
    w.zoomed = def.alt === 'zoom' && inp.alt && !busy;
    let mul = 1;
    if (w.zoomed) mul = 0.7;
    if (def.spinup) {
      const spinning = (inp.fire || inp.alt) && w.ammo > 0;
      const before = w.spin;
      w.spin = Math.max(0, Math.min(1, w.spin + (spinning ? dt / def.spinup : -dt / def.spinup * 1.5)));
      if (spinning && before === 0) sfx('spin', f.pos, 0.8);
      if (spinning) mul = def.slow;
    }
    f.speedMul = mul;

    if (inp.throwPressed && f.weapon) { this.throwWeapon(f); return; }
    if (inp.pickupPressed) this.tryPickup(f, true);
    else if (!f.weapon) this.tryPickup(f, false);

    if (inp.altPressed && w.altCd <= 0 && !busy) this.alt(f, w);

    const wants = def.auto ? inp.fire : inp.firePressed;
    if (wants && w.cd <= 0 && !busy) {
      if (def.spinup && w.spin < 1) return;
      if (w.ammo <= 0) {
        if (inp.firePressed) this.throwWeapon(f);
        return;
      }
      this.primary(f, w);
    }
  }

  primary(f, w) {
    const def = w.def;
    w.cd = 1 / def.rate;
    f.lastShot = this.game.time;
    switch (def.kind) {
      case 'hitscan': {
        let s = def.spread;
        if (w.zoomed) s = def.scopedSpread ?? s * 0.35;
        if (!f.onGround) s *= 1.4;
        if (f.horizSpeed > 2 && !w.zoomed) s *= 1.15;
        this.hitscan(f, w.id, def.pellets || 1, s, def.damage, def.range, { bounces: 0, noscope: def.scope && !w.zoomed });
        w.ammo--;
        if (def.selfKnock) this.selfKnock(f, def.selfKnock);
        break;
      }
      case 'projectile':
        this.launch(f, w.id, def.projectile, f.aimDir());
        w.ammo--;
        break;
      case 'throwable': {
        const d = f.aimDir();
        d.y += 0.12; const l = Math.hypot(d.x, d.y, d.z);
        this.launch(f, w.id, def.projectile, { x: d.x / l, y: d.y / l, z: d.z / l });
        w.ammo--;
        break;
      }
      case 'melee':
        this.melee(f, w.id, def.damage, def.range, def.arc, w.id === 'fists' ? 3 : 2);
        break;
      case 'cone':
        this.cone(f, w.id, def);
        w.ammo--;
        break;
      case 'tesla':
        this.tesla(f, w.id, def);
        w.ammo--;
        break;
    }
    f.recoil = (f.recoil || 0) + (def.recoil || 0);
    this.game.onFire(f, w.id);
    sfx(def.sound || (def.kind === 'melee' ? (w.id === 'fists' ? 'punch' : 'slash') : 'pistol'), f.pos, f.isBot ? 0.9 : 0.75);
    if (f.weapon && f.weapon.ammo <= 0 && f.weapon.def.kind === 'throwable') {
      f.weapon = null; // thrown last grenade/mine
    }
  }

  alt(f, w) {
    const def = w.def;
    switch (def.alt) {
      case 'fan': {
        const n = Math.min(3, w.ammo);
        if (n <= 0 || w.cd > 0) return;
        for (let i = 0; i < n; i++) this.hitscan(f, w.id, 1, def.spread * 4 + 0.03, def.damage, def.range, {});
        w.ammo -= n; w.cd = 0.55; w.altCd = 0.55;
        f.recoil = (f.recoil || 0) + 0.08;
        this.game.onFire(f, w.id);
        sfx('revolver', f.pos, 0.8);
        break;
      }
      case 'ricochet':
        if (w.ammo <= 0 || w.cd > 0) return;
        this.hitscan(f, w.id, 1, 0.003, def.damage, def.range, { bounces: 2, ricochet: true });
        w.ammo--; w.cd = 1 / def.rate; w.altCd = 1 / def.rate;
        f.recoil = (f.recoil || 0) + def.recoil;
        this.game.onFire(f, w.id); sfx('revolver', f.pos, 0.8);
        break;
      case 'slug':
        if (w.ammo <= 0 || w.cd > 0) return;
        this.hitscan(f, w.id, 1, 0.004, 75, 120, {});
        w.ammo--; w.cd = 1 / def.rate; w.altCd = 1 / def.rate;
        f.recoil = (f.recoil || 0) + def.recoil;
        this.game.onFire(f, w.id); sfx('shotgun', f.pos, 0.8);
        break;
      case 'both':
        if (w.ammo < 2 || w.cd > 0) return;
        this.hitscan(f, w.id, def.pellets * 2, def.spread * 1.2, def.damage, def.range, {});
        w.ammo -= 2; w.cd = 0.6; w.altCd = 0.6;
        this.selfKnock(f, def.selfKnock * 2.6);
        f.recoil = (f.recoil || 0) + 0.2;
        this.game.onFire(f, w.id); sfx('shotgun', f.pos, 1);
        break;
      case 'detonate': {
        const r = this.projectiles.find((p) => p.owner === f && p.weaponId === 'rocket');
        if (r) this.explodeProjectile(r);
        w.altCd = 0.2;
        break;
      }
      case 'underhand': {
        if (w.ammo <= 0 || w.cd > 0) return;
        const fw = f.forward();
        this.launch(f, w.id, { ...def.projectile, speed: 9 }, { x: fw.x * 0.95, y: 0.3, z: fw.z * 0.95 });
        w.ammo--; w.cd = 1 / def.rate; w.altCd = 1 / def.rate;
        sfx('throw', f.pos);
        if (w.ammo <= 0) f.weapon = null;
        break;
      }
      case 'remote': {
        const mines = this.projectiles.filter((p) => p.owner === f && p.weaponId === 'stickymine');
        mines.forEach((m) => this.explodeProjectile(m));
        w.altCd = 0.3;
        break;
      }
      case 'lunge':
        if (w.cd > 0) return;
        f.lunge = 0.22; f.lungeHit = new Set();
        { const fw = f.aimDir(); f.vel.x = fw.x * 22; f.vel.z = fw.z * 22; f.vel.y = Math.max(f.vel.y, fw.y * 10 + 2); }
        w.cd = 1.3; w.altCd = 1.3;
        this.game.onFire(f, w.id, 'lunge');
        sfx('slash', f.pos);
        break;
      case 'throwknife':
        if (w.cd > 0) return;
        this.launch(f, 'knife', { ...WEAPONS.knife.projectile, damageOverride: 100 }, f.aimDir());
        f.weapon = null;
        this.game.onFire(f, w.id, 'throw');
        sfx('throw', f.pos);
        break;
      case 'shove':
        if (w.cd > 0) return;
        this.melee(f, 'fists', 8, 2.2, 0.7, 2, 11);
        w.cd = 0.7; w.altCd = 0.7;
        this.game.onFire(f, w.id);
        sfx('punch', f.pos);
        break;
      case 'selfblast': {
        if (w.ammo <= 0 || w.cd > 0) return;
        const d = f.aimDir();
        f.vel.x -= d.x * 17; f.vel.y = Math.max(f.vel.y, 0) - d.y * 15 + 2; f.vel.z -= d.z * 17;
        f.onGround = false;
        w.ammo--; w.cd = 0.9; w.altCd = 0.9;
        this.fx.ring(this.muzzlePos(f), { x: -d.x, y: -d.y, z: -d.z }, 0xc49cff, 3);
        this.game.onFire(f, w.id);
        sfx('boom', f.pos);
        break;
      }
      case 'triple': {
        if (w.ammo <= 0 || w.cd > 0) return;
        const n = Math.min(3, w.ammo);
        const d = f.aimDir();
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.16;
          const c = Math.cos(a), s = Math.sin(a);
          this.launch(f, w.id, WEAPONS.bouncer.projectile, { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c });
        }
        w.ammo -= n; w.cd = 0.8; w.altCd = 0.8;
        this.game.onFire(f, w.id); sfx('pop', f.pos);
        break;
      }
      case 'overload': {
        if (w.ammo < 5 || w.cd > 0) return;
        const c = f.center();
        for (const o of this.game.fighters) {
          if (!o.alive || !this.isEnemy(f, o)) continue;
          const oc = o.center();
          const d = Math.hypot(oc.x - c.x, oc.y - c.y, oc.z - c.z);
          if (d < 6 && this.los(c, oc)) {
            this.damage(o, 48, f, w.id, { knock: { x: (oc.x - c.x) / d * 9, y: 5, z: (oc.z - c.z) / d * 9 } });
            this.fx.lightning([c, oc]);
          }
        }
        this.fx.nova(c, 6);
        w.ammo = 0; w.cd = 1; w.altCd = 1;
        this.game.onFire(f, w.id);
        sfx('zap', f.pos, 1.3); sfx('boom', f.pos, 0.7);
        break;
      }
    }
  }

  selfKnock(f, k) {
    const d = f.aimDir();
    f.vel.x -= d.x * k; f.vel.z -= d.z * k;
    f.vel.y -= d.y * k * 1.3;
    if (d.y < -0.5) f.onGround = false;
  }

  // ---------- traces ----------
  trace(o, d, range, ignore) {
    const wh = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
    let best = wh ? wh.t : range, hitF = null, part = null;
    for (const f of this.game.fighters) {
      if (!f.alive || f === ignore) continue;
      for (const hb of f.hitboxes()) {
        const t = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, hb.minX, hb.minY, hb.minZ, hb.maxX, hb.maxY, hb.maxZ, best);
        if (t >= 0 && t < best) { best = t; hitF = f; part = hb.part; }
      }
    }
    const point = v3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best);
    if (hitF) return { t: best, fighter: hitF, part, point };
    if (wh) return { t: best, point, normal: v3(wh.nx, wh.ny, wh.nz) };
    return { t: best, point };
  }

  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return !this.world.raycast(a.x, a.y, a.z, dx / d, dy / d, dz / d, d - 0.05);
  }

  hitscan(f, weaponId, pellets, spread, damage, range, opts) {
    const def = WEAPONS[weaponId];
    const eye = this.eye(f), aim = f.aimDir(), muz = this.muzzlePos(f);
    const dmgBy = new Map();
    for (let i = 0; i < pellets; i++) {
      let o = eye, d = spreadDir(aim, spread), left = range, bounces = opts.bounces || 0, from = muz, ignore = f, ric = false;
      for (;;) {
        const h = this.trace(o, d, left, ignore);
        this.fx.tracer(from, h.point, ric ? 0xffa07a : 0xfff2c0, pellets > 1 ? 0.015 : 0.025);
        if (h.fighter) {
          const head = h.part === 'head';
          const amt = damage * (head ? (def.headMult || 1.5) : 1);
          const prev = dmgBy.get(h.fighter) || { amt: 0, head: false };
          prev.amt += amt; prev.head ||= head; prev.ric = ric;
          dmgBy.set(h.fighter, prev);
          this.fx.burst(h.point, h.fighter.color, 3, 3, 0.07, 0.4);
          break;
        }
        if (h.normal) {
          this.fx.impact(h.point, h.normal);
          if (bounces > 0) {
            bounces--; ric = true;
            const dot = d.x * h.normal.x + d.y * h.normal.y + d.z * h.normal.z;
            d = { x: d.x - 2 * dot * h.normal.x, y: d.y - 2 * dot * h.normal.y, z: d.z - 2 * dot * h.normal.z };
            o = { x: h.point.x + h.normal.x * 0.02, y: h.point.y + h.normal.y * 0.02, z: h.point.z + h.normal.z * 0.02 };
            from = o; left -= h.t; ignore = null;
            sfx('click', o, 0.6);
            continue;
          }
        }
        break;
      }
    }
    for (const [victim, { amt, head, ric }] of dmgBy) {
      const knock = pellets > 1 ? { x: aim.x * amt * 0.06, y: 1.2, z: aim.z * amt * 0.06 } : null;
      this.damage(victim, amt, f, weaponId, { head, knock, noscope: opts.noscope, ricochet: ric });
    }
  }

  melee(f, weaponId, damage, range, arc, maxTargets, knock = 0) {
    const eye = this.eye(f), aim = f.aimDir();
    const targets = [];
    for (const o of this.game.fighters) {
      if (!o.alive || !this.isEnemy(f, o)) continue;
      const c = o.center();
      c.y = Math.max(o.pos.y + 0.3, Math.min(o.pos.y + o.height - 0.2, eye.y));
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d > range + 0.4) continue;
      const cos = (dx * aim.x + dy * aim.y + dz * aim.z) / d;
      if (cos < arc && d > 0.9) continue;
      if (!this.los(eye, c)) continue;
      targets.push({ o, d, c });
    }
    targets.sort((a, b) => a.d - b.d);
    let hit = false;
    for (const { o, c } of targets.slice(0, maxTargets)) {
      const k = knock || (weaponId === 'fists' ? 4 : 3);
      this.damage(o, damage, f, weaponId, { knock: { x: aim.x * k, y: 2.5, z: aim.z * k } });
      this.fx.burst(c, o.color, 6, 4, 0.08, 0.5);
      hit = true;
    }
    if (!hit) {
      const h = this.world.raycast(eye.x, eye.y, eye.z, aim.x, aim.y, aim.z, range);
      if (h) this.fx.impact(v3(eye.x + aim.x * h.t, eye.y + aim.y * h.t, eye.z + aim.z * h.t), v3(h.nx, h.ny, h.nz));
    }
    return hit;
  }

  updateLunge(f, dt) {
    f.lunge -= dt;
    const c = f.center();
    for (const o of this.game.fighters) {
      if (!o.alive || !this.isEnemy(f, o) || f.lungeHit.has(o)) continue;
      const oc = o.center();
      if (Math.hypot(oc.x - c.x, oc.y - c.y, oc.z - c.z) < 1.9) {
        f.lungeHit.add(o);
        const d = f.forward();
        this.damage(o, 100, f, 'katana', { knock: { x: d.x * 6, y: 3, z: d.z * 6 }, lunge: true });
        this.fx.burst(oc, o.color, 10, 6, 0.09, 0.6);
      }
    }
  }

  cone(f, weaponId, def) {
    const eye = this.eye(f), aim = f.aimDir();
    this.fx.ring(this.muzzlePos(f), aim, 0xc49cff, def.range);
    for (const o of this.game.fighters) {
      if (!o.alive || !this.isEnemy(f, o)) continue;
      const c = o.center();
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d > def.range) continue;
      if ((dx * aim.x + dy * aim.y + dz * aim.z) / d < def.arc) continue;
      if (!this.los(eye, c)) continue;
      const k = def.knock * (1 - d / def.range * 0.5);
      this.damage(o, def.damage, f, weaponId, { knock: { x: dx / d * k, y: Math.max(6, dy / d * k + 5), z: dz / d * k } });
    }
  }

  tesla(f, weaponId, def) {
    const eye = this.eye(f), aim = f.aimDir(), muz = this.muzzlePos(f);
    const h = this.trace(eye, spreadDir(aim, 0.01), def.range, f);
    const pts = [muz, h.point];
    if (h.fighter) {
      const head = h.part === 'head';
      this.damage(h.fighter, def.damage * (head ? 1.4 : 1), f, weaponId, { head });
      // chain to the nearest other enemy
      const src = h.fighter.center();
      let best = null, bd = def.chain;
      for (const o of this.game.fighters) {
        if (!o.alive || o === h.fighter || !this.isEnemy(f, o)) continue;
        const oc = o.center(), d = Math.hypot(oc.x - src.x, oc.y - src.y, oc.z - src.z);
        if (d < bd && this.los(src, oc)) { bd = d; best = o; }
      }
      if (best) { pts.push(best.center()); this.damage(best, def.chainDamage, f, weaponId, { chain: true }); }
    } else if (h.normal) this.fx.impact(h.point, h.normal, 0x9fe8ff);
    this.fx.lightning(pts);
  }

  // ---------- projectiles ----------
  launch(f, weaponId, spec, dir) {
    const start = this.muzzlePos(f);
    const eye = this.eye(f);
    // never spawn inside a wall
    if (!this.los(eye, start)) { start.x = eye.x; start.y = eye.y; start.z = eye.z; }
    const def = WEAPONS[weaponId];
    const mesh = buildProjectileMesh(spec.mesh, def.color);
    mesh.position.set(start.x, start.y, start.z);
    this.game.scene.add(mesh);
    const p = {
      owner: f, weaponId, spec, mesh, pos: start,
      vel: v3(dir.x * spec.speed + f.vel.x * 0.25, dir.y * spec.speed + (spec.gravity ? f.vel.y * 0.25 : 0), dir.z * spec.speed + f.vel.z * 0.25),
      life: spec.life || 5, fuse: spec.fuse ?? null, bounces: spec.bounces ?? 0, age: 0, stuck: false, armed: 0,
    };
    this.projectiles.push(p);
    return p;
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt; p.life -= dt;
      if (p.fuse !== null) { p.fuse -= dt; if (p.fuse <= 0) { this.explodeProjectile(p); continue; } }
      if (p.life <= 0) { this.removeProjectile(p); continue; }
      if (p.stuck) { this.updateMine(p, dt); continue; }
      const s = p.spec;
      p.vel.y -= (s.gravity || 0) * dt;
      const sx = p.vel.x * dt, sy = p.vel.y * dt, sz = p.vel.z * dt;
      const len = Math.hypot(sx, sy, sz);
      if (len < 1e-6) continue;
      const dx = sx / len, dy = sy / len, dz = sz / len;
      const wh = this.world.raycast(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, len + s.radius);
      let best = wh ? Math.max(0, wh.t - s.radius) : Infinity, hitF = null, part = null;
      const r = s.radius;
      for (const f of this.game.fighters) {
        if (!f.alive) continue;
        if (f === p.owner && p.age < 0.25) continue;
        for (const hb of f.hitboxes()) {
          const t = rayAABB(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, hb.minX - r, hb.minY - r, hb.minZ - r, hb.maxX + r, hb.maxY + r, hb.maxZ + r, len);
          if (t >= 0 && t < best) { best = t; hitF = f; part = hb.part; }
        }
      }
      if (hitF) {
        p.pos.x += dx * best; p.pos.y += dy * best; p.pos.z += dz * best;
        this.hitFighter(p, hitF, part);
        continue;
      }
      if (wh && best <= len) {
        p.pos.x += dx * best; p.pos.y += dy * best; p.pos.z += dz * best;
        if (this.hitWorld(p, wh)) continue;
      } else {
        p.pos.x += sx; p.pos.y += sy; p.pos.z += sz;
      }
      p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.thrown) { p.mesh.rotation.x += dt * 14; p.mesh.rotation.y += dt * 5; }
      else if (s.mesh !== 'grenade' && s.mesh !== 'ball' && s.mesh !== 'mine') {
        p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
      }
      if (p.pos.y < this.world.killY - 5) this.removeProjectile(p);
    }
  }

  hitFighter(p, f, part) {
    const s = p.spec;
    if (p.thrown) {
      this.damage(f, 30, p.owner, p.weaponId, { thrown: true, knock: { x: p.vel.x * 0.2, y: 2, z: p.vel.z * 0.2 } });
      f.stun = 0.35;
      this.fx.burst(p.pos, f.color, 6, 4, 0.08, 0.5);
      sfx('punch', p.pos);
      // weapon bounces off and lands
      p.vel.x *= -0.2; p.vel.z *= -0.2; p.vel.y = 2;
      p.thrownHit = true;
      return;
    }
    if (s.explode) { this.explodeProjectile(p, f); return; }
    if (s.harpoon) {
      this.damage(f, WEAPONS.harpoon.damage, p.owner, 'harpoon', {});
      const o = p.owner;
      if (f.alive && o.alive) {
        const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1;
        f.vel.x = dx / d * Math.min(22, d * 2 + 6); f.vel.z = dz / d * Math.min(22, d * 2 + 6); f.vel.y = 6;
        f.onGround = false; f.stun = 0.4;
        f.lastHit = { attacker: o, weaponId: 'harpoon', t: this.game.time };
      }
      this.fx.lightning([this.muzzlePos(o), f.center()], 0x9ad0d8);
      sfx('harpoon', f.pos);
      this.removeProjectile(p);
      return;
    }
    const def = WEAPONS[p.weaponId];
    const dmg = s.damageOverride ?? def.damage;
    const head = part === 'head';
    this.damage(f, dmg * (head ? (def.headMult || 1.5) : 1), p.owner, p.weaponId, {
      head, knock: { x: p.vel.x * 0.08, y: 1.5, z: p.vel.z * 0.08 }, bounced: p.bounced, thrownKnife: !!s.damageOverride,
    });
    this.fx.burst(p.pos, f.color, 6, 4, 0.08, 0.5);
    this.removeProjectile(p);
  }

  hitWorld(p, wh) {
    const s = p.spec;
    const n = v3(wh.nx, wh.ny, wh.nz);
    if (p.thrown) {
      if (n.y > 0.5) { this.landThrown(p); return true; }
      this.reflect(p, n, 0.3);
      return false;
    }
    if (s.harpoon) {
      const o = p.owner;
      if (o.alive) {
        const dx = p.pos.x - o.pos.x, dy = p.pos.y - o.pos.y, dz = p.pos.z - o.pos.z, d = Math.hypot(dx, dy, dz) || 1;
        const sp = Math.min(24, 8 + d * 1.2);
        o.vel.x = dx / d * sp; o.vel.y = Math.max(5, dy / d * sp + 4); o.vel.z = dz / d * sp;
        o.onGround = false; o.wallBounces = 0;
        this.fx.lightning([this.muzzlePos(o), p.pos], 0x9ad0d8);
        sfx('harpoon', o.pos);
      }
      this.removeProjectile(p);
      return true;
    }
    if (s.sticky) {
      p.stuck = true; p.armed = 0.6; p.normal = n;
      p.mesh.position.set(p.pos.x + n.x * 0.04, p.pos.y + n.y * 0.04, p.pos.z + n.z * 0.04);
      p.mesh.lookAt(p.pos.x - n.x, p.pos.y - n.y, p.pos.z - n.z);
      sfx('click', p.pos);
      return true;
    }
    if (s.fuse) { // grenade bounces
      this.reflect(p, n, s.bounce || 0.4);
      sfx('click', p.pos, 0.5);
      return false;
    }
    if (s.bounces !== undefined && p.bounces > 0) {
      p.bounces--; p.bounced = true;
      this.reflect(p, n, s.bounce || 0.8);
      sfx('pop', p.pos, 0.5);
      return false;
    }
    if (s.explode) { this.explodeProjectile(p); return true; }
    this.fx.impact(p.pos, n, 0x8a6a3a);
    if (s.pin) { // bolts stay stuck in walls briefly
      p.stuck = true; p.dead = true; p.life = 3;
      return true;
    }
    this.removeProjectile(p);
    return true;
  }

  reflect(p, n, k) {
    const dot = p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z;
    p.vel.x = (p.vel.x - 2 * dot * n.x) * k; p.vel.y = (p.vel.y - 2 * dot * n.y) * k; p.vel.z = (p.vel.z - 2 * dot * n.z) * k;
    p.pos.x += n.x * 0.02; p.pos.y += n.y * 0.02; p.pos.z += n.z * 0.02;
  }

  updateMine(p, dt) {
    if (p.dead) return;
    p.armed -= dt;
    if (p.armed > 0) return;
    for (const f of this.game.fighters) {
      if (!f.alive || !this.isEnemy(p.owner, f)) continue;
      const c = f.center();
      if (Math.hypot(c.x - p.pos.x, c.y - p.pos.y, c.z - p.pos.z) < 2.6) { this.explodeProjectile(p); return; }
    }
    const blink = Math.floor(this.game.time * 4) % 2;
    p.mesh.children[1] && (p.mesh.children[1].visible = !!blink);
  }

  explodeProjectile(p, direct = null) {
    const def = WEAPONS[p.weaponId];
    this.explosion(p.pos, p.spec.explode || 4, def.damage, p.owner, p.weaponId, direct);
    this.removeProjectile(p);
  }

  explosion(pos, radius, damage, owner, weaponId, direct = null) {
    this.fx.explosion(pos, radius);
    sfx('explosion', pos, 1.2);
    this.game.shake(pos, radius);
    for (const f of this.game.fighters) {
      if (!f.alive) continue;
      const c = f.center();
      const dx = c.x - pos.x, dy = c.y - pos.y, dz = c.z - pos.z;
      const d = Math.max(0.01, Math.hypot(dx, dy, dz));
      if (d > radius + 0.5 && f !== direct) continue;
      if (f !== direct && d > 1.2 && !this.los(pos, c)) continue;
      const k = Math.max(0, 1 - d / (radius + 0.5));
      const self = f === owner;
      let amt = f === direct ? damage : damage * (0.25 + 0.75 * k);
      if (self) amt *= 0.35;
      if (!self && owner && !this.isEnemy(owner, f)) continue;
      const push = (self ? 15 : 11) * k + 3;
      const knock = { x: dx / d * push, y: Math.max(dy / d * push, 0) + 5 * k + 2, z: dz / d * push };
      this.damage(f, amt, owner, weaponId, { knock, explosion: true, self });
    }
  }

  removeProjectile(p) {
    this.game.scene.remove(p.mesh);
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
  }

  // ---------- weapon pickups / throwing ----------
  throwWeapon(f) {
    const w = f.weapon;
    if (!w || w.def.noDrop) return;
    f.weapon = null;
    const mesh = buildWeaponModel(w.id);
    mesh.scale.setScalar(1.6);
    const d = f.aimDir();
    const start = this.muzzlePos(f);
    if (!this.los(this.eye(f), start)) Object.assign(start, this.eye(f));
    mesh.position.set(start.x, start.y, start.z);
    this.game.scene.add(mesh);
    this.projectiles.push({
      owner: f, weaponId: w.id, spec: { gravity: 16, radius: 0.18, life: 8 }, mesh, pos: start, thrown: true, inst: w,
      vel: v3(d.x * 21 + f.vel.x * 0.3, d.y * 21 + 2.5, d.z * 21 + f.vel.z * 0.3), life: 8, fuse: null, age: 0,
    });
    sfx('throw', f.pos);
    this.game.onFire(f, w.id, 'throw');
  }

  landThrown(p) {
    this.removeProjectile(p);
    if (p.inst.ammo > 0) this.spawnPickup(p.inst, p.pos, null);
    else this.fx.burst(p.pos, 0x555555, 5, 2, 0.08, 0.5);
  }

  spawnPickup(inst, pos, spawner) {
    const mesh = new THREE.Group();
    const model = buildWeaponModel(inst.id);
    model.scale.setScalar(1.8);
    mesh.add(model);
    mesh.position.set(pos.x, pos.y + 0.6, pos.z);
    this.game.scene.add(mesh);
    const pk = { inst, pos: { x: pos.x, y: pos.y, z: pos.z }, mesh, spawner, t: Math.random() * 6 };
    this.pickups.push(pk);
    return pk;
  }

  dropWeapon(f) {
    const w = f.weapon;
    f.weapon = null;
    if (!w || w.def.noDrop || w.ammo <= 0) return;
    const g = this.world.groundBelow(f.pos.x, f.pos.y + 1, f.pos.z);
    if (g === null) return;
    this.spawnPickup(w, { x: f.pos.x, y: g, z: f.pos.z }, null);
  }

  tryPickup(f, swap) {
    let best = null, bd = swap ? 2.4 : 1.5;
    for (const pk of this.pickups) {
      const d = Math.hypot(pk.pos.x - f.pos.x, (pk.pos.y - f.pos.y) * 0.7, pk.pos.z - f.pos.z);
      if (d < bd) { bd = d; best = pk; }
    }
    if (!best) return false;
    if (f.weapon) {
      if (!swap) return false;
      const old = f.weapon;
      f.weapon = null;
      if (old.ammo > 0 && !old.def.noDrop) this.spawnPickup(old, { x: f.pos.x, y: best.pos.y, z: f.pos.z }, null);
    }
    this.takePickup(f, best);
    return true;
  }

  takePickup(f, pk) {
    f.weapon = pk.inst;
    pk.inst.cd = 0.25;
    this.game.scene.remove(pk.mesh);
    this.pickups.splice(this.pickups.indexOf(pk), 1);
    if (pk.spawner) { pk.spawner.pickup = null; pk.spawner.respawn = 14; }
    sfx('pickup', f.pos, f.isBot ? 0.5 : 0.8);
    this.game.onPickup(f, pk.inst.id);
  }

  updatePickups(dt) {
    for (const pk of this.pickups) {
      pk.t += dt;
      pk.mesh.rotation.y += dt * 1.6;
      pk.mesh.position.y = pk.pos.y + 0.6 + Math.sin(pk.t * 2.5) * 0.08;
    }
  }

  // ---------- damage ----------
  damage(victim, amount, attacker, weaponId, opts = {}) {
    if (!victim.alive || !this.game.damageEnabled) return;
    if (attacker && attacker !== victim && !this.isEnemy(attacker, victim)) return;
    victim.hp -= amount;
    if (attacker && attacker !== victim) victim.lastHit = { attacker, weaponId, t: this.game.time };
    if (opts.knock) {
      victim.vel.x += opts.knock.x; victim.vel.y = Math.max(victim.vel.y, 0) + opts.knock.y; victim.vel.z += opts.knock.z;
      if (opts.knock.y > 1) victim.onGround = false;
    }
    this.game.onDamage(victim, amount, attacker, weaponId, opts);
    if (victim.hp <= 0) this.game.kill(victim, attacker, weaponId, opts);
  }
}
