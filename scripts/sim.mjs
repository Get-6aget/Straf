import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 30000 });

const simSeconds = Number(process.argv[3] || 90);
for (let i = 0; i < 20; i++) {
  const r = await page.evaluate(([i, simSeconds]) => {
    const g = window.__game;
    g.startMatch({ mode: 'ffa', attract: true, roundsToWin: 99, mapIndex: i });
    const map = g.mapDef.id;
    let takes = 0, lastTake = g.takeNo, roundStart = g.roundNo, voids = 0, states = {};
    const kf = document.querySelector('#h-kf');
    const before = kf.children.length;
    const t0 = performance.now();
    const origKill = g.kill.bind(g);
    const causes = {};
    g.kill = (v, a, w, o) => { const key = (o && o.void ? 'void:' : '') + (w || 'none'); causes[key] = (causes[key] || 0) + 1; return origKill(v, a, w, o); };
    for (let s = 0; s < simSeconds * 60; s++) {
      g.update(1 / 60, null);
      if (g.mapDef.id !== map) break; // round changed map
      if (g.takeNo !== lastTake) { takes++; lastTake = g.takeNo; }
      for (const f of g.fighters) if (f.alive) states[f.state] = (states[f.state] || 0) + 1;
      if (g.fighters.some((f) => f.wallAnim > 0.39)) states.wallbounce = (states.wallbounce || 0) + 1;
    }
    g.kill = origKill;
    const kills = g.fighters.reduce((a, f) => a + f.kills, 0);
    return { i, map, takes, kills, causes, states, ms: Math.round(performance.now() - t0), stuck: g.fighters.map((f) => f.pos.y.toFixed(1)).join(',') };
  }, [i, simSeconds]);
  console.log(JSON.stringify(r));
}
console.log('ERRORS', errors.length, errors.slice(0, 10).join('\n'));
await browser.close();
