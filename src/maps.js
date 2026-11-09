import { mulberry32 } from './physics.js';
import { createKit } from './kit.js';

// Maps are authored with the architecture kit (src/kit.js): walls with arched
// and framed openings, round towers, stair runs, colonnades, steel walkways,
// corrugated sheds and props. Collision is boxes and ramps; visuals are not.
//   W(x, y, z) weapon spawner, S(x, y, z) player spawn (snapped to the floor below)
export const LIGHTING = {
  overcast: { sky: 'overcast', envIntensity: 0.95, bgIntensity: 0.8, fog: 0x86907f, fogDensity: 0.012, sun: 3.3, sunColor: 0xf2eedc, sunDir: [0.6, 0.85, 0.4], hemi: 0.3, grade: [0.92, 1.0, 0.92] },
};

export const MAPS = [
  {
    id: 'citadel', name: { ru: 'Цитадель', en: 'Citadel' }, light: 'overcast', killY: -20,
    weapons: ['kochegar', 'baraban', 'zhuravl', 'klinok', 'tesak', 'limonka', 'pompa', 'shilo'],
    build(k, { W, S }) {
      const { block, wall, row, tower, stairs, column, walkway, rail, crate, barrel, statue, bulb, solid } = k;
      // courtyard floor ending in a cliff to the south
      block(-24, -1, -30, 24, 0, 18, 'gtiles', { bevel: 0 });
      block(-24, -16, 17, 24, -1, 18.6, 'stone', { bevel: 0.1, collide: false });
      // south parapet with a wide gap over the drop
      for (const [a, b] of [[-24, -7], [7, 24]]) {
        block(a, 0, 17.2, b, 0.85, 17.8, 'blocks', { bevel: 0.06 });
        block(a - 0.05, 0.85, 17.1, b + 0.05, 1.0, 17.9, 'concrete', { bevel: 0.03 });
      }
      for (const x of [-7, 7]) block(x - 0.45, 0, 17.05, x + 0.45, 1.6, 17.95, 'blocks', { bevel: 0.06 });

      // --- north rampart with an arched gate into a statue alcove ---
      const RH = 6;
      block(-24, 0, -22, -2.4, RH, -19.6, 'dark', { bevel: 0, collide: false }); solid(-24, 0, -22, -2.4, RH, -19);
      block(2.4, 0, -22, 24, RH, -19.6, 'dark', { bevel: 0, collide: false }); solid(2.4, 0, -22, 24, RH, -19);
      solid(-2.4, 4.6, -22, 2.4, RH, -19);
      wall('x', -24, -19.3, 48, 0, RH, 0.6, 'stone', [
        { at: 24, w: 4, y: 0, h: 4.6, arch: true, frame: 'blocks', fw: 0.3 },
        ...[6, 14, 34, 42].map((at) => ({ at, w: 0.7, y: 2.4, h: 1.5, arch: true, frame: 'blocks', bars: true })),
      ], { collide: false, plinth: 'blocks' });
      block(-24.2, RH, -22.2, 24.2, RH + 0.25, -18.8, 'blocks', { bevel: 0.06, collide: false });
      // merlons on the outer edge
      for (let x = -23; x < 24; x += 2) block(x - 0.5, RH + 0.25, -22.2, x + 0.5, RH + 1.35, -21.4, 'stone', { bevel: 0.05 });
      // gate passage walls + alcove
      for (const s of [-1, 1]) wall('z', s * 2.55, -28, 9, 0, RH, 0.6, 'stone', [], { collide: true });
      wall('x', -3, -28.3, 6, 0, RH, 0.6, 'stone', [{ at: 3, w: 1.2, y: 2.8, h: 2.2, arch: true, frame: 'blocks', bars: true }]);
      block(-3.2, RH, -28.6, 3.2, RH + 0.4, -18.8, 'blocks', { bevel: 0.06 });
      statue(0, -26.2, 0, 0);
      bulb(-2.2, 3.8, -24); bulb(2.2, 3.8, -24);
      // portcullis half raised in the gate
      for (let i = 0; i < 9; i++) block(-1.9 + i * 0.475 - 0.025, 3.1, -19.1, -1.9 + i * 0.475 + 0.025, 4.6, -19.0, 'iron', { bevel: 0, collide: false });
      block(-2, 3.05, -19.12, 2, 3.15, -18.98, 'iron', { bevel: 0, collide: false });
      // stairs onto the rampart from both sides
      stairs(-13, -19, -5, -16.8, 0, RH, '-x', 'blocks', { cheeks: 'stone' });
      stairs(5, -19, 13, -16.8, 0, RH, '+x', 'blocks', { cheeks: 'stone' });
      tower(20.5, -21, 3.6, 0, 13, 'stone', { bands: [6, 10], windows: [{ angle: Math.PI * 0.75, y: 7.2 }, { angle: Math.PI * 0.4, y: 7.2 }, { angle: Math.PI * 0.6, y: 10.6, h: 0.9 }], trim: 'blocks' });
      tower(-20.5, -21, 3, 0, 10, 'blocks', { bands: [6], windows: [{ angle: Math.PI * 0.3, y: 7.4 }, { angle: Math.PI * 0.55, y: 7.4 }], top: 'cone', trim: 'stone' });

      // --- west colonnade (walkable gallery roof) ---
      const GX0 = -24, GX1 = -16.5, GZ0 = -19, GZ1 = 8, GH = 4.4;
      block(GX0, 0, GZ0, GX0 + 0.8, 9, GZ1 + 6, 'stone', { bevel: 0.08 });
      wall('z', GX1, GZ0, GZ1 - GZ0, 0, GH, 0.7, 'blocks', row(GZ1 - GZ0, 6, { w: 2.6, y: 0, h: 3.5, arch: true, frame: 'stone', fw: 0.18 }), { plinth: 'stone' });
      block(GX0 + 0.8, GH, GZ0, GX1 + 0.4, GH + 0.35, GZ1, 'floor', { bevel: 0.04 });
      block(GX1 - 0.12, GH + 0.05, GZ0, GX1 + 0.48, GH + 0.3, GZ1, 'blocks', { bevel: 0.04, collide: false });
      for (let z = GZ0 + 1.5; z < GZ1 - 4; z += 3) block(GX1 - 0.25, GH + 0.35, z - 0.45, GX1 + 0.35, GH + 1.1, z + 0.45, 'blocks', { bevel: 0.05 });
      for (let z = GZ0 + 2; z < GZ1; z += 4.5) bulb(GX0 + 1.0, 3.6, z);
      stairs(GX0 + 0.8, GZ1, GX1 + 0.35, GZ1 + 6, 0, GH, '-z', 'blocks', { cheeks: 'stone' });
      stairs(GX0 + 0.8, GZ0 + 0.1, GX0 + 3.6, GZ0 + 3.2, GH + 0.35, RH, '-z', 'blocks');
      tower(-19.5, 16.2, 2.2, 0, 8.5, 'stone', { bands: [4.4], windows: [{ angle: -Math.PI * 0.2, y: 5.2, h: 0.9 }], top: 'cone', trim: 'blocks' });

      // --- east keep with a slide ramp and a bridge from the rampart ---
      k.building(12, -9, 24, 7, 0, RH, 'blocks', { win: { w: 0.8, h: 1.6, rows: [2.6], n: 3, arch: true, frame: 'stone', bars: true }, trim: 'stone', parapet: 0, faces: 'ws' });
      for (let z = -8; z < 7; z += 2) block(12, RH + 0.2, z - 0.5, 12.6, RH + 1.1, z + 0.5, 'stone', { bevel: 0.05 });
      rail(12.3, 6.7, 24, 6.7, RH + 0.2);
      solids_ramp(k, 4, -6.5, 12, -3, 0, RH, 'slab');
      walkway(14.5, -19, 17.5, -9, RH, { rails: 'we' });
      for (const z of [-16, -12]) { block(14.6, 0, z - 0.25, 15.1, RH - 0.25, z + 0.25, 'blocks', { bevel: 0.04 }); block(16.9, 0, z - 0.25, 17.4, RH - 0.25, z + 0.25, 'blocks', { bevel: 0.04 }); }
      crate(13.4, 0, 9.5, 1.1); crate(14.6, 0, 9.4, 0.9); crate(13.6, 1.1, 9.5, 0.8);
      barrel(22.6, 9); barrel(23, 10); barrel(22.1, 10.4);

      // --- centre: raised round dais, broken colonnade, ruined wall ---
      k.cylinder(-1, 0, 1, 4.2, 1.2, 'blocks', { seg: 40, collide: true });
      k.cylinder(-1, 1.2, 1, 4.35, 0.18, 'stone', { seg: 40 });
      stairs(-2.5, 4.9, 0.5, 6.5, 0, 1.2, '-z', 'stone');
      stairs(-2.5, -4.5, 0.5, -2.9, 0, 1.2, '+z', 'stone');
      column(-6.5, -3.5, 0, 4.6, 0.4, 'blocks', { trim: 'stone' });
      column(4.5, -3.5, 0, 2.4, 0.4, 'blocks', { capital: false, trim: 'stone' });
      column(-6.5, 5.5, 0, 1.3, 0.4, 'blocks', { capital: false, trim: 'stone' });
      column(4.5, 5.5, 0, 4.6, 0.4, 'blocks', { trim: 'stone' });
      wall('x', -11, 10.5, 6, 0, 3.2, 0.6, 'stone', [{ at: 3, w: 1.4, y: 1.0, h: 1.6, arch: true, frame: 'blocks', sill: 'blocks' }], { cap: 'blocks', plinth: 'blocks' });
      wall('z', 8.5, -3, 5, 0, 1.3, 0.6, 'blocks', [], { cap: 'stone' });
      crate(-12, 0, -8, 1.1); crate(-10.9, 0, -8.2, 1); barrel(-15, -14.5); barrel(-14.3, -15.1);

      W(-1, 2, 1); W(0, 1, -26); W(-20, 5.5, -6); W(18, 7, -1); W(16, 7, -14); W(9, 1, 12); W(-10, 1, -12); W(-14, 1, 13);
      S(-12, 1, 14); S(15, 1, 13); S(-20, 5.5, 2); S(9, 1, -15);
    },
  },
  {
    id: 'kvartal', name: { ru: 'Квартал', en: 'Block' }, light: 'overcast', killY: -20,
    weapons: ['kochegar', 'strizh', 'pompa', 'otboinik', 'hlopushka', 'shilo', 'limonka', 'tesak', 'zhuravl'],
    build(k, { W, S }) {
      const { block, wall, row, building, tower, stairs, walkway, rail, shed, crate, barrel, pipe, cable, pole, lamp, bulb } = k;
      block(-24, -1, -20, 24, 0, 20, 'floor', { bevel: 0 });
      block(-14, 0, 8, -4, 0.03, 15, 'grass', { bevel: 0, collide: false });
      block(10, 0, 8, 17, 0.03, 12, 'grass', { bevel: 0, collide: false });
      // kerbs around the grass
      for (const [a, b, c, d] of [[-14.15, 7.85, -3.85, 8.1], [-14.15, 14.9, -3.85, 15.15], [-14.15, 7.85, -13.9, 15.15], [-4.1, 7.85, -3.85, 15.15]]) block(a, 0, b, c, 0.15, d, 'concrete', { bevel: 0.02, collide: false });

      // --- perimeter: brutalist slabs with recessed windows ---
      const w3 = { w: 1.3, h: 1.6, rows: [1.2, 4.4, 7.6, 10.8], n: 4, frame: 'concrete' };
      building(-24, -27, 4, -20, 0, 13.5, 'slab', { win: w3, faces: 's' });
      building(4, -27, 24, -20, 0, 10, 'panels', { win: { ...w3, rows: [1.2, 4.4, 7.6] }, faces: 's', doors: { s: { at: 10, w: 1.6, h: 2.6 } } });
      building(-31, -20, -24, 20, 0, 12, 'panels', { win: { ...w3, rows: [4.4, 7.6], n: 3 }, faces: 'e', doors: { e: { at: 26, w: 1.6, h: 2.6 } } });
      building(24, -20, 31, 6, 0, 16, 'slab', { win: { ...w3, rows: [1.2, 4.4, 7.6, 10.8, 14], n: 3 }, faces: 'w' });
      // south: tall fence wall with barred windows
      wall('x', -24, 20.3, 48, 0, 3.4, 0.6, 'concrete', row(48, 8, { w: 1.6, y: 1.2, h: 1.5, frame: 'concrete', bars: true, sill: 'concrete' }), { cap: 'concrete', plinth: 'concrete' });
      wall('z', 24.3, 6, 14.6, 0, 3.4, 0.6, 'concrete', [], { cap: 'concrete', plinth: 'concrete' });

      // balcony along the north slab + stairs from the ground
      walkway(-23.5, -20, 0, -18.3, 6.4, { rails: 's' });
      for (const x of [-18, -12, -6]) block(x - 0.2, 0, -18.7, x + 0.2, 6.3, -18.4, 'concrete', { bevel: 0.03 });
      stairs(-23.6, -18.3, -21.6, -8.5, 0, 6.4, '-z', 'concrete', { cheeks: 'concrete' });
      rail(-21.55, -18.3, -21.55, -10, 6.4 - 0.1);
      // bridge from the balcony to the house roof
      walkway(-2.2, -18.3, 0, -6.2, 6.4, { rails: 'we' });

      // --- central two-storey house you can run through ---
      const HX0 = -8, HX1 = 6, HZ0 = -6, HZ1 = 4, FH = 3.2, T = 0.3;
      const lx = HX1 - HX0, lz = HZ1 - HZ0;
      const gWin = { w: 1.5, y: 1.0, h: 1.4, frame: 'concrete', sill: 'concrete' };
      const uWin = { w: 1.6, y: FH + 0.9, h: 1.5, frame: 'concrete', sill: 'concrete' };
      wall('x', HX0, HZ0 + T / 2, lx, 0, FH * 2, T, 'concrete', [
        { at: 4, w: 1.4, y: 0, h: 2.4, frame: 'concrete' }, { ...gWin, at: 9.5 }, { ...uWin, at: 3 }, { ...uWin, at: 7.5 }, { ...uWin, at: 11.5 }], { plinth: 'concrete' });
      wall('x', HX0, HZ1 - T / 2, lx, 0, FH * 2, T, 'concrete', [
        { at: 9.5, w: 1.4, y: 0, h: 2.4, frame: 'concrete' }, { ...gWin, at: 3.5 }, { ...uWin, at: 3 }, { ...uWin, at: 7.5 }, { ...uWin, at: 11.5 }], { plinth: 'concrete' });
      wall('z', HX0 + T / 2, HZ0 + T, lz - 2 * T, 0, FH * 2, T, 'concrete', [{ ...gWin, at: 6 }, { ...uWin, at: 4.7 }], { plinth: 'concrete' });
      wall('z', HX1 - T / 2, HZ0 + T, lz - 2 * T, 0, FH * 2, T, 'concrete', [{ at: 4.7, w: 1.4, y: 0, h: 2.4, frame: 'concrete' }, { ...uWin, at: 4.7 }], { plinth: 'concrete' });
      block(HX0 + T, -0.02, HZ0 + T, HX1 - T, 0.02, HZ1 - T, 'gtiles', { bevel: 0, collide: false });
      // first floor slab with a stairwell, interior stairs
      block(-5.4, FH - 0.2, HZ0 + T, HX1 - T, FH, HZ1 - T, 'floor', { bevel: 0 });
      block(HX0 + T, FH - 0.2, 0.2, -5.4, FH, HZ1 - T, 'floor', { bevel: 0 });
      stairs(HX0 + T, HZ0 + T, -5.5, 0.2, 0, FH, '-z', 'concrete', { cheeks: null });
      rail(-5.35, HZ0 + T, -5.35, 0.2, FH);
      // internal partition with a doorway on the ground floor
      wall('x', -1, -1.2, 6.7, 0, FH - 0.2, 0.2, 'concrete', [{ at: 2.2, w: 1.2, y: 0, h: 2.2, frame: 'concrete' }]);
      bulb(-1, FH - 0.3, 1.5); bulb(2, FH * 2 - 0.3, -2.5);
      // roof with parapet and a corrugated hut
      block(HX0, FH * 2 - 0.2, HZ0, HX1, FH * 2, HZ1, 'floor', { bevel: 0 });
      block(HX0 - 0.15, FH * 2 - 0.25, HZ0 - 0.15, HX1 + 0.15, FH * 2 - 0.03, HZ1 + 0.15, 'concrete', { bevel: 0.04, collide: false });
      for (const [a, b, c, d] of [[HX0, HZ1 - 0.3, HX1, HZ1], [HX0, HZ0 + 0.3, HX0 + 0.3, HZ1 - 0.3], [HX0 + 4, HZ0, HX1, HZ0 + 0.3]]) block(a, FH * 2, b, c, FH * 2 + 0.8, d, 'concrete', { bevel: 0.04 });
      shed(0.5, -5.6, 5.5, -1.6, FH * 2, 2.6, { door: 's', doorAt: 0.3 });
      // exterior steel stairs to the roof on the east face
      stairs(HX1 + 0.3, -4.5, HX1 + 1.9, 3.8, 0, FH * 2, '-z', 'plate', { cheeks: 'iron' });
      walkway(HX1, -6.3, HX1 + 1.9, -4.5, FH * 2, { rails: 'ne' });
      rail(HX1 + 1.95, -4.5, HX1 + 1.95, 3.8, FH * 2 * 0.0 + 0.05, { collide: false });

      // --- silo, pipes and a shed in the east yard ---
      tower(17, 14.5, 3, 0, 11, 'slab', { bands: [3, 7], top: 'flat', trim: 'concrete', windows: [{ angle: Math.PI, y: 1.0, w: 0.9, h: 1.6 }] });
      pipe([[17, 9, 11.5], [17, 9, 7], [24, 9, 7]], 0.22);
      pipe([[14, 0, 14.5], [14, 1.2, 14.5], [9, 1.2, 14.5], [9, 1.2, 19.6]], 0.14);
      pipe([[-23.5, 0.2, -10], [-23.5, 11.5, -10]], 0.12);
      pipe([[23.6, 0.2, -16], [23.6, 3.2, -16], [23.6, 3.2, -4], [23.6, 0.2, -4]], 0.16);
      shed(10, -16, 16, -11, 0, 2.8, { door: 's', doorAt: 0.7 });
      crate(9.3, 0, -10.5, 1.1); crate(9.4, 1.1, -10.6, 0.9);
      crate(-18, 0, 4, 1.2); crate(-16.8, 0, 4.1, 1); crate(-17.6, 1.2, 4.1, 0.9);
      barrel(-22.8, 18.5); barrel(-22, 19); barrel(20.5, -18.6); barrel(21.3, -18.9); barrel(12.2, 3.4);
      // low concrete barriers
      for (const [x, z] of [[12, -3], [-14, -4], [-2, 12]]) block(x - 1.3, 0, z - 0.3, x + 1.3, 0.9, z + 0.3, 'concrete', { bevel: 0.08 });
      const p1 = pole(-12, 18), p2 = pole(12, 18.6), p3 = pole(19, -6);
      cable(p1, p2, 0.7); cable(p2, p3, 0.9); cable(p1, [-23.8, 9, 0], 0.6); cable(p3, [23.8, 11, -10], 0.4);
      lamp(-12, -12); lamp(10, 6);

      W(-1, 7, -1); W(3, 4, 1); W(-6, 1, 2); W(-20, 7, -19); W(13, 1, -13.5); W(17, 12, 14.5); W(-18, 1, 12); W(18, 1, 2); W(-9, 7, -18);
      S(-20, 1, 16); S(20, 1, -16); S(20, 1, 17); S(-20, 1, -6);
    },
  },
];

// Concrete slide ramp rising along +x (smooth surface, Source-style).
function solids_ramp(k, x0, z0, x1, z1, y0, y1, mat) {
  k.solidRamp(x0, z0, x1, z1, y0, y1, 'x', 1, mat);
}

export function buildMapData(def) {
  const solids = [], decor = [], weapons = [], spawns = [], geos = [];
  const rng = mulberry32(def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const kit = createKit({ solids, geos, decor, rng });
  kit.solidRamp = (x0, z0, x1, z1, y0, y1, axis, dir, mat) => {
    solids.push({ minX: Math.min(x0, x1), minY: y0, minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxY: y1, maxZ: Math.max(z0, z1), mat, type: 'solid', ramp: { axis, dir } });
  };
  const W = (x, y, z) => weapons.push({ x, y, z });
  const S = (x, y, z) => spawns.push({ x, y, z });
  def.build(kit, { W, S, rng });
  return { solids, decor, weapons, spawns, geos };
}
