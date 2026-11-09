import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('PE', e.message));
page.on('console', (m) => console.log(m.type(), m.text().slice(0, 200)));
await page.goto('http://localhost:4175/?q=1');
await page.waitForTimeout(15000);
console.log(await page.evaluate(() => JSON.stringify({ g: !!window.__game, s: window.__game && window.__game.state, modes: [...document.querySelectorAll('[data-mode]')].map((e) => e.dataset.mode) })));
await browser.close();
