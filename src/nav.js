import { RADIUS, STAND_H } from './constants.js';

// Grid-sampled walkable surfaces connected by walk/jump/drop edges,
// queried with A*. Built once per map.
const CELL = 1.5;

export class NavGraph {
  constructor(world) {
    this.world = world;
    this.nodes = [];
    this.grid = new Map();
    this.build();
  }

  key(ix, iz) { return ix * 4096 + iz; }

  build() {
    const w = this.world;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const b of w.boxes) {
      minX = Math.min(minX, b.minX); minZ = Math.min(minZ, b.minZ);
      maxX = Math.max(maxX, b.maxX); maxZ = Math.max(maxZ, b.maxZ);
    }
    this.minX = minX; this.minZ = minZ;
    const nx = Math.ceil((maxX - minX) / CELL), nz = Math.ceil((maxZ - minZ) / CELL);
    this.nx = nx; this.nz = nz;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const x = minX + (ix + 0.5) * CELL, z = minZ + (iz + 0.5) * CELL;
        const tops = [];
        for (const b of w.boxes) {
          if (w.containsXZ(b, x, z)) tops.push(b);
        }
        const list = [];
        for (const b of tops) {
          const y = w.topAt(b, x, z);
          if (y < w.killY + 2) continue;
          // ignore climbable steps right next to the sample point
          if (w.overlapAny(x - 0.05, y + 0.02, z - 0.05, x + 0.05, y + STAND_H, z + 0.05)) continue;
          if (w.overlapAny(x - RADIUS, y + 0.7, z - RADIUS, x + RADIUS, y + STAND_H, z + RADIUS)) continue;
          if (list.some((n) => Math.abs(n.y - y) < 0.3)) continue;
          const node = { id: this.nodes.length, x, y, z, ix, iz, edges: [], pad: b.type === 'pad', comp: -1 };
          this.nodes.push(node);
          list.push(node);
        }
        if (list.length) this.grid.set(this.key(ix, iz), list);
      }
    }
    const pairCache = new Map();
    for (const n of this.nodes) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const list = this.grid.get(this.key(n.ix + dx, n.iz + dz));
        if (!list) continue;
        for (const m of list) if (this.canLink(n, m, pairCache)) n.edges.push(m.id);
      }
      this.addGapEdges(n);
      if (n.pad) this.addPadEdges(n);
    }
    // connected components (on bidirectional edges) for spawn selection
    let comp = 0;
    for (const n of this.nodes) {
      if (n.comp >= 0) continue;
      const stack = [n]; n.comp = comp;
      while (stack.length) {
        const c = stack.pop();
        for (const e of c.edges) {
          const m = this.nodes[e];
          if (m.comp < 0 && m.edges.includes(c.id)) { m.comp = comp; stack.push(m); }
        }
      }
      comp++;
    }
    const sizes = new Array(comp).fill(0);
    for (const n of this.nodes) sizes[n.comp]++;
    this.mainComp = sizes.indexOf(Math.max(...sizes));
  }

  // Walk/step/drop link between neighbouring cells. Clearance is symmetric, so it
  // is computed once per unordered pair.
  canLink(a, b, cache) {
    const dy = b.y - a.y;
    if (dy > 1.35 || dy < -6) return false;
    const k = a.id < b.id ? a.id * 100000 + b.id : b.id * 100000 + a.id;
    let ok = cache.get(k);
    if (ok === undefined) { ok = this.clear(a, b, true); cache.set(k, ok); }
    return ok;
  }

  clear(a, b, needFloor) {
    const w = this.world;
    const hi = Math.max(a.y, b.y);
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const px = -uz * RADIUS * 0.9, pz = ux * RADIUS * 0.9;
    if (w.raycast(a.x, hi + 1.5, a.z, ux, 0, uz, len)) return false;
    for (const s of [-1, 0, 1]) if (w.raycast(a.x + px * s, hi + 0.6, a.z + pz * s, ux, 0, uz, len)) return false;
    if (needFloor && Math.abs(b.y - a.y) < 0.7) {
      const g = w.groundBelow((a.x + b.x) / 2, hi + 0.3, (a.z + b.z) / 2);
      if (g === null || g < Math.min(a.y, b.y) - 0.7) return false;
    }
    return true;
  }

  // Running jumps across gaps (2-3 cells, no walkable floor in between).
  addGapEdges(n) {
    if (!n.jumps) n.jumps = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      for (let r = 2; r <= 3; r++) {
        const list = this.grid.get(this.key(n.ix + dx * r, n.iz + dz * r));
        if (!list) continue;
        for (const m of list) {
          const dy = m.y - n.y;
          if (dy > 1.0 || dy < -3) continue;
          if (Math.hypot(m.x - n.x, m.z - n.z) > 3.9) continue;
          let gap = true;
          for (let i = 1; i < r && gap; i++) {
            const mid = this.grid.get(this.key(n.ix + dx * i, n.iz + dz * i));
            if (mid && mid.some((q) => q.y > Math.min(n.y, m.y) - 1.2)) gap = false;
          }
          if (!gap || n.edges.includes(m.id)) continue;
          if (!this.clear(n, m, false)) continue;
          n.edges.push(m.id);
          n.jumps.add(m.id);
        }
      }
    }
  }

  // Jump pads launch ~6 m up: link them to ledges overhead.
  addPadEdges(n) {
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const list = this.grid.get(this.key(n.ix + dx, n.iz + dz));
      if (!list) continue;
      for (const m of list) {
        const dy = m.y - n.y;
        if (dy < 1.5 || dy > 6.2 || n.edges.includes(m.id)) continue;
        if (Math.hypot(m.x - n.x, m.z - n.z) > 5.5) continue;
        if (this.world.raycast(n.x, n.y + 0.5, n.z, 0, 1, 0, dy + 1)) continue;
        n.edges.push(m.id);
      }
    }
  }

  isJump(a, b) { return !!(a && b && a.jumps && a.jumps.has(b.id)); }

  nearest(x, y, z) {
    const ix = Math.floor((x - this.minX) / CELL), iz = Math.floor((z - this.minZ) / CELL);
    let best = null, bd = Infinity;
    for (let r = 0; r <= 3 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const list = this.grid.get(this.key(ix + dx, iz + dz));
        if (!list) continue;
        for (const n of list) {
          const vy = y - n.y;
          const d = Math.hypot(n.x - x, n.z - z) + (vy < -0.8 ? 10 + -vy * 3 : vy * 0.5);
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    return best;
  }

  findPath(from, to) {
    if (!from || !to) return null;
    if (from === to) return [to];
    const N = this.nodes;
    const g = new Map(), came = new Map();
    const open = new Heap();
    g.set(from.id, 0);
    open.push(from.id, 0);
    const h = (n) => Math.hypot(n.x - to.x, n.y - to.y, n.z - to.z);
    let iter = 0;
    while (open.size && iter++ < 3000) {
      const cid = open.pop();
      if (cid === to.id) {
        const path = [];
        let c = cid;
        while (c !== undefined) { path.push(N[c]); c = came.get(c); }
        return path.reverse();
      }
      const c = N[cid], gc = g.get(cid);
      for (const eid of c.edges) {
        const e = N[eid];
        const cost = gc + Math.hypot(e.x - c.x, (e.y - c.y) * 1.5, e.z - c.z);
        if (cost < (g.get(eid) ?? Infinity)) {
          g.set(eid, cost); came.set(eid, cid);
          open.push(eid, cost + h(e));
        }
      }
    }
    return null;
  }

  randomNode(rng = Math.random) {
    const main = this.nodes.filter((n) => n.comp === this.mainComp);
    return main[Math.floor(rng() * main.length)];
  }
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top[1];
  }
}
