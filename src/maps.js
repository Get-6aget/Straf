import { mulberry32 } from './physics.js';

// Map DSL
//   B(x, y, z, w, h, d, mat)           solid box, centred on x/z, bottom at y
//   R(x0, z0, x1, z1, y0, y1, axis, mat) ramp from height y0 to y1 along axis (+)
//   rail(x0, z0, x1, z1, y)            rusty railing with collision
//   pipe(x, y, z, len, axis, r)        decorative pipe (no collision)
//   barrel(x, z, y)                    oil drum (collision box)
//   car(x, z, rotY)                    wrecked car (collision box)
//   lamp(x, z)                         street lamp
//   W(x, y, z) weapon spawner, S(x, y, z) spawn
// Lighting presets drive sky, fog and grade.
export const LIGHTING = {
  overcast: { sky: 'overcast', envIntensity: 0.95, bgIntensity: 0.75, fog: 0x7f8a7d, fogDensity: 0.019, sun: 1.45, sunColor: 0xe4ead8, sunDir: [0.45, 1, 0.3], hemi: 0.45, grade: [0.9, 1.0, 0.9] },
};

export const MAPS = [
  {
    id: 'dvor', name: { ru: 'Двор', en: 'Yard' }, light: 'overcast',
    weapons: ['kochegar', 'shilo', 'strizh', 'pompa', 'zhuravl', 'tesak', 'limonka', 'baraban', 'hlopushka', 'otboinik', 'klinok'],
    build({ B, R, rail, pipe, barrel, car, lamp, W, S }) {
      const SX = 46, SZ = 38, H = 9;
      // ground and perimeter
      B(0, -1, 0, SX, 1, SZ, 'floor');
      B(0, 0, -SZ / 2 - 0.5, SX + 2, H, 1, 'concrete'); B(0, 0, SZ / 2 + 0.5, SX + 2, H, 1, 'concrete');
      B(-SX / 2 - 0.5, 0, 0, 1, H, SZ, 'concrete'); B(SX / 2 + 0.5, 0, 0, 1, H, SZ, 'concrete');
      // mossy plinth along the walls
      B(0, 0, -SZ / 2 + 0.15, SX, 1.1, 0.3, 'moss'); B(0, 0, SZ / 2 - 0.15, SX, 1.1, 0.3, 'moss');
      B(-SX / 2 + 0.15, 0, 0, 0.3, 1.1, SZ - 0.6, 'moss');
      // grass patches
      B(-14, 0, 12, 9, 0.04, 7, 'grass'); B(4, 0, 14.5, 10, 0.04, 5, 'grass'); B(-6, 0, -3, 5, 0.04, 4, 'grass');

      // north-west block with a tunnel through it (two halves + lintel)
      B(-17.5, 0, -12.5, 11, 6, 7, 'cracked'); B(-6.5, 0, -12.5, 5, 6, 7, 'cracked');
      B(-10.5, 3.2, -12.5, 3, 2.8, 7, 'cracked');
      B(-11, 6, -12.5, 22, 0.5, 7.4, 'concrete'); // roof slab
      rail(-21.8, -9, -4.2, -9, 6.5);
      // stairs up to its roof along the west wall
      for (let i = 0; i < 10; i++) B(-21.5, 0, 2 - i * 0.8, 2, 0.6 * (i + 1), 0.8, 'concrete');

      // east walkway on pillars
      B(19, 3.2, -1, 6, 0.4, 32, 'concrete');
      for (const z of [-15, -7, 1, 9]) B(16.5, 0, z, 0.8, 3.2, 0.8, 'concrete');
      rail(16.05, -17, 16.05, -6, 3.6); rail(16.05, 2, 16.05, 12, 3.6);
      // stairs from the south
      for (let i = 0; i < 6; i++) B(19, 0, 18 - i * 0.8, 3, 0.53 * (i + 1), 0.8, 'concrete');
      // long slide slope from the walkway down to the yard
      R(4, -6, 16, -2, 0, 3.6, 'x', 'floor');
      B(10, 0, -6.2, 12, 1.2, 0.4, 'concrete'); B(10, 0, -1.8, 12, 1.2, 0.4, 'concrete');

      // centre: low block, raised plinth, cover walls
      B(-4, 0, 6, 6, 1.2, 6, 'concrete'); B(-4, 1.2, 6, 3, 1.2, 3, 'cracked');
      B(5, 0, 6, 0.6, 2.2, 5, 'brick'); B(-12, 0, 3, 4, 2.2, 0.6, 'brick');
      B(-2, 0, -6, 3, 1.1, 0.8, 'concrete'); B(8, 0, 12, 0.8, 1.1, 3, 'concrete');

      // south-east shed with brick walls
      B(10, 0, 15.5, 8, 4, 0.5, 'brick'); B(6.25, 0, 13, 0.5, 4, 5.5, 'brick');
      B(10, 4, 13.2, 8.5, 0.3, 6, 'rust');

      car(-14, 12, 0.3); car(1, -14, 1.4);
      for (const [x, z] of [[-20, 16], [-19, 16.8], [13, -16], [14, -16.6], [-1, 10.5], [7.2, 9.7]]) barrel(x, z, 0);
      barrel(-4, 6.6, 2.4);
      lamp(-3, -16); lamp(12, 2); lamp(-18, 6);

      pipe(-11, 7.5, -18.6, 44, 'x', 0.18); pipe(0, 5.2, 18.6, 44, 'x', 0.12);
      pipe(22.6, 4.5, 0, 36, 'z', 0.15); pipe(-22.6, 0, -18.6, 9, 'y', 0.12); pipe(22.6, 0, 18.6, 9, 'y', 0.14);
      pipe(-6, 6.4, -9, 10, 'x', 0.1);

      W(-4, 3, 6); W(19, 4, -10); W(19, 4, 8); W(-11, 7, -12.5); W(-14, 1, 7); W(2, 1, -10); W(12, 1, 10); W(-20, 1, -4); W(10, 1, -12);
      S(-20, 1, 16); S(20, 1, -16); S(20, 1, 16); S(-19, 1, -5);
    },
  },
];

export function buildMapData(def) {
  const solids = [], decor = [], weapons = [], spawns = [];
  const rng = mulberry32(def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const B = (x, y, z, w, h, d, mat = 'concrete') => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    solids.push({ minX: x - w / 2, minY: y, minZ: z - d / 2, maxX: x + w / 2, maxY: y + h, maxZ: z + d / 2, mat, type: 'solid' });
  };
  const R = (x0, z0, x1, z1, y0, y1, axis, mat = 'floor') => {
    solids.push({ minX: Math.min(x0, x1), minY: y0, minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxY: y1, maxZ: Math.max(z0, z1), mat, type: 'solid', ramp: { axis, dir: 1 } });
  };
  const rail = (x0, z0, x1, z1, y) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // thin collision so you can't walk off, visible as posts + bars
    solids.push({ minX: alongX ? cx - len / 2 : cx - 0.05, minY: y, minZ: alongX ? cz - 0.05 : cz - len / 2, maxX: alongX ? cx + len / 2 : cx + 0.05, maxY: y + 1.05, maxZ: alongX ? cz + 0.05 : cz + len / 2, mat: 'none', type: 'solid' });
    decor.push({ t: 'rail', x0, z0, x1, z1, y });
  };
  const pipe = (x, y, z, len, axis, r = 0.12) => decor.push({ t: 'pipe', x, y, z, len, axis, r });
  const barrel = (x, z, y = 0) => { B(x, y, z, 0.62, 0.9, 0.62, 'none'); decor.push({ t: 'barrel', x, y, z, rot: rng() * 6 }); };
  const car = (x, z, rot = 0) => {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    B(x, 0, z, 1.9 * c + 4.2 * s, 1.35, 1.9 * s + 4.2 * c, 'none');
    decor.push({ t: 'car', x, z, rot });
  };
  const lamp = (x, z) => { B(x, 0, z, 0.25, 4.5, 0.25, 'none'); decor.push({ t: 'lamp', x, z }); };
  const W = (x, y, z) => weapons.push({ x, y, z });
  const S = (x, y, z) => spawns.push({ x, y, z });
  def.build({ B, R, rail, pipe, barrel, car, lamp, W, S, rng });
  return { solids, decor, weapons, spawns };
}
