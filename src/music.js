import { getCtx, getMusicBus, getNoise } from './audio.js';
import { mulberry32 } from './physics.js';

// Procedural electronic soundtrack: seeded breakbeat/house patterns with
// detuned pads, a filtered bass and a delayed pluck arp. Each seed is a new track.
const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10] };
const PROGS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 6, 5, 3], [0, 4, 5, 3], [0, 5, 6, 4]];

export class Music {
  constructor() {
    this.playing = false;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.track = null;
    this.out = null;
  }

  makeTrack(seed, calm) {
    const r = mulberry32(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const scale = SCALES[pick(Object.keys(SCALES))];
    const root = 38 + Math.floor(r() * 8);
    const bpm = calm ? 92 + Math.floor(r() * 12) : 122 + Math.floor(r() * 30);
    const prog = pick(PROGS);
    const pat = (dens) => Array.from({ length: 16 }, () => r() < dens);
    const style = calm ? 'chill' : pick(['break', 'house', 'garage', 'break']);
    let kick, snare;
    if (style === 'house') { kick = [0, 4, 8, 12].map((i) => i); snare = [4, 12]; }
    else if (style === 'garage') { kick = [0, 7, 10]; snare = [4, 12]; }
    else if (style === 'chill') { kick = [0, 10]; snare = [8]; }
    else { kick = [0, 10, r() < 0.5 ? 6 : 11]; snare = [4, 12, r() < 0.5 ? 15 : 7]; }
    const hat = pat(calm ? 0.35 : 0.7);
    const bassPat = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 || r() < 0.3 ? Math.floor(r() * 3) * 2 : -1));
    const arp = Array.from({ length: 16 }, () => (r() < (calm ? 0.35 : 0.5) ? Math.floor(r() * 7) : -1));
    return { scale, root, bpm, prog, kick, snare, hat, bassPat, arp, style, calm, bar: 0, seed };
  }

  play(seed, calm = false) {
    const ctx = getCtx();
    if (!ctx) return;
    this.stop(0.6);
    this.track = this.makeTrack(seed, calm);
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / this.track.bpm) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    delay.connect(dlp).connect(fb).connect(delay);
    dlp.connect(this.out);
    this.delay = delay;
    this.out.connect(getMusicBus());
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
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
      setTimeout(() => o.disconnect(), fade * 1000 + 300);
    }
    this.out = null;
  }

  schedule() {
    const ctx = getCtx();
    if (!ctx || !this.playing || !this.out) return;
    const T = this.track;
    const stepDur = 60 / T.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  degree(deg, oct = 0) {
    const T = this.track, s = T.scale;
    const o = Math.floor(deg / s.length);
    return T.root + s[((deg % s.length) + s.length) % s.length] + 12 * (o + oct);
  }

  playStep(step, t, sd) {
    const T = this.track, ctx = getCtx(), out = this.out;
    const i = step % 16, bar = Math.floor(step / 16);
    const chordDeg = T.prog[bar % T.prog.length];
    const section = Math.floor(bar / 8) % 4; // 0 intro-ish, 1 full, 2 break, 3 full
    const drums = section !== 2 || T.calm;
    const swing = i % 2 ? sd * 0.12 : 0;
    const tt = t + swing;

    if (drums && T.kick.includes(i)) this.kick(tt);
    if (drums && section > 0 && T.snare.includes(i)) this.snare(tt);
    if ((section > 0 || i % 4 === 2) && T.hat[i]) this.hat(tt, i % 4 === 2 ? 0.16 : 0.08);
    if (section !== 2 && T.bassPat[i] >= 0) this.bass(tt, this.midi(this.degree(chordDeg + T.bassPat[i], -1)), sd * 1.8);
    if (i === 0) this.pad(t, [0, 2, 4, 6].map((d) => this.midi(this.degree(chordDeg + d, 1))), sd * 16);
    if (section >= 1 && T.arp[i] >= 0) this.pluck(tt, this.midi(this.degree(chordDeg + T.arp[i], 2)));
    if (i === 0 && bar % 8 === 7) this.noiseSweep(t, sd * 16);
    void ctx; void out;
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  }

  kick(t) {
    const ctx = getCtx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.002, 0.9, 0.35);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.4);
  }

  snare(t) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = getNoise();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    const g = ctx.createGain(); this.env(g, t, 0.001, 0.45, 0.2);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random()); n.stop(t + 0.25);
    const o = ctx.createOscillator(), g2 = ctx.createGain();
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    this.env(g2, t, 0.001, 0.3, 0.1); o.connect(g2).connect(this.out); o.start(t); o.stop(t + 0.15);
  }

  hat(t, v) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = getNoise();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); this.env(g, t, 0.001, v, 0.05);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random()); n.stop(t + 0.08);
  }

  bass(t, freq, dur) {
    const ctx = getCtx(), o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + dur);
    this.env(g, t, 0.005, 0.32, dur);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }

  pad(t, freqs, dur) {
    const ctx = getCtx();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1400, t + dur * 0.5); f.frequency.linearRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur * 1.02);
    f.connect(g).connect(this.out);
    for (const fr of freqs) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur * 1.05);
    }
  }

  pluck(t, freq) {
    const ctx = getCtx(), o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.2);
    this.env(g, t, 0.002, 0.07, 0.25);
    o.connect(f).connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + 0.3);
  }

  noiseSweep(t, dur) {
    const ctx = getCtx();
    const n = ctx.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + dur * 0.95); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(f).connect(g).connect(this.out); n.start(t); n.stop(t + dur);
  }
}
