import { WEAPONS } from './weapons.js';

const DIFF = [
  { reaction: 0.6, aimErr: 0.11, turn: 4.5, fireCone: 0.12, moveSkill: 0.25, headChance: 0.05 },
  { reaction: 0.36, aimErr: 0.06, turn: 8, fireCone: 0.07, moveSkill: 0.55, headChance: 0.2 },
  { reaction: 0.2, aimErr: 0.03, turn: 13, fireCone: 0.045, moveSkill: 0.9, headChance: 0.4 },
];

const PREF_RANGE = { shotgun: 5, doublebarrel: 4, smg: 9, pistol: 12, revolver: 15, rifle: 16, sniper: 28, minigun: 12, rocket: 13, grenade: 12, crossbow: 20, katana: 0, knife: 0, fists: 0, harpoon: 12, resonator: 6, bouncer: 10, tesla: 12, stickymine: 6 };

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class BotBrain {
  constructor(f, difficulty = 1) {
    this.f = f;
    this.d = DIFF[difficulty] || DIFF[1];
    this.reset();
  }

  reset() {
    this.path = null; this.pathI = 0; this.replan = 0; this.goal = null;
    this.target = null; this.seenT = 0; this.strafe = 1; this.strafeT = 0;
    this.err = { y: 0, p: 0 }; this.errT = 0;
    this.prev = {}; this.stuckT = 0; this.lastPos = null; this.unstick = 0;
    this.slideT = 0; this.altHold = 0; this.jumpT = 0; this.yaw = this.f.yaw; this.pitch = 0;
    this.thinkSlow = 0;
  }

  press(name, v) {
    const was = this.prev[name];
    this.prev[name] = v;
    return v && !was;
  }

  think(dt, game) {
    const f = this.f, D = this.d, combat = game.combat;
    const out = { mx: 0, mz: 0, jumpPressed: false, crouch: false, crouchPressed: false, rollPressed: false, fire: false, firePressed: false, alt: false, altPressed: false, pickupPressed: false, throwPressed: false, lean: 0, yaw: this.yaw, pitch: this.pitch };
    if (!f.alive) return out;
    const eye = { x: f.pos.x, y: f.eyeY, z: f.pos.z };
    const wid = f.weapon ? f.weapon.id : 'fists';
    const def = WEAPONS[wid];
    const w = f.weapon || f.fists;

    // ---- target selection ----
    this.thinkSlow -= dt;
    if (this.thinkSlow <= 0 || !this.target || !this.target.alive) {
      this.thinkSlow = 0.25;
      let best = null, bd = Infinity, vis = false;
      for (const o of game.fighters) {
        if (!o.alive || !combat.isEnemy(f, o)) continue;
        const c = o.center();
        const d = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
        const v = combat.los(eye, { x: c.x, y: o.pos.y + o.height - 0.2, z: c.z }) || combat.los(eye, c);
        const score = d - (v ? 30 : 0);
        if (score < bd) { bd = score; best = o; vis = v; }
      }
      if (best !== this.target) this.seenT = 0;
      this.target = best;
      this.visible = vis;
    }
    const T = this.target;
    if (this.visible) this.seenT += dt; else this.seenT = Math.max(0, this.seenT - dt * 2);

    // ---- movement goal ----
    let goal = null;
    const needWeapon = !f.weapon || (w.ammo <= 0);
    let tDist = Infinity;
    if (T) { const c = T.center(); tDist = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z); }
    if (needWeapon && combat.pickups.length && !(T && this.visible && tDist < 5)) {
      // nearest pickup that the nav graph can actually reach
      this.pickT = (this.pickT || 0) - dt;
      if (this.pickT <= 0 || !this.pick || !combat.pickups.includes(this.pick)) {
        this.pickT = 0.7;
        this.badPicks ||= new WeakMap();
        const now = game.time;
        const from = game.nav.nearest(f.pos.x, f.pos.y, f.pos.z);
        const sorted = combat.pickups.filter((pk) => !(this.badPicks.get(pk) > now)).sort((a, b) => Math.hypot(a.pos.x - f.pos.x, a.pos.y - f.pos.y, a.pos.z - f.pos.z) - Math.hypot(b.pos.x - f.pos.x, b.pos.y - f.pos.y, b.pos.z - f.pos.z));
        this.pick = sorted[0];
        for (const pk of sorted.slice(0, 3)) {
          if (game.nav.findPath(from, game.nav.nearest(pk.pos.x, pk.pos.y + 0.1, pk.pos.z))) { this.pick = pk; break; }
          this.badPicks.set(pk, now + 4); // unreachable from here: skip for a while
        }
      }
      goal = this.pick && this.pick.pos;
      if (f.weapon && w.ammo <= 0 && !(T && this.visible && tDist < 14)) out.throwPressed = this.press('throw', true); else this.press('throw', false);
    } else if (T) {
      goal = T.pos;
    }

    let wish = { x: 0, z: 0 };
    if (goal) {
      this.replan -= dt;
      if (this.replan <= 0 || !this.path || (this.goal && Math.hypot(this.goal.x - goal.x, this.goal.z - goal.z) > 3)) {
        this.replan = 0.45 + Math.random() * 0.2;
        this.goal = { x: goal.x, y: goal.y, z: goal.z };
        const a = game.nav.nearest(f.pos.x, f.pos.y, f.pos.z), b = game.nav.nearest(goal.x, goal.y, goal.z);
        this.path = game.nav.findPath(a, b);
        this.pathI = this.path && this.path.length > 1 ? 1 : 0;
      }
      let wp = null;
      if (this.path && this.path.length) {
        while (this.pathI < this.path.length - 1) {
          const n = this.path[this.pathI];
          if (Math.hypot(n.x - f.pos.x, n.z - f.pos.z) < 0.9 && Math.abs(n.y - f.pos.y) < 1.4) {
            this.pathI++;
            // running jump across a gap, diving mid-air if it falls short
            if (game.nav.isJump(n, this.path[this.pathI]) && f.onGround) { out.jumpPressed = true; this.gapT = 0.9; }
          } else break;
        }
        wp = this.path[Math.min(this.pathI, this.path.length - 1)];
      }
      this.gapT = (this.gapT || 0) - dt;
      if (this.gapT > 0 && !f.onGround && f.vel.y < 1.5 && !f.airDiveUsed && f.rollCd <= 0) out.rollPressed = true;
      const tgt = wp && Math.hypot(goal.x - f.pos.x, goal.z - f.pos.z) > 1.6 ? wp : goal;
      const dx = tgt.x - f.pos.x, dz = tgt.z - f.pos.z, dl = Math.hypot(dx, dz);
      if (dl > 0.2) wish = { x: dx / dl, z: dz / dl };
      if (wp && wp.y - f.pos.y > 0.6 && Math.hypot(wp.x - f.pos.x, wp.z - f.pos.z) < 2.6 && f.onGround) out.jumpPressed = true;
      // slide on long straight runs
      if (f.onGround && f.horizSpeed > 6.5 && dl > 6 && Math.random() < dt * D.moveSkill * 0.8 && !this.visible) this.slideT = 0.7;
    }

    // ---- combat movement ----
    const pref = PREF_RANGE[wid] ?? 10;
    if (T && this.visible && !needWeapon) {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.5 + Math.random() * 1.1; }
      const dx = T.pos.x - f.pos.x, dz = T.pos.z - f.pos.z, dl = Math.hypot(dx, dz) || 1;
      const fx = dx / dl, fz = dz / dl;
      const approach = pref === 0 ? 1 : Math.max(-1, Math.min(1, (dl - pref) / 4));
      if (pref === 0 || dl > pref + 3) {
        // keep following the path but add strafe
        wish = { x: wish.x + -fz * this.strafe * 0.45, z: wish.z + fx * this.strafe * 0.45 };
      } else {
        wish = { x: fx * approach + -fz * this.strafe, z: fz * approach + fx * this.strafe };
      }
      if (Math.random() < dt * D.moveSkill * 0.5 && f.onGround) out.jumpPressed = true;
      if (Math.random() < dt * D.moveSkill * 0.35 && f.rollCd <= 0) out.rollPressed = true;
      if (pref > 0 && dl < pref && Math.random() < dt * D.moveSkill * 0.4 && f.horizSpeed > 5.5) this.slideT = 0.6;
    }

    // wall bounce when airborne next to a wall
    if (!f.onGround && f.vel.y < 2 && f.wallBounces < 2 && Math.random() < dt * D.moveSkill * 3) {
      if (f.probeWall(game.world)) out.jumpPressed = true;
    }

    // ---- edge safety & stuck handling ----
    const wl = Math.hypot(wish.x, wish.z);
    if (wl > 0.01) {
      wish.x /= wl; wish.z /= wl;
      const ax = f.pos.x + wish.x * 1.3, az = f.pos.z + wish.z * 1.3;
      const g = game.world.groundBelow(ax, f.pos.y + 0.6, az);
      const goalBelow = this.goal && this.goal.y < f.pos.y - 1;
      if (f.onGround && (g === null || g < game.world.killY + 3 || (f.pos.y - g > 4.5 && !goalBelow))) { wish.x = -wish.x * 0.3; wish.z = -wish.z * 0.3; }
    }
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (this.lastPos && wl > 0.1 && Math.hypot(f.pos.x - this.lastPos.x, f.pos.z - this.lastPos.z) < 0.6) {
        this.unstick = 0.6; this.replan = 0;
        this.unstickDir = { x: -wish.z * (Math.random() < 0.5 ? 1 : -1), z: wish.x };
        out.jumpPressed = true;
      }
      this.lastPos = { x: f.pos.x, z: f.pos.z };
      this.stuckT = 0;
    }
    if (this.unstick > 0) { this.unstick -= dt; wish = { x: wish.x * 0.4 + this.unstickDir.x, z: wish.z * 0.4 + this.unstickDir.z }; }
    out.mx = wish.x; out.mz = wish.z;

    if (this.slideT > 0) { this.slideT -= dt; out.crouch = true; out.crouchPressed = this.press('crouch', true); } else this.press('crouch', false);

    // ---- aiming ----
    let desiredYaw = this.yaw, desiredPitch = 0;
    if (T && (this.visible || this.seenT > 0)) {
      const aimHead = Math.random() < D.headChance;
      const tp = { x: T.pos.x, y: T.pos.y + (aimHead ? T.height - 0.15 : T.height * 0.55), z: T.pos.z };
      const dist = Math.hypot(tp.x - eye.x, tp.y - eye.y, tp.z - eye.z);
      const proj = def.projectile;
      if (proj && def.kind !== 'melee') {
        const tt = dist / proj.speed;
        tp.x += T.vel.x * tt; tp.z += T.vel.z * tt; tp.y += (T.onGround ? 0 : T.vel.y * tt * 0.5);
        if (proj.gravity) tp.y += 0.5 * proj.gravity * tt * tt * (def.kind === 'throwable' ? 0.7 : 1);
        if (wid === 'rocket' && T.onGround) tp.y = T.pos.y + 0.2;
      }
      const dx = tp.x - eye.x, dy = tp.y - eye.y, dz = tp.z - eye.z;
      desiredYaw = Math.atan2(-dx, -dz);
      desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.errT -= dt;
      if (this.errT <= 0) {
        this.errT = 0.3 + Math.random() * 0.4;
        const e = D.aimErr * (1 + 2 / (1 + this.seenT * 3)) * (f.horizSpeed > 6 ? 1.3 : 1);
        this.err = { y: (Math.random() - 0.5) * 2 * e, p: (Math.random() - 0.5) * e };
      }
      desiredYaw += this.err.y; desiredPitch += this.err.p;
    } else if (wl > 0.1) {
      desiredYaw = Math.atan2(-wish.x, -wish.z);
    }
    const dyaw = angDiff(this.yaw, desiredYaw);
    const maxT = D.turn * dt;
    this.yaw += Math.max(-maxT, Math.min(maxT, dyaw));
    this.pitch += Math.max(-maxT, Math.min(maxT, desiredPitch - this.pitch));
    out.yaw = this.yaw; out.pitch = this.pitch;

    // ---- firing ----
    let fire = false, alt = false;
    if (T && this.visible && this.seenT > D.reaction && Math.abs(dyaw) < D.fireCone + (def.pellets ? 0.06 : 0)) {
      const range = def.range || (def.projectile ? 60 : 30);
      if (def.kind === 'melee') fire = tDist < def.range + 0.3;
      else if (tDist < range) fire = true;
      if (w.ammo <= 0 && f.weapon) fire = tDist < 14; // throw the empty gun at them
      // abilities
      switch (def.alt) {
        case 'zoom': alt = tDist > 12; break;
        case 'spin': alt = tDist < 30; break;
        case 'lunge': if (tDist > 3.5 && tDist < 9 && Math.random() < dt * 2) alt = true; break;
        case 'throwknife': if (tDist > 5 && tDist < 16 && Math.random() < dt * 0.6) alt = true; break;
        case 'overload': if (tDist < 5 && w.ammo >= 5) alt = true; break;
        case 'both': if (tDist < 6) { alt = true; fire = false; } break;
        case 'slug': if (tDist > 18) { alt = true; fire = false; } break;
        case 'fan': if (tDist < 6) alt = true; break;
        case 'shove': if (tDist < 2 && Math.random() < dt) alt = true; break;
        case 'remote': if (combat.projectiles.some((p) => p.owner === f && p.stuck && Math.hypot(p.pos.x - T.pos.x, p.pos.z - T.pos.z) < 3.5)) alt = true; break;
        case 'detonate': {
          const r = combat.projectiles.find((p) => p.owner === f && p.weaponId === 'rocket');
          if (r && Math.hypot(r.pos.x - T.pos.x, r.pos.y - T.pos.y, r.pos.z - T.pos.z) < 3) alt = true;
          break;
        }
        default: break;
      }
      if (wid === 'sniper' && tDist > 12 && !w.zoomed) fire = false; // scope in first
    } else if (T && def.alt === 'spin' && this.seenT > 0) alt = true;
    out.fire = fire; out.firePressed = this.press('fire', fire) || (fire && !def.auto && w.cd <= 0 && Math.random() < 0.5);
    if (def.alt === 'zoom' || def.alt === 'spin') { out.alt = alt; out.altPressed = this.press('alt', alt); }
    else { out.altPressed = this.press('alt', alt); out.alt = alt; }

    // swap for a better gun lying nearby when low on ammo
    if (f.weapon && w.ammo <= 2 && combat.pickups.some((pk) => Math.hypot(pk.pos.x - f.pos.x, pk.pos.z - f.pos.z) < 2)) out.pickupPressed = this.press('pickup', true);
    else this.press('pickup', false);
    return out;
  }
}
