import { chromium } from 'playwright-core';

// Debug: find which post-processing interaction blows the frame out when the viewmodel is visible.
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
const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `/tmp/dbg-${name}.png` }); console.log(name); };
await shot('base');
await page.evaluate(() => { window.__game.post.vmPass.clearDepth = false; });
await shot('noClearDepth');
await page.evaluate(() => { const g = window.__game; g.post.vmPass.clearDepth = true; g.vm.scene.environment = null; });
await shot('noEnv');
await page.evaluate(() => { const g = window.__game; g.vm.root.traverse((o) => { if (o.isSkinnedMesh) o.visible = false; }); });
await shot('noSkinned');
await page.evaluate(() => { const g = window.__game; g.vm.root.traverse((o) => { o.visible = true; }); g.post.gtao.output = 1; });
await shot('gtaoDiffuseOut');
await browser.close();
