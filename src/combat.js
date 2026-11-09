import { WEAPONS, newWeaponInstance } from './weapons.js';
import { buildProjectileMesh, buildWeaponModel } from './models.js';
import { rayAABB } from './physics.js';
import { sfx } from './audio.js';

const v3 = (x, y, z) => ({ x, y, z });

function spreadDir(d, s) {
  if (s <= 0) return { ...d };
  const up = Math.abs(d.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let rx = d.y * up.z - d.z * up.y, ry = d.z * up.x - d.x * up.z, rz = d.x * up.y - d.y * up.x;
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * d.z - rz * d.y, uy = rz * d.x - rx * d.z, uz = rx * d.y - ry * d.x;
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  const x = d.x + rx * ca + ux * sa, y = d.y + ry * ca + uy * sa, z = d.z + rz * ca + uz * sa;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

// Two-hand weapon system: one-handed guns can be held in each hand
// (LMB = right, RMB = left); two-handed guns use RMB for aim/alt.
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

  isEnemy(a, b) { return a !== b && a.team !== b.team; }
  eye(f) { return v3(f.pos.x, f.eyeY, f.pos.z); }
  muzzlePos(f, hand = 'R') {
    const d = f.aimDir();
    const side = hand === 'R' ? 0.2 : -0.2;
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
    return v3(f.pos.x + d.x * 0.7 + rx * side, f.eyeY - 0.16 + d.y * 0.7, f.pos.z + d.z * 0.7 + rz * side);
  }

  // ---------- per-fighter ----------
  updateFighter(f, inp, dt) {
    if (!f.alive) return;
    const R = f.hands.R, Lh = f.hands.L;
    for (const w of [R, Lh]) if (w) w.cd -= dt;
    if (f.lunge > 0) this.updateLunge(f, dt);
    f.punchCd = (f.punchCd || 0) - dt;

    if (inp.throwPressed) { this.throwWeapon(f, R ? 'R' : 'L'); return; }
    if (inp.pickupPressed) this.interact(f);
    else if (!R && !Lh) this.tryPickup(f, false);

    const busy = f.state === 'mantle';
    const twoH = R && R.def.hands === 2;
    if (R) R.zoomed = !!(twoH && R.def.alt === 'zoom' && inp.alt && !busy);

    // melee lunge: hold RMB then LMB
    if (R && R.def.alt === 'lunge' && inp.alt && inp.firePressed && R.cd <= 0 && !busy) { this.startLunge(f, R); return; }

    if (R) this.handFire(f, R, 'R', inp.fire, inp.firePressed, dt, busy);
    else if (inp.firePressed && f.punchCd <= 0 && !busy) this.punch(f);

    if (Lh) this.handFire(f, Lh, 'L', inp.alt, inp.altPressed, dt, busy);
  }

  handFire(f, w, hand, held, pressed, dt, busy) {
    const def = w.def;
    if (def.kind === 'grenade') { this.updateGrenade(f, w, hand, held, pressed, dt); return; }
    if (busy || w.cd > 0) return;
    const wants = def.auto ? held : pressed;
    if (!wants) return;
    if (w.ammo <= 0) {
      if (pressed) { sfx('empty', f.pos, 0.6); this.throwWeapon(f, hand); }
      return;
    }
    this.primary(f, w, hand);
  }

  primary(f, w, hand) {
    const def = w.def;
    w.cd = def.interval;
    switch (def.kind) {
      case 'hitscan': {
        let s = def.spread;
        if (w.zoomed) s = def.scopedSpread ?? s * 0.35;
        if (!f.onGround) s *= 1.5;
        if (def.moveSpread && (f.horizSpeed > 3 || !f.onGround)) s += def.moveSpread;
        this.hitscan(f, w.id, hand, def.pellets || 1, s, def.damage, def.range, { noscope: def.scope && !w.zoomed });
        w.ammo--;
        if (def.selfPush) this.selfPush(f, def.selfPush);
        break;
      }
      case 'projectile':
        this.launch(f, w.id, def.projectile, f.aimDir(), hand);
        w.ammo--;
        break;
      case 'melee':
        this.melee(f, w.id, def.damage, def.range, def.arc);
        break;
      default: break;
    }
    f.recoil = (f.recoil || 0) + (def.recoil || 0);
    this.game.onFire(f, w.id, hand);
    sfx(def.sound, f.pos, f.isBot ? 0.9 : 0.75);
  }

  // Grenades: hold to cook (fuse runs in hand), release to throw.
  updateGrenade(f, w, hand, held, pressed, dt) {
    const spec = w.def.projectile;
    if (pressed && w.cookT < 0 && w.cd <= 0) { w.cookT = 0; sfx('click', f.pos, 0.6); }
    if (w.cookT >= 0) {
      w.cookT += dt;
      if (w.cookT >= spec.fuse) { // cooked too long
        f.hands[hand] = null;
        this.explosion(this.eye(f), spec.explode, w.def.damage, f, w.id);
        return;
      }
      if (!held) {
        const d = f.aimDir(); d.y += 0.1;
        const l = Math.hypot(d.x, d.y, d.z);
        const p = this.launch(f, w.id, spec, { x: d.x / l, y: d.y / l, z: d.z / l }, hand);
        p.fuse = spec.fuse - w.cookT;
        f.hands[hand] = null;
        this.game.onFire(f, w.id, hand, 'throw');
        sfx('throw', f.pos);
      }
    }
  }

  selfPush(f, k) {
    const d = f.aimDir();
    f.vel.x -= d.x * k; f.vel.z -= d.z * k; f.vel.y -= d.y * k * 1.2;
    if (d.y < -0.4) f.onGround = false;
  }

  punch(f) {
    f.punchCd = 0.45;
    this.melee(f, null, 25, 1.9, 0.7);
    this.game.onFire(f, null, 'R');
    sfx('punch', f.pos, 0.7);
  }

  startLunge(f, w) {
    const d = f.aimDir();
    f.lunge = 0.25; f.lungeHit = new Set(); f.lungeWeapon = w.id;
    f.vel.x = d.x * 19; f.vel.z = d.z * 19; f.vel.y = Math.max(f.vel.y, d.y * 8 + 2.5);
    f.onGround = false;
    w.cd = 1.0;
    this.game.onFire(f, w.id, 'R', 'lunge');
    sfx('slash', f.pos);
  }

  updateLunge(f, dt) {
    f.lunge -= dt;
    const c = f.center();
    const def = WEAPONS[f.lungeWeapon];
    for (const o of this.game.fighters) {
      if (!o.alive || !this.isEnemy(f, o) || f.lungeHit.has(o)) continue;
      const oc = o.center();
      if (Math.hypot(oc.x - c.x, oc.y - c.y, oc.z - c.z) < 1.9) {
        f.lungeHit.add(o);
        const d = f.forward();
        this.damage(o, def.lungeDamage, f, f.lungeWeapon, { knock: { x: d.x * 6, y: 3, z: d.z * 6 }, lunge: true });
        this.fx.blood(oc, d);
      }
    }
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

  hitscan(f, weaponId, hand, pellets, spread, damage, range, opts) {
    const def = WEAPONS[weaponId];
    const eye = this.eye(f), aim = f.aimDir(), muz = this.muzzlePos(f, hand);
    const dmgBy = new Map();
    for (let i = 0; i < pellets; i++) {
      const d = spreadDir(aim, spread);
      const h = this.trace(eye, d, range, f);
      this.fx.tracer(muz, h.point, pellets > 1 ? 0.012 : 0.02);
      if (h.fighter) {
        const head = h.part === 'head';
        const prev = dmgBy.get(h.fighter) || { amt: 0, head: false };
        prev.amt += damage * (head ? def.head || 1 : 1); prev.head ||= head;
        dmgBy.set(h.fighter, prev);
        this.fx.blood(h.point, d);
      } else if (h.normal) this.fx.impact(h.point, h.normal);
    }
    for (const [victim, { amt, head }] of dmgBy) {
      const knock = pellets > 1 ? { x: aim.x * amt * 0.04, y: 1, z: aim.z * amt * 0.04 } : null;
      this.damage(victim, amt, f, weaponId, { head, knock, noscope: opts.noscope });
    }
  }

  melee(f, weaponId, damage, range, arc) {
    const eye = this.eye(f), aim = f.aimDir();
    let best = null, bd = Infinity;
    for (const o of this.game.fighters) {
      if (!o.alive || !this.isEnemy(f, o)) continue;
      const c = o.center();
      c.y = Math.max(o.pos.y + 0.3, Math.min(o.pos.y + o.height - 0.2, eye.y));
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d > range + 0.4) continue;
      if ((dx * aim.x + dy * aim.y + dz * aim.z) / d < arc && d > 0.9) continue;
      if (!this.los(eye, c)) continue;
      if (d < bd) { bd = d; best = { o, c }; }
    }
    if (best) {
      this.damage(best.o, damage, f, weaponId, { knock: { x: aim.x * 4, y: 2, z: aim.z * 4 } });
      this.fx.blood(best.c, aim);
      return true;
    }
    const h = this.world.raycast(eye.x, eye.y, eye.z, aim.x, aim.y, aim.z, range);
    if (h) this.fx.impact(v3(eye.x + aim.x * h.t, eye.y + aim.y * h.t, eye.z + aim.z * h.t), v3(h.nx, h.ny, h.nz));
    return false;
  }

  // ---------- projectiles ----------
  launch(f, weaponId, spec, dir, hand = 'R') {
    const start = this.muzzlePos(f, hand);
    const eye = this.eye(f);
    if (!this.los(eye, start)) Object.assign(start, eye);
    const mesh = buildProjectileMesh(spec.mesh, WEAPONS[weaponId].paint);
    mesh.position.set(start.x, start.y, start.z);
    this.game.scene.add(mesh);
    const p = {
      owner: f, weaponId, spec, mesh, pos: start, age: 0, life: spec.life || 5, fuse: spec.fuse ?? null,
      vel: v3(dir.x * spec.speed + f.vel.x * 0.2, dir.y * spec.speed + (spec.gravity ? f.vel.y * 0.2 : 0), dir.z * spec.speed + f.vel.z * 0.2),
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
      const s = p.spec;
      p.vel.y -= (s.gravity || 0) * dt;
      const sx = p.vel.x * dt, sy = p.vel.y * dt, sz = p.vel.z * dt;
      const len = Math.hypot(sx, sy, sz);
      if (len < 1e-6) continue;
      const dx = sx / len, dy = sy / len, dz = sz / len, r = s.radius;
      const wh = this.world.raycast(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, len + r);
      let best = wh ? Math.max(0, wh.t - r) : Infinity, hitF = null, part = null;
      for (const f of this.game.fighters) {
        if (!f.alive || (f === p.owner && p.age < 0.25)) continue;
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
        if (this.hitWorld(p, v3(wh.nx, wh.ny, wh.nz))) continue;
      } else { p.pos.x += sx; p.pos.y += sy; p.pos.z += sz; }
      p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.thrown) { p.mesh.rotation.x += dt * 14; p.mesh.rotation.y += dt * 5; }
      else if (s.mesh === 'rocket') p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
      if (p.pos.y < this.world.killY - 5) this.removeProjectile(p);
    }
  }

  hitFighter(p, f, part) {
    if (p.thrown) {
      // thrown gun: 25 damage, knocks back, makes the victim drop their gun
      this.damage(f, 25, p.owner, p.weaponId, { thrown: true, knock: { x: p.vel.x * 0.25, y: 2.5, z: p.vel.z * 0.25 } });
      f.stun = 0.25;
      if (f.alive && f.hands.R) this.dropHand(f, 'R');
      this.fx.blood(p.pos, p.vel);
      sfx('punch', p.pos);
      p.vel.x *= -0.2; p.vel.z *= -0.2; p.vel.y = 2;
      return;
    }
    if (p.spec.explode) { this.explodeProjectile(p, f); return; }
    const def = WEAPONS[p.weaponId];
    const head = part === 'head';
    this.damage(f, def.damage * (head ? def.head || 1 : 1), p.owner, p.weaponId, { head });
    this.removeProjectile(p);
  }

  hitWorld(p, n) {
    if (p.thrown) {
      if (n.y > 0.5) { this.landThrown(p); return true; }
      this.reflect(p, n, 0.3);
      return false;
    }
    if (p.spec.fuse) { this.reflect(p, n, p.spec.bounce || 0.4); sfx('click', p.pos, 0.5); return false; }
    if (p.spec.explode) { this.explodeProjectile(p); return true; }
    this.fx.impact(p.pos, n);
    this.removeProjectile(p);
    return true;
  }

  reflect(p, n, k) {
    const dot = p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z;
    p.vel.x = (p.vel.x - 2 * dot * n.x) * k; p.vel.y = (p.vel.y - 2 * dot * n.y) * k; p.vel.z = (p.vel.z - 2 * dot * n.z) * k;
    p.pos.x += n.x * 0.02; p.pos.y += n.y * 0.02; p.pos.z += n.z * 0.02;
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
      if (d > radius && f !== direct) continue;
      if (f !== direct && d > 1.2 && !this.los(pos, c)) continue;
      const k = Math.max(0, 1 - d / radius);
      const self = f === owner;
      // self-damage is small so rocket jumps stay usable
      const amt = self ? 25 * k : (f === direct ? damage : damage * k * k);
      if (!self && owner && !this.isEnemy(owner, f)) continue;
      const push = (self ? 16 : 10) * k + 2;
      this.damage(f, amt, owner, weaponId, { knock: { x: dx / d * push, y: Math.max(dy / d * push, 0) + 6 * k, z: dz / d * push }, explosion: true, self });
    }
  }

  removeProjectile(p) {
    this.game.scene.remove(p.mesh);
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
  }

  // ---------- pickups ----------
  throwWeapon(f, hand) {
    const w = f.hands[hand];
    if (!w) return;
    if (w.def.hands === 2) f.hands.L = null;
    f.hands[hand] = null;
    const mesh = buildWeaponModel(w.id);
    mesh.scale.setScalar(1.4);
    const d = f.aimDir();
    const start = this.muzzlePos(f, hand);
    if (!this.los(this.eye(f), start)) Object.assign(start, this.eye(f));
    mesh.position.set(start.x, start.y, start.z);
    this.game.scene.add(mesh);
    this.projectiles.push({
      owner: f, weaponId: w.id, spec: { gravity: 16, radius: 0.18, life: 8 }, mesh, pos: start, thrown: true, inst: w,
      vel: v3(d.x * 20 + f.vel.x * 0.3, d.y * 20 + 2.5, d.z * 20 + f.vel.z * 0.3), life: 8, fuse: null, age: 0,
    });
    sfx('throw', f.pos);
    this.game.onFire(f, w.id, hand, 'throw');
  }

  landThrown(p) {
    this.removeProjectile(p);
    if (p.inst.ammo > 0) this.spawnPickup(p.inst, p.pos, null);
    else this.fx.dust(p.pos);
  }

  spawnPickup(inst, pos, spawner) {
    const mesh = buildWeaponModel(inst.id);
    mesh.scale.setScalar(1.6);
    mesh.position.set(pos.x, pos.y + 0.55, pos.z);
    this.game.scene.add(mesh);
    const pk = { inst, pos: { ...pos }, mesh, spawner, t: Math.random() * 6 };
    this.pickups.push(pk);
    return pk;
  }

  dropHand(f, hand) {
    const w = f.hands[hand];
    if (!w) return;
    f.hands[hand] = null;
    if (w.ammo <= 0) return;
    const g = this.world.groundBelow(f.pos.x, f.pos.y + 1, f.pos.z);
    if (g !== null) this.spawnPickup(w, { x: f.pos.x, y: g, z: f.pos.z }, null);
  }

  dropAll(f) { this.dropHand(f, 'R'); this.dropHand(f, 'L'); }

  nearestPickup(f, maxD) {
    let best = null, bd = maxD;
    for (const pk of this.pickups) {
      const d = Math.hypot(pk.pos.x - f.pos.x, (pk.pos.y - f.pos.y) * 0.7, pk.pos.z - f.pos.z);
      if (d < bd) { bd = d; best = pk; }
    }
    return best;
  }

  // F: pick up the nearest weapon, or drop what you hold
  interact(f) {
    const pk = this.nearestPickup(f, 2.4);
    if (pk) { this.take(f, pk); return; }
    if (f.hands.L) this.dropHand(f, 'L'); else this.dropHand(f, 'R');
  }

  tryPickup(f) {
    const pk = this.nearestPickup(f, 1.4);
    if (pk) this.take(f, pk);
  }

  take(f, pk) {
    const w = pk.inst, R = f.hands.R;
    if (w.def.hands === 2) { this.dropAll(f); f.hands.R = w; }
    else if (!R) f.hands.R = w;
    else if (R.def.hands === 1 && !f.hands.L) f.hands.L = w;
    else { this.dropHand(f, 'R'); f.hands.R = w; }
    w.cd = Math.max(w.cd, 0.2);
    this.game.scene.remove(pk.mesh);
    this.pickups.splice(this.pickups.indexOf(pk), 1);
    if (pk.spawner) { pk.spawner.pickup = null; pk.spawner.respawn = 12; }
    sfx('pickup', f.pos, f.isBot ? 0.5 : 0.8);
  }

  updatePickups(dt) {
    for (const pk of this.pickups) {
      pk.t += dt;
      pk.mesh.rotation.y += dt * 1.4;
      pk.mesh.position.y = pk.pos.y + 0.55 + Math.sin(pk.t * 2.2) * 0.06;
    }
  }

  // ---------- damage ----------
  damage(victim, amount, attacker, weaponId, opts = {}) {
    if (!victim.alive || !this.game.damageEnabled || amount <= 0) return;
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

export { newWeaponInstance };
