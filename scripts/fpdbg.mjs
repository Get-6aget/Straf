import { chromium } from 'playwright-core';
// Usage: node scripts/fpdbg.mjs weaponId[,L] ['{"view":[cx,cy,cz,tx,ty,tz]}']  -> views of the hand from several angles
const url = 'http://localhost:4174/';
const out = '/tmp/hoplite/workspace/.shots/fp';
const ids = (process.argv[2] || 'shilo').split(',');
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 600 }, locale: 'ru-RU' })).newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('pageerror', e.message, (e.stack || '').split('\n').slice(0, 3).join('|')));
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 1 })));
await page.goto(url + '?q=1');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle');
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(1500);
await page.evaluate(async (ids) => {
  const { MAPS } = await import('/src/maps.js'); window.__game.loadMap(MAPS.find((m) => m.id === 'kvartal'));
  const { newWeaponInstance } = await import('/src/weapons.js');
  const g = window.__game, p = g.player;
  p.pos.x = -14; p.pos.y = 0.01; p.pos.z = 16; g.pYaw = -2.4; g.fighters[1].pos.x = 30;
  g.combat.take(p, g.combat.spawnPickup(newWeaponInstance(ids[0]), { x: p.pos.x, y: p.pos.y, z: p.pos.z }, null));
  if (ids[1] === 'L') p.hands.L = newWeaponInstance(ids[0]);
}, ids);
await page.waitForTimeout(1500);
const views = JSON.parse(process.argv[3] || '{"side":[0.65,-0.2,-0.42,0.23,-0.25,-0.42],"top":[0.3,0.3,-0.3,0.25,-0.25,-0.45],"back":[0.25,-0.1,0.3,0.25,-0.25,-0.45],"front":[0.0,-0.2,-0.9,0.25,-0.25,-0.4]}');
for (const [n, v] of Object.entries(views)) {
  await page.evaluate((v) => { const c = window.__game.vm.camera; c.position.set(v[0], v[1], v[2]); c.lookAt(v[3], v[4], v[5]); }, v);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/dbg-${ids[0]}-${n}.png` });
}
await browser.close();
