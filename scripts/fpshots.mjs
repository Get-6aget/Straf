import { chromium } from 'playwright-core';
// Usage: node scripts/fpshots.mjs [name,name] [close]
const url = 'http://localhost:4174/';
const out = '/tmp/hoplite/workspace/.shots/fp';
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null;
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ru-RU' })).newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('pageerror', e.message, (e.stack || '').split('\n').slice(0, 3).join('|')));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 1 })));
await page.goto(url + '?q=1');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle');
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(7000);
await page.evaluate(() => { for (const e of document.querySelectorAll('body > *:not(canvas)')) e.style.display = 'none'; });
await page.evaluate(async () => {
  const { MAPS } = await import('/src/maps.js'); window.__game.loadMap(MAPS.find((m) => m.id === 'kvartal'));
  const g = window.__game, p = g.player;
  p.pos.x = -14; p.pos.y = 0.01; p.pos.z = 16; g.pYaw = -2.4; g.pPitch = -0.05;
  g.fighters[1].pos.x = 30;
});
const give = (ids) => page.evaluate(async (ids) => {
  const { newWeaponInstance } = await import('/src/weapons.js');
  const g = window.__game, p = g.player;
  p.hands.R = null; p.hands.L = null;
  g.combat.take(p, g.combat.spawnPickup(newWeaponInstance(ids[0]), { x: p.pos.x, y: p.pos.y, z: p.pos.z }, null));
  if (ids[1]) p.hands.L = newWeaponInstance(ids[1]);
}, ids);
const shots = [['empty', []], ['shilo', ['shilo']], ['dual', ['shilo', 'shilo']], ['baraban', ['baraban']], ['otboinik', ['otboinik']], ['strizh', ['strizh']], ['kochegar', ['kochegar']], ['pompa', ['pompa']], ['zhuravl', ['zhuravl']], ['hlopushka', ['hlopushka']], ['tesak', ['tesak']], ['klinok', ['klinok']], ['limonka', ['limonka']]];
for (const [name, ids] of shots) {
  if (only && !only.includes(name)) continue;
  if (ids.length) await give(ids); else await page.evaluate(() => { const p = window.__game.player; p.hands.R = null; p.hands.L = null; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  if (process.argv[3] === 'close') {
    await page.evaluate(() => { const c = window.__game.vm.camera; c.position.set(0.1, -0.1, 0.0); c.lookAt(0.18, -0.25, -0.5); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}-close.png` });
    await page.evaluate(() => { const c = window.__game.vm.camera; c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); });
  }
}
await browser.close();
