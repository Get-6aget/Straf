import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
page.setDefaultTimeout(180000);
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 300)));
page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
await page.goto('http://localhost:4175/?q=2');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle');
await page.click('[data-mode="1v1"]');
for (const t of [1000, 3000, 6000]) {
  await page.waitForTimeout(t);
  console.log(await page.evaluate(() => { const g = window.__game; return JSON.stringify({ s: g.state, cam: g.camera.position, spec: !!g.spectateTarget, keys: Object.keys(g).slice(0, 60) }); }));
  await page.screenshot({ path: `/tmp/dbg${t}.png` });
}
await browser.close();
