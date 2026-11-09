import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 600, height: 400 } })).newPage();
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:4175/?q=2');
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle');
await page.click('[data-mode="1v1"]');
await page.waitForTimeout(2500);
console.log(await page.evaluate(async () => {
  const g = window.__game, f = g.fighters[1];
  const { CharacterModel } = await import('/src/models.js');
  const m = new CharacterModel(f.color, 1);
  m.root.position.set(0, 0, 0); m.root.updateMatrixWorld(true);
  m.body.traverse((o) => o.isBone && o.updateMatrixWorld(true));
  const mesh = m.body.children.find((c) => c.isSkinnedMesh), geo = mesh.geometry, si = geo.attributes.skinIndex, v = new (m.root.position.constructor)();
  const out = { shoe: [1e9, -1e9], leg: [1e9, -1e9], shoeZ: [1e9, -1e9], legZ: [1e9, -1e9] };
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const b = si.getX(i); mesh.getVertexPosition(i, v);
    const isShoe = b === 13 || b === 16, isLeg = b === 12 || b === 15;
    if (isShoe) { out.shoe[0] = Math.min(out.shoe[0], v.y); out.shoe[1] = Math.max(out.shoe[1], v.y); out.shoeZ[0] = Math.min(out.shoeZ[0], v.z); out.shoeZ[1] = Math.max(out.shoeZ[1], v.z); }
    if (isLeg) { out.leg[0] = Math.min(out.leg[0], v.y); out.leg[1] = Math.max(out.leg[1], v.y); out.legZ[0] = Math.min(out.legZ[0], v.z); out.legZ[1] = Math.max(out.legZ[1], v.z); }
  }
  return JSON.stringify(out);
}));
await browser.close();
