import { WEAPONS } from './weapons.js';

const DIFF = [
  { reaction: 0.55, aimErr: 0.1, turn: 5, fireCone: 0.12, moveSkill: 0.3, headChance: 0.05 },
  { reaction: 0.32, aimErr: 0.055, turn: 8.5, fireCone: 0.07, moveSkill: 0.6, headChance: 0.18 },
  { reaction: 0.18, aimErr: 0.028, turn: 13, fireCone: 0.045, moveSkill: 0.95, headChance: 0.35 },
];
const PREF_RANGE = { pompa: 5, strizh: 9, shilo: 12, baraban: 14, otboinik: 10, kochegar: 16, zhuravl: 28, hlopushka: 12, limonka: 11, tesak: 0, klinok: 0 };

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
    this.target = null; this.visible = false; this.seenT = 0; this.strafe = 1; this.strafeT = 0;
    this.err = { y: 0, p: 0 }; this.errT = 0; this.prev = {};
    this.stuckT = 0; this.lastPos = null; this.unstick = 0;
    this.slideT = 0; this.thinkSlow = 0; this.cook = 0;
    this.yaw = this.f.yaw; this.pitch = 0;
    this.pick = null; this.pickT = 0; this.badPicks = new WeakMap();
  }

  press(name, v) { const was = this.prev[name]; this.prev[name] = v; return v && !was; }

  think(dt, game) {
    const f = this.f, D = this.d, combat = game.combat;
    const out = { mx: 0, mz: 0, fwdAmount: 1, sprint: true, jumpPressed: false, jump: false, crouch: false, crouchPressed: false, fire: false, firePressed: false, alt: false, altPressed: false, pickupPressed: false, throwPressed: false, lean: 0, yaw: this.yaw, pitch: this.pitch };
    if (!f.alive) return out;
    const eye = { x: f.pos.x, y: f.eyeY, z: f.pos.z };
    const R = f.hands.R, Lh = f.hands.L;
    const wid = R ? R.id : null;
    const def = wid ? WEAPONS[wid] : null;

    // ---- target ----
    this.thinkSlow -= dt;
    if (this.thinkSlow <= 0 || !this.target || !this.target.alive) {
      this.thinkSlow = 0.25;
      let best = null, bs = Infinity, vis = false;
      for (const o of game.fighters) {
        if (!o.alive || !combat.isEnemy(f, o)) continue;
        const c = o.center();
        const d = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
        const v = combat.los(eye, { x: c.x, y: o.pos.y + o.height - 0.2, z: c.z }) || combat.los(eye, c);
        const score = d - (v ? 30 : 0);
        if (score < bs) { bs = score; best = o; vis = v; }
      }
      if (best !== this.target) this.seenT = 0;
      this.target = best; this.visible = vis;
    }
    const T = this.target;
    if (this.visible) this.seenT += dt; else this.seenT = Math.max(0, this.seenT - dt * 2);
    let tDist = Infinity;
    if (T) { const c = T.center(); tDist = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z); }

    // ---- goal ----
    const empty = R && R.ammo <= 0;
    const needWeapon = !R || empty;
    let goal = null;
    if (needWeapon && combat.pickups.length && !(T && this.visible && tDist < 4)) {
      this.pickT -= dt;
      if (this.pickT <= 0 || !this.pick || !combat.pickups.includes(this.pick)) {
        this.pickT = 0.7;
        const from = game.nav.nearest(f.pos.x, f.pos.y, f.pos.z);
        const sorted = combat.pickups.filter((pk) => !(this.badPicks.get(pk) > game.time))
          .sort((a, b) => Math.hypot(a.pos.x - f.pos.x, a.pos.y - f.pos.y, a.pos.z - f.pos.z) - Math.hypot(b.pos.x - f.pos.x, b.pos.y - f.pos.y, b.pos.z - f.pos.z));
        this.pick = sorted[0];
        for (const pk of sorted.slice(0, 3)) {
          if (game.nav.findPath(from, game.nav.nearest(pk.pos.x, pk.pos.y + 0.1, pk.pos.z))) { this.pick = pk; break; }
          this.badPicks.set(pk, game.time + 4);
        }
      }
      goal = this.pick && this.pick.pos;
      if (this.pick && Math.hypot(this.pick.pos.x - f.pos.x, this.pick.pos.z - f.pos.z) < 1.8 && R) out.pickupPressed = this.press('pick', true); else this.press('pick', false);
    } else if (T) goal = T.pos;

    let wish = { x: 0, z: 0 };
    if (goal) {
      this.replan -= dt;
      if (this.replan <= 0 || !this.path || (this.goal && Math.hypot(this.goal.x - goal.x, this.goal.z - goal.z) > 3)) {
        this.replan = 0.45 + Math.random() * 0.2;
        this.goal = { ...goal };
        this.path = game.nav.findPath(game.nav.nearest(f.pos.x, f.pos.y, f.pos.z), game.nav.nearest(goal.x, goal.y, goal.z));
        this.pathI = this.path && this.path.length > 1 ? 1 : 0;
      }
      let wp = null;
      if (this.path && this.path.length) {
        while (this.pathI < this.path.length - 1) {
          const n = this.path[this.pathI];
          if (Math.hypot(n.x - f.pos.x, n.z - f.pos.z) < 0.9 && Math.abs(n.y - f.pos.y) < 1.4) {
            this.pathI++;
            if (game.nav.isJump(n, this.path[this.pathI]) && f.onGround) out.jumpPressed = true;
          } else break;
        }
        wp = this.path[Math.min(this.pathI, this.path.length - 1)];
      }
      const tgt = wp && Math.hypot(goal.x - f.pos.x, goal.z - f.pos.z) > 1.6 ? wp : goal;
      const dx = tgt.x - f.pos.x, dz = tgt.z - f.pos.z, dl = Math.hypot(dx, dz);
      if (dl > 0.2) wish = { x: dx / dl, z: dz / dl };
      if (wp && wp.y - f.pos.y > 0.55 && Math.hypot(wp.x - f.pos.x, wp.z - f.pos.z) < 2.4 && f.onGround) { out.jumpPressed = true; out.jump = true; }
      // slide on long runs (and keep sliding downhill)
      if (f.onGround && f.horizSpeed > 6.8 && dl > 7 && f.slideCd <= 0 && Math.random() < dt * D.moveSkill * 1.2) this.slideT = 0.8;
    }

    // ---- combat movement ----
    const pref = PREF_RANGE[wid] ?? 10;
    if (T && this.visible && !needWeapon) {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.5 + Math.random(); }
      const dx = T.pos.x - f.pos.x, dz = T.pos.z - f.pos.z, dl = Math.hypot(dx, dz) || 1;
      const fx = dx / dl, fz = dz / dl;
      if (pref === 0 || dl > pref + 3) wish = { x: wish.x - fz * this.strafe * 0.45, z: wish.z + fx * this.strafe * 0.45 };
      else {
        const ap = Math.max(-1, Math.min(1, (dl - pref) / 4));
        wish = { x: fx * ap - fz * this.strafe, z: fz * ap + fx * this.strafe };
      }
      if (Math.random() < dt * D.moveSkill * 0.7 && f.onGround) out.jumpPressed = true;
      if (f.onGround && f.horizSpeed > 5 && f.slideCd <= 0 && Math.random() < dt * D.moveSkill * 0.5) this.slideT = 0.5;
      out.sprint = pref === 0 || dl > pref;
    }
    // slide jump at the end of a slide; wall jump when airborne next to a wall
    if (f.state === 'slide' && f.stateT > 0.35 && Math.random() < dt * D.moveSkill * 4) out.jumpPressed = true;
    if (!f.onGround && f.vel.y < 1.5 && f.wallJumpsUsed < f.mods().wallJumps && Math.random() < dt * D.moveSkill * 3 && f.probeWall(game.world, 0.4)) out.jumpPressed = true;

    // ---- edge safety / stuck ----
    const wl = Math.hypot(wish.x, wish.z);
    if (wl > 0.01) {
      wish.x /= wl; wish.z /= wl;
      const g = game.world.groundBelow(f.pos.x + wish.x * 1.3, f.pos.y + 0.6, f.pos.z + wish.z * 1.3);
      const goalBelow = this.goal && this.goal.y < f.pos.y - 1;
      if (f.onGround && (g === null || g < game.world.killY + 3 || (f.pos.y - g > 4.5 && !goalBelow))) { wish.x *= -0.3; wish.z *= -0.3; }
    }
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (this.lastPos && wl > 0.1 && Math.hypot(f.pos.x - this.lastPos.x, f.pos.z - this.lastPos.z) < 0.6) {
        this.unstick = 0.6; this.replan = 0;
        this.unstickDir = { x: -wish.z * (Math.random() < 0.5 ? 1 : -1), z: wish.x };
        out.jumpPressed = true; out.jump = true;
      }
      this.lastPos = { x: f.pos.x, z: f.pos.z };
      this.stuckT = 0;
    }
    if (this.unstick > 0) { this.unstick -= dt; wish = { x: wish.x * 0.4 + this.unstickDir.x, z: wish.z * 0.4 + this.unstickDir.z }; }
    out.mx = wish.x; out.mz = wish.z;
    if (this.slideT > 0) { this.slideT -= dt; out.crouch = true; out.crouchPressed = this.press('crouch', true); } else this.press('crouch', false);

    // ---- aim ----
    let desiredYaw = this.yaw, desiredPitch = 0;
    if (T && (this.visible || this.seenT > 0)) {
      const head = Math.random() < D.headChance;
      const tp = { x: T.pos.x, y: T.pos.y + (head ? T.height - 0.15 : T.height * 0.55), z: T.pos.z };
      const dist = Math.hypot(tp.x - eye.x, tp.y - eye.y, tp.z - eye.z);
      const proj = def && def.projectile;
      if (proj) {
        const tt = dist / proj.speed;
        tp.x += T.vel.x * tt; tp.z += T.vel.z * tt;
        if (proj.gravity) tp.y += 0.5 * proj.gravity * tt * tt * 0.8;
        if (wid === 'hlopushka' && T.onGround) tp.y = T.pos.y + 0.2;
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
    } else if (wl > 0.1) desiredYaw = Math.atan2(-wish.x, -wish.z);
    const dyaw = angDiff(this.yaw, desiredYaw);
    const mt = D.turn * dt;
    this.yaw += Math.max(-mt, Math.min(mt, dyaw));
    this.pitch += Math.max(-mt, Math.min(mt, desiredPitch - this.pitch));
    out.yaw = this.yaw; out.pitch = this.pitch;

    // ---- fire ----
    let fire = false, alt = false;
    const canSee = T && this.visible && this.seenT > D.reaction && Math.abs(dyaw) < D.fireCone + (def && def.pellets ? 0.05 : 0);
    if (canSee) {
      if (!def) fire = tDist < 2.2;
      else if (def.kind === 'melee') { fire = tDist < def.range + 0.3; if (tDist > 3.5 && tDist < 8 && Math.random() < dt * 1.5) { alt = true; fire = true; } }
      else if (def.kind === 'grenade') { this.cook += dt; fire = this.cook < 1.2 && tDist < 22; if (!fire) this.cook = 0; }
      else fire = tDist < (def.range || 60) || empty;
      if (empty) fire = tDist < 14;
      if (def && def.alt === 'zoom' && tDist > 12) alt = true;
      if (wid === 'zhuravl' && tDist > 12 && !R.zoomed) fire = false;
    } else this.cook = 0;
    out.fire = fire;
    out.firePressed = this.press('fire', fire) || (fire && def && !def.auto && def.kind !== 'grenade' && R.cd <= 0 && Math.random() < 0.5);
    // left hand fires with the right one
    if (Lh) { out.alt = fire; out.altPressed = out.firePressed; }
    else { out.alt = alt; out.altPressed = this.press('alt', alt); }
    if (empty && !(T && this.visible && tDist < 14)) out.throwPressed = this.press('throw', true); else this.press('throw', false);
    return out;
  }
}
