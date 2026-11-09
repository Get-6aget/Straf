import { chromium } from 'playwright-core';

// Debug: does the overview white-out persist over time after a map load?
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
page.setDefaultTimeout(180000);
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 2 })));
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 120000 });
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(1000);
await page.evaluate(async () => {
  const { MAPS } = await import('/src/maps.js');
  const g = window.__game;
  g.loadMap(MAPS.find((m) => m.id === 'kvartal'));
  g.__u = g.update; g.update = () => {};
  const p = g.player; p.pos.x = 0; p.pos.y = 18; p.pos.z = 24; g.pYaw = 0; g.pPitch = -0.5;
});
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `/tmp/dbg-t${i}.png` });
}
await page.evaluate(() => { const g = window.__game, p = g.player; p.pos.y = 6; });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/dbg-low.png' });
await page.evaluate(() => { const g = window.__game, p = g.player; p.pos.y = 18; g.post.gtao.enabled = false; });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/dbg-nogtao.png' });
const info = await page.evaluate(() => { const g = window.__game; return { far: g.camera.far, fogD: g.scene.fog.density, sky: !!g.scene.background }; });
console.log(JSON.stringify(info));
await browser.close();
