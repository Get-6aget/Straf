import * as THREE from 'three';
import { MAPS, LIGHTING } from './level.js';
import { buildSpawnerPad } from './scene.js';
import { NavGraph } from './nav.js';
import { Fighter } from './fighter.js';
import { CharacterModel } from './models.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { BotBrain } from './bot.js';
import { Viewmodel, Post } from './viewmodel.js';
import { WEAPONS, newWeaponInstance, weaponName } from './weapons.js';
import { sfx, setListener } from './audio.js';
import { settings, stats, saveStats } from './settings.js';
import { t, getLang } from './i18n.js';
import * as K from './constants.js';

const BOT_NAMES = {
  ru: ['Тапок', 'Кефир', 'Шнурок', 'Бублик', 'Пельмень', 'Сквозняк', 'Компот', 'Ёжик', 'Утюг', 'Батон', 'Гвоздь', 'Сырок', 'Валенок', 'Пончик'],
  en: ['Slipper', 'Kefir', 'Laces', 'Bagel', 'Dumpling', 'Draft', 'Compote', 'Hedgehog', 'Iron', 'Loaf', 'Nail', 'Curd', 'Boot', 'Donut'],
};
// Overall colours: muted workwear, team modes use two clear hues
const FFA_COLORS = [0x6e7358, 0x8a5a3c, 0x4e5f6e, 0x7a6e48];
const TEAM_COLORS = [[0x4e6278, 0x5a6e84], [0x8a4e38, 0x96583e]];
const QUALITY = [{ scale: 0.65 }, { scale: 0.85 }, { scale: 1 }];

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Game {
  constructor(renderer, hud, music, sky, levels) {
    this.levels = levels;
    this.renderer = renderer;
    this.hud = hud;
    this.music = music;
    this.sky = sky;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(95, 1, 0.05, 500);
    this.camera.rotation.order = 'YXZ';
    this.vm = new Viewmodel();
    this.vm.setEnvironment(sky.env);
    this.post = new Post(renderer, this.scene, this.camera, this.vm);
    this.effects = new Effects(this.scene);
    this.combat = new Combat(this);
    this.fighters = [];
    this.brains = new Map();
    this.sides = [];
    this.takes = {}; this.rounds = {};
    this.takesPerRound = K.TAKES_PER_ROUND;
    this.state = 'idle';
    this.stateT = 0;
    this.time = 0;
    this.mapRoot = null;
    this.player = null;
    this.pYaw = 0; this.pPitch = 0;
    this.fx = { kick: 0, shake: 0, landDip: 0, bob: 0, damage: 0, flash: 0, roll: 0 };
    this.damageEnabled = false;
    this.showBoard = false;
    this.paused = false;
    this.attract = false;
    this.lastLook = { dx: 0, dy: 0 };
    this.navCache = new Map();
    this.emit = this.emit.bind(this);
    this.onMatchEnd = null;
    this.onGameplay = null;
  }

  resize(w, h) {
    const q = QUALITY[settings.quality] || QUALITY[1];
    const pr = Math.min(window.devicePixelRatio || 1, 2) * q.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.post.setQuality(settings.quality);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aspect = w / h;
  }

  get showSpeed() { return settings.speedo; }

  // ---------------- match flow ----------------
  startMatch(cfg) {
    this.cfg = cfg;
    this.attract = !!cfg.attract;
    for (const f of this.fighters) this.scene.remove(f.model.root);
    this.fighters = []; this.brains.clear(); this.sides = [];
    const lang = getLang();
    const names = shuffle([...(BOT_NAMES[lang] || BOT_NAMES.en)]);
    const teamMode = cfg.mode === '2v2';
    const count = cfg.mode === '1v1' ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const isPlayer = !this.attract && i === 0;
      const team = teamMode ? (i < 2 ? 0 : 1) : i;
      const color = teamMode ? TEAM_COLORS[team][i % 2] : FFA_COLORS[i];
      const name = isPlayer ? (settings.name || t('you')) : names[i];
      const f = new Fighter({ id: i, name, isBot: !isPlayer, color, team });
      f.displayName = name;
      f.kills = 0; f.deaths = 0;
      f.model = new CharacterModel(color, i * 3 + Math.floor(Math.random() * 5));
      this.scene.add(f.model.root);
      this.fighters.push(f);
      if (!isPlayer) this.brains.set(f, new BotBrain(f, this.attract ? 1 : cfg.difficulty));
    }
    this.player = this.attract ? null : this.fighters[0];
    for (const id of [...new Set(this.fighters.map((f) => f.team))]) {
      const members = this.fighters.filter((f) => f.team === id);
      const name = members.map((m) => m.displayName).join(' & ');
      this.sides.push({ id, name, members, lastDeath: -1 });
      this.takes[id] = 0; this.rounds[id] = 0;
    }
    this.roundsToWin = cfg.roundsToWin || 4;
    this.roundNo = 0;
    this.mapOrder = shuffle(MAPS.map((_, i) => i));
    this.mapCursor = 0;
    this.hud.clearFeed();
    this.nextRound();
  }

  nextRound() {
    this.roundNo++;
    for (const s of this.sides) this.takes[s.id] = 0;
    if (this.mapCursor >= this.mapOrder.length) { this.mapOrder = shuffle(this.mapOrder); this.mapCursor = 0; }
    this.loadMap(MAPS[this.mapOrder[this.mapCursor++]]);
    if (!this.attract && settings.music > 0) this.music.next();
    this.takeNo = 0;
    this.startTake();
  }

  loadMap(def) {
    if (this.mapDef && this.mapDef.id === def.id && this.mapRoot) return; // single-map rotation: reuse
    if (this.mapRoot) this.scene.remove(this.mapRoot);
    const level = this.levels.get(def.id);
    const L = LIGHTING[def.light] || LIGHTING.overcast;
    this.mapRoot = new THREE.Group();
    this.mapRoot.add(level.group);
    // lights only affect dynamic objects; the level itself is fully baked
    const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi);
    const sun = new THREE.DirectionalLight(L.sunColor, L.sun);
    sun.position.copy(level.sun).multiplyScalar(50);
    this.mapRoot.add(hemi, sun, sun.target);
    this.scene.add(this.mapRoot);
    this.scene.fog = new THREE.FogExp2(L.fog, L.fogDensity);
    this.scene.background = this.sky.bg;
    this.scene.backgroundIntensity = L.bgIntensity;
    this.scene.environment = this.sky.env;
    this.scene.environmentIntensity = L.envIntensity;
    this.light = L;
    this.world = level.world;
    this.effects.world = this.world;
    if (!this.navCache.has(def.id)) this.navCache.set(def.id, new NavGraph(this.world));
    this.nav = this.navCache.get(def.id);
    this.mapDef = def;

    this.spawns = level.spawns.map((p) => this.snap({ x: p.x, y: p.y + 1, z: p.z })).filter(Boolean);
    const spots = level.weapons.map((p) => this.snap({ x: p.x, y: p.y + 1, z: p.z })).filter(Boolean);
    this.spawners = spots.map((pos) => {
      const pad = buildSpawnerPad();
      pad.position.set(pos.x, pos.y, pos.z);
      this.mapRoot.add(pad);
      return { pos, pickup: null, respawn: 0, pad };
    });
  }

  snap(p) {
    const w = this.world, R = K.RADIUS;
    const g = w.groundBelow(p.x, p.y, p.z);
    if (g === null || g < w.killY + 2) return null;
    if (w.overlapAny(p.x - R, g + 0.02, p.z - R, p.x + R, g + K.STAND_H, p.z + R)) return null;
    return { x: p.x, y: g, z: p.z };
  }

  // Each map has its own weapon set (as in the original game).
  pickWeapon() {
    const set = this.mapDef.weapons;
    let total = 0;
    for (const id of set) total += WEAPONS[id].weight || 5;
    let r = Math.random() * total;
    for (const id of set) { r -= WEAPONS[id].weight || 5; if (r <= 0) return id; }
    return set[0];
  }

  assignSpawns() {
    const sp = [...this.spawns];
    let chosen;
    if (this.fighters.length === 2) {
      let bi = 0, bj = 1, bd = -1;
      for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
        const d = Math.hypot(sp[i].x - sp[j].x, sp[i].z - sp[j].z);
        if (d > bd) { bd = d; bi = i; bj = j; }
      }
      chosen = Math.random() < 0.5 ? [sp[bi], sp[bj]] : [sp[bj], sp[bi]];
    } else chosen = shuffle(sp);
    this.fighters.forEach((f, i) => {
      const p = chosen[i % chosen.length];
      f.reset({ x: p.x + (i >= chosen.length ? 1 : 0), y: p.y + 0.01, z: p.z, yaw: Math.atan2(p.x, p.z) });
      f.model.deadT = 0;
    });
  }

  startTake() {
    this.takeNo++;
    this.combat.clear();
    this.effects.clear();
    this.assignSpawns();
    for (const b of this.brains.values()) { b.reset(); b.yaw = b.f.yaw; }
    for (const s of this.spawners) { s.pickup = this.combat.spawnPickup(newWeaponInstance(this.pickWeapon()), s.pos, s); s.respawn = 0; }
    if (this.player) { this.pYaw = this.player.yaw; this.pPitch = 0; }
    this.state = 'countdown';
    this.stateT = this.takeNo === 1 ? 2.5 : 1.6;
    this.lastBeep = Math.ceil(this.stateT);
    this.damageEnabled = false;
    this.deathInfo = '';
    this.spectateTarget = null;
    for (const s of this.sides) s.lastDeath = -1;
    if (!this.attract) {
      const mname = this.mapDef.name[getLang()] || this.mapDef.name.en;
      if (this.takeNo === 1) this.hud.message(`${t('round')} ${this.roundNo}`, mname, 2.3);
      else this.hud.message(`${t('take')} ${this.takeNo}`, '', 1.5);
    }
    this.onGameplay?.(true);
  }

  update(dt, inp) {
    if (this.state === 'idle') return;
    this.time += dt;
    this.stateT -= dt;
    this.showBoard = !!(inp && inp.tab);
    const frozen = this.state === 'countdown';
    for (const f of this.fighters) {
      const pin = f === this.player ? this.playerInput(inp) : this.brains.get(f).think(dt, this);
      if (frozen) Object.assign(pin, { mx: 0, mz: 0, jumpPressed: false, crouchPressed: false, fire: false, firePressed: false, alt: false, altPressed: false, throwPressed: false, pickupPressed: false });
      const wasAlive = f.alive;
      f.update(dt, pin, this.world, this.emit);
      if (!frozen) this.combat.updateFighter(f, pin, dt);
      if (wasAlive && f.alive && f.pos.y < this.world.killY) {
        const lh = f.lastHit;
        this.kill(f, lh && this.time - lh.t < 6 ? lh.attacker : null, lh ? lh.weaponId : null, { void: true });
      }
      if (!f.alive && f.pos.y > this.world.killY - 10) {
        f.vel.y -= K.GRAVITY * dt; f.vel.x *= 0.92; f.vel.z *= 0.92;
        f.height = 0.5; f.move(this.world, dt, () => {});
      }
      this.footsteps(f, dt);
      f.model.update(dt, f);
    }
    if (this.player) this.player.model.root.visible = !this.player.alive;
    this.combat.updateProjectiles(dt);
    this.combat.updatePickups(dt);
    for (const s of this.spawners) {
      s.pad.userData.ring.material.color.setHex(s.pickup ? 0x7dff6a : 0x2f4a2c);
      if (!s.pickup && s.respawn > 0) {
        s.respawn -= dt;
        if (s.respawn <= 0) s.pickup = this.combat.spawnPickup(newWeaponInstance(this.pickWeapon()), s.pos, s);
      }
    }
    this.effects.update(dt);
    this.stateMachine();
  }

  stateMachine() {
    switch (this.state) {
      case 'countdown': {
        const c = Math.ceil(this.stateT);
        if (c < this.lastBeep && c > 0) { this.lastBeep = c; if (!this.attract) sfx('beep'); }
        if (this.stateT <= 0) {
          this.state = 'play';
          this.damageEnabled = true;
          if (!this.attract) { this.hud.message(t('fight'), '', 0.7); sfx('go'); }
        }
        break;
      }
      case 'play':
        if (this.sides.filter((s) => s.members.some((m) => m.alive)).length <= 1) { this.state = 'takeEnd'; this.stateT = 1.0; }
        break;
      case 'takeEnd':
        if (this.stateT <= 0) this.resolveTake();
        break;
      case 'between':
        if (this.stateT <= 0) {
          if (this.next === 'take') this.startTake();
          else if (this.next === 'round') this.nextRound();
          else this.endMatch();
        }
        break;
      default: break;
    }
  }

  resolveTake() {
    const alive = this.sides.filter((s) => s.members.some((m) => m.alive));
    let winners = alive;
    if (!alive.length) {
      // everyone died within a second of each other: all of them score
      const last = Math.max(...this.sides.map((s) => s.lastDeath));
      winners = this.sides.filter((s) => s.lastDeath >= last - 1);
    }
    for (const s of winners) this.takes[s.id]++;
    const names = winners.map((s) => s.name).join(', ');
    const plural = winners.length > 1 || winners[0].members.length > 1;
    if (!this.attract) this.hud.feed(`<b>${names}</b> ${t(plural ? 'wonTakePl' : 'wonTake')}`, false);
    const roundWinners = this.sides.filter((s) => this.takes[s.id] >= this.takesPerRound);
    this.next = 'take';
    const pSide = this.player ? this.sides.find((s) => s.members.includes(this.player)) : null;
    if (roundWinners.length) {
      for (const s of roundWinners) this.rounds[s.id]++;
      const max = Math.max(...this.sides.map((s) => this.rounds[s.id]));
      const leaders = this.sides.filter((s) => this.rounds[s.id] === max);
      this.next = max >= this.roundsToWin && leaders.length === 1 && !this.attract ? 'match' : 'round';
      if (this.attract && max >= this.roundsToWin) for (const s of this.sides) this.rounds[s.id] = 0;
      if (!this.attract) {
        const rn = roundWinners.map((s) => s.name).join(', ');
        this.hud.message(rn, t(roundWinners.length > 1 || roundWinners[0].members.length > 1 ? 'wonRoundPl' : 'wonRound'), 2.2);
        if (roundWinners.includes(pSide)) sfx('win');
      }
    } else if (!this.attract && winners.length > 1) this.hud.message(t('draw'), '', 1.6);
    this.state = 'between';
    this.stateT = this.next === 'take' ? 1.6 : 2.4;
    this.damageEnabled = false;
  }

  endMatch() {
    this.state = 'matchEnd';
    this.onGameplay?.(false);
    const max = Math.max(...this.sides.map((s) => this.rounds[s.id]));
    const winner = this.sides.find((s) => this.rounds[s.id] === max);
    const won = winner.members.includes(this.player);
    stats.matches++;
    if (won) stats.wins++;
    saveStats();
    sfx(won ? 'win' : 'lose');
    this.onMatchEnd?.({ won, winner, sides: this.sides, rounds: this.rounds, fighters: this.fighters, player: this.player });
  }

  stop() {
    this.state = 'idle';
    this.combat.clear();
    this.effects.clear();
    this.onGameplay?.(false);
  }

  // ---------------- player ----------------
  playerInput(inp) {
    const out = { mx: 0, mz: 0, fwdAmount: 0, sprint: false, jumpPressed: false, jump: false, crouch: false, crouchPressed: false, fire: false, firePressed: false, alt: false, altPressed: false, pickupPressed: false, throwPressed: false, lean: 0, yaw: this.pYaw, pitch: this.pPitch };
    const f = this.player;
    if (!inp || this.paused) { this.lastLook = { dx: 0, dy: 0 }; return out; }
    const R = f.hands.R;
    const zoomMul = R && R.zoomed ? (R.def.zoom || 1) : 1;
    const sens = settings.sens * 0.0021 * zoomMul;
    this.pYaw -= inp.dx * sens;
    this.pPitch -= inp.dy * sens * (settings.invertY ? -1 : 1);
    if (f.recoil) { this.pPitch += f.recoil * 0.4; this.fx.kick += f.recoil * 0.7; f.recoil = 0; }
    this.pPitch = Math.max(-1.55, Math.min(1.55, this.pPitch));
    this.lastLook = { dx: inp.dx, dy: inp.dy };
    let fw = (inp.fwd ? 1 : 0) - (inp.back ? 1 : 0), rt = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (inp.joy) { fw = -inp.joy.y; rt = inp.joy.x; }
    const sy = Math.sin(this.pYaw), cy = Math.cos(this.pYaw);
    out.mx = -sy * fw + cy * rt;
    out.mz = -cy * fw - sy * rt;
    out.fwdAmount = fw;
    out.sprint = settings.autoSprint ? !inp.sprint : inp.sprint;
    Object.assign(out, {
      jumpPressed: inp.jumpPressed, jump: inp.jump, crouch: inp.crouch, crouchPressed: inp.crouchPressed,
      fire: inp.fire, firePressed: inp.firePressed, alt: inp.alt, altPressed: inp.altPressed,
      pickupPressed: inp.pickupPressed, throwPressed: inp.throwPressed, lean: inp.lean,
    });
    return out;
  }

  emit(name, f, extra) {
    const isP = f === this.player;
    const vol = isP ? 0.7 : 1;
    switch (name) {
      case 'jump': sfx('jump', f.pos, vol); break;
      case 'land':
        if (extra > 6) sfx('land', f.pos, vol * Math.min(1.4, extra / 10));
        if (isP) this.fx.landDip = Math.min(0.2, extra * 0.011);
        break;
      case 'slide': sfx('slide', f.pos, vol); break;
      case 'slidejump': sfx('jump', f.pos, vol); sfx('whoosh', f.pos, vol); break;
      case 'walljump': sfx('walljump', f.pos, vol); this.effects.dust({ x: f.pos.x - f.wallNormal.x * 0.4, y: f.pos.y + 0.6, z: f.pos.z - f.wallNormal.z * 0.4 }); break;
      case 'wallrun': sfx('step', f.pos, vol); break;
      case 'mantle': sfx('land', f.pos, vol * 0.5); break;
      case 'pad': sfx('pad', f.pos, vol); break;
      default: break;
    }
  }

  footsteps(f, dt) {
    if (!f.alive) return;
    const run = f.state === 'wallrun' || (f.onGround && f.state === 'normal');
    const hs = f.horizSpeed;
    if (!run || hs < 2.5) return;
    f.stepT = (f.stepT || 0) - dt * hs;
    if (f.stepT <= 0) { f.stepT = 2.6; sfx('step', f.pos, f === this.player ? 0.45 : 0.9); }
  }

  shake(pos, radius) {
    const c = this.camera.position;
    const d = Math.hypot(pos.x - c.x, pos.y - c.y, pos.z - c.z);
    this.fx.shake = Math.max(this.fx.shake, Math.max(0, 1 - d / (radius * 4)) * 0.6);
  }

  // ---------------- combat callbacks ----------------
  onFire(f, id, hand, kind) {
    if (f === this.player) this.vm.onFire(hand, kind, id);
    else if (id && WEAPONS[id] && WEAPONS[id].kind === 'hitscan' && kind !== 'throw') this.effects.muzzle(this.combat.muzzlePos(f, hand));
  }

  onDamage(victim, amount, attacker, weaponId, opts) {
    if (attacker === this.player && victim !== this.player) {
      this.hud.hitmarker(opts.head, victim.hp <= 0);
      sfx(opts.head ? 'headshot' : 'hit');
    }
    if (victim === this.player) {
      this.fx.damage = Math.min(1, this.fx.damage + amount / 70);
      sfx('hurt', null, 0.8);
      if (attacker && attacker !== victim) {
        const yawTo = Math.atan2(-(attacker.pos.x - victim.pos.x), -(attacker.pos.z - victim.pos.z));
        this.hud.damageFrom(-(yawTo - this.pYaw));
      }
    }
  }

  kill(victim, attacker, weaponId, opts = {}) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    const side = this.sides.find((s) => s.members.includes(victim));
    if (side) side.lastDeath = this.time;
    this.combat.dropAll(victim);
    victim.deaths++;
    if (attacker && attacker !== victim) {
      attacker.kills++;
      if (attacker.alive) { opts.air = !attacker.onGround && attacker.state !== 'slide'; opts.slide = attacker.state === 'slide'; }
    }
    const mine = !!this.player && (victim === this.player || attacker === this.player);
    this.hud.killfeed(attacker, victim, weaponId, opts, mine);
    if (attacker === this.player && victim !== this.player) { sfx('kill'); if (!this.attract) stats.kills++; }
    if (victim === this.player) {
      stats.deaths++;
      if (attacker && attacker !== victim) {
        this.deathInfo = `${t('killedBy')} <b>${attacker.displayName}</b> · «${weaponName(weaponId, getLang())}» · ${Math.max(0, Math.ceil(attacker.hp))} HP`;
        this.spectateTarget = attacker;
      } else this.deathInfo = opts.void ? t('kfVoid') : t('kfSelf');
      this.spectateDelay = 1.4;
    }
  }

  // ---------------- camera & render ----------------
  render(dt) {
    if (this.state === 'idle') return;
    const fx = this.fx;
    fx.kick *= Math.exp(-dt * 12);
    fx.shake *= Math.exp(-dt * 6);
    fx.landDip *= Math.exp(-dt * 9);
    fx.damage = Math.max(0, fx.damage - dt * 1.1);
    fx.flash = Math.max(0, fx.flash - dt * 3);
    const cam = this.camera, p = this.player;
    let fp = false, fov = settings.fov;

    if (p && p.alive) {
      fp = true;
      const right = { x: Math.cos(this.pYaw), z: -Math.sin(this.pYaw) };
      let bobY = 0, bobRoll = 0;
      if (p.onGround && p.state === 'normal' && p.horizSpeed > 1) {
        fx.bob += dt * p.horizSpeed * 1.2;
        const a = Math.min(1, p.horizSpeed / 7.4);
        bobY = Math.abs(Math.sin(fx.bob)) * 0.04 * a;
        bobRoll = Math.sin(fx.bob) * 0.005 * a;
      }
      const leanOff = p.lean * 0.5;
      cam.position.set(p.pos.x + right.x * leanOff, p.eyeY - fx.landDip + bobY, p.pos.z + right.z * leanOff);
      let roll = -p.lean * 0.14 + bobRoll;
      if (p.state === 'slide') { roll += 0.07; fov += 6; }
      if (p.state === 'wallrun') roll += 0.18 * (p.wallNormal.x * right.x + p.wallNormal.z * right.z);
      if (p.wallKick > 0) roll += 0.08 * Math.sin((1 - p.wallKick / 0.35) * Math.PI) * (p.wallNormal.x * right.x + p.wallNormal.z * right.z);
      fx.roll += (roll - fx.roll) * Math.min(1, dt * 10);
      fov += Math.max(0, Math.min(12, (p.horizSpeed - 7.5) * 1.3));
      const R = p.hands.R;
      if (R && R.zoomed) fov = settings.fov * (R.def.zoom || 1);
      const sh = fx.shake;
      cam.rotation.set(this.pPitch + fx.kick + (Math.random() - 0.5) * sh * 0.1, this.pYaw + (Math.random() - 0.5) * sh * 0.1, fx.roll);
    } else {
      // killcam on your killer, then spectate whoever is alive
      this.spectateDelay = (this.spectateDelay || 0) - dt;
      let tgt = this.spectateTarget;
      if (this.attract) {
        this.attractT = (this.attractT || 0) - dt;
        if (!tgt || !tgt.alive || this.attractT <= 0) { const al = this.fighters.filter((f) => f.alive); tgt = al[Math.floor(Math.random() * al.length)] || this.fighters[0]; this.attractT = 8; }
      } else if (!tgt || (!tgt.alive && this.spectateDelay <= 0)) tgt = this.fighters.find((f) => f.alive && f !== p) || this.fighters[0];
      this.spectateTarget = tgt;
      const yaw = tgt.alive ? tgt.yaw : (this.specYaw ?? 0);
      if (this.specYaw === undefined) this.specYaw = yaw;
      let d = yaw - this.specYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.specYaw += d * Math.min(1, dt * 3);
      const head = { x: tgt.pos.x, y: tgt.pos.y + 1.7, z: tgt.pos.z };
      const back = { x: Math.sin(this.specYaw) * 3.6, y: 1.2, z: Math.cos(this.specYaw) * 3.6 };
      const len = Math.hypot(back.x, back.y, back.z);
      const h = this.world.raycast(head.x, head.y, head.z, back.x / len, back.y / len, back.z / len, len);
      const dd = h ? Math.max(0.4, h.t - 0.3) : len;
      cam.position.set(head.x + back.x / len * dd, head.y + back.y / len * dd, head.z + back.z / len * dd);
      cam.lookAt(head.x, head.y - 0.2, head.z);
      fov = 80;
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix(); }
    setListener(cam.position.x, cam.position.y, cam.position.z, fp ? this.pYaw : cam.rotation.y);
    if (fp) this.vm.update(dt, p, this.lastLook, this.aspect);
    this.post.render(dt, { time: this.time, damage: fx.damage * 0.8, flash: fx.flash, vmVisible: fp && this.vm.root.visible, tint: this.light && this.light.grade });
  }
}
