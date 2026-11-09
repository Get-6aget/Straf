import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '/tmp/t';
const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/01-menu.png` });

// Attract mode: bots fighting in the background
const attract = await page.evaluate(() => {
  const g = window.__game;
  return { map: g.mapDef.id, state: g.state, fighters: g.fighters.map((f) => ({ n: f.displayName, hp: f.hp, alive: f.alive, w: f.weapon && f.weapon.id, k: f.kills, pos: [f.pos.x.toFixed(1), f.pos.y.toFixed(1), f.pos.z.toFixed(1)] })) };
});
console.log('ATTRACT', JSON.stringify(attract));

// Start a 1v1 match
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/02-match-start.png` });
const st = await page.evaluate(() => {
  const g = window.__game;
  return { map: g.mapDef.id, state: g.state, round: g.roundNo, take: g.takeNo, p: g.player && { hp: g.player.hp, pos: g.player.pos, alive: g.player.alive } };
});
console.log('MATCH', JSON.stringify(st));

// Give the player a weapon and look at the enemy, then screenshot the viewmodel
await page.evaluate(() => {
  const g = window.__game;
  const pk = g.combat.pickups[0];
  if (pk) g.combat.takePickup(g.player, pk);
  const e = g.fighters[1];
  g.pYaw = Math.atan2(-(e.pos.x - g.player.pos.x), -(e.pos.z - g.player.pos.z));
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/03-weapon.png` });

// Let the match run; the bot should come and fight
const samples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  samples.push(await page.evaluate(() => {
    const g = window.__game;
    return { s: g.state, r: g.roundNo, t: g.takeNo, takes: JSON.stringify(g.takes), rounds: JSON.stringify(g.rounds), f: g.fighters.map((f) => `${f.displayName}:${Math.round(f.hp)}:${f.alive ? 'A' : 'D'}:${f.weapon ? f.weapon.id : '-'}:${f.state}`).join(' '), kf: document.querySelector('#h-kf').innerText.replace(/\n/g, ' | ') };
  }));
  if (i === 3) await page.screenshot({ path: `${out}/04-fight.png` });
}
console.log(samples.map((s) => JSON.stringify(s)).join('\n'));
await page.screenshot({ path: `${out}/05-later.png` });
console.log('ERRORS', errors.length, errors.slice(0, 15).join('\n'));
await browser.close();
