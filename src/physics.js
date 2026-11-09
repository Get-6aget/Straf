// Collision world made of convex solids: axis-aligned boxes and ramps
// (a box whose top is a slope rising along X or Z). Ramps make slope
// sliding possible while keeping collision cheap and predictable.
export class World {
  constructor() {
    this.boxes = [];
    this.killY = -25;
  }

  // ramp: { axis: 'x' | 'z', dir: 1 | -1 } — top rises toward +axis when dir = 1
  add(minX, minY, minZ, maxX, maxY, maxZ, type = 'solid', ramp = null) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, type, ramp };
    if (ramp) {
      const len = ramp.axis === 'x' ? maxX - minX : maxZ - minZ;
      b.slope = (maxY - minY) / len;
    }
    this.boxes.push(b);
    return b;
  }

  // Vertical cylinder (towers, silos, barrels).
  addCyl(x, z, r, y0, y1, type = 'solid') {
    const b = { cyl: true, x, z, r, minX: x - r, maxX: x + r, minY: y0, maxY: y1, minZ: z - r, maxZ: z + r, type, ramp: null };
    this.boxes.push(b);
    return b;
  }

  containsXZ(b, x, z) {
    if (b.cyl) return (x - b.x) ** 2 + (z - b.z) ** 2 <= b.r * b.r;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  // Height of a ramp top at (x, z); for plain boxes it is maxY.
  topAt(b, x, z) {
    if (!b.ramp) return b.maxY;
    const { axis, dir } = b.ramp;
    let t;
    if (axis === 'x') t = dir > 0 ? x - b.minX : b.maxX - x;
    else t = dir > 0 ? z - b.minZ : b.maxZ - z;
    const len = axis === 'x' ? b.maxX - b.minX : b.maxZ - b.minZ;
    t = Math.max(0, Math.min(len, t));
    return b.minY + t * b.slope;
  }

  // Downhill unit vector (xz) and slope steepness for ramps.
  downhill(b) {
    if (!b || !b.ramp) return null;
    const s = b.slope, { axis, dir } = b.ramp;
    return { x: axis === 'x' ? -dir : 0, z: axis === 'z' ? -dir : 0, s };
  }

  boxOverlap(b, minX, minY, minZ, maxX, maxY, maxZ) {
    if (!(minX < b.maxX && maxX > b.minX && minY < b.maxY && maxY > b.minY && minZ < b.maxZ && maxZ > b.minZ)) return false;
    if (b.cyl) {
      const qx = Math.max(minX, Math.min(maxX, b.x)), qz = Math.max(minZ, Math.min(maxZ, b.z));
      return (qx - b.x) ** 2 + (qz - b.z) ** 2 < b.r * b.r;
    }
    if (!b.ramp) return true;
    // Highest point of the slope under the query footprint
    const cx = Math.max(b.minX, Math.min(b.maxX, b.ramp.dir > 0 ? maxX : minX));
    const cz = Math.max(b.minZ, Math.min(b.maxZ, b.ramp.dir > 0 ? maxZ : minZ));
    return minY < this.topAt(b, cx, cz);
  }

  overlapAny(minX, minY, minZ, maxX, maxY, maxZ) {
    for (const b of this.boxes) if (this.boxOverlap(b, minX, minY, minZ, maxX, maxY, maxZ)) return b;
    return null;
  }

  overlapAll(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0;
    for (const b of this.boxes) if (this.boxOverlap(b, minX, minY, minZ, maxX, maxY, maxZ)) out.push(b);
    return out;
  }

  // Ray vs convex solid (Cyrus–Beck). Returns {t, nx, ny, nz, box} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, hit = null, bn = null;
    for (const b of this.boxes) {
      const r = rayConvex(b, ox, oy, oz, dx, dy, dz, best);
      if (r && r.t < best) { best = r.t; hit = b; bn = r; }
      else if (r && !hit && r.t <= best) { best = r.t; hit = b; bn = r; }
    }
    return hit ? { t: best, nx: bn.nx, ny: bn.ny, nz: bn.nz, box: hit } : null;
  }

  groundBelow(x, startY, z, maxDrop = 80) {
    const h = this.raycast(x, startY, z, 0, -1, 0, maxDrop);
    if (!h || h.ny < 0.5) return null;
    return startY - h.t;
  }
}

function planesOf(b) {
  if (b._planes) return b._planes;
  const p = [
    [-1, 0, 0, -b.minX], [1, 0, 0, b.maxX],
    [0, -1, 0, -b.minY],
    [0, 0, -1, -b.minZ], [0, 0, 1, b.maxZ],
  ];
  if (!b.ramp) p.push([0, 1, 0, b.maxY]);
  else {
    const s = b.slope, { axis, dir } = b.ramp;
    let nx = 0, nz = 0, d;
    if (axis === 'x') { nx = -s * dir; d = dir > 0 ? b.minY - s * b.minX : b.minY + s * b.maxX; }
    else { nz = -s * dir; d = dir > 0 ? b.minY - s * b.minZ : b.minY + s * b.maxZ; }
    const l = Math.hypot(nx, 1, nz);
    p.push([nx / l, 1 / l, nz / l, d / l]);
  }
  b._planes = p;
  return p;
}

function rayCyl(b, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity, n = null;
  const fx = ox - b.x, fz = oz - b.z;
  const c = fx * fx + fz * fz - b.r * b.r;
  if (c <= 0 && oy >= b.minY && oy <= b.maxY) return { t: 0, nx: -dx, ny: -dy, nz: -dz };
  const a = dx * dx + dz * dz;
  if (a > 1e-12 && c > 0) {
    const bb = 2 * (dx * fx + dz * fz), disc = bb * bb - 4 * a * c;
    if (disc >= 0) {
      const t = (-bb - Math.sqrt(disc)) / (2 * a);
      const y = oy + dy * t;
      if (t >= 0 && y >= b.minY && y <= b.maxY) { best = t; n = [(fx + dx * t) / b.r, 0, (fz + dz * t) / b.r]; }
    }
  }
  for (const [py, ny] of [[b.maxY, 1], [b.minY, -1]]) {
    if (Math.abs(dy) < 1e-9 || (ny > 0 ? oy < py : oy > py)) continue;
    const t = (py - oy) / dy;
    if (t < 0 || t >= best) continue;
    const hx = fx + dx * t, hz = fz + dz * t;
    if (hx * hx + hz * hz <= b.r * b.r) { best = t; n = [0, ny, 0]; }
  }
  if (!n || best > maxDist) return null;
  return { t: best, nx: n[0], ny: n[1], nz: n[2] };
}

function rayConvex(b, ox, oy, oz, dx, dy, dz, maxDist) {
  if (b.cyl) return rayCyl(b, ox, oy, oz, dx, dy, dz, maxDist);
  // quick AABB reject
  if (rayAABB(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, maxDist) < 0) return null;
  let tEnter = 0, tExit = maxDist, n = null;
  for (const [nx, ny, nz, d] of planesOf(b)) {
    const denom = nx * dx + ny * dy + nz * dz;
    const dist = d - (nx * ox + ny * oy + nz * oz);
    if (Math.abs(denom) < 1e-9) { if (dist < 0) return null; continue; }
    const t = dist / denom;
    if (denom < 0) { if (t > tEnter) { tEnter = t; n = [nx, ny, nz]; } }
    else if (t < tExit) tExit = t;
    if (tEnter > tExit) return null;
  }
  if (!n) return { t: 0, nx: -dx, ny: -dy, nz: -dz }; // origin inside
  return { t: tEnter, nx: n[0], ny: n[1], nz: n[2] };
}

export function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
  let tmin = 0, tmax = maxDist;
  if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) return -1; }
  else {
    let t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) return -1; }
  else {
    let t1 = (minY - oy) / dy, t2 = (maxY - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) return -1; }
  else {
    let t1 = (minZ - oz) / dz, t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1;
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
