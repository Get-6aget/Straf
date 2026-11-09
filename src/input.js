import { t } from './i18n.js';

// Keys are bound by physical code so the Russian layout works too.
// Ctrl+W still closes the tab in windowed mode, so C is the primary crouch key.
const BIND = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right', ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  Space: 'jump', KeyC: 'crouch', ControlLeft: 'crouch', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyQ: 'leanL', KeyE: 'leanR', KeyF: 'pickup', KeyG: 'throw', Tab: 'tab',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.edges = new Set();
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.enabled = false;
    this.touch = null;
    this.onLockChange = null;
    this.onEscape = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { this.onEscape?.(); return; }
      const a = BIND[e.code];
      if (!a) return;
      if (this.enabled) e.preventDefault();
      if (!this.held.has(a)) this.edges.add(a);
      this.held.add(a);
    });
    window.addEventListener('keyup', (e) => { const a = BIND[e.code]; if (a) this.held.delete(a); });
    window.addEventListener('blur', () => this.held.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.touch) { this.lock(); return; }
      const a = e.button === 0 ? 'fire' : e.button === 2 ? 'alt' : null;
      if (a) { if (!this.held.has(a)) this.edges.add(a); this.held.add(a); }
    });
    window.addEventListener('mouseup', (e) => {
      const a = e.button === 0 ? 'fire' : e.button === 2 ? 'alt' : null;
      if (a) this.held.delete(a);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Clamp huge spikes some browsers emit on pointer-lock transitions
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.held.delete('fire'); this.held.delete('alt'); }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (this.touch) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  consume() {
    const h = this.held, e = this.edges;
    const out = {
      fwd: h.has('fwd'), back: h.has('back'), left: h.has('left'), right: h.has('right'),
      jumpPressed: e.has('jump'), jump: h.has('jump'), crouch: h.has('crouch'), crouchPressed: e.has('crouch'), sprint: h.has('sprint'),
      fire: h.has('fire'), firePressed: e.has('fire'), alt: h.has('alt'), altPressed: e.has('alt'),
      pickupPressed: e.has('pickup'), throwPressed: e.has('throw'), lean: (h.has('leanR') ? 1 : 0) - (h.has('leanL') ? 1 : 0),
      tab: h.has('tab'), dx: this.dx, dy: this.dy, joy: null,
    };
    if (this.touch) {
      const T = this.touch;
      out.joy = T.joy.active ? { x: T.joy.x, y: T.joy.y } : null;
      out.dx += T.lookDx; out.dy += T.lookDy;
      T.lookDx = 0; T.lookDy = 0;
      for (const [k, v] of Object.entries(T.btn)) {
        if (k === 'fire') { out.fire ||= v.held; out.firePressed ||= v.edge; }
        if (k === 'alt') { out.alt ||= v.held; out.altPressed ||= v.edge; }
        if (k === 'jump') { out.jumpPressed ||= v.edge; out.jump ||= v.held; }
        if (k === 'slide') { out.crouch ||= v.held; out.crouchPressed ||= v.edge; }
        if (k === 'sprint') out.sprint ||= v.held;
        if (k === 'pick') out.pickupPressed ||= v.edge;
        if (k === 'throw') out.throwPressed ||= v.edge;
        v.edge = false;
      }
    }
    this.edges.clear();
    this.dx = 0; this.dy = 0;
    return out;
  }

  // ---------- touch controls ----------
  enableTouch(root) {
    const T = { joy: { active: false, x: 0, y: 0, id: null, ox: 0, oy: 0 }, lookId: null, lx: 0, ly: 0, lookDx: 0, lookDy: 0, btn: {} };
    this.touch = T;
    root.classList.add('touch');
    root.innerHTML = `
      <div class="t-joy"><div class="t-knob"></div></div>
      <div class="t-btns">
        <button data-b="fire" class="t-big">${t('mobileFire')}</button>
        <button data-b="alt">${t('mobileAlt')}</button>
        <button data-b="jump">${t('mobileJump')}</button>
        <button data-b="slide">${t('mobileSlide')}</button>
        <button data-b="sprint">${t('mobileSprint')}</button>
        <button data-b="pick">${t('mobilePick')}</button>
        <button data-b="throw">${t('mobileThrow')}</button>
      </div>`;
    const joyEl = root.querySelector('.t-joy'), knob = root.querySelector('.t-knob');
    root.querySelectorAll('button[data-b]').forEach((b) => {
      const k = b.dataset.b;
      T.btn[k] = { held: false, edge: false };
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); T.btn[k].held = true; T.btn[k].edge = true; b.classList.add('on'); }, { passive: false });
      const up = (e) => { e.preventDefault(); T.btn[k].held = false; b.classList.remove('on'); };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    });
    const start = (e) => {
      if (!this.enabled) return;
      for (const tc of e.changedTouches) {
        if (tc.clientX < innerWidth * 0.4 && T.joy.id === null) {
          T.joy.id = tc.identifier; T.joy.active = true; T.joy.ox = tc.clientX; T.joy.oy = tc.clientY;
          joyEl.style.left = tc.clientX - 60 + 'px'; joyEl.style.top = tc.clientY - 60 + 'px'; joyEl.classList.add('on');
        } else if (T.lookId === null) { T.lookId = tc.identifier; T.lx = tc.clientX; T.ly = tc.clientY; }
      }
    };
    const move = (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === T.joy.id) {
          let x = (tc.clientX - T.joy.ox) / 55, y = (tc.clientY - T.joy.oy) / 55;
          const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
          T.joy.x = x; T.joy.y = y;
          knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
        } else if (tc.identifier === T.lookId) {
          T.lookDx += (tc.clientX - T.lx) * 2.2; T.lookDy += (tc.clientY - T.ly) * 2.2;
          T.lx = tc.clientX; T.ly = tc.clientY;
        }
      }
    };
    const end = (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === T.joy.id) { T.joy.id = null; T.joy.active = false; T.joy.x = T.joy.y = 0; knob.style.transform = ''; joyEl.classList.remove('on'); }
        if (tc.identifier === T.lookId) T.lookId = null;
      }
    };
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
    this.canvas.addEventListener('touchend', end);
    this.canvas.addEventListener('touchcancel', end);
  }
}
