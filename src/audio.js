// All sound is synthesised at runtime with WebAudio: no audio files ship.
let ctx = null, master, sfxBus, musicBus, noiseBuf;
const listener = { x: 0, y: 0, z: 0, yaw: 0 };
let volumes = { sfx: 0.8, music: 0.5 };
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  return ctx;
}

export function getCtx() { return ctx; }
export function getMusicBus() { return musicBus; }
export function getNoise() { return noiseBuf; }

export function setVolumes(v) { volumes = { ...volumes, ...v }; applyVolumes(); }
export function setMuted(m) { muted = m; applyVolumes(); }
function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.05);
  sfxBus.gain.setTargetAtTime(volumes.sfx, t, 0.02);
  musicBus.gain.setTargetAtTime(volumes.music * 0.55, t, 0.02);
}

export function setListener(x, y, z, yaw) { listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw; }

function spatial(pos, base = 1) {
  if (!pos) return { gain: base, pan: 0 };
  const dx = pos.x - listener.x, dy = pos.y - listener.y, dz = pos.z - listener.z;
  const d = Math.hypot(dx, dy, dz);
  const gain = base / (1 + d * d * 0.004 + d * 0.03);
  // right vector of listener: (cos yaw, -sin yaw)
  const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
  const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
  return { gain, pan };
}

function out(pos, base) {
  const { gain, pan } = spatial(pos, base);
  if (gain < 0.01) return null;
  const g = ctx.createGain(); g.gain.value = gain;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.connect(p).connect(sfxBus);
  } else g.connect(sfxBus);
  return g;
}

function noise(dest, t, dur, { type = 'lowpass', freq = 2000, q = 1, vol = 1, attack = 0.001, freqEnd = null } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}

function tone(dest, t, dur, { type = 'sine', f0 = 440, f1 = null, vol = 1, attack = 0.002 } = {}) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

const SOUNDS = {
  pistol: (d, t) => { noise(d, t, 0.18, { freq: 3500, freqEnd: 600, vol: 0.9 }); tone(d, t, 0.12, { type: 'square', f0: 220, f1: 60, vol: 0.4 }); },
  revolver: (d, t) => { noise(d, t, 0.35, { freq: 2600, freqEnd: 300, vol: 1 }); tone(d, t, 0.25, { type: 'sawtooth', f0: 150, f1: 40, vol: 0.5 }); },
  smg: (d, t) => { noise(d, t, 0.09, { freq: 4200, freqEnd: 900, vol: 0.6 }); tone(d, t, 0.06, { type: 'square', f0: 300, f1: 90, vol: 0.25 }); },
  rifle: (d, t) => { noise(d, t, 0.14, { freq: 3000, freqEnd: 500, vol: 0.8 }); tone(d, t, 0.1, { type: 'square', f0: 180, f1: 50, vol: 0.35 }); },
  shotgun: (d, t) => { noise(d, t, 0.45, { freq: 1800, freqEnd: 200, vol: 1.1 }); tone(d, t, 0.3, { type: 'sine', f0: 120, f1: 35, vol: 0.9 }); noise(d, t + 0.32, 0.05, { type: 'bandpass', freq: 2500, vol: 0.3 }); },
  sniper: (d, t) => { noise(d, t, 0.7, { freq: 2200, freqEnd: 150, vol: 1.1 }); tone(d, t, 0.5, { type: 'sawtooth', f0: 110, f1: 30, vol: 0.6 }); },
  rocket: (d, t) => { noise(d, t, 0.6, { freq: 900, freqEnd: 3000, vol: 0.7, attack: 0.05 }); tone(d, t, 0.3, { f0: 90, f1: 50, vol: 0.6 }); },
  throw: (d, t) => { noise(d, t, 0.18, { type: 'bandpass', freq: 800, freqEnd: 2400, q: 2, vol: 0.5, attack: 0.04 }); },
  bow: (d, t) => { tone(d, t, 0.18, { type: 'triangle', f0: 180, f1: 80, vol: 0.6 }); noise(d, t, 0.12, { type: 'highpass', freq: 3000, vol: 0.3 }); },
  slash: (d, t) => { noise(d, t, 0.2, { type: 'bandpass', freq: 1500, freqEnd: 5000, q: 3, vol: 0.7, attack: 0.03 }); },
  punch: (d, t) => { noise(d, t, 0.1, { freq: 900, vol: 0.6 }); tone(d, t, 0.1, { f0: 140, f1: 60, vol: 0.6 }); },
  boom: (d, t) => { tone(d, t, 0.4, { type: 'sine', f0: 70, f1: 25, vol: 1 }); noise(d, t, 0.35, { type: 'bandpass', freq: 400, freqEnd: 120, q: 1.5, vol: 0.9 }); },
  pop: (d, t) => { tone(d, t, 0.12, { type: 'sine', f0: 600, f1: 180, vol: 0.6 }); },
  zap: (d, t) => { tone(d, t, 0.15, { type: 'sawtooth', f0: 1400, f1: 300, vol: 0.35 }); noise(d, t, 0.15, { type: 'highpass', freq: 4000, vol: 0.4 }); },
  explosion: (d, t) => { noise(d, t, 1.2, { freq: 1500, freqEnd: 60, vol: 1.3, attack: 0.005 }); tone(d, t, 0.8, { f0: 80, f1: 22, vol: 1.2 }); },
  empty: (d, t) => { tone(d, t, 0.04, { type: 'square', f0: 1200, vol: 0.15 }); },
  jump: (d, t) => { noise(d, t, 0.1, { freq: 700, vol: 0.25 }); },
  land: (d, t) => { noise(d, t, 0.12, { freq: 400, vol: 0.45 }); tone(d, t, 0.08, { f0: 90, f1: 50, vol: 0.3 }); },
  step: (d, t) => { noise(d, t, 0.06, { freq: 600 + Math.random() * 300, vol: 0.18 }); },
  slide: (d, t) => { noise(d, t, 0.7, { type: 'bandpass', freq: 1200, freqEnd: 400, q: 0.8, vol: 0.45, attack: 0.03 }); },
  heavy: (d, t) => { noise(d, t, 0.4, { freq: 2000, freqEnd: 180, vol: 1.1 }); tone(d, t, 0.3, { type: 'sawtooth', f0: 120, f1: 35, vol: 0.7 }); },
  whoosh: (d, t) => { noise(d, t, 0.3, { type: 'bandpass', freq: 600, freqEnd: 2200, q: 1.2, vol: 0.35, attack: 0.05 }); },
  walljump: (d, t) => { tone(d, t, 0.1, { f0: 150, f1: 70, vol: 0.5 }); noise(d, t, 0.15, { type: 'bandpass', freq: 900, freqEnd: 2500, vol: 0.4 }); },
  pad: (d, t) => { tone(d, t, 0.35, { type: 'triangle', f0: 200, f1: 900, vol: 0.4 }); },
  pickup: (d, t) => { tone(d, t, 0.06, { type: 'square', f0: 700, vol: 0.2 }); tone(d, t + 0.06, 0.08, { type: 'square', f0: 1050, vol: 0.2 }); },
  hit: (d, t) => { tone(d, t, 0.05, { type: 'square', f0: 1800, vol: 0.18 }); },
  headshot: (d, t) => { tone(d, t, 0.07, { type: 'square', f0: 2400, vol: 0.22 }); tone(d, t + 0.05, 0.08, { type: 'square', f0: 3000, vol: 0.18 }); },
  kill: (d, t) => { tone(d, t, 0.12, { type: 'triangle', f0: 880, vol: 0.35 }); tone(d, t + 0.09, 0.2, { type: 'triangle', f0: 1320, vol: 0.35 }); },
  hurt: (d, t) => { tone(d, t, 0.12, { type: 'sawtooth', f0: 200, f1: 90, vol: 0.3 }); },
  beep: (d, t) => { tone(d, t, 0.15, { type: 'square', f0: 660, vol: 0.25 }); },
  go: (d, t) => { tone(d, t, 0.35, { type: 'square', f0: 990, vol: 0.28 }); },
  win: (d, t) => { [523, 659, 784, 1046].forEach((f, i) => tone(d, t + i * 0.1, 0.3, { type: 'triangle', f0: f, vol: 0.3 })); },
  lose: (d, t) => { [392, 330, 262].forEach((f, i) => tone(d, t + i * 0.14, 0.35, { type: 'triangle', f0: f, vol: 0.3 })); },
  click: (d, t) => { tone(d, t, 0.03, { type: 'square', f0: 900, vol: 0.12 }); },
  harpoon: (d, t) => { tone(d, t, 0.3, { type: 'sawtooth', f0: 90, f1: 300, vol: 0.3 }); },
  spin: (d, t) => { tone(d, t, 0.25, { type: 'sawtooth', f0: 60, f1: 200, vol: 0.12 }); },
};

export function sfx(name, pos = null, vol = 1) {
  if (!ctx || muted) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  const d = out(pos, vol);
  if (!d) return;
  fn(d, ctx.currentTime);
}
