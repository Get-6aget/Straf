import { chromium } from 'playwright-core';

// Map review shots: overviews and first-person views per map.
// usage: node scripts/mapshots.mjs [url] [outDir] [mapId]
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '/tmp/shots-maps';
const only = process.argv[4];
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ru-RU' })).newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: Number(new URLSearchParams(location.search).get('q') ?? 2) })));
await page.goto(url + '?q=' + (process.env.Q ?? 2));
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/menu.png` });
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(1000);
// [name, x, y, z, yaw, pitch]
const views = {
  citadel: [['over-s', 0, 16, 26, 0, -0.45], ['over-n', 0, 14, -16, Math.PI, -0.5], ['fp-court', 8, 0, 12, -0.6, 0.0], ['fp-gate', 0, 0, -10, 0, 0.12], ['fp-gallery', -20, 4.75, 4, 0, -0.05], ['fp-rampart', 10, 6.25, -20.5, 2.2, -0.15], ['fp-colon', -12, 0, -2, -1.4, 0.05]],
  kvartal: [['over-s', 0, 18, 24, 0, -0.5], ['over-n', 0, 16, -14, Math.PI, -0.45], ['fp-yard', -16, 0, 14, -0.8, 0.02], ['fp-house', -3, 0, 2, -1.2, 0.0], ['fp-upper', 2, 3.2, -3, 2.4, -0.05], ['fp-roof', 4, 6.4, 2, 0.6, -0.15], ['fp-east', 18, 0, -2, 0.3, 0.05]],
};
for (const [id, list] of Object.entries(views)) {
  if (only && only !== id) continue;
  await page.evaluate(async (id) => {
    const { MAPS } = await import('/src/maps.js');
    const g = window.__game;
    if (g.__u) g.update = g.__u;
    g.loadMap(MAPS.find((m) => m.id === id));
    g.__u = g.update; g.update = () => {};
    for (const f of g.fighters.slice(1)) f.model.root.visible = false;
  }, id);
  await page.waitForTimeout(2500);
  for (const [name, x, y, z, yaw, pitch] of list) {
    await page.evaluate(([x, y, z, yaw, pitch]) => { const g = window.__game, p = g.player; p.pos.x = x; p.pos.y = y; p.pos.z = z; g.pYaw = yaw; g.pPitch = pitch; }, [x, y, z, yaw, pitch]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${id}-${name}.png` });
  }
}
console.log('ERRORS', errors.length, '\n' + errors.slice(0, 15).join('\n'));
await browser.close();
