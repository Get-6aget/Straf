import { chromium } from 'playwright-core';
// Third-person character review shots: node scripts/charshots.mjs [url] [outDir] [poses,csv] [views,csv]
const url = process.argv[2] || 'http://localhost:4175/';
const out = process.argv[3] || '.shots/char';
const only = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null;
const onlyViews = process.argv[5] ? process.argv[5].split(',') : null;
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US' })).newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 2 })));
await page.goto(url + '?q=2');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 120000 });
await page.click('[data-mode="1v1"]');
await page.waitForFunction(() => window.__game && window.__game.fighters && window.__game.fighters.length > 1);
await page.waitForTimeout(2500);
await page.evaluate(async (seed) => {
  const g = window.__game;
  const { CharacterModel } = await import('/src/models.js');
  const f1 = g.fighters[1];
  g.scene.remove(f1.model.root); f1.model = new CharacterModel(f1.color, seed); g.scene.add(f1.model.root);
  g.update = () => {};
  g.player.alive = false;
  for (const f of g.fighters.slice(2)) f.model.root.visible = false;
  document.querySelectorAll('#hud, .hud, [id*=hud]').forEach((e) => { e.style.display = 'none'; });
  window.__cam = { az: 0, dist: 4, h: 1.0, ly: 0.95, fov: 36 };
  g.render = (dt) => {
    const c = g.camera, k = window.__cam, f = g.fighters[1];
    c.position.set(f.pos.x + Math.sin(k.az) * k.dist, f.pos.y + k.h, f.pos.z + Math.cos(k.az) * k.dist);
    c.lookAt(f.pos.x, f.pos.y + k.ly, f.pos.z);
    if (c.fov !== k.fov) { c.fov = k.fov; c.updateProjectionMatrix(); }
    g.post.render(dt, { time: g.time, damage: 0, flash: 0, vmVisible: false, tint: g.light && g.light.grade });
  };
}, Number(process.env.SEED ?? 1));
const spot = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  let best = null;
  for (let x = -40; x <= 40; x += 2) for (let z = -40; z <= 40; z += 2) {
    const h = w.raycast(x, 8, z, 0, -1, 0, 20); if (!h) continue;
    const y = 8 - h.t; if (y > 1) continue;
    if (w.raycast(x, y + 0.3, z, 0, 1, 0, 6)) continue;
    let flat = true; for (const [ox, oz] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [3, 0], [-3, 0]]) { const q = w.raycast(x + ox, 8, z + oz, 0, -1, 0, 20); if (!q || Math.abs(8 - q.t - y) > 0.03) flat = false; } if (!flat) continue;
    for (let a = 0; a < 24 && flat; a++) for (const rr of [0.5, 1, 1.5, 2, 2.5, 3.2]) { const q = w.raycast(x + Math.cos(a * Math.PI / 12) * rr, 8, z + Math.sin(a * Math.PI / 12) * rr, 0, -1, 0, 20); if (!q || Math.abs(8 - q.t - y) > 0.02) flat = false; } if (!flat) continue;
    let low = false; for (let a = 0; a < 16; a++) { if (w.raycast(x, y + 0.12, z, Math.cos(a * Math.PI / 8), 0, Math.sin(a * Math.PI / 8), 3.8)) low = true; } if (low) continue;
    let clear = 0;
    for (let a = 0; a < 16; a++) { const dx = Math.cos(a * Math.PI / 8), dz = Math.sin(a * Math.PI / 8); const r = w.raycast(x, y + 1.2, z, dx, 0, dz, 9); clear += r ? r.t : 9; }
    if (!best || clear > best.clear) best = { x, y, z, clear };
  }
  return best;
});
console.log('spot', JSON.stringify(spot));
const poses = [
  ['idle', { state: 'normal', onGround: true, vel: { x: 0, y: 0, z: 0 }, noGun: true }],
  ['run', { state: 'normal', onGround: true, sprinting: true, vel: { x: 7, y: 0, z: 0 } }],
  ['walk', { state: 'normal', onGround: true, vel: { x: 3.5, y: 0, z: 0 }, noGun: true }],
  ['crouch', { state: 'normal', onGround: true, crouching: true, vel: { x: 0, y: 0, z: 0 }, noGun: true }],
  ['slide0', { state: 'slide', onGround: true, stateT: 0.3, vel: { x: 12, y: 0, z: 0 }, noGun: true }],
  ['slide', { state: 'slide', onGround: true, stateT: 0.3, vel: { x: 12, y: 0, z: 0 } }],
  ['wallrun', { state: 'wallrun', onGround: false, wallNormal: { x: 0, z: 1 }, vel: { x: 7, y: 0, z: 0 } }],
  ['walljump', { state: 'normal', onGround: false, wallKick: 0.18, wallNormal: { x: 1, z: 0 }, vel: { x: 6, y: 5, z: 0 } }],
  ['mantle', { state: 'mantle', onGround: false, vel: { x: 0, y: 0, z: 0 } }],
  ['rifle', { state: 'normal', onGround: true, vel: { x: 0, y: 0, z: 0 }, gun: 2 }],
  ['pistol', { state: 'normal', onGround: true, vel: { x: 0, y: 0, z: 0 }, gun: 1 }],
  ['dead', { dead: true }],
];
// az: camera angle around the character (character faces -x; so az=-pi/2 is its front)
const views = [['f', { az: Math.PI / 2 }], ['q', { az: Math.PI / 4 }], ['s', { az: 0 }], ['b', { az: -Math.PI / 2 }],
  ['face', { az: Math.PI / 2 - 0.25, dist: 1.2, h: 1.65, ly: 1.65, fov: 30 }], ['hand', { az: Math.PI / 2 - 0.6, dist: 1.4, h: 1.0, ly: 0.9, fov: 30 }], ['feet', { az: Math.PI / 3, dist: 1.8, h: 0.5, ly: 0.35, fov: 30 }]];
const POS = process.env.PX ? [Number(process.env.PX), Number(process.env.PZ), Number(process.env.PY ?? 0)] : [spot.x, spot.z, spot.y];
for (const [name, p] of poses) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(([p, POS]) => {
    const g = window.__game, f = g.fighters[1];
    Object.assign(f, { alive: !p.dead, wallKick: 0, crouching: false, sprinting: false, pitch: 0, state: 'normal', stateT: 0.2, height: 1.8 }, p);
    f.yaw = -Math.PI / 2;
    f.pos.x = POS[0]; f.pos.y = POS[2] + (p.state === 'wallrun' ? 1.2 : 0.01); f.pos.z = POS[1];
    f.vel = { ...(p.vel || { x: 0, y: 0, z: 0 }) };
    f.hands.R = null; f.hands.L = null; f.horizSpeed = Math.hypot(f.vel.x, f.vel.z);
    if (!p.noGun) {
      const pk = g.combat.pickups.find((x) => x.inst.def.kind === 'hitscan' && x.inst.def.hands === (p.gun || 1)) || g.combat.pickups[0];
      g.combat.take(f, pk);
    }
    for (const x of g.combat.pickups) x.mesh.visible = false; for (const s of g.spawners) s.pad.visible = false;
    if (p.dead) f.model.deadT = 0;
    f.model.phase = 1.0; window.__dbg = () => { const m = f.model; const mesh = m.body.children.find(c => c.isSkinnedMesh); mesh.skeleton.update(); const vp = (i) => mesh.getVertexPosition(i, m.root.position.clone()).toArray().map(x => +x.toFixed(2)); const dd = {sv: vp(370), leg: vp(200)}; return JSON.stringify({dd, hs: f.horizSpeed, hips: m.hips.position.y, lu: m.legL.upper.rotation.x, ll: m.legL.lower.rotation.x, ft: m.legL.foot.rotation.x, ftp: m.legL.foot.getWorldPosition(m.root.position.clone()).toArray(), root: m.root.position.toArray()}); };
    for (const x of g.combat.pickups) x.mesh.visible = false; for (const s of g.spawners) s.pad.visible = false;
    for (let i = 0; i < 80; i++) { f.stateT = p.stateT ?? 0.2; f.model.update(1 / 60, f); }
  }, [p, POS]);
  for (const [vn, v] of views) {
    if (onlyViews ? !onlyViews.includes(vn) : (['face', 'hand', 'feet', 'b'].includes(vn) && name !== 'idle')) continue;
    await page.evaluate((v) => { window.__cam = { az: 0, dist: 4, h: 1.0, ly: 0.95, fov: 36, ...v }; }, v);
    await page.waitForTimeout(500); if (process.env.DBG) console.log(name, await page.evaluate(() => window.__dbg()));
    await page.screenshot({ path: `${out}/${name}-${vn}.png` });
  }
}
if (!only || only.includes('lineup')) {
  await page.evaluate(async ([POS]) => {
    const g = window.__game, { CharacterModel } = await import('/src/models.js');
    g.fighters[1].model.root.visible = false;
    const cols = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd4ac0d];
    window.__line = [0, 1, 2, 3].map((i) => {
      const m = new CharacterModel(cols[i], i + 4 * i); g.scene.add(m.root);
      const f = { pos: { x: POS[0] + (i - 1.5) * 0.0, y: POS[2], z: POS[1] + (i - 1.5) * 0.95 }, alive: true, state: 'normal', stateT: 0.2, onGround: true, horizSpeed: 0, vel: { x: 0, y: 0, z: 0 }, yaw: -Math.PI / 2 + (i - 1.5) * 0.12, pitch: 0, lean: 0, wallKick: 0, crouching: false, sprinting: false, hands: { R: null, L: null } };
      for (let k = 0; k < 40; k++) m.update(1 / 60, f);
      return m;
    });
    window.__cam = { az: Math.PI / 2, dist: 6.2, h: 1.1, ly: 0.9, fov: 38 };
  }, [POS]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/lineup.png` });
}
console.log('ERRORS', errors.length, '\n' + errors.slice(0, 10).join('\n'));
await browser.close();
