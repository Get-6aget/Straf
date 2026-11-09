import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '/tmp/t';
const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--lang=ru-RU'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 30000 });

// Third-person poses on the yard map (side view: camera behind fighter yaw=0, motion along +x)
await page.evaluate(() => {
  const g = window.__game;
  g.startMatch({ mode: 'ffa', attract: true, roundsToWin: 99, mapIndex: 0 });
  g.__origUpdate = g.update;
  g.update = () => {};
  for (const f of g.fighters.slice(1)) { f.pos.x = 100; f.model.root.visible = false; }
});
const poses = [
  ['run', { state: 'normal', vel: { x: 7, y: 0, z: 0 } }],
  ['slide', { state: 'slide', stateT: 0.3, vel: { x: 11, y: 0, z: 0 } }],
  ['roll', { state: 'roll', stateT: 0.18, rollDir: { x: 1, z: 0 }, vel: { x: 10, y: 0, z: 0 } }],
  ['dive', { state: 'dive', stateT: 0.2, onGround: false, rollDir: { x: 1, z: 0 }, vel: { x: 11, y: 2, z: 0 } }],
  ['wallbounce', { state: 'normal', onGround: false, wallAnim: 0.2, wallNormal: { x: 1, z: 0 }, vel: { x: 7, y: 6, z: 0 } }],
];
for (const [name, p] of poses) {
  await page.evaluate(([p]) => {
    const g = window.__game;
    const f = g.fighters[0];
    Object.assign(f, { alive: true, onGround: true, yaw: 0, pitch: 0, wallAnim: 0 }, p);
    f.pos.x = 6; f.pos.y = 0; f.pos.z = -3;
    if (p.vel) f.vel = { ...p.vel };
    f.weapon = null;
    g.spectateTarget = f; g.attractT = 999; g.specYaw = -0.9;
    for (let i = 0; i < (p.state === 'roll' ? 1 : 40); i++) f.model.update(1 / 60, f);
    f.yaw = -0.9;
  }, [p]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/pose-${name}.png`, clip: { x: 320, y: 120, width: 640, height: 480 } });
}

// First-person: real 1v1 match, Russian HUD, kill feed, roll camera
await page.evaluate(() => { const g = window.__game; g.update = g.__origUpdate; });
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(3200);
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player, e = g.fighters[1];
  const pk = g.combat.pickups[0];
  if (pk) g.combat.takePickup(p, pk);
  // fake two kills in the feed to show formatting
  g.hud.killfeed(e, p, 'harpoon', ['tagAir'], true);
  g.hud.killfeed(p, e, 'resonator', ['tagVoid'], true);
  g.hud.killfeed(null, e, null, ['tagVoid'], false);
  p.state = 'roll'; p.stateT = 0.16; p.rollDir = { x: Math.cos(g.pYaw), z: -Math.sin(g.pYaw) }; // sideways roll
});
await page.waitForTimeout(60);
await page.screenshot({ path: `${out}/fp-roll.png` });
await page.evaluate(() => { const g = window.__game; const p = g.player; p.state = 'slide'; p.stateT = 0; p.vel = { x: -Math.sin(g.pYaw) * 12, y: 0, z: -Math.cos(g.pYaw) * 12 }; });
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/fp-slide.png` });
console.log('ERRORS', errors.length, errors.join('\n'));
await browser.close();
