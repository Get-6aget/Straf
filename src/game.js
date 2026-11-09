import * as THREE from 'three';
import { MAPS, buildMapData } from './maps.js';
import { buildMapScene } from './scene.js';
import { NavGraph } from './nav.js';
import { Fighter } from './fighter.js';
import { CharacterModel } from './models.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { BotBrain } from './bot.js';
import { Viewmodel, Post } from './viewmodel.js';
import { WEAPONS, WEAPON_IDS, newWeaponInstance, weaponName } from './weapons.js';
import { sfx, setListener } from './audio.js';
import { settings, stats, saveStats } from './settings.js';
import { t, getLang } from './i18n.js';
import * as K from './constants.js';

const BOT_NAMES = {
  ru: ['Тапок', 'Кефир', 'Шнурок', 'Бублик', 'Пельмень', 'Сквозняк', 'Компот', 'Ёжик', 'Кактус', 'Утюг', 'Батон', 'Гвоздь', 'Сырок', 'Пончик', 'Валенок'],
  en: ['Slipper', 'Kefir', 'Laces', 'Bagel', 'Dumpling', 'Draft', 'Compote', 'Hedgehog', 'Cactus', 'Iron', 'Loaf', 'Nail', 'Curd', 'Donut', 'Boot'],
};
const FFA_COLORS = [0xece6d6, 0xd8735a, 0x6aa0c8, 0xd6be5a, 0x8ac87a, 0xb07ac8];
const TEAM_COLORS = [[0x8ec0f0, 0x5f93c8], [0xf0957a, 0xc8654e]];
const QUALITY = [{ scale: 0.6, samples: 0 }, { scale: 0.85, samples: 2 }, { scale: 1, samples: 4 }];

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function pickWeapon() {
  let total = 0;
  for (const id of WEAPON_IDS) total += WEAPONS[id].weight || 5;
  let r = Math.random() * total;
  for (const id of WEAPON_IDS) { r -= WEAPONS[id].weight || 5; if (r <= 0) return id; }
  return 'pistol';
}

export class Game {
  constructor(renderer, hud, music) {
    this.renderer = renderer;
    this.hud = hud;
    this.music = music;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(95, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.vm = new Viewmodel();
    this.post = new Post(renderer);
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
    this.fx = { kick: 0, shake: 0, landDip: 0, bob: 0, damage: 0, flash: 0 };
    this.damageEnabled = false;
    this.showBoard = false;
    this.onMatchEnd = null;
    this.onGameplay = null;
    this.paused = false;
    this.attract = false;
    this.lastLook = { dx: 0, dy: 0 };
    this.emit = this.emit.bind(this);
  }

  resize(w, h) {
    const q = QUALITY[settings.quality] || QUALITY[1];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w * dpr, h * dpr, q.scale, q.samples);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aspect = w / h;
  }

  // ---------------- match flow ----------------
  startMatch(cfg) {
    this.cfg = cfg;
    this.attract = !!cfg.attract;
    for (const f of this.fighters) this.scene.remove(f.model.root);
    this.fighters = []; this.brains.clear(); this.sides = [];
    const lang = getLang();
    const names = shuffle([...BOT_NAMES[lang] || BOT_NAMES.en]);
    let teamMode = cfg.mode === '2v2';
    const count = cfg.mode === '1v1' ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const isPlayer = !this.attract && i === 0;
      const team = teamMode ? (i < 2 ? 0 : 1) : i;
      const color = teamMode ? TEAM_COLORS[team][i % 2] : FFA_COLORS[i];
      const name = isPlayer ? (settings.name || t('you')) : names[i];
      const f = new Fighter({ id: i, name, isBot: !isPlayer, color, team });
      f.displayName = name;
      f.kills = 0; f.deaths = 0;
      f.model = new CharacterModel(color);
      this.scene.add(f.model.root);
      this.fighters.push(f);
      if (!isPlayer) this.brains.set(f, new BotBrain(f, this.attract ? 1 : cfg.difficulty));
    }
    this.player = this.attract ? null : this.fighters[0];
    const teams = [...new Set(this.fighters.map((f) => f.team))];
    for (const id of teams) {
      const members = this.fighters.filter((f) => f.team === id);
      const name = teamMode ? (members.includes(this.player) ? `${t('team')} ${this.player.displayName}` : `${t('team')} ${members[0].displayName}`) : members[0].displayName;
      this.sides.push({ id, name, color: members[0].color, members, lastDeath: -1 });
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
    const def = (this.cfg.mapIndex !== undefined && this.roundNo === 1) ? MAPS[this.cfg.mapIndex] : MAPS[this.mapOrder[this.mapCursor++]];
    this.loadMap(def);
    if (!this.attract) this.music.play((Math.random() * 1e9) | 0, false);
    this.takeNo = 0;
    this.startTake();
  }

  loadMap(def) {
    if (this.mapRoot) {
      this.scene.remove(this.mapRoot);
      this.mapRoot.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.dispose && !o.material.map) o.material.dispose(); } });
    }
    this.renderer.shadowMap.enabled = settings.quality > 0;
    const data = buildMapData(def);
    const built = buildMapScene(def, data, settings.quality);
    this.mapRoot = built.group;
    this.scene.add(this.mapRoot);
    this.scene.fog = built.fog;
    this.scene.background = built.background;
    this.world = built.world;
    // maps are deterministic, so the nav graph can be reused across rounds
    this.navCache ||= new Map();
    if (!this.navCache.has(def.id)) this.navCache.set(def.id, new NavGraph(this.world));
    this.nav = this.navCache.get(def.id);
    this.mapDef = def;
    this.pal = def.pal;
    this.vm.setPalette(def.pal);

    const need = Math.max(4, this.fighters.length);
    this.spawns = data.spawns.map((p) => this.snap(p)).filter(Boolean);
    this.fillPoints(this.spawns, need);
    const spots = data.weapons.map((p) => this.snap(p)).filter(Boolean);
    this.fillPoints(spots, 7);
    this.spawners = spots.map((pos) => {
      const base = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.08, 16), new THREE.MeshLambertMaterial({ color: def.pal.dark }));
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.pal.accent).lerp(new THREE.Color(0xffffff), 0.4) }));
      ring.position.y = 0.01;
      base.add(disc, ring);
      base.position.set(pos.x, pos.y + 0.04, pos.z);
      this.mapRoot.add(base);
      return { pos, pickup: null, respawn: 0 };
    });
  }

  snap(p) {
    const w = this.world, R = K.RADIUS;
    const g = w.groundBelow(p.x, p.y, p.z);
    if (g === null || g < w.killY + 2) return null;
    if (w.overlapAny(p.x - R, g + 0.02, p.z - R, p.x + R, g + K.STAND_H, p.z + R)) return null;
    return { x: p.x, y: g, z: p.z };
  }

  fillPoints(list, need) {
    let guard = 0;
    while (list.length < need && guard++ < 200) {
      // farthest-point sampling over the main nav component
      let best = null, bd = -1;
      for (let i = 0; i < 30; i++) {
        const n = this.nav.randomNode();
        if (!n) break;
        const d = list.length ? Math.min(...list.map((p) => Math.hypot(p.x - n.x, p.z - n.z))) : 1;
        if (d > bd) { bd = d; best = n; }
      }
      if (!best) break;
      list.push({ x: best.x, y: best.y, z: best.z });
    }
  }

  assignSpawns() {
    const sp = [...this.spawns];
    const n = this.fighters.length;
    let chosen;
    if (n === 2) {
      let bi = 0, bj = 1, bd = -1;
      for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
        const d = Math.hypot(sp[i].x - sp[j].x, sp[i].z - sp[j].z);
        if (d > bd) { bd = d; bi = i; bj = j; }
      }
      chosen = Math.random() < 0.5 ? [sp[bi], sp[bj]] : [sp[bj], sp[bi]];
    } else if (this.cfg.mode === '2v2') {
      const a = sp[Math.floor(Math.random() * sp.length)];
      const sorted = sp.slice().sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
      chosen = [sorted[0], sorted[1], sorted[sorted.length - 1], sorted[sorted.length - 2]];
      if (Math.random() < 0.5) chosen = [chosen[2], chosen[3], chosen[0], chosen[1]];
    } else chosen = shuffle(sp).slice(0, n);
    this.fighters.forEach((f, i) => {
      const p = chosen[i] || sp[i % sp.length];
      const yaw = Math.atan2(p.x, p.z); // face the map centre
      f.reset({ x: p.x + (Math.random() - 0.5) * 0.2, y: p.y + 0.01, z: p.z + (Math.random() - 0.5) * 0.2, yaw });
      f.fists = newWeaponInstance('fists');
      f.model.deadT = 0;
    });
  }

  startTake() {
    this.takeNo++;
    this.combat.clear();
    this.effects.clear();
    this.assignSpawns();
    for (const b of this.brains.values()) { b.reset(); b.yaw = b.f.yaw; }
    for (const s of this.spawners) {
      s.pickup = this.combat.spawnPickup(newWeaponInstance(pickWeapon()), s.pos, s);
      s.respawn = 0;
    }
    if (this.player) { this.pYaw = this.player.yaw; this.pPitch = 0; }
    this.state = 'countdown';
    this.stateT = this.takeNo === 1 ? 2.6 : 1.8;
    this.lastBeep = Math.ceil(this.stateT);
    this.takeTime = 0;
    this.damageEnabled = false;
    this.deathInfo = '';
    this.spectateTarget = null;
    for (const s of this.sides) s.lastDeath = -1;
    if (!this.attract) {
      const mname = this.mapDef.name[getLang()] || this.mapDef.name.en;
      if (this.takeNo === 1) this.hud.message(`${t('round')} ${this.roundNo}`, mname, 2.4);
      else this.hud.message(`${t('take')} ${this.takeNo}`, '', 1.6);
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
      let pin;
      if (f === this.player) pin = this.playerInput(inp, dt);
      else pin = this.brains.get(f).think(dt, this);
      if (frozen) { pin.mx = pin.mz = 0; pin.jumpPressed = pin.rollPressed = pin.crouchPressed = false; pin.fire = pin.firePressed = pin.altPressed = false; pin.throwPressed = false; }
      const wasAlive = f.alive;
      f.update(dt, pin, this.world, this.emit);
      if (!frozen) this.combat.updateFighter(f, pin, dt);
      if (wasAlive && f.alive && f.pos.y < this.world.killY) {
        const lh = f.lastHit;
        if (lh && lh.attacker !== f && this.time - lh.t < 6) this.kill(f, lh.attacker, lh.weaponId, { void: true });
        else this.kill(f, null, null, { void: true });
      }
      if (!f.alive && f.pos.y > this.world.killY - 10) {
        // corpses settle under gravity
        f.vel.y -= K.GRAVITY * dt; f.vel.x *= 0.95; f.vel.z *= 0.95;
        f.height = 0.6; f.move(this.world, dt, () => {});
      }
      this.footsteps(f, dt);
      f.model.update(dt, f);
    }
    if (this.player) this.player.model.root.visible = !this.player.alive;

    this.combat.updateProjectiles(dt);
    this.combat.updatePickups(dt);
    for (const s of this.spawners) {
      if (!s.pickup && s.respawn > 0) {
        s.respawn -= dt;
        if (s.respawn <= 0) s.pickup = this.combat.spawnPickup(newWeaponInstance(pickWeapon()), s.pos, s);
      }
    }
    this.effects.update(dt);
    this.stateMachine(dt);
  }

  stateMachine() {
    switch (this.state) {
      case 'countdown': {
        const c = Math.ceil(this.stateT);
        if (c < this.lastBeep && c > 0) { this.lastBeep = c; if (!this.attract) sfx('beep'); }
        if (this.stateT <= 0) {
          this.state = 'play';
          this.damageEnabled = true;
          if (!this.attract) { this.hud.message(t('fight'), '', 0.8); sfx('go'); }
        }
        break;
      }
      case 'play': {
        this.takeTime += 1 / 60;
        const alive = this.sides.filter((s) => s.members.some((m) => m.alive));
        if (alive.length <= 1) { this.state = 'takeEnd'; this.stateT = 1.0; }
        break;
      }
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
      const last = Math.max(...this.sides.map((s) => s.lastDeath));
      winners = this.sides.filter((s) => s.lastDeath >= last - 1);
    }
    for (const s of winners) this.takes[s.id]++;
    const pSide = this.player ? this.sides.find((s) => s.members.includes(this.player)) : null;
    const roundWinners = this.sides.filter((s) => this.takes[s.id] >= this.takesPerRound);
    this.next = 'take';
    if (roundWinners.length) {
      for (const s of roundWinners) this.rounds[s.id]++;
      const max = Math.max(...this.sides.map((s) => this.rounds[s.id]));
      const leaders = this.sides.filter((s) => this.rounds[s.id] === max);
      this.next = max >= this.roundsToWin && leaders.length === 1 && !this.attract ? 'match' : 'round';
      if (this.attract && max >= this.roundsToWin) for (const s of this.sides) this.rounds[s.id] = 0;
      if (!this.attract) {
        if (roundWinners.length === 1 && roundWinners[0] === pSide) { this.hud.message(t('youWinRound'), '', 2.2); sfx('win'); }
        else this.hud.message(`${t('roundWonBy')}: ${roundWinners.map((s) => s.name).join(', ')}`, '', 2.2);
      }
    } else if (!this.attract) {
      if (winners.length > 1) this.hud.message(t('draw'), '', 1.8);
      else if (winners[0] === pSide) this.hud.message(t('youWinTake'), '', 1.8);
      else this.hud.message(`${t('takeWonBy')}: ${winners[0].name}`, '', 1.8);
    }
    this.state = 'between';
    this.stateT = this.next === 'take' ? 1.8 : 2.6;
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
    this.music.stop(1.5);
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
  playerInput(inp, dt) {
    const f = this.player;
    const out = { mx: 0, mz: 0, jumpPressed: false, crouch: false, crouchPressed: false, rollPressed: false, fire: false, firePressed: false, alt: false, altPressed: false, pickupPressed: false, throwPressed: false, lean: 0, yaw: this.pYaw, pitch: this.pPitch };
    if (!inp || this.paused) { this.lastLook = { dx: 0, dy: 0 }; return out; }
    const w = f.weapon;
    const zoomMul = w && w.zoomed ? (w.def.zoom || 1) : 1;
    const sens = settings.sens * 0.0021 * zoomMul;
    this.pYaw -= inp.dx * sens;
    this.pPitch -= inp.dy * sens * (settings.invertY ? -1 : 1);
    if (f.recoil) { this.pPitch += f.recoil * 0.45; this.fx.kick += f.recoil * 0.8; f.recoil = 0; }
    this.pPitch = Math.max(-1.55, Math.min(1.55, this.pPitch));
    this.lastLook = { dx: inp.dx, dy: inp.dy };
    let fw = (inp.fwd ? 1 : 0) - (inp.back ? 1 : 0), rt = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (inp.joy) { fw = -inp.joy.y; rt = inp.joy.x; }
    const sy = Math.sin(this.pYaw), cy = Math.cos(this.pYaw);
    out.mx = -sy * fw + cy * rt;
    out.mz = -cy * fw - sy * rt;
    Object.assign(out, {
      jumpPressed: inp.jumpPressed, crouch: inp.crouch, crouchPressed: inp.crouchPressed, rollPressed: inp.rollPressed,
      fire: inp.fire, firePressed: inp.firePressed, alt: inp.alt, altPressed: inp.altPressed,
      pickupPressed: inp.pickupPressed, throwPressed: inp.throwPressed, lean: inp.lean, yaw: this.pYaw, pitch: this.pPitch,
    });
    void dt;
    return out;
  }

  emit(name, f, extra) {
    const isP = f === this.player;
    const vol = isP ? 0.7 : 1;
    switch (name) {
      case 'jump': sfx('jump', f.pos, vol); break;
      case 'land':
        if (extra > 6) sfx('land', f.pos, vol * Math.min(1.4, extra / 10));
        if (isP) this.fx.landDip = Math.min(0.22, extra * 0.012);
        break;
      case 'slide': sfx('slide', f.pos, vol); break;
      case 'roll': sfx('roll', f.pos, vol); break;
      case 'dive': sfx('roll', f.pos, vol); break;
      case 'wallbounce':
        sfx('wallbounce', f.pos, vol);
        this.effects.burst({ x: f.pos.x - f.wallNormal.x * 0.4, y: f.pos.y + 0.8, z: f.pos.z - f.wallNormal.z * 0.4 }, 0xd0d0d0, 5, 2, 0.06, 0.4);
        break;
      case 'pad': sfx('pad', f.pos, vol); break;
      default: break;
    }
  }

  footsteps(f, dt) {
    if (!f.alive || !f.onGround || f.state !== 'normal') return;
    const hs = f.horizSpeed;
    if (hs < 3) return;
    f.stepT = (f.stepT || 0) - dt * hs;
    if (f.stepT <= 0) { f.stepT = 2.4; sfx('step', f.pos, f === this.player ? 0.5 : 0.9); }
  }

  shake(pos, radius) {
    const c = this.camera.position;
    const d = Math.hypot(pos.x - c.x, pos.y - c.y, pos.z - c.z);
    this.fx.shake = Math.max(this.fx.shake, Math.max(0, 1 - d / (radius * 4)) * 0.6);
  }

  // ---------------- combat callbacks ----------------
  onFire(f, id, kind) {
    if (f === this.player) this.vm.onFire(kind);
    else if (WEAPONS[id] && WEAPONS[id].kind !== 'melee' && kind !== 'throw') this.effects.muzzle(this.combat.muzzlePos(f));
  }

  onPickup() {}

  onDamage(victim, amount, attacker, weaponId, opts) {
    if (attacker === this.player && victim !== this.player) {
      this.hud.hitmarker(opts.head, victim.hp <= 0);
      sfx(opts.head ? 'headshot' : 'hit');
    }
    if (victim === this.player) {
      this.fx.damage = Math.min(1, this.fx.damage + amount / 60);
      sfx('hurt', null, 0.8);
      const src = attacker && attacker !== victim ? attacker.pos : null;
      if (src) {
        const yawTo = Math.atan2(-(src.x - victim.pos.x), -(src.z - victim.pos.z));
        this.hud.damageFrom(-(yawTo - this.pYaw));
      }
    }
  }

  kill(victim, attacker, weaponId, opts = {}) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.deathTime = this.time;
    const side = this.sides.find((s) => s.members.includes(victim));
    if (side) side.lastDeath = this.time;
    this.combat.dropWeapon(victim);
    victim.deaths++;
    if (attacker && attacker !== victim) attacker.kills++;
    const tags = [];
    if (opts.head) tags.push('tagHead');
    if (opts.noscope) tags.push('tagNoscope');
    if (opts.ricochet) tags.push('tagRic');
    if (opts.thrown || opts.thrownKnife) tags.push('tagThrown');
    if (opts.lunge) tags.push('tagLunge');
    if (opts.chain) tags.push('tagChain');
    if (opts.bounced) tags.push('tagBounce');
    if (attacker && attacker !== victim && attacker.alive) {
      if (attacker.state === 'slide') tags.push('tagSlide');
      else if (attacker.state === 'roll' || attacker.state === 'dive') tags.push('tagRoll');
      else if (!attacker.onGround) tags.push('tagAir');
    }
    if (opts.void) tags.push('tagVoid');
    const involves = !!this.player && (victim === this.player || attacker === this.player);
    this.hud.killfeed(attacker, victim, weaponId || 'fists', tags, involves);
    this.effects.burst(victim.center(), victim.color, 16, 6, 0.12, 0.9);
    if (attacker === this.player && victim !== this.player) {
      sfx('kill');
      if (!this.attract) stats.kills++;
    }
    if (victim === this.player) {
      stats.deaths++;
      const lang = getLang();
      if (attacker && attacker !== victim) {
        this.deathInfo = `${t('killedBy')}: <b>${attacker.displayName}</b> [${weaponName(weaponId, lang)}]${tags.length ? ' · ' + tags.map((x) => t(x)).join(' · ') : ''}`;
        this.spectateTarget = attacker;
      } else if (opts.void) this.deathInfo = `${t('you')} — ${t('fellVoid')}`;
      else this.deathInfo = `${t('you')} — ${t('selfKill')} [${weaponName(weaponId, lang)}]`;
      this.spectateDelay = 1.2;
    }
  }

  // ---------------- camera & render ----------------
  render(dt) {
    if (this.state === 'idle') return;
    const fx = this.fx;
    fx.kick *= Math.exp(-dt * 12);
    fx.shake *= Math.exp(-dt * 6);
    fx.landDip *= Math.exp(-dt * 9);
    fx.damage = Math.max(0, fx.damage - dt * 1.2);
    fx.flash = Math.max(0, fx.flash - dt * 3);
    const cam = this.camera;
    const p = this.player;
    let firstPerson = false;
    let fov = settings.fov;

    if (p && p.alive) {
      firstPerson = true;
      const right = { x: Math.cos(this.pYaw), z: -Math.sin(this.pYaw) };
      const leanOff = p.lean * 0.45;
      let bobY = 0, bobRoll = 0;
      if (p.onGround && p.state === 'normal' && p.horizSpeed > 1) {
        fx.bob += dt * p.horizSpeed * 1.25;
        const a = Math.min(1, p.horizSpeed / 7);
        bobY = Math.abs(Math.sin(fx.bob)) * 0.045 * a;
        bobRoll = Math.sin(fx.bob) * 0.006 * a;
      }
      cam.position.set(p.pos.x + right.x * leanOff, p.eyeY - fx.landDip + bobY, p.pos.z + right.z * leanOff);
      let pitchOff = 0, rollOff = -p.lean * 0.12 + bobRoll;
      if (p.state === 'slide') { rollOff += 0.09; fov += 6; }
      if (p.state === 'dive') { pitchOff -= 0.18; fov += 8; }
      if (p.state === 'roll' && settings.rollCam) {
        // full 360° tumble in the roll direction
        const tt = Math.min(1, p.stateT / K.ROLL_TIME);
        const e = tt * tt * (3 - 2 * tt);
        const fwd = { x: -Math.sin(this.pYaw), z: -Math.cos(this.pYaw) };
        const fComp = p.rollDir.x * fwd.x + p.rollDir.z * fwd.z;
        const sComp = p.rollDir.x * right.x + p.rollDir.z * right.z;
        pitchOff -= fComp * e * Math.PI * 2;
        rollOff -= sComp * e * Math.PI * 2;
      } else if (p.state === 'roll') rollOff += 0.1;
      if (p.wallAnim > 0) {
        const k = Math.sin((1 - p.wallAnim / 0.4) * Math.PI);
        const side = p.wallNormal.x * right.x + p.wallNormal.z * right.z;
        rollOff += side * 0.22 * k;
        pitchOff += 0.05 * k;
      }
      fov += Math.max(0, Math.min(10, (p.horizSpeed - 8) * 1.2));
      const w = p.weapon;
      if (w && w.zoomed) fov = settings.fov * (w.def.zoom || 1);
      const sh = fx.shake;
      cam.rotation.set(this.pPitch + fx.kick + pitchOff + (Math.random() - 0.5) * sh * 0.1, this.pYaw + (Math.random() - 0.5) * sh * 0.1, rollOff);
    } else {
      this.spectateDelay = (this.spectateDelay || 0) - dt;
      let tgt = this.spectateTarget;
      if (this.attract) {
        this.attractT = (this.attractT || 0) - dt;
        if (!tgt || !tgt.alive || this.attractT <= 0) { tgt = this.fighters.filter((f) => f.alive)[Math.floor(Math.random() * 4)] || this.fighters[0]; this.attractT = 9; }
      } else if (p && this.spectateDelay > 0) tgt = p;
      else if (!tgt || !tgt.alive) tgt = this.fighters.find((f) => f.alive && f !== p) || p || this.fighters[0];
      this.spectateTarget = tgt;
      const yaw = tgt.alive ? (tgt === p ? this.pYaw : tgt.yaw) : (this.specYaw || 0);
      this.specYaw = this.specYaw === undefined ? yaw : this.specYaw + angleLerp(this.specYaw, yaw, Math.min(1, dt * 3));
      const head = { x: tgt.pos.x, y: tgt.pos.y + 1.6, z: tgt.pos.z };
      const back = { x: Math.sin(this.specYaw) * 4, y: 1.6, z: Math.cos(this.specYaw) * 4 };
      const len = Math.hypot(back.x, back.y, back.z);
      const h = this.world.raycast(head.x, head.y, head.z, back.x / len, back.y / len, back.z / len, len);
      const d = h ? Math.max(0.5, h.t - 0.3) : len;
      cam.position.set(head.x + back.x / len * d, head.y + back.y / len * d, head.z + back.z / len * d);
      cam.lookAt(head.x, head.y, head.z);
    }
    if (cam.fov !== fov) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix(); }
    setListener(cam.position.x, cam.position.y, cam.position.z, firstPerson ? this.pYaw : cam.rotation.y);

    if (firstPerson) this.vm.update(dt, p, this.lastLook, { aspect: this.aspect, hidden: false });
    this.post.render(this.scene, cam, firstPerson ? this.vm : null, this.time, fx.damage * 0.8, fx.flash);
  }
}

function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d * k;
}
