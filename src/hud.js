import { t, getLang } from './i18n.js';
import { weaponName } from './weapons.js';
import { MAX_HP } from './constants.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function ammoText(w) {
  if (!w) return '<span class="dim">---</span>';
  if (w.ammo === Infinity) return '∞';
  return `${w.ammo}<span class="sep">/</span>${w.def.ammo}`;
}

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="cap small" id="h-round"></div>
        <div class="takes" id="h-takes"></div>
      </div>
      <div class="killfeed" id="h-kf"></div>
      <div class="cross" id="h-cross"><i></i><i></i><i></i><i></i></div>
      <div class="hitmark" id="h-hit"></div>
      <div class="dmgdir" id="h-dmg"></div>
      <div class="center" id="h-center"><div class="big"></div><div class="small"></div></div>
      <div class="bottom">
        <div class="cap ammo" id="h-ammoL"><div class="wn" id="h-wnL"></div><div class="num" id="h-numL"></div></div>
        <div class="cap hp" id="h-hpcap"><div class="heart"></div><div class="num" id="h-hp">100</div></div>
        <div class="cap ammo" id="h-ammoR"><div class="wn" id="h-wnR"></div><div class="num" id="h-numR"></div></div>
      </div>
      <div class="hint" id="h-hint"></div>
      <div class="death" id="h-death"></div>
      <div class="scope" id="h-scope"></div>
      <div class="speedo" id="h-speed"></div>
      <div class="board" id="h-board"></div>`;
    this.$ = (id) => root.querySelector('#' + id);
    this.kf = this.$('h-kf');
    this.cache = {};
    this.hitT = 0;
    this.centerT = 0;
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
    this.$('h-hit').className = 'hitmark on' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.35 : 0.14;
  }

  damageFrom(angle) {
    const el = document.createElement('div');
    el.className = 'dmgarc';
    el.style.transform = `rotate(${angle}rad)`;
    this.$('h-dmg').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // Sentence-style feed: "<victim> убит из «<weapon>» — <killer>"
  feed(html, mine) {
    const el = document.createElement('div');
    el.className = 'kf' + (mine ? ' me' : '');
    el.innerHTML = html;
    this.kf.appendChild(el);
    while (this.kf.children.length > 7) this.kf.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 7000);
  }

  killfeed(killer, victim, weaponId, opts, mine) {
    const lang = getLang();
    const v = `<b>${esc(victim.displayName)}</b>`;
    const w = `«${esc(weaponName(weaponId, lang))}»`;
    let s;
    if (opts.void && !killer) s = `${v} ${t('kfVoid')}`;
    else if (!killer || killer === victim) s = `${v} ${t('kfSelf')} ${weaponId ? w : ''}`;
    else {
      const k = `<b>${esc(killer.displayName)}</b>`;
      if (opts.void) s = `${v} ${t('kfPushed')} ${k}`;
      else if (opts.head) s = `${v} ${t('kfHead')} ${w} ${t('kfBy')} ${k}`;
      else if (opts.thrown) s = `${v} ${t('kfThrown')} ${w} ${t('kfBy')} ${k}`;
      else s = `${v} ${t('kfKilled')} ${w} ${t('kfBy')} ${k}`;
      if (opts.noscope) s += ` <i>${t('kfNoscope')}</i>`;
      if (opts.lunge) s += ` <i>${t('kfLunge')}</i>`;
      if (opts.air) s += ` <i>${t('kfAir')}</i>`;
      if (opts.slide) s += ` <i>${t('kfSlide')}</i>`;
    }
    this.feed(s, mine);
  }

  clearFeed() { this.kf.innerHTML = ''; }

  update(dt, g) {
    const p = g.player;
    this.hitT -= dt;
    if (this.hitT <= 0) this.$('h-hit').className = 'hitmark';
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.$('h-center').style.opacity = 0; }

    this.set('h-round', `${t('round')} <span class="g">${g.roundNo}</span>`);
    let tk = '';
    for (const side of g.sides) {
      const pips = Array.from({ length: g.takesPerRound }, (_, i) => `<i class="${i < g.takes[side.id] ? 'on' : ''}"></i>`).join('');
      const alive = side.members.some((m) => m.alive);
      tk += `<div class="cap side ${alive ? '' : 'dead'}"><span class="sn">${esc(side.name)}</span><span class="g">${g.rounds[side.id]}</span><span class="pips">${pips}</span></div>`;
    }
    this.set('h-takes', tk);
    if (!p) return;

    this.set('h-hp', String(Math.max(0, Math.ceil(p.hp))));
    this.$('h-hpcap').classList.toggle('low', p.hp < 35);
    const lang = getLang();
    const R = p.hands.R, L = p.hands.L;
    const twoH = R && R.def.hands === 2;
    this.set('h-numR', ammoText(R));
    this.set('h-wnR', R ? esc(weaponName(R.id, lang)) : '');
    this.set('h-numL', twoH ? '<span class="dim">≡</span>' : ammoText(L));
    this.set('h-wnL', L ? esc(weaponName(L.id, lang)) : '');

    let hint = '';
    if (p.alive && g.state === 'play') {
      const near = g.combat.nearestPickup(p, 2.4);
      if (near && (R || L)) hint = `F — ${esc(weaponName(near.inst.id, lang))}`;
      if (R && R.ammo <= 0) hint = t('hintEmpty');
    }
    this.set('h-hint', hint);

    const sp = R && R.def.spread ? R.def.spread * (R.zoomed ? 0.3 : 1) * (p.onGround ? 1 : 1.5) : 0.008;
    const gap = Math.round(3 + sp * 220);
    if (this.cache.gap !== gap) { this.$('h-cross').style.setProperty('--gap', gap + 'px'); this.cache.gap = gap; }
    const scoped = R && R.zoomed && R.def.scope;
    this.$('h-scope').style.display = scoped ? 'block' : 'none';
    this.$('h-cross').style.display = scoped || !p.alive ? 'none' : 'block';
    this.set('h-speed', g.showSpeed ? `${p.horizSpeed.toFixed(1)}` : '');

    this.set('h-death', !p.alive && g.deathInfo ? g.deathInfo : '');

    const board = this.$('h-board');
    if (g.showBoard) {
      board.style.display = 'block';
      let rows = `<div class="row head"><span>${t('name')}</span><span>${t('kills')}</span><span>${t('deaths')}</span></div>`;
      for (const f of [...g.fighters].sort((a, b) => b.kills - a.kills)) {
        rows += `<div class="row ${f === p ? 'me' : ''}"><span>${esc(f.displayName)}</span><span>${f.kills}</span><span>${f.deaths}</span></div>`;
      }
      this.set('h-board', rows);
    } else board.style.display = 'none';
    void MAX_HP;
  }
}
