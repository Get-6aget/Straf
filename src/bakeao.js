import * as THREE from 'three';

// Baked sky visibility ("ambient occlusion") for static map geometry.
// Collision solids are voxelised into a coarse occupancy grid; each unique
// vertex marches a fixed set of hemisphere rays through it. The result only
// scales indirect light (sky/env/hemisphere), so sunlit floors stay lit while
// interiors, corners and the undersides of walkways go dark.
const CELL = 0.4;

// Fixed cosine-ish distributed hemisphere directions around +Z, rotated per normal.
const DIRS = (() => {
  const out = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, phi = i * 2.399963; // golden angle
    const r = Math.sqrt(u), z = Math.sqrt(1 - u);
    out.push([r * Math.cos(phi), r * Math.sin(phi), z]);
  }
  return out;
})();

export class OccupancyGrid {
  constructor(world) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of world.boxes) {
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); minZ = Math.min(minZ, b.minZ);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); maxZ = Math.max(maxZ, b.maxZ);
    }
    minY = Math.max(minY, -3);
    this.o = [minX - CELL, minY - CELL, minZ - CELL];
    this.n = [Math.ceil((maxX - minX) / CELL) + 3, Math.ceil((maxY - minY) / CELL) + 3, Math.ceil((maxZ - minZ) / CELL) + 3];
    const [nx, ny, nz] = this.n;
    this.d = new Uint8Array(nx * ny * nz);
    for (const b of world.boxes) {
      // thin railings and props shouldn't darken the world
      if (Math.min(b.maxX - b.minX, b.maxZ - b.minZ) < 0.15) continue;
      const i0 = Math.max(0, Math.floor((b.minX - this.o[0]) / CELL + 0.5)), i1 = Math.min(nx - 1, Math.floor((b.maxX - this.o[0]) / CELL - 0.5));
      const j0 = Math.max(0, Math.floor((b.minY - this.o[1]) / CELL + 0.5)), j1 = Math.min(ny - 1, Math.floor((b.maxY - this.o[1]) / CELL - 0.5));
      const k0 = Math.max(0, Math.floor((b.minZ - this.o[2]) / CELL + 0.5)), k1 = Math.min(nz - 1, Math.floor((b.maxZ - this.o[2]) / CELL - 0.5));
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        let top = j1;
        if (b.ramp) {
          const x = this.o[0] + (i + 0.5) * CELL, z = this.o[2] + (k + 0.5) * CELL;
          top = Math.min(j1, Math.floor((world.topAt(b, x, z) - this.o[1]) / CELL - 0.5));
        }
        for (let j = j0; j <= top; j++) this.d[(j * nz + k) * nx + i] = 1;
      }
    }
  }

  solidAt(x, y, z) {
    const i = Math.floor((x - this.o[0]) / CELL), j = Math.floor((y - this.o[1]) / CELL), k = Math.floor((z - this.o[2]) / CELL);
    const [nx, ny, nz] = this.n;
    if (i < 0 || k < 0 || i >= nx || k >= nz || j >= ny) return 0;
    if (j < 0) return 1;
    return this.d[(j * nz + k) * nx + i];
  }

  // 0 = fully enclosed, 1 = open sky.
  visibility(px, py, pz, nx, ny, nz) {
    // tangent frame
    let tx, ty, tz;
    if (Math.abs(ny) < 0.9) { tx = nz; ty = 0; tz = -nx; } else { tx = 1; ty = 0; tz = 0; }
    let l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const ox = px + nx * CELL * 0.6, oy = py + ny * CELL * 0.6, oz = pz + nz * CELL * 0.6;
    let vis = 0, wsum = 0;
    for (const [a, b, c] of DIRS) {
      const dx = tx * a + bx * b + nx * c, dy = ty * a + by * b + ny * c, dz = tz * a + bz * b + nz * c;
      // rays towards the sky count more: overcast light comes from above
      const w = 0.35 + Math.max(0, dy);
      let open = 1;
      for (let s = 1; s <= 22; s++) {
        const t = s * s * 0.035 + s * 0.12;
        if (this.solidAt(ox + dx * t, oy + dy * t, oz + dz * t)) { open = Math.min(1, t / 14); break; }
      }
      vis += open * w; wsum += w;
    }
    return vis / wsum;
  }
}

export function bakeVisibility(geo, grid) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const out = new Float32Array(pos.count);
  const memo = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = nor.getX(i), b = nor.getY(i), c = nor.getZ(i);
    const key = `${Math.round(x * 20)},${Math.round(y * 20)},${Math.round(z * 20)},${Math.round(a * 4)},${Math.round(b * 4)},${Math.round(c * 4)}`;
    let v = memo.get(key);
    if (v === undefined) { v = grid.visibility(x, y, z, a, b, c); memo.set(key, v); }
    out[i] = v;
  }
  geo.setAttribute('skyVis', new THREE.BufferAttribute(out, 1));
}

// Clone a material so it reads the baked attribute for indirect light only.
const cache = new Map();
export function withSkyVis(mat) {
  if (cache.has(mat)) return cache.get(mat);
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skyVis;\nvarying float vSkyVis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyVis = skyVis;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkyVis;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float sv = clamp(vSkyVis, 0.0, 1.0);
        float skyAO = sv * sv * (3.0 - 2.0 * sv);
        reflectedLight.indirectDiffuse *= mix(0.08, 1.0, skyAO);
        reflectedLight.indirectSpecular *= mix(0.03, 1.0, skyAO);
        reflectedLight.directDiffuse *= mix(0.55, 1.0, sv);`);
  };
  m.customProgramCacheKey = () => 'skyvis';
  cache.set(mat, m);
  return m;
}
