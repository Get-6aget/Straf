import { chromium } from 'playwright-core';
import fs from 'fs';
const url = 'http://localhost:4175/';
const out = '/tmp/shots-char';
fs.mkdirSync(out, { recursive: true });
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 640 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + (e.stack || '').split('\n').slice(0, 3).join('|')));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 1 })));
await page.goto(url + '?q=1');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 90000 });
await page.waitForTimeout(2000);
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const g = window.__game; document.head.insertAdjacentHTML('beforeend','<style>body > *:not(:has(canvas)){display:none !important}</style>');
  g.update = () => {};
  g.player.alive = false; g.spectateDelay = -1;
  for (const f of g.fighters) f.model.root.visible = false;
  const { CharacterModel } = await import('/src/character.js');
  const { WEAPONS } = await import('/src/weapons.js');
  window.__W = Object.keys(WEAPONS);
  window.__ms = [];
  window.__mk = (color, seed, x, z, pose, wid, dead) => {
    const m = new CharacterModel(color, seed); g.scene.add(m.root);
    const def = wid ? WEAPONS[wid] : null;
    const f = Object.assign({ pos: { x, y: 0.01, z }, state: 'normal', onGround: true, sprinting: false, crouching: false, horizSpeed: 0, vel: { x: 0, y: 0, z: 0 }, yaw: Math.PI, pitch: 0, lean: 0, wallNormal: { x: 0, z: 1 }, wallKick: 0, stateT: 0.2, alive: true,
      hands: { R: wid ? { id: wid, def } : null, L: null } }, pose);
    window.__ms.push(m);
    for (let i = 0; i < (dead ? 120 : 60); i++) m.update(1 / 60, f);
    return m;
  };
  window.__clear = () => { window.__ms.forEach((m) => g.scene.remove(m.root)); window.__ms = []; };
  const orig = g.post.render.bind(g.post);
  g.post.render = (dt, o) => { const c = window.__cam; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.fov = c[6] || 40; g.camera.updateProjectionMatrix(); } if (!window.__once) return; window.__once = false; o.flash = 0; o.damage = 0; orig(dt, o); window.__done = true; };
});
const shot = async (name, cam) => {
  await page.evaluate((c) => { window.__cam = c; window.__done = false; window.__once = true; }, cam); await page.waitForFunction(() => window.__done, null, { timeout: 120000 }); await page.waitForTimeout(300);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
};
const colors = [0x3f6f9a, 0xa0432e, 0x5c8a3c, 0xb88a2a, 0x7a4a8c, 0x2f8a86];
const W = await page.evaluate(() => window.__W);
console.log(W.join(','));
const pistol = 'shilo', rifle = W.find((w) => /koch/.test(w)) || W[4];
const X = 0, Z = -3;
const cams = [
  ['front', [X, 1.1, Z + 3.3, X, 0.95, Z, 40]],
  ['34', [X + 2.3, 1.2, Z + 2.4, X, 0.95, Z, 40]],
  ['side', [X + 3.3, 1.0, Z, X, 0.95, Z, 40]],
];
const scenes = [
  ['lineup', async () => { await page.evaluate((cs) => cs.forEach((c, i) => window.__mk(c, i, -2.25 + i * 0.9, -3, {}, null)), colors); await shot('lineup', [0.2, 1.1, Z + 6.5, 0.2, 0.95, Z, 40]); await shot('lineup-b', [0.2, 1.1, Z + 6.5, 0.2, 0.95, Z, 40]); }],
  ['lineup2', async () => { await page.evaluate((cs) => cs.forEach((c, i) => window.__mk(c, i + 6, -2.25 + i * 0.9, -3, {}, null)), colors); await shot('lineup2', [0.2, 1.1, Z + 6.5, 0.2, 0.95, Z, 40]); }],
  ['head', async () => { await page.evaluate(() => window.__mk(0x3f6f9a, 0, 0, -3, {}, null)); await page.evaluate(() => window.__mk(0xa0432e, 3, 0.9, -3, {}, null)); await shot('head', [0.45, 1.65, Z + 1.3, 0.45, 1.62, Z, 35]); }],
  ['idle', () => mk(0xa0432e, 1, {}, null)],
  ['rifle', () => mk(0x3f6f9a, 3, {}, rifle)],
  ['pistol', () => mk(0x5c8a3c, 2, {}, pistol)],
  ['run', () => mk(0xb88a2a, 0, { sprinting: true, horizSpeed: 7, vel: { x: 0, y: 0, z: -7 } }, rifle)],
  ['slide', () => mk(0x7a4a8c, 4, { state: 'slide', horizSpeed: 12, vel: { x: 0, y: 0, z: -12 }, stateT: 0.3 }, pistol)],
  ['wallrun', () => mk(0x2f8a86, 5, { state: 'wallrun', onGround: false, horizSpeed: 7, vel: { x: 0, y: 0, z: -7 }, wallNormal: { x: 1, z: 0 } }, null)],
  ['crouch', () => mk(0xa0432e, 7, { crouching: true, horizSpeed: 2 }, pistol)],
  ['air', () => mk(0x3f6f9a, 8, { onGround: false, vel: { x: 0, y: 3, z: -4 }, horizSpeed: 4 }, rifle)],
  ['mantle', () => mk(0x5c8a3c, 9, { state: 'mantle', onGround: false }, null)],
  ['dead', () => mk(0xb88a2a, 10, { alive: false }, pistol, true)],
];
async function mk(c, s, pose, w, dead) { await page.evaluate(([c, s, pose, w, d]) => { window.__mk(c, s, 0, -3, pose, w, d); }, [c, s, pose, w, dead || false]); }
for (const [name, fn] of scenes) {
  if (only && !only.test(name)) continue;
  await page.evaluate(() => window.__clear());
  await fn();
  if (['lineup', 'lineup2', 'head'].includes(name)) continue;
  for (const [suf, cam] of cams) await shot(`${name}-${suf}`, cam);
}
console.log('ERRORS', errors.length, errors.slice(0, 8).join('\n'));
await browser.close();
