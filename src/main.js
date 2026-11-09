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
import { MAPS } from './maps.js';

const $ = (s, r = document) => r.querySelector(s);
const canvas = $('#c');
const uiRoot = $('#ui');

let game, input, hud, music;
let mode = 'menu'; // menu | play | paused | results
let isMobile = false;
let audioMuted = false;

function showLoading() {
  uiRoot.innerHTML = `<div class="screen loading on"><div class="logo">ПЕРЕ<span style="color:#c0603e">КАТ</span></div><div class="loadbar"><div></div></div></div>`;
}

function screens() {
  const tip = () => { const tips = t('tips'); return tips[Math.floor(Math.random() * tips.length)]; };
  uiRoot.innerHTML = `
  <div class="screen menu" id="s-menu"><div class="panel">
    <div class="logo">${t('title').slice(0, 4)}<span>${t('title').slice(4)}</span></div>
    <div class="sub">${t('subtitle')}</div>
    <button class="btn" data-mode="1v1">${t('play1v1')}</button>
    <button class="btn" data-mode="2v2">${t('play2v2')}</button>
    <button class="btn" data-mode="ffa">${t('playFfa')}</button>
    <div class="opt">${t('difficulty')}</div>
    <div class="seg" id="seg-diff">${[0, 1, 2].map((d) => `<button data-v="${d}">${t('diff' + d)}</button>`).join('')}</div>
    <div class="opt">${t('rounds')}</div>
    <div class="seg" id="seg-rounds">${[2, 4, 6, 8].map((d) => `<button data-v="${d}">${d}</button>`).join('')}</div>
    <div class="btnrow" style="margin-top:14px"><button class="btn sec" id="b-settings">${t('settings')}</button><button class="btn sec" id="b-controls">${t('controls')}</button></div>
    <div class="tip" id="tip">${tip()}</div>
    <div class="statline">${t('matches')}: ${stats.matches} · ${t('wins')}: ${stats.wins} · ${t('kills')}: ${stats.kills} · ${MAPS.length} ${t('map').toLowerCase()}</div>
  </div></div>
  <div class="screen modal" id="s-pause"><div class="panel">
    <h2>${t('paused')}</h2>
    <button class="btn" id="b-resume">${t('resume')}</button>
    <button class="btn sec" id="b-psettings">${t('settings')}</button>
    <button class="btn sec" id="b-pcontrols">${t('controls')}</button>
    <button class="btn sec" id="b-quit">${t('toMenu')}</button>
  </div></div>
  <div class="screen modal" id="s-settings"><div class="panel" id="settings-panel"></div></div>
  <div class="screen modal" id="s-controls"><div class="panel">
    <h2>${t('controls')}</h2>
    <div class="ctrl-list">${['ctrlMove', 'ctrlJump', 'ctrlSlide', 'ctrlRoll', 'ctrlFire', 'ctrlAlt', 'ctrlPick', 'ctrlThrow', 'ctrlLean', 'ctrlTab'].map((k) => `<div>${t(k)}</div>`).join('')}
    ${isMobile ? `<div>${t('hintTouch')}</div>` : ''}</div>
    <button class="btn" data-back>${t('back')}</button>
  </div></div>
  <div class="screen modal results" id="s-results"><div class="panel" id="results-panel"></div></div>
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
  uiRoot.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => back()));
  buildSettings();
}

let returnTo = 's-menu';
function show(id) {
  uiRoot.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
}
function openModal(id, from) { returnTo = from; show(id); }
function back() { show(returnTo); }

function buildSettings() {
  const p = $('#settings-panel');
  const range = (key, min, max, step, fmt = (v) => v) => `<div class="field"><label>${t(key)} <span id="v-${key}">${fmt(settings[key])}</span></label><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}"></div>`;
  p.innerHTML = `<h2>${t('settings')}</h2>
    <div class="field"><label>${t('name')}</label><input type="text" id="f-name" maxlength="16" value="${(settings.name || '').replace(/"/g, '')}" placeholder="${t('you')}"></div>
    ${range('sens', 0.2, 3, 0.05, (v) => Number(v).toFixed(2))}
    ${range('fov', 70, 115, 1)}
    ${range('music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
    ${range('sfx', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
    <div class="opt">${t('quality')}</div>
    <div class="seg" id="seg-q">${[0, 1, 2].map((d) => `<button data-v="${d}">${t('q' + d)}</button>`).join('')}</div>
    <div class="field check"><label><input type="checkbox" data-c="rollCam" ${settings.rollCam ? 'checked' : ''}> ${t('rollCam')}</label></div>
    <div class="field check"><label><input type="checkbox" data-c="invertY" ${settings.invertY ? 'checked' : ''}> ${t('invertY')}</label></div>
    <button class="btn" data-back>${t('back')}</button>`;
  p.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.k;
    settings[k] = Number(inp.value);
    const fmt = { sens: (v) => v.toFixed(2), music: (v) => Math.round(v * 100) + '%', sfx: (v) => Math.round(v * 100) + '%' }[k] || ((v) => v);
    $('#v-' + k).textContent = fmt(settings[k]);
    setVolumes({ music: settings.music, sfx: settings.sfx });
    saveSettings();
  }));
  p.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => { settings[c.dataset.c] = c.checked; saveSettings(); }));
  $('#f-name').addEventListener('input', (e) => { settings.name = e.target.value.trim().slice(0, 16); saveSettings(); });
  const q = $('#seg-q');
  const sync = () => q.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(settings.quality) === b.dataset.v));
  q.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { settings.quality = Number(b.dataset.v); saveSettings(); sync(); onResize(); }));
  sync();
  p.querySelector('[data-back]').addEventListener('click', () => back());
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
  game.startMatch({ mode: m, difficulty: settings.difficulty, roundsToWin: settings.rounds });
  if (!isMobile) input.lock();
  lastCfg = m;
}
let lastCfg = '1v1';

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
  startAttract();
  show('s-menu');
}

function startAttract() {
  game.startMatch({ mode: 'ffa', attract: true, roundsToWin: 99 });
  music.play(((Math.random() * 1e6) | 0), true);
}

async function onMatchEnd(res) {
  mode = 'results';
  input.enabled = false;
  input.unlock();
  $('#touch').classList.remove('on');
  await new Promise((r) => setTimeout(r, 1800));
  const rows = res.fighters.map((f) => `<div class="row"><span style="color:#${f.color.toString(16).padStart(6, '0')};text-shadow:0 1px 0 #0006">${f.displayName}</span><span>${f.kills}</span><span>${f.deaths}</span><span>${res.rounds[f.team]}</span></div>`).join('');
  $('#results-panel').innerHTML = `<div class="big ${res.won ? 'win' : 'lose'}">${res.won ? t('matchWon') : t('matchLost')}</div>
    <div class="sub">${t('winner')}: ${res.winner.name}</div>
    <div class="restable"><div class="row head"><span>${t('name')}</span><span>${t('kills')}</span><span>${t('deaths')}</span><span>${t('score')}</span></div>${rows}</div>
    <button class="btn" id="b-again">${t('again')}</button>
    <button class="btn sec" id="b-rmenu">${t('toMenu')}</button>`;
  // Interstitial between matches (Yandex rate-limits it on their side)
  await SDK.showFullscreenAd(() => setMuted(true), () => setMuted(audioMuted));
  hud.show(false);
  show('s-results');
  $('#b-again').onclick = () => { show(null); startMatch(lastCfg); };
  $('#b-rmenu').onclick = () => toMenu();
}

function onResize() {
  game.resize(window.innerWidth, window.innerHeight);
}

// ---------------- boot ----------------
async function boot() {
  showLoading();
  loadSettings();
  loadStats();
  await SDK.init();
  setLang(SDK.lang());
  document.documentElement.lang = SDK.lang() === 'ru' ? 'ru' : 'en';
  document.title = t('title');
  isMobile = SDK.isMobile();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(1);

  hud = new Hud($('#hud'));
  music = new Music();
  game = new Game(renderer, hud, music);
  input = new Input(canvas);
  if (isMobile) input.enableTouch($('#touch'));
  game.onMatchEnd = onMatchEnd;
  game.onGameplay = (on) => { if (mode === 'play') (on ? SDK.gameplayStart() : SDK.gameplayStop()); };
  input.onLockChange = (locked) => {
    $('#clickplay') && ($('#clickplay').style.display = 'none');
    if (!locked && mode === 'play' && !isMobile) pause();
  };
  // Escape never counts as a user gesture for pointer lock, so it only pauses.
  input.onEscape = () => { if (mode === 'play' && (isMobile || !input.locked)) pause(); };

  setVolumes({ music: settings.music, sfx: settings.sfx });
  const unlockAudio = () => {
    const first = !window.__audioReady;
    initAudio();
    window.__audioReady = true;
    if (first && mode === 'menu') music.play(((Math.random() * 1e6) | 0), true);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  const muteAll = (m) => { audioMuted = m; setMuted(m); };
  SDK.onPause(() => { muteAll(true); pause(); });
  SDK.onResume(() => muteAll(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { muteAll(true); pause(); } else muteAll(false);
  });

  screens();
  window.addEventListener('resize', onResize);
  onResize();
  startAttract();
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
      // sub-step the simulation for stable movement at low frame rates
      const steps = Math.min(4, Math.ceil(dt / (1 / 75)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        let si = inp;
        if (inp && i > 0) si = { ...inp, jumpPressed: false, crouchPressed: false, rollPressed: false, firePressed: false, altPressed: false, pickupPressed: false, throwPressed: false, dx: 0, dy: 0 };
        game.update(h, si);
      }
    }
    if (mode === 'play' || mode === 'results') hud.update(dt, game);
    // Chrome may refuse an immediate re-lock after Esc; prompt for a click instead
    const cp = $('#clickplay');
    if (cp) cp.style.display = mode === 'play' && !isMobile && !input.locked ? 'block' : 'none';
    game.render(dt);
  };
  requestAnimationFrame(loop);
  window.__game = game;
}

boot();
