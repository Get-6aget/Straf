import { chromium } from 'playwright-core';
// Third-person character review shots: node scripts/charshots.mjs [url] [outDir] [only,names]
const url = process.argv[2] || 'http://localhost:4175/';
const out = process.argv[3] || '.shots/char';
const only = process.argv[4] ? process.argv[4].split(',') : null;
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'ru-RU' })).newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 2 })));
await page.goto(url + '?q=2');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 120000 });
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const g = window.__game;
  g.__u = g.update; g.update = () => {};
  g.player.alive = false; g.spectateDelay = -1;
  for (const f of g.fighters.slice(2)) f.model.root.visible = false;
});
const poses = [
  ['idle', { state: 'normal', onGround: true, vel: { x: 0, y: 0, z: 0 }, noGun: true }],
  ['run', { state: 'normal', onGround: true, sprinting: true, vel: { x: 7, y: 0, z: 0 } }],
  ['walk', { state: 'normal', onGround: true, vel: { x: 3.5, y: 0, z: 0 }, noGun: true }],
  ['crouch', { state: 'normal', onGround: true, crouching: true, vel: { x: 0, y: 0, z: 0 }, noGun: true }],
  ['slide', { state: 'slide', onGround: true, stateT: 0.3, vel: { x: 12, y: 0, z: 0 } }],
  ['wallrun', { state: 'wallrun', onGround: false, wallNormal: { x: 0, z: 1 }, vel: { x: 7, y: 0, z: 0 } }],
  ['walljump', { state: 'normal', onGround: false, wallKick: 0.18, wallNormal: { x: 1, z: 0 }, vel: { x: 6, y: 5, z: 0 } }],
  ['mantle', { state: 'mantle', onGround: false, vel: { x: 0, y: 0, z: 0 } }],
  ['rifle', { state: 'normal', onGround: true, vel: { x: 0, y: 0, z: 0 }, gun: 2 }],
  ['pistol', { state: 'normal', onGround: true, vel: { x: 0, y: 0, z: 0 }, gun: 1 }],
  ['dead', { dead: true }],
];
const views = [['f', 0], ['q', 0.8], ['s', 1.57]];
for (const [name, p] of poses) {
  if (only && !only.includes(name)) continue;
  for (const [vn, off] of views) {
    await page.evaluate(([p, off]) => {
      const g = window.__game, f = g.fighters[1];
      Object.assign(f, { alive: !p.dead, wallKick: 0, crouching: false, sprinting: false, pitch: 0, state: 'normal', stateT: 0.2, height: 1.8 }, p);
      f.yaw = -Math.PI / 2;
      f.pos.x = 1; f.pos.y = p.state === 'wallrun' ? 1.2 : 0.01; f.pos.z = 1;
      f.vel = { ...(p.vel || { x: 0, y: 0, z: 0 }) };
      f.hands.R = null; f.hands.L = null;
      if (!p.noGun) {
        const pk = g.combat.pickups.find((x) => x.inst.def.hands === (p.gun || 1)) || g.combat.pickups[0];
        g.combat.take(f, pk);
      }
      if (p.dead) f.model.deadT = 0;
      g.spectateTarget = f; g.specYaw = -2.2 + off;
      f.model.phase = 1.0;
      for (let i = 0; i < 80; i++) { f.stateT = p.stateT ?? 0.2; f.model.update(1 / 60, f); }
    }, [p, off]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-${vn}.png` });
  }
}
console.log('ERRORS', errors.length, '\n' + errors.slice(0, 10).join('\n'));
await browser.close();
