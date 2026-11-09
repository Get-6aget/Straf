import { chromium } from 'playwright-core';

// Visual check: menu, first-person view, third-person movement poses.
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '/tmp/t';
const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: Number(new URLSearchParams(location.search).get('q') ?? 2) })));
await page.goto(url + '?q=' + (process.argv[4] ?? 2));
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/v2-menu.png` });

// first-person: real match, player holds a rifle, looks across the yard
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(800);
const setup = async (fn, arg) => page.evaluate(fn, arg);
await setup(() => {
  const g = window.__game, p = g.player;
  const pk = g.combat.pickups.find((x) => x.inst.def.hands === 2) || g.combat.pickups[0];
  g.combat.take(p, pk);
  p.pos.x = -14; p.pos.y = 0.01; p.pos.z = 16; g.pYaw = -2.4; g.pPitch = -0.02;
  const e = g.fighters[1]; e.pos.x = -2; e.pos.y = 0; e.pos.z = 2;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/v2-fp.png` });
await setup(() => { const g = window.__game, p = g.player; p.pos.x = 19; p.pos.y = 3.61; p.pos.z = -14; g.pYaw = 0.6; g.pPitch = -0.15; });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/v2-fp2.png` });

// third-person poses: freeze simulation, place a bot, orbit camera
await setup(() => {
  const g = window.__game;
  g.__u = g.update; g.update = () => {};
  g.player.alive = false; g.spectateDelay = -1;
  for (const f of g.fighters.slice(2)) f.model.root.visible = false;
});
const poses = [
  ['run', { state: 'normal', onGround: true, sprinting: true, vel: { x: 7, y: 0, z: 0 } }],
  ['slide', { state: 'slide', onGround: true, stateT: 0.3, vel: { x: 12, y: 0, z: 0 } }],
  ['wallrun', { state: 'wallrun', onGround: false, wallNormal: { x: 0, z: 1 }, vel: { x: 7, y: 0, z: 0 } }],
  ['walljump', { state: 'normal', onGround: false, wallKick: 0.18, wallNormal: { x: 1, z: 0 }, vel: { x: 6, y: 5, z: 0 } }],
  ['mantle', { state: 'mantle', onGround: false, vel: { x: 0, y: 0, z: 0 } }],
];
for (const [name, p] of poses) {
  await setup(([p]) => {
    const g = window.__game, f = g.fighters[1];
    Object.assign(f, { alive: true, wallKick: 0, crouching: false, sprinting: false, pitch: 0 }, p);
    f.yaw = -Math.PI / 2;
    f.pos.x = 1; f.pos.y = p.state === 'wallrun' ? 1.2 : 0.01; f.pos.z = 1;
    if (p.vel) f.vel = { ...p.vel };
    if (!f.hands.R) g.combat.take(f, g.combat.pickups.find((x) => x.inst.def.hands === 1) || g.combat.pickups[0]);
    g.spectateTarget = f; g.specYaw = -2.2;
    for (let i = 0; i < 40; i++) { f.stateT = p.stateT ?? 0.2; f.model.update(1 / 60, f); }
  }, [p]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/v2-pose-${name}.png`, clip: { x: 240, y: 60, width: 800, height: 600 } });
}
console.log('ERRORS', errors.length, '\n' + errors.slice(0, 12).join('\n'));
await browser.close();
