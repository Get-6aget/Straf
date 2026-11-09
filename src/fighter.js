import * as K from './constants.js';

const tmpBoxes = [];

// Shared movement controller for both the player and bots, so bots obey
// exactly the same rules (slide, roll/dive, wall bounce).
export class Fighter {
  constructor({ id, name, isBot = false, color = 0xe8e2d0, team = id }) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
    this.color = color;
    this.team = team;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.height = K.STAND_H;
    this.weapon = null;
    this.model = null;
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }

  reset(sp) {
    this.pos.x = sp.x; this.pos.y = sp.y; this.pos.z = sp.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = sp.yaw || 0;
    this.pitch = 0;
    this.hp = K.MAX_HP;
    this.alive = true;
    this.deathTime = 0;
    this.onGround = true;
    this.groundBox = null;
    this.state = 'normal';
    this.stateT = 0;
    this.crouching = false;
    this.height = K.STAND_H;
    this.slideCd = 0;
    this.rollCd = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.wallBounces = 0;
    this.airDiveUsed = false;
    this.rollDir = { x: 0, z: 1 };
    this.wallAnim = 0;
    this.wallNormal = { x: 0, z: 0 };
    this.lean = 0;
    this.lastHit = null;
    this.speedMul = 1;
    this.airTime = 0;
    this.weapon = null;
    this.stun = 0;
  }

  get eyeY() { return this.pos.y + this.height - 0.16; }
  get horizSpeed() { return Math.hypot(this.vel.x, this.vel.z); }
  get isLow() { return this.state === 'slide' || this.state === 'roll' || this.state === 'dive'; }

  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  aimDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  // inp: {mx, mz (world wish), jumpPressed, crouch, rollPressed, lean, yaw, pitch}
  update(dt, inp, world, emit) {
    if (!this.alive) return;
    this.yaw = inp.yaw; this.pitch = inp.pitch;
    this.lean += ((inp.lean || 0) - this.lean) * Math.min(1, dt * 10);
    this.slideCd -= dt; this.rollCd -= dt; this.coyote -= dt; this.jumpBuffer -= dt;
    this.wallAnim -= dt; this.stun -= dt;
    this.stateT += dt;
    if (inp.jumpPressed) this.jumpBuffer = 0.13;

    let wx = inp.mx || 0, wz = inp.mz || 0;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    if (this.stun > 0) { wx *= 0.2; wz *= 0.2; }
    const hs = this.horizSpeed;

    // State transitions
    if (this.state === 'normal') {
      if (inp.rollPressed && this.rollCd <= 0) {
        let dx = wx, dz = wz;
        if (Math.hypot(dx, dz) < 0.1) { const f = this.forward(); dx = f.x; dz = f.z; }
        const l = Math.hypot(dx, dz); dx /= l; dz /= l;
        this.rollDir.x = dx; this.rollDir.z = dz;
        if (this.onGround) {
          this.setState('roll');
          this.vel.x = dx * K.ROLL_SPEED; this.vel.z = dz * K.ROLL_SPEED;
          emit('roll', this);
          this.rollCd = K.ROLL_CD;
        } else if (!this.airDiveUsed) {
          this.setState('dive');
          this.airDiveUsed = true;
          const sp = Math.max(K.DIVE_SPEED, hs);
          this.vel.x = dx * sp; this.vel.z = dz * sp;
          this.vel.y = Math.max(this.vel.y, K.DIVE_UP);
          emit('dive', this);
          this.rollCd = K.ROLL_CD;
        }
      } else if (inp.crouch && this.onGround && hs > K.SLIDE_MIN_START && this.slideCd <= 0 && (inp.crouchPressed || this.airTime > 0)) {
        this.setState('slide');
        const sp = Math.min(hs + K.SLIDE_BOOST, K.SLIDE_MAX);
        this.vel.x = this.vel.x / hs * sp; this.vel.z = this.vel.z / hs * sp;
        emit('slide', this);
      }
    }

    if (this.onGround) this.airTime = 0; else this.airTime += dt;

    const wantCrouch = !!inp.crouch;
    let maxSpeed = K.RUN_SPEED * this.speedMul;

    switch (this.state) {
      case 'roll': {
        const t = this.stateT / K.ROLL_TIME;
        const sp = K.ROLL_SPEED * (1 - 0.35 * t) * Math.max(0.6, this.speedMul);
        if (this.onGround) { this.vel.x = this.rollDir.x * sp; this.vel.z = this.rollDir.z * sp; }
        if (this.stateT >= K.ROLL_TIME) this.setState('normal');
        break;
      }
      case 'dive': {
        this.airAccel(wx, wz, maxSpeed * 0.5, dt);
        break;
      }
      case 'slide': {
        let sp = hs - K.SLIDE_FRICTION * dt;
        if (sp < 0.01) sp = 0.01;
        // gentle steering toward wish direction
        if (wl > 0.1 && hs > 0.1) {
          const cx = this.vel.x / hs, cz = this.vel.z / hs;
          let nx = cx + wx * dt * 1.6, nz = cz + wz * dt * 1.6;
          const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
          this.vel.x = nx * sp; this.vel.z = nz * sp;
        } else if (hs > 0.01) {
          this.vel.x = this.vel.x / hs * sp; this.vel.z = this.vel.z / hs * sp;
        }
        if (!wantCrouch || sp < 4 || this.stateT > K.SLIDE_TIME || !this.onGround) {
          this.setState('normal');
          this.slideCd = K.SLIDE_CD;
        }
        break;
      }
      default: {
        this.crouching = wantCrouch && this.onGround;
        if (this.crouching) maxSpeed = K.CROUCH_SPEED * this.speedMul;
        if (this.onGround) {
          this.friction(dt);
          this.accel(wx, wz, maxSpeed * Math.min(1, wl + 0.0001) , K.GROUND_ACCEL, dt);
        } else {
          this.airAccel(wx, wz, maxSpeed, dt);
        }
      }
    }

    // Jump / wall bounce
    if (this.jumpBuffer > 0 && this.stun <= 0) {
      const canJump = (this.onGround || this.coyote > 0) && !(this.state === 'roll' && this.stateT < 0.15);
      if (canJump) {
        this.vel.y = K.JUMP_V;
        this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
        if (this.state === 'slide' || this.state === 'roll') { this.setState('normal'); this.slideCd = K.SLIDE_CD; }
        emit('jump', this);
      } else if (!this.onGround && this.wallBounces < K.MAX_WALL_BOUNCES) {
        const n = this.probeWall(world);
        if (n) {
          const vn = this.vel.x * n.x + this.vel.z * n.z;
          if (vn < 0) { this.vel.x -= n.x * vn; this.vel.z -= n.z * vn; }
          this.vel.x += n.x * K.WALL_KICK + wx * 2;
          this.vel.z += n.z * K.WALL_KICK + wz * 2;
          this.vel.y = K.WALL_JUMP_V * (1 - this.wallBounces * 0.08);
          this.wallBounces++;
          this.wallNormal.x = n.x; this.wallNormal.z = n.z;
          this.wallAnim = 0.4;
          this.jumpBuffer = 0;
          if (this.state === 'dive') this.setState('normal');
          emit('wallbounce', this);
        }
      }
    }

    this.vel.y -= K.GRAVITY * dt;
    if (this.vel.y < -40) this.vel.y = -40;

    this.move(world, dt, emit);

    // Body height
    let targetH = K.STAND_H;
    if (this.isLow) targetH = K.LOW_H;
    else if (this.crouching) targetH = K.CROUCH_H;
    if (targetH > this.height) {
      const nh = Math.min(targetH, this.height + dt * 6);
      if (!world.overlapAny(this.pos.x - K.RADIUS, this.pos.y + this.height, this.pos.z - K.RADIUS, this.pos.x + K.RADIUS, this.pos.y + nh, this.pos.z + K.RADIUS)) this.height = nh;
      else if (this.state === 'normal') this.crouching = true;
    } else if (targetH < this.height) {
      this.height = Math.max(targetH, this.height - dt * 9);
    }

    if (this.onGround && this.groundBox && this.groundBox.type === 'pad') {
      this.vel.y = K.PAD_V;
      this.onGround = false;
      this.wallBounces = 0;
      emit('pad', this);
    }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  friction(dt) {
    const sp = this.horizSpeed;
    if (sp < 0.001) return;
    const drop = Math.max(sp, K.STOP_SPEED) * K.FRICTION * dt;
    const ns = Math.max(0, sp - drop) / sp;
    this.vel.x *= ns; this.vel.z *= ns;
  }

  accel(wx, wz, wishSpeed, a, dt) {
    const wl = Math.hypot(wx, wz);
    if (wl < 0.001) return;
    wx /= wl; wz /= wl;
    const cur = this.vel.x * wx + this.vel.z * wz;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const as = Math.min(a * dt * wishSpeed, add);
    this.vel.x += wx * as; this.vel.z += wz * as;
  }

  airAccel(wx, wz, maxSpeed, dt) {
    this.accel(wx, wz, maxSpeed, K.AIR_ACCEL, dt);
  }

  probeWall(world) {
    const R = K.RADIUS + 0.35, p = this.pos;
    const boxes = world.overlapAll(p.x - R, p.y + 0.15, p.z - R, p.x + R, p.y + this.height - 0.1, p.z + R, tmpBoxes);
    let best = null, bestD = 1e9;
    for (const b of boxes) {
      const cands = [
        [b.minX - p.x, -1, 0], [p.x - b.maxX, 1, 0],
        [b.minZ - p.z, 0, -1], [p.z - b.maxZ, 0, 1],
      ];
      for (const [d, nx, nz] of cands) {
        if (d >= -0.05 && d < bestD) { bestD = d; best = { x: nx, z: nz }; }
      }
    }
    return best;
  }

  aabbFree(world, x, y, z, h) {
    const R = K.RADIUS;
    return !world.overlapAny(x - R, y, z - R, x + R, y + h, z + R);
  }

  move(world, dt, emit) {
    const dx = this.vel.x * dt, dy = this.vel.y * dt, dz = this.vel.z * dt;
    const steps = Math.min(10, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.25)));
    const wasGround = this.onGround;
    const fallSpeed = -this.vel.y;
    this.onGround = false;
    this.groundBox = null;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(world, 0, dx / steps, wasGround);
      this.moveAxis(world, 2, dz / steps, wasGround);
      this.moveAxis(world, 1, dy / steps, wasGround);
    }
    // Stick to the ground when walking down steps
    if (wasGround && !this.onGround && this.vel.y <= 0) {
      const g = world.groundBelow(this.pos.x, this.pos.y + 0.05, this.pos.z);
      if (g !== null && this.pos.y - g < 0.6 && this.aabbFree(world, this.pos.x, g, this.pos.z, this.height)) {
        this.pos.y = g; this.onGround = true; this.vel.y = 0;
        const h = world.raycast(this.pos.x, g + 0.05, this.pos.z, 0, -1, 0, 0.2);
        this.groundBox = h ? h.box : null;
      } else {
        this.coyote = 0.11;
      }
    }
    if (!wasGround && this.onGround) {
      this.wallBounces = 0;
      this.airDiveUsed = false;
      if (this.state === 'dive') {
        // Dive turns into a landing roll that keeps momentum
        const hs = this.horizSpeed;
        if (hs > 0.5) { this.rollDir.x = this.vel.x / hs; this.rollDir.z = this.vel.z / hs; }
        this.setState('roll');
        emit('roll', this);
      }
      emit('land', this, fallSpeed);
    }
  }

  moveAxis(world, axis, d, wasGround) {
    if (d === 0) return;
    const p = this.pos, R = K.RADIUS;
    if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
    const boxes = world.overlapAll(p.x - R, p.y, p.z - R, p.x + R, p.y + this.height, p.z + R, tmpBoxes);
    if (!boxes.length) return;
    for (const b of boxes) {
      if (!(p.x - R < b.maxX && p.x + R > b.minX && p.y < b.maxY && p.y + this.height > b.minY && p.z - R < b.maxZ && p.z + R > b.minZ)) continue;
      if (axis === 1) {
        if (d < 0) { p.y = b.maxY; this.vel.y = 0; this.onGround = true; this.groundBox = b; }
        else { p.y = b.minY - this.height - 0.001; if (this.vel.y > 0) this.vel.y = 0; }
        continue;
      }
      const stepH = b.maxY - p.y;
      if ((wasGround || this.onGround) && stepH > 0 && stepH <= K.STEP_H && this.aabbFree(world, p.x, b.maxY + 0.001, p.z, this.height)) {
        p.y = b.maxY + 0.001;
        continue;
      }
      if (axis === 0) {
        p.x = d > 0 ? b.minX - R - 0.001 : b.maxX + R + 0.001;
        this.vel.x = 0;
      } else {
        p.z = d > 0 ? b.minZ - R - 0.001 : b.maxZ + R + 0.001;
        this.vel.z = 0;
      }
    }
  }

  // Hitboxes: body + head, adjusted for crouch/slide/roll height.
  hitboxes() {
    const p = this.pos, h = this.height;
    const headH = Math.min(0.36, h * 0.3);
    return [
      { part: 'body', minX: p.x - 0.36, minY: p.y, minZ: p.z - 0.36, maxX: p.x + 0.36, maxY: p.y + h - headH, maxZ: p.z + 0.36 },
      { part: 'head', minX: p.x - 0.22, minY: p.y + h - headH, minZ: p.z - 0.22, maxX: p.x + 0.22, maxY: p.y + h + 0.04, maxZ: p.z + 0.22 },
    ];
  }

  center() { return { x: this.pos.x, y: this.pos.y + this.height * 0.55, z: this.pos.z }; }
}
