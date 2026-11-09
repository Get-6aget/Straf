import { chromium } from 'playwright-core';

// In-engine character check: a bot 2.6 m in front of the camera in several movement states.
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '/tmp/verify/charcheck';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 1, music: 0 })));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 90000 });
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(600);
await page.evaluate(() => {
  const g = window.__game;
  g.update = () => {};
  const p = g.player;
  p.pos.x = 14; p.pos.y = 0.01; p.pos.z = 2.6; g.pYaw = 0; g.pPitch = -0.12;
  document.querySelector('#hud').style.display = 'none';
});
const states = [
  ['idle', { state: 'normal', onGround: true, vel: { x: 0, y: 0, z: 0 } }],
  ['run', { state: 'normal', onGround: true, sprinting: true, vel: { x: 0, y: 0, z: 7.4 } }],
  ['slide', { state: 'slide', onGround: true, vel: { x: 0, y: 0, z: 12 } }],
  ['wallrun', { state: 'wallrun', onGround: false, wallNormal: { x: 1, z: 0 }, vel: { x: 0, y: 0, z: 7 } }],
  ['fall', { state: 'normal', onGround: false, airT: 1, vel: { x: 0, y: -4, z: 2 } }],
  ['death', { state: 'normal', onGround: true, alive: false, vel: { x: 0, y: 0, z: 0 } }],
];
for (const [name, s] of states) {
  await page.evaluate(([s, name]) => {
    const g = window.__game, e = g.fighters[1];
    const yaw = name === 'idle' || name === 'death' ? Math.PI : Math.PI / 2 + 0.5;
    Object.assign(e, { alive: true, crouching: false, sprinting: false, airT: 0, pitch: 0.1, wallKick: 0 }, s);
    e.yaw = yaw;
    e.pos.x = 14; e.pos.y = name === 'wallrun' ? 0.6 : 0.01; e.pos.z = 0;
    if (!e.hands.R) { const pk = g.combat.pickups.find((x) => x.inst.def.hands === 2) || g.combat.pickups[0]; g.combat.take(e, pk); }
    e.model.root.rotation.y = yaw;
    for (let i = 0; i < 45; i++) { e.stateT = 0.3; e.model.update(1 / 60, e); }
  }, [s, name]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log('ERRORS', errors.length, errors.slice(0, 5).join('\n'));
await browser.close();
