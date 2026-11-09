import * as K from './constants.js';

const tmp = [];

// Shared movement controller for the player and bots.
// States: normal | slide | wallrun | mantle
export class Fighter {
  constructor({ id, name, isBot = false, color = 0x8a8f7a, team = id }) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
    this.color = color;
    this.team = team;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.hands = { R: null, L: null };
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }

  reset(sp) {
    Object.assign(this.pos, { x: sp.x, y: sp.y, z: sp.z });
    Object.assign(this.vel, { x: 0, y: 0, z: 0 });
    this.yaw = sp.yaw || 0;
    this.pitch = 0;
    this.hp = K.MAX_HP;
    this.alive = true;
    this.onGround = true;
    this.groundBox = null;
    this.groundT = 1;
    this.airT = 0;
    this.state = 'normal';
    this.stateT = 0;
    this.crouching = false;
    this.height = K.STAND_H;
    this.slideCd = 0;
    this.slideDir = { x: 0, z: 1 };
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.wallJumpsUsed = 0;
    this.wallNormal = { x: 0, z: 0 };
    this.wallKick = 0;
    this.wallrunCd = 0;
    this.mantleFrom = null;
    this.lean = 0;
    this.lastHit = null;
    this.stun = 0;
    this.sprinting = false;
    this.hands = { R: null, L: null };
    this.lastSlideJump = -9;
  }

  get eyeY() { return this.pos.y + this.height - 0.14; }
  get horizSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  // Weapon modifiers (heavy guns slow you, blades speed you up)
  mods() {
    let speed = 1, jump = 1, wallJumps = 1;
    for (const w of [this.hands.R, this.hands.L]) {
      if (!w) continue;
      const d = w.def;
      speed *= d.speed ?? 1;
      jump *= d.jump ?? 1;
      wallJumps = Math.max(wallJumps, d.wallJumps ?? 1);
    }
    return { speed, jump, wallJumps };
  }

  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  aimDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  // inp: { mx, mz (world wish), fwdAmount, sprint, jumpPressed, jump, crouch, crouchPressed, lean, yaw, pitch }
  update(dt, inp, world, emit) {
    if (!this.alive) return;
    this.yaw = inp.yaw; this.pitch = inp.pitch;
    this.lean += ((inp.lean || 0) - this.lean) * Math.min(1, dt * 12);
    this.slideCd -= dt; this.coyote -= dt; this.jumpBuffer -= dt; this.stun -= dt;
    this.wallKick -= dt; this.wallrunCd -= dt;
    this.stateT += dt;
    if (inp.jumpPressed) this.jumpBuffer = 0.12;
    if (this.onGround) { this.groundT += dt; this.airT = 0; } else { this.airT += dt; this.groundT = 0; }

    const M = this.mods();
    let wx = inp.mx || 0, wz = inp.mz || 0;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    if (this.stun > 0) { wx = wz = 0; }
    const hs = this.horizSpeed;
    this.sprinting = !!inp.sprint && wl > 0.1 && (inp.fwdAmount ?? 1) > -0.1 && this.state === 'normal';

    // ----- state transitions -----
    if (this.state === 'normal' && inp.crouchPressed && this.onGround && hs > K.SLIDE_MIN_SPEED && this.slideCd <= 0) {
      this.startSlide(hs, emit);
    }

    switch (this.state) {
      case 'slide': this.updateSlide(dt, inp, world, emit); break;
      case 'wallrun': this.updateWallrun(dt, inp, world, emit); break;
      case 'mantle': this.updateMantle(dt); break;
      default: this.updateNormal(dt, inp, wx, wz, M, world, emit);
    }

    if (this.state !== 'mantle') {
      const g = this.state === 'wallrun' ? K.GRAVITY * K.WALLRUN_GRAVITY : K.GRAVITY;
      this.vel.y -= g * dt;
      if (this.vel.y < -38) this.vel.y = -38;
      this.move(world, dt, emit);
    }

    // body height
    let targetH = K.STAND_H;
    if (this.state === 'slide') targetH = K.SLIDE_H;
    else if (this.crouching) targetH = K.CROUCH_H;
    if (targetH > this.height) {
      const nh = Math.min(targetH, this.height + dt * 7);
      const R = K.RADIUS;
      if (!world.overlapAny(this.pos.x - R, this.pos.y + this.height, this.pos.z - R, this.pos.x + R, this.pos.y + nh, this.pos.z + R)) this.height = nh;
      else if (this.state === 'normal') this.crouching = true;
    } else if (targetH < this.height) this.height = Math.max(targetH, this.height - dt * 10);

    if (this.onGround && this.groundBox && this.groundBox.type === 'pad') {
      this.vel.y = K.PAD_V; this.onGround = false; this.wallJumpsUsed = 0;
      emit('pad', this);
    }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  updateNormal(dt, inp, wx, wz, M, world, emit) {
    this.crouching = !!inp.crouch && this.onGround;
    let maxSpeed = (this.sprinting ? K.SPRINT_SPEED : K.WALK_SPEED) * M.speed;
    if (this.crouching) maxSpeed = K.CROUCH_SPEED * M.speed;
    const wl = Math.hypot(wx, wz);

    if (this.onGround) {
      // Jumping within the bhop window skips friction entirely
      const hopping = this.jumpBuffer > 0 && this.groundT < K.BHOP_WINDOW;
      if (!hopping) this.friction(dt);
      if (wl > 0.01) this.accel(wx / wl, wz / wl, maxSpeed * Math.min(1, wl), K.GROUND_ACCEL, dt);
    } else if (wl > 0.01) {
      this.accel(wx / wl, wz / wl, K.AIR_WISH_CAP, K.AIR_ACCEL, dt);
    }

    if (this.jumpBuffer > 0 && this.stun <= 0) {
      if (this.onGround || this.coyote > 0) {
        this.vel.y = K.JUMP_V * Math.sqrt(M.jump);
        this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
        emit('jump', this);
      } else if (this.wallJumpsUsed < M.wallJumps) {
        const n = this.probeWall(world, 0.4);
        if (n) this.wallJump(n, wx, wz, emit);
      }
    }

    // Wall run: airborne, moving fast along a wall with movement held
    if (!this.onGround && this.wallrunCd <= 0 && this.vel.y < 4 && wl > 0.1 && this.horizSpeed > K.WALLRUN_MIN_SPEED * 0.8) {
      const n = this.probeWall(world, 0.25);
      if (n) {
        const along = Math.abs(this.vel.x * n.z - this.vel.z * n.x);
        const into = wx * n.x + wz * n.z;
        if (along > K.WALLRUN_MIN_SPEED * 0.75 && into < 0.2) {
          this.wallNormal.x = n.x; this.wallNormal.z = n.z;
          this.setState('wallrun');
          if (this.vel.y < 0) this.vel.y *= 0.2;
          emit('wallrun', this);
        }
      }
    }

    // Mantle: jump-held into a ledge in front
    if (!this.onGround && inp.jump && (inp.fwdAmount ?? 0) > 0.3 && this.vel.y < 3) this.tryMantle(world, emit);
  }

  startSlide(hs, emit) {
    const fromSprint = this.sprinting || hs > K.WALK_SPEED + 0.5;
    const boost = fromSprint ? K.SLIDE_BOOST_SPRINT : K.SLIDE_BOOST_WALK;
    const sp = Math.min(K.SLIDE_MAX, Math.max(hs, K.WALK_SPEED) + boost);
    this.slideDir.x = this.vel.x / hs; this.slideDir.z = this.vel.z / hs;
    this.vel.x = this.slideDir.x * sp; this.vel.z = this.slideDir.z * sp;
    this.slideCd = K.SLIDE_CD;
    this.setState('slide');
    emit('slide', this);
  }

  updateSlide(dt, inp, world, emit) {
    let sp = this.horizSpeed;
    // fixed direction: WASD does not steer the slide
    const dh = this.onGround ? world.downhill(this.groundBox) : null;
    if (dh) {
      // gravity along the slope accelerates downhill motion
      const a = K.GRAVITY * dh.s / Math.hypot(1, dh.s);
      this.vel.x += dh.x * a * dt; this.vel.z += dh.z * a * dt;
      sp = this.horizSpeed;
      const dot = (this.vel.x * dh.x + this.vel.z * dh.z) / Math.max(sp, 0.01);
      if (dot < 0.3) sp = Math.max(0, sp - K.SLIDE_DECEL * dt);
      this.vel.x = this.vel.x / Math.max(this.horizSpeed, 0.001) * Math.min(sp, 22);
      this.vel.z = this.vel.z / Math.max(this.horizSpeed, 0.001) * Math.min(sp, 22);
    } else if (this.onGround) {
      sp = Math.max(0, sp - K.SLIDE_DECEL * dt);
      if (this.horizSpeed > 0.01) { const k = sp / this.horizSpeed; this.vel.x *= k; this.vel.z *= k; }
    }
    const onSlope = !!dh;
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      // slide-jump: jump out of the slide with an extra burst
      const hs = this.horizSpeed || 1;
      const ns = Math.min(K.SLIDE_MAX + 2, hs + K.SLIDE_JUMP_BOOST);
      this.vel.x = this.vel.x / hs * ns; this.vel.z = this.vel.z / hs * ns;
      this.vel.y = K.JUMP_V;
      this.onGround = false; this.jumpBuffer = 0;
      this.lastSlideJump = performance.now();
      this.setState('normal');
      emit('slidejump', this);
      return;
    }
    if (!inp.crouch || this.horizSpeed < K.SLIDE_MIN_SPEED * 0.9 || (!onSlope && this.stateT > K.SLIDE_MAX_TIME) || (!this.onGround && this.airT > 0.25)) {
      this.setState('normal');
      this.crouching = !!inp.crouch;
    }
  }

  updateWallrun(dt, inp, world, emit) {
    const n = this.probeWall(world, 0.3);
    const wl = Math.hypot(inp.mx || 0, inp.mz || 0);
    if (!n || this.onGround || this.stateT > K.WALLRUN_TIME || wl < 0.1 || this.horizSpeed < K.WALLRUN_MIN_SPEED * 0.6) {
      this.setState('normal');
      this.wallrunCd = 0.35;
      return;
    }
    this.wallNormal.x = n.x; this.wallNormal.z = n.z;
    // keep speed along the wall, hug it slightly
    const tx = -n.z, tz = n.x;
    let along = this.vel.x * tx + this.vel.z * tz;
    const sgn = Math.sign(along) || 1;
    along = sgn * Math.max(Math.abs(along), K.WALLRUN_MIN_SPEED);
    this.vel.x = tx * along - n.x * 0.6; this.vel.z = tz * along - n.z * 0.6;
    if (this.jumpBuffer > 0) {
      this.wallJump(n, inp.mx || 0, inp.mz || 0, emit, true);
      this.wallrunCd = 0.3;
    }
  }

  wallJump(n, wx, wz, emit, fromRun = false) {
    const vn = this.vel.x * n.x + this.vel.z * n.z;
    if (vn < 0) { this.vel.x -= n.x * vn; this.vel.z -= n.z * vn; }
    this.vel.x += n.x * K.WALLJUMP_OUT + wx * 1.5;
    this.vel.z += n.z * K.WALLJUMP_OUT + wz * 1.5;
    if (fromRun) { const hs = this.horizSpeed; const k = (hs + 1.2) / hs; this.vel.x *= k; this.vel.z *= k; }
    this.vel.y = K.WALLJUMP_UP * Math.sqrt(this.mods().jump);
    this.wallJumpsUsed++;
    this.wallNormal.x = n.x; this.wallNormal.z = n.z;
    this.wallKick = 0.35;
    this.jumpBuffer = 0;
    this.setState('normal');
    emit('walljump', this);
  }

  tryMantle(world, emit) {
    const f = this.forward(), R = K.RADIUS, p = this.pos;
    const ax = p.x + f.x * (R + 0.35), az = p.z + f.z * (R + 0.35);
    // wall in front at chest height and free space above a ledge
    if (!world.raycast(p.x, p.y + 0.9, p.z, f.x, 0, f.z, R + 0.4)) return;
    const top = world.groundBelow(ax, p.y + 2.1, az, 2.1);
    if (top === null) return;
    const rise = top - p.y;
    if (rise < 0.5 || rise > 1.9) return;
    if (world.overlapAny(ax - R, top + 0.02, az - R, ax + R, top + K.CROUCH_H, az + R)) return;
    this.mantleFrom = { x: p.x, y: p.y, z: p.z };
    this.mantleTo = { x: ax, y: top + 0.01, z: az };
    this.vel.x = f.x * 2; this.vel.z = f.z * 2; this.vel.y = 0;
    this.setState('mantle');
    emit('mantle', this);
  }

  updateMantle(dt) {
    const t = Math.min(1, this.stateT / 0.28);
    const a = this.mantleFrom, b = this.mantleTo;
    const e = t * t * (3 - 2 * t);
    this.pos.x = a.x + (b.x - a.x) * Math.max(0, (e - 0.4) / 0.6);
    this.pos.z = a.z + (b.z - a.z) * Math.max(0, (e - 0.4) / 0.6);
    this.pos.y = a.y + (b.y - a.y) * Math.min(1, e / 0.6);
    void dt;
    if (t >= 1) { this.setState('normal'); this.onGround = true; this.groundT = 0; this.vel.y = 0; this.wallJumpsUsed = 0; }
  }

  friction(dt) {
    const sp = this.horizSpeed;
    if (sp < 0.001) return;
    const drop = Math.max(sp, K.STOP_SPEED) * K.FRICTION * dt;
    const k = Math.max(0, sp - drop) / sp;
    this.vel.x *= k; this.vel.z *= k;
  }

  accel(wx, wz, wishSpeed, a, dt) {
    const cur = this.vel.x * wx + this.vel.z * wz;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const as = Math.min(a * dt * Math.max(wishSpeed, 1), add);
    this.vel.x += wx * as; this.vel.z += wz * as;
  }

  probeWall(world, reach) {
    const R = K.RADIUS + reach, p = this.pos;
    const boxes = world.overlapAll(p.x - R, p.y + 0.3, p.z - R, p.x + R, p.y + this.height - 0.2, p.z + R, tmp);
    let best = null, bestD = 1e9;
    for (const b of boxes) {
      if (b.ramp) continue;
      const c = [[b.minX - p.x, -1, 0], [p.x - b.maxX, 1, 0], [b.minZ - p.z, 0, -1], [p.z - b.maxZ, 0, 1]];
      for (const [d, nx, nz] of c) if (d >= -0.05 && d < bestD) { bestD = d; best = { x: nx, z: nz }; }
    }
    return best;
  }

  aabbFree(world, x, y, z, h) {
    const R = K.RADIUS;
    return !world.overlapAny(x - R, y, z - R, x + R, y + h, z + R);
  }

  move(world, dt, emit) {
    const dx = this.vel.x * dt, dy = this.vel.y * dt, dz = this.vel.z * dt;
    const steps = Math.min(12, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2)));
    const wasGround = this.onGround;
    const fallSpeed = -this.vel.y;
    this.onGround = false;
    this.groundBox = null;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(world, 0, dx / steps, wasGround);
      this.moveAxis(world, 2, dz / steps, wasGround);
      this.moveAxis(world, 1, dy / steps, wasGround);
    }
    // stick to stairs and slopes when walking down
    if (wasGround && !this.onGround && this.vel.y <= 0.01) {
      const g = world.groundBelow(this.pos.x, this.pos.y + 0.05, this.pos.z);
      if (g !== null && this.pos.y - g < 0.65 && this.aabbFree(world, this.pos.x, g + 0.001, this.pos.z, this.height)) {
        this.pos.y = g + 0.001; this.onGround = true; this.vel.y = 0;
        const h = world.raycast(this.pos.x, g + 0.05, this.pos.z, 0, -1, 0, 0.2);
        this.groundBox = h ? h.box : null;
      } else this.coyote = 0.12;
    }
    if (!wasGround && this.onGround) {
      this.wallJumpsUsed = 0;
      if (this.state === 'wallrun') this.setState('normal');
      emit('land', this, fallSpeed);
    }
  }

  moveAxis(world, axis, d, wasGround) {
    if (d === 0) return;
    const p = this.pos, R = K.RADIUS;
    if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
    const boxes = world.overlapAll(p.x - R, p.y, p.z - R, p.x + R, p.y + this.height, p.z + R, tmp);
    for (const b of boxes) {
      if (!world.boxOverlap(b, p.x - R, p.y, p.z - R, p.x + R, p.y + this.height, p.z + R)) continue;
      if (b.ramp) {
        const top = world.topAt(b, p.x, p.z);
        // walkable from above: ride the slope surface
        if (p.y > top - 1.0 && this.vel.y <= 4) {
          if (p.y < top) { p.y = top; if (this.vel.y < 0) this.vel.y = 0; this.onGround = true; this.groundBox = b; }
          continue;
        }
        if (axis === 1) {
          if (d < 0) { p.y = top; this.vel.y = 0; this.onGround = true; this.groundBox = b; }
          else { p.y = b.minY - this.height - 0.001; if (this.vel.y > 0) this.vel.y = 0; }
          continue;
        }
      }
      if (axis === 1) {
        if (d < 0) { p.y = b.maxY; this.vel.y = 0; this.onGround = true; this.groundBox = b; }
        else { p.y = b.minY - this.height - 0.001; if (this.vel.y > 0) this.vel.y = 0; }
        continue;
      }
      const stepH = b.maxY - p.y;
      if ((wasGround || this.onGround) && !b.ramp && stepH > 0 && stepH <= K.STEP_H && this.aabbFree(world, p.x, b.maxY + 0.001, p.z, this.height)) {
        p.y = b.maxY + 0.001;
        continue;
      }
      if (axis === 0) { p.x = d > 0 ? b.minX - R - 0.001 : b.maxX + R + 0.001; this.vel.x = 0; }
      else { p.z = d > 0 ? b.minZ - R - 0.001 : b.maxZ + R + 0.001; this.vel.z = 0; }
    }
  }

  hitboxes() {
    const p = this.pos, h = this.height;
    const headH = Math.min(0.42, h * 0.3);
    return [
      { part: 'body', minX: p.x - 0.34, minY: p.y, minZ: p.z - 0.34, maxX: p.x + 0.34, maxY: p.y + h - headH, maxZ: p.z + 0.34 },
      { part: 'head', minX: p.x - 0.25, minY: p.y + h - headH, minZ: p.z - 0.25, maxX: p.x + 0.25, maxY: p.y + h + 0.06, maxZ: p.z + 0.25 },
    ];
  }

  center() { return { x: this.pos.x, y: this.pos.y + this.height * 0.55, z: this.pos.z }; }
}
