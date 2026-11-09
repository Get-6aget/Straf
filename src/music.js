import { getCtx, getMusicBus, getNoise } from './audio.js';
import { mulberry32 } from './physics.js';

// Procedural jungle / atmospheric drum & bass. Drums are synthesised and
// re-sequenced from original break patterns (16th grid, 2 bars).
const K = 1, S = 2, G = 3, H = 4, O = 5; // kick, snare, ghost snare, closed hat, open hat/ride
const BREAKS = [
  // classic two-step-ish jungle break
  [K, H, 0, H, S, H, G, K, H, K, 0, H, S, H, G, H, K, H, 0, H, S, H, G, K, H, 0, K, H, S, G, 0, O],
  // rolling break with ghosts
  [K, 0, H, G, S, 0, G, H, 0, K, K, 0, S, H, G, 0, K, 0, H, G, S, 0, G, K, 0, 0, K, H, S, G, S, G],
  // half-time atmospheric
  [K, H, H, 0, 0, H, G, H, S, H, 0, H, 0, K, H, G, K, H, 0, H, 0, H, G, K, S, H, 0, G, 0, H, O, H],
  // choppy
  [K, G, S, 0, K, 0, S, G, 0, K, S, 0, G, S, K, G, K, 0, S, G, 0, K, S, 0, K, G, 0, S, G, S, S, G],
];
const CHORDS = [ // jazzy minor progressions (scale-degree roots + 7th/9th voicings)
  [[0, 3, 7, 10, 14], [5, 8, 12, 15, 19], [3, 7, 10, 14, 17], [8, 12, 15, 19, 22]],
  [[0, 3, 7, 10, 14], [-2, 2, 5, 9, 12], [-4, 0, 3, 7, 10], [-5, -1, 2, 5, 9]],
  [[0, 3, 7, 10, 17], [3, 7, 10, 14, 17], [5, 8, 12, 15, 19], [7, 10, 14, 17, 21]],
];
const TITLES_A = ['Мокрый', 'Ночной', 'Тихий', 'Бетонный', 'Глубокий', 'Ржавый', 'Туманный', 'Поздний', 'Нижний', 'Сонный'];
const TITLES_B = ['перрон', 'канал', 'свет', 'двор', 'ток', 'район', 'шлюз', 'прибой', 'туннель', 'город'];

export class Music {
  constructor() {
    this.playing = false;
    this.timer = null;
    this.seed = (Math.random() * 1e6) | 0;
    this.track = null;
    this.out = null;
    this.onChange = null;
  }

  makeTrack(seed) {
    const r = mulberry32(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const bpm = 164 + Math.floor(r() * 12);
    return {
      seed, bpm,
      title: `${pick(TITLES_A)} ${pick(TITLES_B)}`,
      root: 36 + Math.floor(r() * 7),
      chords: pick(CHORDS),
      breaks: [pick(BREAKS), pick(BREAKS)],
      bassPat: Array.from({ length: 32 }, (_, i) => (i % 8 === 0 ? 0 : r() < 0.18 ? (r() < 0.5 ? 7 : 12) : -1)),
      arp: Array.from({ length: 16 }, () => (r() < 0.3 ? Math.floor(r() * 5) : -1)),
      lengthBars: 64,
    };
  }

  get title() { return this.track ? `${this.track.title} · ${this.track.bpm} BPM` : ''; }

  next() { this.seed = (this.seed * 1103515245 + 12345) >>> 0; this.play(this.seed); }
  prev() { this.seed = (this.seed - 12345) >>> 0; this.play(this.seed); }

  play(seed = this.seed) {
    const ctx = getCtx();
    if (!ctx) return;
    this.stop(0.5);
    this.seed = seed;
    this.track = this.makeTrack(seed);
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    // shared space: delay + short synthetic reverb
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = (60 / this.track.bpm) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(this.out);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(ctx, 2.6);
    const vg = ctx.createGain(); vg.gain.value = 0.35;
    this.verb.connect(vg).connect(this.out);
    this.out.connect(getMusicBus());
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
    this.onChange?.(this.title);
  }

  impulse(ctx, secs) {
    const len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }

  stop(fade = 0.4) {
    const ctx = getCtx();
    clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    if (this.out && ctx) {
      const o = this.out;
      o.gain.cancelScheduledValues(ctx.currentTime);
      o.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => o.disconnect(), fade * 1000 + 400);
    }
    this.out = null;
  }

  schedule() {
    const ctx = getCtx();
    if (!ctx || !this.playing || !this.out) return;
    const sd = 60 / this.track.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, sd);
      this.nextTime += sd;
      this.step++;
      if (this.step >= this.track.lengthBars * 16) { this.next(); return; }
    }
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  playStep(step, t, sd) {
    const T = this.track;
    const i32 = step % 32, bar = Math.floor(step / 16), i16 = step % 16;
    const phrase = Math.floor(bar / 8) % 8; // 0 intro, 1-3 drop, 4 break, 5-7 drop
    const intro = phrase === 0, brk = phrase === 4;
    const chord = T.chords[Math.floor(bar / 2) % T.chords.length];
    const brkPat = T.breaks[Math.floor(bar / 4) % 2];

    if (!brk) {
      // chop: occasionally replay a different slice of the break
      let idx = i32;
      if (!intro && i16 >= 12 && bar % 4 === 3 && ((step * 7) % 5 === 0)) idx = (i32 + 8) % 32;
      const hit = brkPat[idx];
      const vol = intro ? 0.5 : 1;
      if (hit === K && !intro) this.kick(t, vol);
      if (hit === S) this.snare(t, 0.55 * vol);
      if (hit === G) this.snare(t, 0.16 * vol, true);
      if (hit === H || (intro && i16 % 2 === 0)) this.hat(t, (i16 % 4 === 2 ? 0.13 : 0.07) * vol);
      if (hit === O) this.hat(t, 0.12 * vol, true);
      if (!intro && T.bassPat[i32] >= 0) this.reese(t, this.midi(T.root + chord[0] + T.bassPat[i32] - 12), sd * 7);
    }
    if (i16 === 0 && bar % 2 === 0) {
      this.pad(t, chord.map((n) => this.midi(T.root + 24 + n)), sd * 32);
      this.keys(t, chord.slice(0, 4).map((n) => this.midi(T.root + 36 + n)), brk ? 0.05 : 0.035);
    }
    if (!intro && T.arp[i16] >= 0 && bar % 2 === 1) this.keys(t, [this.midi(T.root + 48 + chord[T.arp[i16]])], 0.03);
    if (i16 === 0 && bar % 8 === 7) this.sweep(t, sd * 16);
    if (i16 === 0 && bar % 8 === 0 && !intro) this.sub(t, this.midi(T.root + chord[0] - 12), sd * 6);
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  kick(t, v) {
    const ctx = getCtx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    this.env(g, t, 0.002, 0.95 * v, 0.28);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
  }

  snare(t, v, ghost = false) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = getNoise(); n.playbackRate.value = ghost ? 1.3 : 1;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = ghost ? 2600 : 1900; f.Q.value = 0.8;
    const g = ctx.createGain(); this.env(g, t, 0.001, v, ghost ? 0.08 : 0.19);
    n.connect(f).connect(g); g.connect(this.out);
    if (!ghost) g.connect(this.verb);
    n.start(t, Math.random()); n.stop(t + 0.22);
    if (!ghost) {
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.06);
      this.env(g2, t, 0.001, v * 0.6, 0.09); o.connect(g2).connect(this.out); o.start(t); o.stop(t + 0.12);
    }
  }

  hat(t, v, open = false) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = getNoise();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = open ? 6500 : 8000;
    const g = ctx.createGain(); this.env(g, t, 0.001, v, open ? 0.22 : 0.035);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random()); n.stop(t + 0.25);
  }

  // Reese bass: detuned saws through a moving low-pass
  reese(t, freq, dur) {
    const ctx = getCtx(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(650, t + dur * 0.4); f.frequency.linearRampToValueAtTime(220, t + dur);
    this.env(g, t, 0.01, 0.2, dur);
    f.connect(g).connect(this.out);
    for (const det of [-14, 0, 13]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  sub(t, freq, dur) {
    const ctx = getCtx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; this.env(g, t, 0.02, 0.35, dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }

  pad(t, freqs, dur) {
    const ctx = getCtx(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5); f.frequency.linearRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g); g.connect(this.out); g.connect(this.verb);
    for (const fr of freqs) for (const det of [-9, 9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  // Electric-piano-ish FM keys with tremolo
  keys(t, freqs, v) {
    const ctx = getCtx();
    for (const fr of freqs) {
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.frequency.value = fr; mod.frequency.value = fr * 1.0;
      mg.gain.setValueAtTime(fr * 1.6, t); mg.gain.exponentialRampToValueAtTime(fr * 0.1, t + 0.6);
      mod.connect(mg).connect(car.frequency);
      this.env(g, t, 0.004, v, 1.6);
      car.connect(g); g.connect(this.out); g.connect(this.delay); g.connect(this.verb);
      car.start(t); mod.start(t); car.stop(t + 1.7); mod.stop(t + 1.7);
    }
  }

  sweep(t, dur) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.95); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(f).connect(g); g.connect(this.out); g.connect(this.verb);
    n.start(t); n.stop(t + dur);
  }
}
