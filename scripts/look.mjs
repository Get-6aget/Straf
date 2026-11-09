import { chromium } from 'playwright-core';

// Look-dev helper: place the player at named viewpoints and screenshot.
// usage: node scripts/look.mjs <url> <outdir> [debug]
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '/tmp/verify/look';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 1, music: 0 })));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 90000 });
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  const g = window.__game;
  g.__u = g.update; g.update = () => {}; // freeze simulation
  const meshes = [];
  g.mapRoot.traverse((o) => { if (o.isMesh && meshes.length < 6) meshes.push({ n: o.name, attrs: Object.keys(o.geometry.attributes), lm: !!o.material.lightMap, lmi: o.material.lightMapIntensity, map: !!o.material.map }); });
  return { meshes, fighters: g.fighters.length, model: g.fighters[1].model.constructor.name };
});
console.log(JSON.stringify(info));
// three.js coords: x, y(up), z = -blender_y
const views = [
  ['plaza_south', [0, 0, 13], 0, 0.02],
  ['arcade_ground', [-17.5, 0, -11], -Math.PI / 2, 0.0],
  ['gallery_upper', [-8, 4.4, -11], -2.3, -0.25],
  ['roof', [17, 4.4, 10], 0.85, -0.12],
  ['scaffold', [-11, 4.4, 1], -0.9, -0.15],
  ['shed', [-8.5, 0, 9], 0.3, 0.05],
];
for (const [name, pos, yaw, pitch] of views) {
  await page.evaluate(([pos, yaw, pitch]) => {
    const g = window.__game, p = g.player;
    p.pos.x = pos[0]; p.pos.y = pos[1] + 0.01; p.pos.z = pos[2];
    g.pYaw = yaw; g.pPitch = pitch;
    const e = g.fighters[1];
    e.pos.x = pos[0] - Math.sin(yaw) * 5 + 0.8; e.pos.y = pos[1]; e.pos.z = pos[2] - Math.cos(yaw) * 5;
    e.yaw = yaw + Math.PI;
    e.model.update(0.016, e);
  }, [pos, yaw, pitch]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log('ERRORS', errors.length, errors.slice(0, 8).join('\n'));
await browser.close();
