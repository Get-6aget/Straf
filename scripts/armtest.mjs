import { chromium } from 'playwright-core';
import fs from 'fs';
// Usage: node scripts/armtest.mjs name '[["R","L"|null], cam|null]' ...   (fast hand-only renders; writes .shots/fp/t-<name>.png)
// Or: node scripts/armtest.mjs --set  (renders the full default weapon set in-frame)
const out = '/tmp/hoplite/workspace/.shots/fp';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 700, height: 400 } })).newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('pageerror', e.message, (e.stack || '').split('\n').slice(0, 4).join('|')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text()); });
await page.goto('http://localhost:4174/scripts/armtest.html');
await page.waitForFunction(() => window.ready);
const jobs = JSON.parse(process.argv[2]);
for (const [name, ids, cam] of jobs) {
  const url = await page.evaluate(([ids, cam]) => window.shot(ids, cam), [ids, cam || null]);
  fs.writeFileSync(`${out}/t-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
