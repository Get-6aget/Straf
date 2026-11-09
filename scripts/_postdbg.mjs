import { chromium } from 'playwright-core';

// Debug: render an overview camera with post passes toggled to find what blows the frame out.
const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
page.setDefaultTimeout(180000);
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 2 })));
await page.goto(url);
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
const variants = [['all', {}], ['nobloom', { bloom: false }], ['nogtao', { gtao: false }], ['novm', { vm: false }], ['none', { bloom: false, gtao: false, vm: false }]];
for (const [name, v] of variants) {
  const info = await page.evaluate((v) => {
    const g = window.__game, P = g.post;
    P.bloom.enabled = v.bloom ?? true; P.gtao.enabled = v.gtao ?? true;
    g.vm.root.visible = v.vm ?? true;
    const c = g.camera;
    return { cam: c.position.toArray().map((x) => +x.toFixed(2)), near: c.near, far: c.far, fov: c.fov };
  }, v);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/dbg-${name}.png` });
  console.log(name, JSON.stringify(info));
}
await browser.close();
