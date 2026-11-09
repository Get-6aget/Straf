import { t, getLang } from './i18n.js';
import { weaponName } from './weapons.js';
import { MAX_HP } from './constants.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="score" id="h-score"></div>
      <div class="killfeed" id="h-kf"></div>
      <div class="cross" id="h-cross"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="hitmark" id="h-hit"></div>
      <div class="dmgdir" id="h-dmg"></div>
      <div class="center" id="h-center"><div class="big"></div><div class="small"></div></div>
      <div class="vitals"><div class="hpbar"><div id="h-hpfill"></div></div><div class="hpnum" id="h-hp">100</div></div>
      <div class="weapon"><div class="wname" id="h-wname"></div><div class="wammo" id="h-wammo"></div><div class="walt" id="h-walt"></div></div>
      <div class="hint" id="h-hint"></div>
      <div class="death" id="h-death"></div>
      <div class="scope" id="h-scope"></div>
      <div class="board" id="h-board"></div>
      <div class="mapname" id="h-map"></div>`;
    this.$ = (id) => root.querySelector('#' + id);
    this.kf = this.$('h-kf');
    this.cache = {};
    this.hitT = 0;
    this.centerT = 0;
    this.dmgMarks = [];
  }

  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    this.$(id).innerHTML = html;
  }

  show(v) { this.root.style.display = v ? 'block' : 'none'; }

  message(big, small = '', dur = 2) {
    const c = this.$('h-center');
    c.querySelector('.big').textContent = big;
    c.querySelector('.small').textContent = small;
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    c.style.opacity = 1;
    this.centerT = dur;
  }

  hitmarker(head, kill) {
    const h = this.$('h-hit');
    h.className = 'hitmark on' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.35 : 0.15;
  }

  damageFrom(angle) {
    const el = document.createElement('div');
    el.className = 'dmgarc';
    el.style.transform = `rotate(${angle}rad)`;
    this.$('h-dmg').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // Kill feed: "<killer> [weapon · tags] <victim>"
  killfeed(killer, victim, weaponId, tags, involvesPlayer) {
    const lang = getLang();
    const el = document.createElement('div');
    el.className = 'kf' + (involvesPlayer ? ' me' : '');
    const name = (f) => `<span class="kn" style="color:${hex(f.color)}">${esc(f.displayName)}</span>`;
    const tagStr = tags.length ? `<span class="kt">${tags.map((x) => esc(t(x))).join(' · ')}</span>` : '';
    if (!killer && tags.includes('tagVoid')) {
      el.innerHTML = `${name(victim)} <span class="kw">${esc(t('fellVoid'))}</span>`;
    } else if (killer === victim) {
      el.innerHTML = `${name(victim)} <span class="kw">[${esc(weaponName(weaponId, lang))}]</span> <span class="kw">${esc(t('selfKill'))}</span>`;
    } else {
      el.innerHTML = `${name(killer)} <span class="kw">[${esc(weaponName(weaponId, lang))}]</span>${tagStr} ${name(victim)}`;
    }
    this.kf.prepend(el);
    while (this.kf.children.length > 6) this.kf.lastChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 6000);
  }

  clearFeed() { this.kf.innerHTML = ''; }

  update(dt, g) {
    const p = g.player;
    this.hitT -= dt;
    if (this.hitT <= 0) this.$('h-hit').className = 'hitmark';
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.$('h-center').style.opacity = 0; }

    // scores
    let sc = '';
    for (const side of g.sides) {
      const pips = Array.from({ length: g.takesPerRound }, (_, i) => `<i class="${i < g.takes[side.id] ? 'on' : ''}"></i>`).join('');
      const alive = side.members.some((m) => m.alive);
      sc += `<div class="side ${alive ? '' : 'dead'}" style="--c:${hex(side.color)}"><span class="sn">${esc(side.name)}</span><span class="sr">${g.rounds[side.id]}</span><span class="pips">${pips}</span></div>`;
    }
    this.set('h-score', sc + `<div class="goal">${g.roundsToWin}</div>`);
    this.set('h-map', g.mapDef ? `${esc(g.mapDef.name[getLang()] || g.mapDef.name.en)} · ${t('round')} ${g.roundNo}` : '');

    if (!p) return;
    const hp = Math.max(0, Math.ceil(p.hp));
    this.set('h-hp', String(hp));
    const fill = this.$('h-hpfill');
    const pct = Math.max(0, p.hp / MAX_HP) * 100;
    if (this.cache.hpw !== pct) { fill.style.width = pct + '%'; fill.classList.toggle('low', pct < 35); this.cache.hpw = pct; }

    const w = p.weapon;
    const lang = getLang();
    if (w) {
      this.set('h-wname', esc(weaponName(w.id, lang)));
      this.set('h-wammo', w.ammo === Infinity ? '∞' : `${w.ammo}<small>/${w.def.ammo}</small>`);
      this.set('h-walt', w.def.altName ? `<b>${t('altFire')}</b> ${esc(w.def.altName[lang] || w.def.altName.en)} &nbsp; <b>G</b> ${t('throwHint').split('—')[1] || ''}` : '');
    } else {
      this.set('h-wname', esc(weaponName('fists', lang)));
      this.set('h-wammo', `<small>${t('noWeapon')}</small>`);
      this.set('h-walt', `<b>${t('altFire')}</b> ${esc((lang === 'ru' ? 'Толчок' : 'Shove'))}`);
    }

    // pickup hint
    let hint = '';
    if (p.alive && g.state === 'play') {
      const near = g.combat.pickups.find((pk) => Math.hypot(pk.pos.x - p.pos.x, pk.pos.z - p.pos.z) < 2.4 && Math.abs(pk.pos.y - p.pos.y) < 1.8);
      if (near && p.weapon) hint = `${t('swap')}: ${esc(weaponName(near.inst.id, lang))}`;
      if (p.weapon && p.weapon.ammo <= 0) hint = t('ctrlFire').split('(')[1]?.replace(')', '') || '';
    }
    this.set('h-hint', hint);

    // crosshair spread
    const sp = w && w.def.spread ? w.def.spread * (w.zoomed ? 0.3 : 1) * (p.onGround ? 1 : 1.4) : 0.01;
    const gap = Math.round(4 + sp * 260);
    if (this.cache.gap !== gap) { this.$('h-cross').style.setProperty('--gap', gap + 'px'); this.cache.gap = gap; }
    const scoped = w && w.zoomed && w.def.scope;
    this.$('h-scope').style.display = scoped ? 'block' : 'none';
    this.$('h-cross').style.display = scoped || !p.alive ? 'none' : 'block';

    // death / spectate info
    let d = '';
    if (!p.alive && g.deathInfo) d = g.deathInfo;
    else if (g.spectateTarget && !p.alive) d = `${t('spectating')}: ${esc(g.spectateTarget.displayName)}`;
    this.set('h-death', d);

    // scoreboard
    const board = this.$('h-board');
    if (g.showBoard) {
      board.style.display = 'block';
      let rows = `<div class="row head"><span>${t('name')}</span><span>${t('kills')}</span><span>${t('deaths')}</span></div>`;
      for (const f of [...g.fighters].sort((a, b) => b.kills - a.kills)) {
        rows += `<div class="row ${f === p ? 'me' : ''}"><span style="color:${hex(f.color)}">${esc(f.displayName)}</span><span>${f.kills}</span><span>${f.deaths}</span></div>`;
      }
      this.set('h-board', rows);
    } else board.style.display = 'none';
  }
}
