// Axis-aligned box world. Every solid in a map is an AABB, which keeps
// collision, raycasts and nav-graph generation simple and fast.
export class World {
  constructor() {
    this.boxes = [];
    this.killY = -25;
  }

  add(minX, minY, minZ, maxX, maxY, maxZ, type = 'solid') {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, type };
    this.boxes.push(b);
    return b;
  }

  overlapAny(minX, minY, minZ, maxX, maxY, maxZ) {
    for (const b of this.boxes) {
      if (minX < b.maxX && maxX > b.minX && minY < b.maxY && maxY > b.minY && minZ < b.maxZ && maxZ > b.minZ) return b;
    }
    return null;
  }

  overlapAll(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0;
    for (const b of this.boxes) {
      if (minX < b.maxX && maxX > b.minX && minY < b.maxY && maxY > b.minY && minZ < b.maxZ && maxZ > b.minZ) out.push(b);
    }
    return out;
  }

  // Returns {t, nx, ny, nz, box} for the closest hit within maxDist, or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, hit = null, bnx = 0, bny = 0, bnz = 0;
    for (const b of this.boxes) {
      let tmin = 0, tmax = best, axis = -1, sgn = 0;
      // X
      if (Math.abs(dx) < 1e-9) { if (ox < b.minX || ox > b.maxX) continue; }
      else {
        let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) { tmin = t1; axis = 0; sgn = dx > 0 ? -1 : 1; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (Math.abs(dy) < 1e-9) { if (oy < b.minY || oy > b.maxY) continue; }
      else {
        let t1 = (b.minY - oy) / dy, t2 = (b.maxY - oy) / dy;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) { tmin = t1; axis = 1; sgn = dy > 0 ? -1 : 1; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (oz < b.minZ || oz > b.maxZ) continue; }
      else {
        let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) { tmin = t1; axis = 2; sgn = dz > 0 ? -1 : 1; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (tmin < best || (hit === null && tmin <= best)) {
        best = tmin; hit = b;
        bnx = bny = bnz = 0;
        if (axis === 0) bnx = sgn; else if (axis === 1) bny = sgn; else if (axis === 2) bnz = sgn;
        else { bnx = -dx; bny = -dy; bnz = -dz; } // origin inside box
      }
    }
    return hit ? { t: best, nx: bnx, ny: bny, nz: bnz, box: hit } : null;
  }

  // First free top surface strictly below startY at (x, z) for a body of radius r.
  groundBelow(x, startY, z, r = 0.3, maxDrop = 80) {
    const h = this.raycast(x, startY, z, 0, -1, 0, maxDrop);
    if (!h || h.ny < 0.5) return null;
    return startY - h.t;
  }
}

// Ray vs AABB given as numbers; returns entry distance or -1.
export function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
  let tmin = 0, tmax = maxDist;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return -1; continue; }
    let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
