import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e=>console.log('pe',e.message));
await page.goto('http://localhost:4174/');
await page.waitForTimeout(3000);
const r = await page.evaluate(async()=>{
  const { buildFPArm } = await import('/src/fparms.js');
  const out={};
  for (const p of ['grip','under','handle','fist']) {
    const a = buildFPArm(p); a.mesh.updateMatrixWorld(true); a.mesh.skeleton.update();
    const g=a.mesh.geometry; const res={};
    for (const k of Object.keys(g.attributes)) { const arr=g.attributes[k].array; let bad=0; for (const v of arr) if(!isFinite(v)) bad++; res[k]=[arr.length,bad]; }
    const sw=g.attributes.skinWeight.array; let zero=0,nz=0; for(let i=0;i<sw.length;i+=4){const s=sw[i]+sw[i+1]+sw[i+2]+sw[i+3]; if(s<0.99||s>1.01)zero++;}
    let nl=0; const n=g.attributes.normal.array; for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2]); if(Math.abs(l-1)>0.01)nl++;}
    let be=0; for(const m of a.mesh.skeleton.boneMatrices) if(!isFinite(m)) be++;
    out[p]={res,zero,nl,be,groups:g.groups.length,idx:g.index&&g.index.count};
  }
  return out;
});
console.log(JSON.stringify(r,null,1));
await browser.close();
