import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Architecture kit. Every piece emits world-space visual geometry (merged per
// material in scene.js) plus axis-aligned collision solids for physics/nav.
// Visual shapes may be round or arched; collision stays boxes and ramps.
//
// Geometry entries: { geo, mat, uv: 'box' | 'cyl', cx, cz }

const tmpM = new THREE.Matrix4();

export function createKit({ solids, geos, decor, rng }) {
  const solid = (minX, minY, minZ, maxX, maxY, maxZ, extra) => {
    solids.push({ minX, minY, minZ, maxX, maxY, maxZ, mat: 'none', type: 'solid', ...extra });
  };
  const add = (geo, mat, uv = 'box', cx = 0, cz = 0) => {
    if (geo.index) { const g = geo.toNonIndexed(); geo.dispose(); geo = g; }
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    geos.push({ geo, mat, uv, cx, cz });
  };

  // ---------- primitives ----------
  function block(x0, y0, z0, x1, y1, z1, mat, { bevel = 0.05, collide = true } = {}) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    if (w <= 0 || h <= 0 || d <= 0) return;
    const r = Math.min(bevel, Math.min(w, h, d) * 0.45);
    const geo = r > 0.004 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(geo, mat);
    if (collide) solid(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1));
  }

  function cylinder(x, y0, z, r, h, mat, { seg = 24, collide = false, open = false, r2 = r, uv = 'cyl' } = {}) {
    const geo = new THREE.CylinderGeometry(r2, r, h, seg, 1, open);
    geo.translate(x, y0 + h / 2, z);
    add(geo, mat, uv, x, z);
    if (collide) roundCollider(x, z, r, y0, y0 + h);
  }

  // Octagon-ish union of boxes approximating a circle footprint.
  function roundCollider(x, z, r, y0, y1) {
    solid(x - r, y0, z - r * 0.42, x + r, y1, z + r * 0.42);
    solid(x - r * 0.42, y0, z - r, x + r * 0.42, y1, z + r);
    solid(x - r * 0.8, y0, z - r * 0.8, x + r * 0.8, y1, z + r * 0.8);
  }

  // Shape in the (u, v) wall plane, extruded by thickness t, placed along an axis.
  // ax 'x': u → +x from x0, wall centred on z0.  ax 'z': u → +z from z0, centred on x0.
  function placeExtrude(shape, ax, x0, z0, y0, t, mat, depthOffset = 0) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 10 });
    if (ax === 'x') geo.translate(x0, y0, z0 - t / 2 + depthOffset);
    else { geo.rotateY(-Math.PI / 2); geo.translate(x0 + t / 2 - depthOffset, y0, z0); }
    add(geo, mat);
    return geo;
  }

  function openingPath(o, grow = 0) {
    const p = new THREE.Path();
    const x0 = o.at - o.w / 2 - grow, x1 = o.at + o.w / 2 + grow, y0 = o.y - (o.y > 0 ? grow : 0), top = o.y + o.h + grow;
    if (o.arch) {
      const r = o.w / 2 + grow, cy = top - r;
      p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, cy);
      p.absarc(o.at, cy, r, 0, Math.PI, false);
      p.lineTo(x0, y0);
    } else {
      p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, top); p.lineTo(x0, top); p.lineTo(x0, y0);
    }
    return p;
  }

  // Wall with through-openings (doors, windows, arches) and optional trims.
  // openings: { at, w, y, h, arch, frame: mat, sill, bars, shutter }
  function wall(ax, x0, z0, len, y0, h, t, mat, openings = [], { cap = null, plinth = null, collide = true, frame = null } = {}) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len, h); shape.lineTo(0, h); shape.lineTo(0, 0);
    const doors = [];
    for (const o of openings) {
      if (o.y <= 0.001) doors.push(o);
      else shape.holes.push(openingPath(o));
    }
    // doors cut the bottom edge, so rebuild the outline instead of a hole
    if (doors.length) {
      doors.sort((a, b) => a.at - b.at);
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      for (const o of doors) {
        const a = o.at - o.w / 2, b = o.at + o.w / 2, top = o.h;
        s.lineTo(a, 0);
        if (o.arch) { const r = o.w / 2; s.lineTo(a, top - r); s.absarc(o.at, top - r, r, Math.PI, 0, true); s.lineTo(b, 0); }
        else { s.lineTo(a, top); s.lineTo(b, top); s.lineTo(b, 0); }
      }
      s.lineTo(len, 0); s.lineTo(len, h); s.lineTo(0, h); s.lineTo(0, 0);
      s.holes = shape.holes;
      placeExtrude(s, ax, x0, z0, y0, t, mat);
    } else placeExtrude(shape, ax, x0, z0, y0, t, mat);

    // trims around openings
    for (const o of openings) {
      const fm = o.frame ?? frame;
      if (fm) {
        const fw = o.fw ?? 0.14;
        const ring = new THREE.Shape(openingPath(o, fw).getPoints());
        ring.holes.push(openingPath(o, 0));
        if (o.y <= 0.001) {
          // door frame: U-shape open at the bottom
          const s = new THREE.Shape();
          const a = o.at - o.w / 2, b = o.at + o.w / 2, top = o.h;
          s.moveTo(a - fw, 0); s.lineTo(a, 0);
          if (o.arch) { const r = o.w / 2; s.lineTo(a, top - r); s.absarc(o.at, top - r, r, Math.PI, 0, true); s.lineTo(b, 0); s.lineTo(b + fw, 0); s.lineTo(b + fw, top - r); s.absarc(o.at, top - r, r + fw, 0, Math.PI, false); }
          else { s.lineTo(a, top); s.lineTo(b, top); s.lineTo(b, 0); s.lineTo(b + fw, 0); s.lineTo(b + fw, top + fw); s.lineTo(a - fw, top + fw); }
          s.lineTo(a - fw, 0);
          placeExtrude(s, ax, x0, z0, y0, t + 0.12, fm, -0.06);
        } else placeExtrude(ring, ax, x0, z0, y0, t + 0.12, fm, -0.06);
      }
      if (o.sill) {
        const a = o.at - o.w / 2 - 0.12, b = o.at + o.w / 2 + 0.12, sy = y0 + o.y;
        if (ax === 'x') block(x0 + a, sy - 0.12, z0 - t / 2 - 0.12, x0 + b, sy, z0 + t / 2 + 0.12, o.sill, { collide: false, bevel: 0.03 });
        else block(x0 - t / 2 - 0.12, sy - 0.12, z0 + a, x0 + t / 2 + 0.12, sy, z0 + b, o.sill, { collide: false, bevel: 0.03 });
      }
      if (o.bars) {
        const n = Math.max(2, Math.round(o.w / 0.16));
        const top = o.arch ? o.h - o.w / 2 : o.h;
        for (let i = 1; i < n; i++) {
          const u = o.at - o.w / 2 + (i * o.w) / n;
          const geo = new THREE.CylinderGeometry(0.018, 0.018, top + 0.1, 6);
          geo.translate(0, y0 + o.y + top / 2, 0);
          if (ax === 'x') geo.translate(x0 + u, 0, z0); else geo.translate(x0, 0, z0 + u);
          add(geo, 'iron');
        }
        for (const hy of [0.12, top - 0.12]) {
          if (ax === 'x') block(x0 + o.at - o.w / 2, y0 + o.y + hy - 0.03, z0 - 0.03, x0 + o.at + o.w / 2, y0 + o.y + hy + 0.03, z0 + 0.03, 'iron', { collide: false, bevel: 0 });
          else block(x0 - 0.03, y0 + o.y + hy - 0.03, z0 + o.at - o.w / 2, x0 + 0.03, y0 + o.y + hy + 0.03, z0 + o.at + o.w / 2, 'iron', { collide: false, bevel: 0 });
        }
        if (collide && o.y < 1.5) {
          if (ax === 'x') solid(x0 + o.at - o.w / 2, y0 + o.y, z0 - 0.05, x0 + o.at + o.w / 2, y0 + o.y + o.h, z0 + 0.05);
          else solid(x0 - 0.05, y0 + o.y, z0 + o.at - o.w / 2, x0 + 0.05, y0 + o.y + o.h, z0 + o.at + o.w / 2);
        }
      }
    }
    if (cap) {
      if (ax === 'x') block(x0 - 0.1, y0 + h, z0 - t / 2 - 0.1, x0 + len + 0.1, y0 + h + 0.22, z0 + t / 2 + 0.1, cap, { bevel: 0.04, collide });
      else block(x0 - t / 2 - 0.1, y0 + h, z0 - 0.1, x0 + t / 2 + 0.1, y0 + h + 0.22, z0 + len + 0.1, cap, { bevel: 0.04, collide });
    }
    if (plinth) {
      const ph = 0.55;
      const segs = [[0, len]];
      for (const o of doors) {
        const a = o.at - o.w / 2 - 0.15, b = o.at + o.w / 2 + 0.15;
        for (let i = segs.length - 1; i >= 0; i--) {
          const [s0, s1] = segs[i];
          if (b <= s0 || a >= s1) continue;
          segs.splice(i, 1, ...[[s0, a], [b, s1]].filter(([p, q]) => q - p > 0.05));
        }
      }
      for (const [s0, s1] of segs) {
        if (ax === 'x') block(x0 + s0, y0, z0 - t / 2 - 0.07, x0 + s1, y0 + ph, z0 + t / 2 + 0.07, plinth, { collide: false, bevel: 0.04 });
        else block(x0 - t / 2 - 0.07, y0, z0 + s0, x0 + t / 2 + 0.07, y0 + ph, z0 + s1, plinth, { collide: false, bevel: 0.04 });
      }
    }
    if (!collide) return;
    // collision: piers between openings, sills below, lintels above
    const sorted = [...openings].sort((a, b) => a.at - b.at);
    let u = 0;
    const box = (u0, u1, v0, v1) => {
      if (u1 - u0 < 0.01 || v1 - v0 < 0.01) return;
      if (ax === 'x') solid(x0 + u0, y0 + v0, z0 - t / 2, x0 + u1, y0 + v1, z0 + t / 2);
      else solid(x0 - t / 2, y0 + v0, z0 + u0, x0 + t / 2, y0 + v1, z0 + u1);
    };
    for (const o of sorted) {
      const a = o.at - o.w / 2, b = o.at + o.w / 2;
      box(u, a, 0, h);
      box(a, b, 0, o.y);
      box(a, b, o.y + o.h, h);
      u = b;
    }
    box(u, len, 0, h);
  }

  // Evenly spaced openings helper.
  function row(len, n, o) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ ...o, at: (len * (i + 0.5)) / n });
    return out;
  }

  // Closed building block with recessed windows (facade with holes over a dark core).
  // win: { w, h, rows: [y...], n (per 10 m) }, faces: which sides get windows
  function building(x0, z0, x1, z1, y0, h, mat, { win = null, trim = 'concrete', roof = 'floor', parapet = 0.9, cornice = true, faces = 'nsew', doors = {} } = {}) {
    const t = 0.35;
    block(x0 + t * 0.5, y0, z0 + t * 0.5, x1 - t * 0.5, y0 + h - 0.32, z1 - t * 0.5, 'dark', { bevel: 0, collide: false });
    solid(x0, y0, z0, x1, y0 + h, z1);
    const lx = x1 - x0, lz = z1 - z0;
    const mk = (len, side) => {
      const out = [];
      if (win && faces.includes(side)) {
        const n = Math.max(1, Math.round((len / 10) * (win.n ?? 3)));
        for (const y of win.rows) out.push(...row(len, n, { w: win.w, h: win.h, y, arch: win.arch, sill: win.sill ?? trim, frame: win.frame ?? null, bars: win.bars }));
      }
      if (doors[side]) out.push({ y: 0, w: 1.4, h: 2.4, frame: trim, ...doors[side] });
      return out;
    };
    wall('x', x0, z0 + t / 2, lx, y0, h, t, mat, mk(lx, 'n'), { collide: false, plinth: trim });
    wall('x', x0, z1 - t / 2, lx, y0, h, t, mat, mk(lx, 's'), { collide: false, plinth: trim });
    wall('z', x0 + t / 2, z0 + t, lz - 2 * t, y0, h, t, mat, mk(lz - 2 * t, 'w'), { collide: false, plinth: trim });
    wall('z', x1 - t / 2, z0 + t, lz - 2 * t, y0, h, t, mat, mk(lz - 2 * t, 'e'), { collide: false, plinth: trim });
    // roof deck + parapet + cornice
    block(x0 + t, y0 + h - 0.3, z0 + t, x1 - t, y0 + h - 0.05, z1 - t, roof, { bevel: 0, collide: false });
    if (cornice) {
      for (const [a, b, c, d] of [[x0 - 0.15, z0 - 0.15, x1 + 0.15, z0 + 0.2], [x0 - 0.15, z1 - 0.2, x1 + 0.15, z1 + 0.15], [x0 - 0.15, z0, x0 + 0.2, z1], [x1 - 0.2, z0, x1 + 0.15, z1]]) {
        block(a, y0 + h - 0.05, b, c, y0 + h + 0.2, d, trim, { collide: false, bevel: 0.05 });
      }
    }
    if (parapet > 0) {
      const py = y0 + h + 0.2, pt = 0.3;
      block(x0, py, z0, x1, py + parapet, z0 + pt, mat, { collide: false });
      block(x0, py, z1 - pt, x1, py + parapet, z1, mat, { collide: false });
      block(x0, py, z0 + pt, x0 + pt, py + parapet, z1 - pt, mat, { collide: false });
      block(x1 - pt, py, z0 + pt, x1, py + parapet, z1 - pt, mat, { collide: false });
      for (const [a, b, c, d] of [[x0 - 0.06, z0 - 0.06, x1 + 0.06, z0 + pt + 0.06], [x0 - 0.06, z1 - pt - 0.06, x1 + 0.06, z1 + 0.06], [x0 - 0.06, z0, x0 + pt + 0.06, z1], [x1 - pt - 0.06, z0, x1 + 0.06, z1]]) {
        block(a, py + parapet, b, c, py + parapet + 0.12, d, trim, { collide: false, bevel: 0.03 });
      }
      solid(x0, py, z0, x1, py + parapet + 0.12, z0 + pt);
      solid(x0, py, z1 - pt, x1, py + parapet + 0.12, z1);
      solid(x0, py, z0, x0 + pt, py + parapet + 0.12, z1);
      solid(x1 - pt, py, z0, x1, py + parapet + 0.12, z1);
    }
  }

  // Round tower. Windows/doors are recessed dark slots with stone surrounds.
  function tower(x, z, r, y0, h, mat, { windows = [], doorAngle = null, bands = [], top = 'crenel', trim = 'concrete', collide = true } = {}) {
    cylinder(x, y0, z, r, h, mat, { seg: 32, open: true });
    // top cap
    const cap = new THREE.CircleGeometry(r, 32); cap.rotateX(-Math.PI / 2); cap.translate(x, y0 + h, z);
    add(cap, 'floor');
    for (const by of bands) cylinder(x, y0 + by, z, r + 0.07, 0.24, trim, { seg: 32 });
    cylinder(x, y0, z, r + 0.1, 0.6, trim, { seg: 32 });
    const slot = (ang, wy, ww, wh, door) => {
      const cx = x + Math.cos(ang) * r, cz = z + Math.sin(ang) * r;
      const g = new THREE.Group();
      g.position.set(cx, y0 + wy, cz); g.rotation.y = -ang + Math.PI / 2;
      const place = (geo, m) => { g.updateMatrixWorld(true); geo.applyMatrix4(g.matrixWorld); add(geo, m); };
      const box = (w, hh, d, px, py, pz, m) => { const geo = new RoundedBoxGeometry(w, hh, d, 1, Math.min(0.04, Math.min(w, hh, d) * 0.4)); geo.translate(px, py, pz); place(geo, m); };
      box(ww, wh, 0.12, 0, wh / 2, 0.0, door ? 'woodDark' : 'dark');
      box(0.16, wh + 0.16, 0.3, -ww / 2 - 0.08, wh / 2, 0.05, trim);
      box(0.16, wh + 0.16, 0.3, ww / 2 + 0.08, wh / 2, 0.05, trim);
      box(ww + 0.48, 0.2, 0.34, 0, wh + 0.1, 0.06, trim);
      if (!door) box(ww + 0.36, 0.12, 0.38, 0, -0.06, 0.08, trim);
    };
    for (const w of windows) slot(w.angle, w.y, w.w ?? 0.6, w.h ?? 1.1, false);
    if (doorAngle !== null) slot(doorAngle, 0, 1.2, 2.3, true);
    if (top === 'crenel') {
      const n = Math.max(8, Math.round((Math.PI * 2 * r) / 1.3));
      cylinder(x, y0 + h, z, r + 0.15, 0.25, trim, { seg: 32 });
      for (let i = 0; i < n; i += 1) {
        if (i % 2) continue;
        const a = (i / n) * Math.PI * 2;
        const g = new RoundedBoxGeometry(0.32, 0.9, (Math.PI * 2 * r) / n * 1.05, 1, 0.04);
        g.rotateY(-a); g.translate(x + Math.cos(a) * (r - 0.06), y0 + h + 0.25 + 0.45, z + Math.sin(a) * (r - 0.06));
        add(g, mat);
      }
    } else if (top === 'cone') {
      const g = new THREE.ConeGeometry(r + 0.5, r * 1.6, 32, 1, true); g.translate(x, y0 + h + r * 0.8, z); add(g, 'roof', 'cyl', x, z);
    }
    if (collide) roundCollider(x, z, r, y0, y0 + h);
  }

  // Straight stair run. dir: '+x' | '-x' | '+z' | '-z' (direction of ascent).
  // Visual steps, smooth ramp collision (Source-style), optional side cheeks.
  function stairs(x0, z0, x1, z1, y0, y1, dir, mat, { cheeks = null, collide = true } = {}) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    const axis = dir[1], sgn = dir[0] === '+' ? 1 : -1;
    const run = axis === 'x' ? maxX - minX : maxZ - minZ;
    const rise = y1 - y0;
    const n = Math.max(2, Math.round(rise / 0.22));
    for (let i = 0; i < n; i++) {
      const sy = y0 + (rise * (i + 1)) / n;
      const a = (run * i) / n, b = run;
      if (axis === 'x') {
        const s0 = sgn > 0 ? minX + a : maxX - b, s1 = sgn > 0 ? minX + b : maxX - a;
        block(s0, i === 0 ? y0 : sy - rise / n, minZ, s1, sy, maxZ, mat, { collide: false, bevel: 0.025 });
      } else {
        const s0 = sgn > 0 ? minZ + a : maxZ - b, s1 = sgn > 0 ? minZ + b : maxZ - a;
        block(minX, i === 0 ? y0 : sy - rise / n, s0, maxX, sy, s1, mat, { collide: false, bevel: 0.025 });
      }
    }
    if (collide) solids.push({ minX, minY: y0, minZ, maxX, maxY: y1, maxZ, mat: 'none', type: 'solid', ramp: { axis, dir: sgn } });
    if (cheeks) {
      const s = new THREE.Shape();
      s.moveTo(0, -0.05); s.lineTo(run, -0.05); s.lineTo(run, rise + 0.35); s.lineTo(run - 0.3, rise + 0.35); s.lineTo(0, 0.35); s.lineTo(0, -0.05);
      const flip = sgn < 0;
      const sides = axis === 'x' ? [minZ - 0.12, maxZ + 0.12] : [minX - 0.12, maxX + 0.12];
      for (const c of sides) {
        const geo = new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: false });
        geo.translate(0, 0, -0.12);
        if (flip) { geo.scale(-1, 1, 1); geo.translate(run, 0, 0); }
        if (axis === 'x') geo.translate(minX, y0, c);
        else { geo.rotateY(-Math.PI / 2); geo.translate(c, y0, minZ); }
        // mirrored geometry flips winding; fix by recomputing via index swap
        if (flip) flipWinding(geo);
        add(geo, cheeks);
      }
    }
  }

  function column(x, z, y0, h, r, mat, { capital = true, trim = mat } = {}) {
    const b = r * 1.35;
    block(x - b, y0, z - b, x + b, y0 + 0.4, z + b, trim, { collide: false, bevel: 0.05 });
    cylinder(x, y0 + 0.4, z, r, h - (capital ? 0.8 : 0.4), mat, { seg: 20, r2: r * 0.92 });
    if (capital) {
      cylinder(x, y0 + h - 0.4, z, r * 1.02, 0.12, trim, { seg: 20, r2: r * 1.2 });
      block(x - b, y0 + h - 0.28, z - b, x + b, y0 + h, z + b, trim, { collide: false, bevel: 0.05 });
    }
    solid(x - r, y0, z - r, x + r, y0 + h, z + r);
  }

  // Steel I-beam between two axis-aligned points.
  function ibeam(ax, x, y, z, len, size = 0.3, mat = 'iron') {
    const f = size, w = size * 0.6, tw = 0.03, tf = 0.04;
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -f / 2); s.lineTo(w / 2, -f / 2); s.lineTo(w / 2, -f / 2 + tf); s.lineTo(tw / 2, -f / 2 + tf); s.lineTo(tw / 2, f / 2 - tf);
    s.lineTo(w / 2, f / 2 - tf); s.lineTo(w / 2, f / 2); s.lineTo(-w / 2, f / 2); s.lineTo(-w / 2, f / 2 - tf); s.lineTo(-tw / 2, f / 2 - tf);
    s.lineTo(-tw / 2, -f / 2 + tf); s.lineTo(-w / 2, -f / 2 + tf); s.lineTo(-w / 2, -f / 2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    if (ax === 'x') geo.rotateY(Math.PI / 2);
    else if (ax === 'y') { geo.rotateX(-Math.PI / 2); }
    geo.translate(x, y, z);
    add(geo, mat);
  }

  // Railing with posts, top and mid rails; thin collision so players can't walk off.
  function rail(x0, z0, x1, z1, y, { collide = true } = {}) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const [hy, r] of [[1.0, 0.03], [0.55, 0.018]]) {
      const geo = new THREE.CylinderGeometry(r, r, len, 8);
      if (alongX) geo.rotateZ(Math.PI / 2); else geo.rotateX(Math.PI / 2);
      geo.translate(cx, y + hy, cz);
      add(geo, 'iron');
    }
    const posts = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= posts; i++) {
      const t = -len / 2 + (i * len) / posts;
      const px = alongX ? cx + t : cx, pz = alongX ? cz : cz + t;
      block(px - 0.03, y, pz - 0.03, px + 0.03, y + 1.02, pz + 0.03, 'iron', { collide: false, bevel: 0.01 });
    }
    if (collide) {
      if (alongX) solid(cx - len / 2, y, cz - 0.05, cx + len / 2, y + 1.05, cz + 0.05);
      else solid(cx - 0.05, y, cz - len / 2, cx + 0.05, y + 1.05, cz + len / 2);
    }
  }

  // Metal grate walkway on I-beams.
  function walkway(x0, z0, x1, z1, y, { rails = '', posts = true } = {}) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    block(minX, y - 0.08, minZ, maxX, y, maxZ, 'plate', { bevel: 0.01 });
    const alongX = maxX - minX > maxZ - minZ;
    if (alongX) { ibeam('x', minX, y - 0.23, minZ + 0.1, maxX - minX); ibeam('x', minX, y - 0.23, maxZ - 0.1, maxX - minX); }
    else { ibeam('z', minX + 0.1, y - 0.23, minZ, maxZ - minZ); ibeam('z', maxX - 0.1, y - 0.23, minZ, maxZ - minZ); }
    if (rails.includes('n')) rail(minX, minZ + 0.05, maxX, minZ + 0.05, y);
    if (rails.includes('s')) rail(minX, maxZ - 0.05, maxX, maxZ - 0.05, y);
    if (rails.includes('w')) rail(minX + 0.05, minZ, minX + 0.05, maxZ, y);
    if (rails.includes('e')) rail(maxX - 0.05, minZ, maxX - 0.05, maxZ, y);
    return { alongX, minX, maxX, minZ, maxZ };
  }

  // Corrugated-iron shed with a mono-pitch roof and a doorway.
  function shed(x0, z0, x1, z1, y0, h, { door = 's', doorAt = 0.5, mat = 'corr' } = {}) {
    const t = 0.08, lx = x1 - x0, lz = z1 - z0;
    const dw = 1.3, dh = 2.3;
    const op = (side, len) => (side === door ? [{ at: len * doorAt, w: dw, y: 0, h: dh }] : []);
    wall('x', x0, z0 + t / 2, lx, y0, h + 0.5, t, mat, op('n', lx));
    wall('x', x0, z1 - t / 2, lx, y0, h, t, mat, op('s', lx));
    wall('z', x0 + t / 2, z0 + t, lz - 2 * t, y0, h, t, mat, op('w', lz - 2 * t));
    wall('z', x1 - t / 2, z0 + t, lz - 2 * t, y0, h, t, mat, op('e', lz - 2 * t));
    // sloped roof as a thin tilted slab with overhang
    const roofLen = lz + 0.8, slope = Math.atan2(0.5, lz);
    const geo = new THREE.BoxGeometry(lx + 0.6, 0.05, Math.hypot(roofLen, 0.5));
    geo.rotateX(-slope); geo.translate((x0 + x1) / 2, y0 + h + 0.3, (z0 + z1) / 2);
    add(geo, 'corrRoof');
    for (const zz of [z0 + 0.3, (z0 + z1) / 2, z1 - 0.3]) ibeam('x', x0, y0 + h + 0.12 + (z1 - zz) / lz * 0.5, zz, lx, 0.14, 'iron');
    solid(x0, y0 + h, z0, x1, y0 + h + 0.55, z1);
  }

  function crate(x, y, z, s = 1, rot = 0) {
    const h = s / 2;
    block(x - h + 0.04, y + 0.04, z - h + 0.04, x + h - 0.04, y + s - 0.04, z + h - 0.04, 'wood', { collide: false, bevel: 0.02 });
    const e = 0.09;
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      block(x + a * h - (a > 0 ? e : 0), y, z + b * h - (b > 0 ? e : 0), x + a * h + (a < 0 ? e : 0), y + s, z + b * h + (b < 0 ? e : 0), 'woodDark', { collide: false, bevel: 0.015 });
    }
    for (const yy of [y, y + s - e]) {
      block(x - h, yy, z - h, x + h, yy + e, z - h + e, 'woodDark', { collide: false, bevel: 0.015 });
      block(x - h, yy, z + h - e, x + h, yy + e, z + h, 'woodDark', { collide: false, bevel: 0.015 });
      block(x - h, yy, z - h, x - h + e, yy + e, z + h, 'woodDark', { collide: false, bevel: 0.015 });
      block(x + h - e, yy, z - h, x + h, yy + e, z + h, 'woodDark', { collide: false, bevel: 0.015 });
    }
    solid(x - h, y, z - h, x + h, y + s, z + h);
  }

  function barrel(x, z, y = 0) {
    solid(x - 0.31, y, z - 0.31, x + 0.31, y + 0.9, z + 0.31);
    decor.push({ t: 'barrel', x, y, z, rot: rng() * 6 });
  }

  // Pipe along a polyline of axis-aligned points with elbow joints and flanges.
  function pipe(points, r = 0.12, mat = 'rust') {
    for (let i = 0; i < points.length - 1; i++) {
      const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]);
      const len = a.distanceTo(b);
      const geo = new THREE.CylinderGeometry(r, r, len, 12, 1, true);
      const dirv = b.clone().sub(a).normalize();
      tmpM.makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv));
      geo.applyMatrix4(tmpM);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      geo.translate(mid.x, mid.y, mid.z);
      add(geo, mat);
      const nf = Math.floor(len / 3);
      for (let k = 1; k <= nf; k++) {
        const p = a.clone().lerp(b, k / (nf + 1));
        const fg = new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.07, 12);
        fg.applyMatrix4(tmpM); fg.translate(p.x, p.y, p.z);
        add(fg, mat);
      }
    }
    for (let i = 1; i < points.length - 1; i++) {
      const g = new THREE.SphereGeometry(r * 1.08, 12, 8); g.translate(...points[i]); add(g, mat);
    }
  }

  // Sagging cable between two points.
  function cable(p0, p1, sag = 0.8) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
    const m = a.clone().add(b).multiplyScalar(0.5); m.y -= sag * 2;
    const curve = new THREE.QuadraticBezierCurve3(a, m, b);
    add(new THREE.TubeGeometry(curve, 24, 0.012, 4, false), 'cable');
  }

  function pole(x, z, h = 8) {
    cylinder(x, 0, z, 0.13, h, 'woodDark', { seg: 10, r2: 0.1, uv: 'box' });
    block(x - 0.9, h - 0.7, z - 0.06, x + 0.9, h - 0.56, z + 0.06, 'woodDark', { collide: false, bevel: 0.02 });
    for (const dx of [-0.75, -0.3, 0.3, 0.75]) cylinder(x + dx, h - 0.56, z, 0.035, 0.12, 'iron', { seg: 6, uv: 'box' });
    solid(x - 0.15, 0, z - 0.15, x + 0.15, h, z + 0.15);
    return [x, h - 0.45, z];
  }

  function lamp(x, z, y = 0, h = 4.6) {
    solid(x - 0.12, y, z - 0.12, x + 0.12, y + h, z + 0.12);
    decor.push({ t: 'lamp', x, z, y, h });
  }

  // Wall-mounted lamp; light pooling is faked by the bloom on the bulb.
  function bulb(x, y, z) { decor.push({ t: 'bulb', x, y, z }); }

  // Bald stone figure on a plinth.
  function statue(x, z, y = 0, rot = 0) {
    block(x - 0.6, y, z - 0.6, x + 0.6, y + 1.1, z + 0.6, 'stone', { bevel: 0.05 });
    block(x - 0.7, y + 1.1, z - 0.7, x + 0.7, y + 1.25, z + 0.7, 'concrete', { collide: false, bevel: 0.04 });
    decor.push({ t: 'statue', x, y: y + 1.25, z, rot });
    solid(x - 0.3, y + 1.25, z - 0.3, x + 0.3, y + 3.1, z + 0.3);
  }

  function tree(x, z, y = 0, s = 1) { decor.push({ t: 'tree', x, y, z, s, seed: rng() }); solid(x - 0.2, y, z - 0.2, x + 0.2, y + 3 * s, z + 0.2); }

  return { block, cylinder, roundCollider, wall, row, building, tower, stairs, column, ibeam, rail, walkway, shed, crate, barrel, pipe, cable, pole, lamp, bulb, statue, tree, solid, add };
}

function flipWinding(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const swap = (attr, i, j) => {
    for (let k = 0; k < attr.itemSize; k++) {
      const a = attr.array[i * attr.itemSize + k];
      attr.array[i * attr.itemSize + k] = attr.array[j * attr.itemSize + k];
      attr.array[j * attr.itemSize + k] = a;
    }
  };
  if (geo.index) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) { const a = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = a; }
  } else {
    for (let i = 0; i < pos.count; i += 3) { swap(pos, i + 1, i + 2); swap(nor, i + 1, i + 2); if (uv) swap(uv, i + 1, i + 2); }
  }
  for (let i = 0; i < nor.count; i++) nor.setX(i, nor.getX(i));
  geo.computeVertexNormals();
}
