// Checks that every sfx/music file loads and decodes, and that sfx() plays samples.
// Usage: (npx vite --port 4176 --strictPort &) && node scripts/audiocheck.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:4176/';
const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/favicon|sdk\.js/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
await page.goto(url);

const r = await page.evaluate(async () => {
  const audio = await import('/src/audio.js');
  const { Music, TRACKS } = await import('/src/music.js');
  const ctx = audio.initAudio();
  await ctx.resume();
  const t0 = performance.now();
  while (performance.now() - t0 < 20000) {
    const s = audio.getSampleStats();
    if (s.loaded + s.failed >= s.total) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const stats = audio.getSampleStats();

  // a sample play creates a mono, non-looping BufferSource with a real buffer
  const created = [];
  const orig = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = () => { const s = orig(); created.push(s); return s; };
  const names = ['pistol', 'revolver', 'heavy', 'smg', 'rifle', 'shotgun', 'sniper', 'rocket', 'slash', 'throw', 'step', 'land', 'jump',
    'slide', 'whoosh', 'walljump', 'explosion', 'boom', 'empty', 'pickup', 'hit', 'headshot', 'kill', 'hurt', 'beep', 'go', 'win', 'lose', 'click', 'punch'];
  const sampled = {};
  for (const n of names) {
    const before = created.length;
    audio.sfx(n, { x: 3, y: 0, z: 2 }, 1);
    sampled[n] = created.slice(before).some((s) => s.buffer && s.buffer !== audio.getNoise() && !s.loop);
  }

  const music = [];
  for (const t of TRACKS) {
    const res = await fetch('/assets/music/' + t.file);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    music.push({ file: t.file, sec: Math.round(buf.duration), ch: buf.numberOfChannels });
  }
  const m = new Music();
  m.play();
  await new Promise((r) => setTimeout(r, 1500));
  const first = m.title;
  const playingFile = !!m.el && !m.el.paused && m.el.currentTime > 0;
  m.next();
  await new Promise((r) => setTimeout(r, 1000));
  const afterNext = m.title;
  m.stop();
  return { stats, sampled, music, first, playingFile, afterNext, failedMusic: m.failed };
});

console.log(JSON.stringify(r, null, 1));
const missing = Object.entries(r.sampled).filter(([, v]) => !v).map(([k]) => k);
console.log('sfx without sample playback:', missing.join(', ') || 'none');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
const ok = r.stats.failed === 0 && r.stats.loaded === r.stats.total && r.music.length && r.playingFile && !r.failedMusic && !errors.length && !missing.length;
console.log(ok ? 'AUDIO CHECK OK' : 'AUDIO CHECK FAILED');
process.exit(ok ? 0 : 1);
