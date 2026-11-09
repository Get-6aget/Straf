import { chromium } from 'playwright-core';

// Geometry sanity check: NaN positions/normals and zero-length normals per material mesh.
const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
page.setDefaultTimeout(180000);
await page.addInitScript(() => localStorage.setItem('perekat_settings_v2', JSON.stringify({ quality: 0 })));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state !== 'idle', null, { timeout: 120000 });
const res = await page.evaluate(async () => {
  const { MAPS } = await import('/src/maps.js');
  const g = window.__game, out = {};
  for (const m of MAPS) {
    g.loadMap(m);
    const r = [];
    g.mapRoot.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position.array, n = o.geometry.attributes.normal?.array, uv = o.geometry.attributes.uv?.array;
      let nanP = 0, nanN = 0, zeroN = 0, nanUV = 0;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nanP++;
      if (n) for (let i = 0; i < n.length; i += 3) { if (!Number.isFinite(n[i] + n[i + 1] + n[i + 2])) nanN++; else if (n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2] < 0.5) zeroN++; }
      if (uv) for (let i = 0; i < uv.length; i++) if (!Number.isFinite(uv[i])) nanUV++;
      if (nanP || nanN || zeroN || nanUV) r.push({ mat: o.material.map?.image?.src?.split('/').pop() || o.material.color?.getHexString(), verts: p.length / 3, nanP, nanN, zeroN, nanUV });
    });
    out[m.id] = r;
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
