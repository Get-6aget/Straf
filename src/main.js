import './style.css';
import * as THREE from 'three';
import { SDK } from './sdk.js';
import { setLang, t } from './i18n.js';
import { settings, loadSettings, saveSettings, stats, loadStats } from './settings.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { Music } from './music.js';
import { initAudio, setVolumes, setMuted } from './audio.js';
import { loadSky, preloadAll, setAnisotropy } from './assets.js';
import { MAPS, loadLevel } from './level.js';
import { loadCharacterAsset } from './charmodel.js';
import { loadArmsAsset } from './viewmodel.js';
import { loadWeaponAssets } from './models.js';
import { WEAPON_IDS } from './weapons.js';

const $ = (s, r = document) => r.querySelector(s);
const canvas = $('#c');
const uiRoot = $('#ui');

let game, input, hud, music;
let mode = 'menu'; // menu | play | paused | results
let isMobile = false;
let audioMuted = false;
let lastMode = '1v1';
let returnTo = 's-menu';

function showLoading(pct) {
  uiRoot.innerHTML = `<div class="screen loading on"><div class="logo">${t('titleA')}<span>${t('titleB')}</span></div><div class="loadbar"><div style="width:${pct}%"></div></div><div class="loadtxt">${t('loading')}…</div></div>`;
}

function screens() {
  const tips = t('tips');
  uiRoot.innerHTML = `
  <div class="screen menu" id="s-menu">
    <div class="frame left">
      <div class="logo">${t('titleA')}<span>${t('titleB')}</span></div>
      <div class="sub">${t('subtitle')}</div>
      <button class="mbtn" data-mode="1v1">${t('play1v1')}</button>
      <button class="mbtn" data-mode="2v2">${t('play2v2')}</button>
      <button class="mbtn" data-mode="ffa">${t('playFfa')}</button>
      <div class="row2"><button class="mbtn sm" id="b-settings">${t('settings')}</button><button class="mbtn sm" id="b-controls">${t('controls')}</button></div>
      <div class="tip">${tips[Math.floor(Math.random() * tips.length)]}</div>
    </div>
    <div class="frame right">
      <div class="ftitle">${t('difficulty')}</div>
      <div class="seg" id="seg-diff">${[0, 1, 2].map((d) => `<button data-v="${d}">${t('diff' + d)}</button>`).join('')}</div>
      <div class="ftitle">${t('rounds')}</div>
      <div class="seg" id="seg-rounds">${[2, 4, 6, 8].map((d) => `<button data-v="${d}">${d}</button>`).join('')}</div>
      <div class="ftitle">${t('stats')}</div>
      <div class="statline">${t('matches')} <b>${stats.matches}</b> · ${t('wins')} <b>${stats.wins}</b> · ${t('kills')} <b>${stats.kills}</b></div>
    </div>
    <div class="frame player">
      <div class="ftitle">${t('nowPlaying')}</div>
      <div class="ptitle" id="p-title">—</div>
      <div class="pctl"><button id="p-prev">⏮</button><button id="p-play">⏯</button><button id="p-next">⏭</button></div>
      <label class="pchk"><input type="checkbox" id="p-ingame" ${settings.inGameMusic ? 'checked' : ''}> ${t('inGameMusic')}</label>
    </div>
  </div>
  <div class="screen modal" id="s-pause"><div class="frame">
    <div class="mtitle">${t('paused')}</div>
    <button class="mbtn" id="b-resume">${t('resume')}</button>
    <button class="mbtn sm" id="b-psettings">${t('settings')}</button>
    <button class="mbtn sm" id="b-pcontrols">${t('controls')}</button>
    <button class="mbtn sm red" id="b-quit">${t('toMenu')}</button>
  </div></div>
  <div class="screen modal" id="s-settings"><div class="frame" id="settings-panel"></div></div>
  <div class="screen modal" id="s-controls"><div class="frame wide">
    <div class="mtitle">${t('controls')}</div>
    <div class="ctrl-list">${t('ctrl').map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>
    <button class="mbtn sm" data-back>${t('back')}</button>
  </div></div>
  <div class="screen results" id="s-results"><div class="board3d" id="results-panel"></div></div>
  <div class="clickplay" id="clickplay">${t('clickToPlay')}</div>`;

  uiRoot.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startMatch(b.dataset.mode)));
  const seg = (id, key) => {
    const el = $(id);
    const sync = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(settings[key]) === b.dataset.v));
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { settings[key] = Number(b.dataset.v); saveSettings(); sync(); }));
    sync();
  };
  seg('#seg-diff', 'difficulty');
  seg('#seg-rounds', 'rounds');
  $('#b-settings').onclick = () => openModal('s-settings', 's-menu');
  $('#b-controls').onclick = () => openModal('s-controls', 's-menu');
  $('#b-resume').onclick = () => resume();
  $('#b-psettings').onclick = () => openModal('s-settings', 's-pause');
  $('#b-pcontrols').onclick = () => openModal('s-controls', 's-pause');
  $('#b-quit').onclick = () => toMenu();
  uiRoot.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show(returnTo)));
  $('#p-prev').onclick = () => { initAudio(); music.prev(); };
  $('#p-next').onclick = () => { initAudio(); music.next(); };
  $('#p-play').onclick = () => { initAudio(); if (music.playing) music.stop(); else music.play(); };
  $('#p-ingame').onchange = (e) => { settings.inGameMusic = e.target.checked; saveSettings(); };
  music.onChange = (title) => { const el = $('#p-title'); if (el) el.textContent = title; };
  if (music.track) $('#p-title').textContent = music.title;
  buildSettings();
}

function show(id) { uiRoot.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id)); }
function openModal(id, from) { returnTo = from; show(id); }

function buildSettings() {
  const p = $('#settings-panel');
  const fmt = { sens: (v) => Number(v).toFixed(2), music: (v) => Math.round(v * 100) + '%', sfx: (v) => Math.round(v * 100) + '%' };
  const range = (k, min, max, step) => `<div class="field"><label>${t(k)} <span id="v-${k}">${(fmt[k] || ((v) => v))(settings[k])}</span></label><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${settings[k]}"></div>`;
  const check = (k) => `<label class="pchk"><input type="checkbox" data-c="${k}" ${settings[k] ? 'checked' : ''}> ${t(k)}</label>`;
  p.innerHTML = `<div class="mtitle">${t('settings')}</div>
    <div class="field"><label>${t('name')}</label><input type="text" id="f-name" maxlength="16" value="${(settings.name || '').replace(/"/g, '')}" placeholder="${t('you')}"></div>
    ${range('sens', 0.2, 3, 0.05)}${range('fov', 80, 120, 1)}${range('music', 0, 1, 0.05)}${range('sfx', 0, 1, 0.05)}
    <div class="ftitle">${t('quality')}</div>
    <div class="seg" id="seg-q">${[0, 1, 2].map((d) => `<button data-v="${d}">${t('q' + d)}</button>`).join('')}</div>
    ${check('autoSprint')}${check('invertY')}${check('speedo')}
    <button class="mbtn sm" data-back>${t('back')}</button>`;
  p.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.k;
    settings[k] = Number(inp.value);
    $('#v-' + k).textContent = (fmt[k] || ((v) => v))(settings[k]);
    setVolumes({ music: settings.music, sfx: settings.sfx });
    saveSettings();
  }));
  p.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => { settings[c.dataset.c] = c.checked; saveSettings(); }));
  $('#f-name').addEventListener('input', (e) => { settings.name = e.target.value.trim().slice(0, 16); saveSettings(); });
  const q = $('#seg-q');
  const sync = () => q.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(settings.quality) === b.dataset.v));
  q.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { settings.quality = Number(b.dataset.v); saveSettings(); sync(); onResize(); }));
  sync();
  p.querySelector('[data-back]').addEventListener('click', () => show(returnTo));
}

// ---------------- flow ----------------
function startMatch(m) {
  initAudio();
  mode = 'play';
  show(null);
  hud.show(true);
  if (isMobile) $('#touch').classList.add('on');
  input.enabled = true;
  game.paused = false;
  if (!settings.inGameMusic) music.stop();
  game.startMatch({ mode: m, difficulty: settings.difficulty, roundsToWin: settings.rounds });
  if (!isMobile) input.lock();
  lastMode = m;
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  game.paused = true;
  input.enabled = false;
  input.unlock();
  SDK.gameplayStop();
  show('s-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  show(null);
  input.enabled = true;
  game.paused = false;
  SDK.gameplayStart();
  if (!isMobile) input.lock();
}

function toMenu() {
  mode = 'menu';
  game.paused = false;
  input.enabled = false;
  input.unlock();
  hud.show(false);
  $('#touch').classList.remove('on');
  game.stop();
  game.startMatch({ mode: 'ffa', attract: true, roundsToWin: 99 });
  screens();
  show('s-menu');
}

async function onMatchEnd(res) {
  mode = 'results';
  input.enabled = false;
  input.unlock();
  $('#touch').classList.remove('on');
  await new Promise((r) => setTimeout(r, 1600));
  const sides = [...res.sides].sort((a, b) => res.rounds[b.id] - res.rounds[a.id]);
  const rows = sides.map((s, i) => `<div class="place p${i + 1}"><span class="pn">${i + 1}</span><span class="pnm">${s.name}</span><span class="pr">${res.rounds[s.id]} ${t('wonRounds')}</span></div>`).join('');
  $('#results-panel').innerHTML = `<div class="big ${res.won ? 'win' : 'lose'}">${res.won ? t('victory') : t('defeat')}</div>${rows}
    <div class="row2"><button class="mbtn" id="b-again">${t('again')}</button><button class="mbtn sm" id="b-rmenu">${t('toMenu')}</button></div>`;
  await SDK.showFullscreenAd(() => setMuted(true), () => setMuted(audioMuted));
  hud.show(false);
  show('s-results');
  $('#b-again').onclick = () => { show(null); startMatch(lastMode); };
  $('#b-rmenu').onclick = () => toMenu();
}

function onResize() { game.resize(window.innerWidth, window.innerHeight); }

async function boot() {
  loadSettings();
  loadStats();
  await SDK.init();
  setLang(SDK.lang());
  document.documentElement.lang = SDK.lang() === 'ru' ? 'ru' : 'en';
  document.title = t('title');
  showLoading(10);
  isMobile = SDK.isMobile();
  if (isMobile && settings.quality > 0 && !localStorage.getItem('perekat_settings_v2')) settings.quality = 0;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  setAnisotropy(renderer);

  const [sky, ...lvls] = await Promise.all([loadSky(renderer), ...MAPS.map((d) => loadLevel(d, renderer)), preloadAll(), loadCharacterAsset(), loadWeaponAssets(WEAPON_IDS), loadArmsAsset()]);
  const levels = new Map(MAPS.map((d, i) => [d.id, lvls[i]]));
  showLoading(90);

  hud = new Hud($('#hud'));
  music = new Music();
  game = new Game(renderer, hud, music, sky, levels);
  input = new Input(canvas);
  if (isMobile) input.enableTouch($('#touch'));
  game.onMatchEnd = onMatchEnd;
  game.onGameplay = (on) => { if (mode === 'play') (on ? SDK.gameplayStart() : SDK.gameplayStop()); };
  input.onLockChange = (locked) => { if (!locked && mode === 'play' && !isMobile) pause(); };
  input.onEscape = () => { if (mode === 'play' && (isMobile || !input.locked)) pause(); };

  setVolumes({ music: settings.music, sfx: settings.sfx });
  const unlockAudio = () => {
    const first = !window.__audioReady;
    initAudio();
    window.__audioReady = true;
    if (first && mode === 'menu' && settings.music > 0) music.play();
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  const muteAll = (m) => { audioMuted = m; setMuted(m); };
  SDK.onPause(() => { muteAll(true); pause(); });
  SDK.onResume(() => muteAll(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { muteAll(true); pause(); } else muteAll(false); });

  screens();
  window.addEventListener('resize', onResize);
  onResize();
  game.startMatch({ mode: 'ffa', attract: true, roundsToWin: 99 });
  show('s-menu');
  SDK.ready();

  let last = performance.now();
  const loop = (now) => {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    const inp = mode === 'play' ? input.consume() : (input.consume(), null);
    if (mode !== 'paused' && mode !== 'results') {
      const steps = Math.min(4, Math.ceil(dt / (1 / 90)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        let si = inp;
        if (inp && i > 0) si = { ...inp, jumpPressed: false, crouchPressed: false, firePressed: false, altPressed: false, pickupPressed: false, throwPressed: false, dx: 0, dy: 0 };
        game.update(h, si);
      }
    }
    if (mode === 'play' || mode === 'results') hud.update(dt, game);
    const cp = $('#clickplay');
    if (cp) cp.style.display = mode === 'play' && !isMobile && !input.locked ? 'block' : 'none';
    game.render(dt);
  };
  requestAnimationFrame(loop);
  window.__game = game;
}

boot();
