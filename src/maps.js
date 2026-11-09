import { mulberry32 } from './physics.js';

// Every map is built from axis-aligned boxes through a tiny DSL:
//   B(x, y, z, w, h, d, mat)  box centred on x/z, bottom at y
//   pad(x, z, y)              jump pad
//   W(x, y, z)                weapon spawner (snapped down to the floor)
//   S(x, y, z)                player spawn hint (snapped down)
// Palettes are overcast/hazy: strong sky fill, weak key light, thick fog.

const P = {
  concrete: { sky: 0xb9c2c4, ground: 0x6d6a62, fog: 0xbfc6c6, floor: 0xa8a49a, wall: 0xc9c4b8, accent: 0xc0603e, accent2: 0x5f7d84, dark: 0x5a5a58, fogNear: 18, fogFar: 85, key: 0.55 },
  warehouse: { sky: 0xc9b9a0, ground: 0x5b4e40, fog: 0xbfb19a, floor: 0x8c8274, wall: 0xb8a88f, accent: 0xd59a3c, accent2: 0x6d7f8c, dark: 0x4a4440, fogNear: 15, fogFar: 70, key: 0.45 },
  roofs: { sky: 0xaab8c6, ground: 0x585e66, fog: 0xa9b6c2, floor: 0x8e8f92, wall: 0xb6aea4, accent: 0xb5543c, accent2: 0x4e6f8c, dark: 0x45484d, fogNear: 20, fogFar: 95, key: 0.5 },
  pool: { sky: 0xc5d3cf, ground: 0x6f7c78, fog: 0xc6d4d0, floor: 0xd8d4c8, wall: 0xe6e1d4, accent: 0x5aa7b0, accent2: 0xd0704f, dark: 0x6a7a78, fogNear: 18, fogFar: 85, key: 0.5 },
  maze: { sky: 0xb7c4ad, ground: 0x5d6650, fog: 0xb6c2ac, floor: 0x8f9a7c, wall: 0x6e8a5c, accent: 0xd9c27a, accent2: 0x8c5a4a, dark: 0x4a5640, fogNear: 12, fogFar: 60, key: 0.45 },
  towers: { sky: 0xc4bed2, ground: 0x625e6e, fog: 0xc2bcd0, floor: 0x9d97a8, wall: 0xbfb8cc, accent: 0xe08a5a, accent2: 0x5a8aa0, dark: 0x55505f, fogNear: 20, fogFar: 95, key: 0.5 },
  bridge: { sky: 0xb4c6d0, ground: 0x4c5a62, fog: 0xb0c3cd, floor: 0x9a8f80, wall: 0xb2a593, accent: 0xb84a3a, accent2: 0x4a6a7a, dark: 0x4a4a4a, fogNear: 22, fogFar: 100, key: 0.5 },
  colosseum: { sky: 0xd6c6aa, ground: 0x6a5a44, fog: 0xd2c2a6, floor: 0xc2ad88, wall: 0xd8c7a6, accent: 0x9a4a32, accent2: 0x5a6a4a, dark: 0x6a5a4a, fogNear: 20, fogFar: 90, key: 0.55 },
  parking: { sky: 0xa9aeb2, ground: 0x4a4c4e, fog: 0xa6abaf, floor: 0x7e8082, wall: 0x9fa2a3, accent: 0xd8c14a, accent2: 0x4a7aa8, dark: 0x3e4042, fogNear: 14, fogFar: 70, key: 0.45 },
  zen: { sky: 0xd2d0bc, ground: 0x6e6a58, fog: 0xd0cebb, floor: 0xd7cfb4, wall: 0x8e8a7c, accent: 0xa3483a, accent2: 0x5f8a8a, dark: 0x5c5a52, fogNear: 18, fogFar: 85, key: 0.5 },
  factory: { sky: 0xb0aa9c, ground: 0x4f4a42, fog: 0xaca696, floor: 0x7a7468, wall: 0x948b7c, accent: 0xd8742e, accent2: 0x3e6a6a, dark: 0x3c3a36, fogNear: 14, fogFar: 72, key: 0.45 },
  station: { sky: 0xbdc3b8, ground: 0x585c54, fog: 0xbac0b4, floor: 0xb4b0a2, wall: 0xd6d1c2, accent: 0x3e7a5a, accent2: 0xc8a43a, dark: 0x464842, fogNear: 15, fogFar: 75, key: 0.45 },
  ziggurat: { sky: 0xd8c0a8, ground: 0x6e5440, fog: 0xd4bca4, floor: 0xbe9e7c, wall: 0xcaa982, accent: 0x5a8a7a, accent2: 0xa8503a, dark: 0x6a5240, fogNear: 22, fogFar: 100, key: 0.55 },
  port: { sky: 0xaebdc4, ground: 0x4e5a5e, fog: 0xabbac1, floor: 0x8a8c88, wall: 0x9a9890, accent: 0xb8503a, accent2: 0x3a6a9a, dark: 0x464a4c, fogNear: 18, fogFar: 90, key: 0.5 },
  library: { sky: 0xc8b8a0, ground: 0x5a4838, fog: 0xc0b098, floor: 0x7e624a, wall: 0xc6b293, accent: 0x7a3a2e, accent2: 0x3a5a4a, dark: 0x4a382c, fogNear: 12, fogFar: 62, key: 0.42 },
  islands: { sky: 0xbfd0d8, ground: 0x5a6a72, fog: 0xbccdd6, floor: 0x9aa890, wall: 0xb8b2a2, accent: 0xe0904a, accent2: 0x7a5aa0, dark: 0x5a5e5a, fogNear: 24, fogFar: 110, key: 0.5 },
  canyon: { sky: 0xd6b8a0, ground: 0x6a4a38, fog: 0xd2b49c, floor: 0xb08a6a, wall: 0xb9876a, accent: 0x5a7a8a, accent2: 0xd8b05a, dark: 0x6a4a3a, fogNear: 20, fogFar: 95, key: 0.55 },
  office: { sky: 0xc8ccc8, ground: 0x5e6260, fog: 0xc4c8c4, floor: 0x8a9290, wall: 0xdedcd4, accent: 0x4a7a9a, accent2: 0xc86a4a, dark: 0x4e5452, fogNear: 14, fogFar: 70, key: 0.45 },
  glacier: { sky: 0xd4e0e6, ground: 0x8a9aa2, fog: 0xd2dee5, floor: 0xe4ecef, wall: 0xc4d8e2, accent: 0x5a9ac0, accent2: 0xc06a5a, dark: 0x8aa0aa, fogNear: 16, fogFar: 80, key: 0.5 },
  dusk: { sky: 0xd4a8b8, ground: 0x5a4060, fog: 0xc89cb2, floor: 0x8a7090, wall: 0xb08aa8, accent: 0x5ad0c8, accent2: 0xf0b860, dark: 0x4a3852, fogNear: 16, fogFar: 80, key: 0.4 },
};

function stairs(B, x, z, dx, dz, n, { y0 = 0, stepH = 0.5, depth = 0.8, width = 2, m = 'dark' } = {}) {
  for (let i = 0; i < n; i++) {
    const cx = x + dx * (i + 0.5) * depth, cz = z + dz * (i + 0.5) * depth;
    const top = y0 + (i + 1) * stepH;
    const w = dx !== 0 ? depth : width, d = dz !== 0 ? depth : width;
    B(cx, y0, cz, w, top - y0, d, m);
  }
}

function enclosure(B, sx, sz, h = 5, t = 1, m = 'wall') {
  B(0, -1, 0, sx, 1, sz, 'floor');
  B(0, 0, -sz / 2 - t / 2, sx + 2 * t, h, t, m);
  B(0, 0, sz / 2 + t / 2, sx + 2 * t, h, t, m);
  B(-sx / 2 - t / 2, 0, 0, t, h, sz, m);
  B(sx / 2 + t / 2, 0, 0, t, h, sz, m);
}

export const MAPS = [
  {
    id: 'yard', name: { ru: 'Бетонный двор', en: 'Concrete Yard' }, pal: P.concrete,
    build({ B, W, S }) {
      enclosure(B, 44, 44, 5);
      B(0, 0, 0, 8, 2, 8, 'wall');
      stairs(B, 0, 7.2, 0, -1, 4, { width: 3 });
      stairs(B, 0, -7.2, 0, 1, 4, { width: 3 });
      B(-12, 0, -9, 9, 3, 1); B(-16, 0, -5, 1, 3, 9);
      B(12, 0, 9, 9, 3, 1); B(16, 0, 5, 1, 3, 9);
      B(10, 0, -12, 2, 2, 2, 'accent'); B(12.2, 0, -12, 2, 2, 2, 'accent'); B(11, 2, -12, 2, 2, 2, 'accent');
      B(-10, 0, 12, 2, 2, 2, 'accent'); B(-12.2, 0, 12.5, 2, 1, 2, 'accent');
      B(-6, 0, -16, 6, 1.2, 0.6, 'accent2'); B(6, 0, 16, 6, 1.2, 0.6, 'accent2');
      B(-17, 0, 17, 4, 4, 4, 'dark'); B(17, 0, -17, 4, 4, 4, 'dark');
      W(0, 5, 0); W(-14, 3, -14); W(14, 3, 14); W(15, 3, -6); W(-15, 3, 6); W(0, 3, -16); W(0, 3, 16); W(11, 6, -12);
      S(-18, 3, -18); S(18, 3, 18); S(18, 3, -10); S(-18, 3, 10);
    },
  },
  {
    id: 'warehouse', name: { ru: 'Склад', en: 'Warehouse' }, pal: P.warehouse,
    build({ B, W, S }) {
      enclosure(B, 40, 30, 8);
      for (let i = -1; i <= 1; i++) {
        B(i * 10, 0, -6, 1.2, 4, 10, 'accent2');
        B(i * 10, 0, 7.5, 1.2, 2.5, 6, 'accent2');
      }
      // catwalk along north wall
      B(0, 3.6, -13, 36, 0.4, 3, 'dark');
      stairs(B, -18.5, -5.55, 0, -1, 7, { y0: 0, width: 2.4, depth: 0.85, stepH: 0.571 });
      stairs(B, 18.5, -5.55, 0, -1, 7, { y0: 0, width: 2.4, depth: 0.85, stepH: 0.571 });
      B(-14, 0, 10, 2, 2, 2, 'accent'); B(-14, 2, 10, 2, 2, 2, 'accent'); B(-12, 0, 10, 2, 2, 2, 'accent');
      B(14, 0, 2, 2, 2, 2, 'accent'); B(5, 0, 2, 3, 1.2, 1.2, 'accent'); B(-5, 0, 2, 3, 1.2, 1.2, 'accent');
      for (let x = -15; x <= 15; x += 6) B(x, 7, 0, 0.4, 0.4, 30, 'dark'); // roof beams
      W(0, 6, -13); W(-15, 3, 0); W(15, 3, 10); W(-5, 2, 2); W(5, 2, 2); W(0, 2, 11); W(-13, 6, 10);
      S(-17, 2, 12); S(17, 2, 12); S(-15, 2, 2); S(14, 2, -4);
    },
  },
  {
    id: 'roofs', name: { ru: 'Крыши', en: 'Rooftops' }, pal: P.roofs, killY: -14,
    build({ B, W, S }) {
      const roofs = [[-14, -14, 12, 12, 0], [2, -14, 10, 12, 1], [17, -12, 10, 14, 0], [-14, 2, 12, 10, 1], [1, 2, 9, 10, 0], [16, 4, 10, 12, 1], [-12, 17, 14, 9, 0.5], [6, 17, 12, 9, 0]];
      for (const [x, z, w, d, top] of roofs) {
        B(x, -20, z, w, 20 + top, d, 'wall');
        B(x + w / 2 - 0.2, top, z + d / 4, 0.4, 0.7, d / 2 - 1, 'dark'); // short parapet
      }
      // planks over the gaps (each roof is at most 1 m above its plank)
      const plank = (x, z, w, d) => B(x, -0.3, z, w, 0.3, d, 'accent');
      plank(-5.5, -14, 5, 1.4); plank(9.5, -12, 5, 1.4); plank(-14, -5.5, 1.4, 5); plank(-5.75, 2, 4.5, 1.4);
      plank(8.25, 3, 5.5, 1.4); plank(2, 9.75, 1.4, 5.5); plank(-2.5, 17, 5, 1.4); plank(16, -3.5, 1.4, 3); plank(-12, 9.75, 1.4, 5.5);
      B(-16, 1, 2, 3, 2.2, 3, 'accent2'); B(2, 1, -16, 2, 2, 3, 'accent2'); B(17, 0, -12, 4, 1, 1, 'accent2');
      B(16, 1, 6, 2, 3, 2, 'dark'); B(-10, 0.5, 18, 2, 2, 2, 'dark'); B(6, 0, 19, 3, 1.2, 1, 'dark');
      W(-14, 5, -14); W(2, 5, -12); W(17, 5, -12); W(-12, 6, 4); W(1, 5, 2); W(16, 7, 2); W(-12, 5, 17); W(6, 5, 17);
      S(-17, 5, -17); S(19, 5, 8); S(19, 5, -16); S(-16, 5, 19);
    },
  },
  {
    id: 'pool', name: { ru: 'Пустой бассейн', en: 'Drained Pool' }, pal: P.pool,
    build({ B, W, S }) {
      B(0, -4, -13, 40, 4, 14, 'floor'); B(0, -4, 13, 40, 4, 14, 'floor');
      B(-15, -4, 0, 10, 4, 12, 'floor'); B(15, -4, 0, 10, 4, 12, 'floor');
      B(0, -5, 0, 20, 1, 12, 'accent');
      const t = 1, h = 4;
      B(0, 0, -20.5, 42, h, t); B(0, 0, 20.5, 42, h, t); B(-20.5, 0, 0, t, h, 40); B(20.5, 0, 0, t, h, 40);
      stairs(B, -5.2, 4, -1, 0, 6, { y0: -4, stepH: 0.666, width: 3, m: 'wall' });
      stairs(B, 5.2, -4, 1, 0, 6, { y0: -4, stepH: 0.666, width: 3, m: 'wall' });
      B(0, -4, 0, 2, 1.2, 6, 'wall');
      // diving tower
      B(-14, 0, -12, 4, 3, 4, 'accent2'); stairs(B, -14, -6.8, 0, -1, 6, { width: 2 });
      B(-12, 3, -9, 1, 0.25, 4, 'wall');
      B(12, 0, 10, 6, 1, 2, 'wall'); B(14, 0, -14, 2, 2, 2, 'accent2'); B(-10, 0, 14, 3, 1.2, 1, 'accent2');
      W(0, 0, 0); W(-14, 6, -12); W(12, 3, 10); W(-6, -1, 3); W(6, -1, -3); W(15, 3, 0); W(-15, 3, 0); W(0, 3, 15);
      S(-18, 2, 18); S(18, 2, -18); S(18, 2, 15); S(-18, 2, -15);
    },
  },
  {
    id: 'maze', name: { ru: 'Живая изгородь', en: 'Hedge Maze' }, pal: P.maze,
    build({ B, W, S, rng }) {
      const N = 8, C = 4.5, S0 = N * C;
      enclosure(B, S0, S0, 3.4, 1, 'wall');
      const vis = Array.from({ length: N * N }, () => false);
      const wallsH = Array.from({ length: N * (N + 1) }, () => true); // horizontal walls between rows
      const wallsV = Array.from({ length: (N + 1) * N }, () => true);
      const stack = [[0, 0]]; vis[0] = true;
      while (stack.length) {
        const [cx, cz] = stack[stack.length - 1];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [cx + a, cz + b, a, b]).filter(([x, z]) => x >= 0 && z >= 0 && x < N && z < N && !vis[z * N + x]);
        if (!nb.length) { stack.pop(); continue; }
        const [nx, nz, a, b] = nb[Math.floor(rng() * nb.length)];
        if (a !== 0) wallsV[cz * (N + 1) + Math.max(cx, nx)] = false; else wallsH[Math.max(cz, nz) * N + cx] = false;
        vis[nz * N + nx] = true; stack.push([nx, nz]);
      }
      const o = -S0 / 2;
      for (let z = 1; z < N; z++) for (let x = 0; x < N; x++) {
        const centre = x >= 3 && x <= 4 && z === 4;
        if (wallsH[z * N + x] && rng() > 0.22 && !centre) B(o + x * C + C / 2, 0, o + z * C, C + 0.6, 3.2, 0.6, 'wall');
      }
      for (let z = 0; z < N; z++) for (let x = 1; x < N; x++) {
        const centre = x === 4 && (z === 3 || z === 4);
        if (wallsV[z * (N + 1) + x] && rng() > 0.22 && !centre) B(o + x * C, 0, o + z * C + C / 2, 0.6, 3.2, C + 0.6, 'wall');
      }
      B(0, 0, 0, 2, 1, 2, 'accent');
      W(0, 3, 0); W(o + C / 2, 3, -o - C / 2); W(-o - C / 2, 3, o + C / 2); W(o + C * 2.5, 3, o + C * 2.5); W(-o - C * 2.5, 3, -o - C * 2.5); W(o + C * 5.5, 3, o + C * 1.5); W(o + C * 1.5, 3, o + C * 5.5);
      S(o + C / 2, 3, o + C / 2); S(-o - C / 2, 3, -o - C / 2); S(-o - C / 2, 3, o + C / 2); S(o + C / 2, 3, -o - C / 2);
    },
  },
  {
    id: 'towers', name: { ru: 'Четыре башни', en: 'Four Towers' }, pal: P.towers,
    build({ B, W, S, pad }) {
      enclosure(B, 46, 46, 7);
      for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
        B(x, 0, z, 5, 5.5, 5, 'wall');
        pad(x + (x > 0 ? -4 : 4), z, 0);
      }
      B(0, 5.1, -12, 19, 0.4, 2, 'dark'); B(0, 5.1, 12, 19, 0.4, 2, 'dark');
      B(0, 0, 0, 3, 3, 3, 'accent'); B(-4, 0, 0, 1, 1.3, 5, 'accent2'); B(4, 0, 0, 1, 1.3, 5, 'accent2');
      B(0, 0, -5, 5, 1.3, 1, 'accent2'); B(0, 0, 5, 5, 1.3, 1, 'accent2');
      B(-19, 0, 0, 3, 2, 8, 'dark'); B(19, 0, 0, 3, 2, 8, 'dark');
      W(-12, 9, -12); W(12, 9, 12); W(12, 9, -12); W(-12, 9, 12); W(0, 6, 0); W(0, 8, -12); W(0, 8, 12); W(-19, 4, 0); W(19, 4, 0);
      S(-20, 2, -20); S(20, 2, 20); S(20, 2, -20); S(-20, 2, 20);
    },
  },
  {
    id: 'bridge', name: { ru: 'Мост над бездной', en: 'Chasm Bridge' }, pal: P.bridge, killY: -14,
    build({ B, W, S }) {
      B(0, -2, 0, 6, 2, 40, 'floor');
      B(0, -2, -26, 22, 2, 12, 'floor'); B(0, -2, 26, 22, 2, 12, 'floor');
      B(-11.5, 0, -26, 1, 4, 12); B(11.5, 0, -26, 1, 4, 12); B(0, 0, -32.5, 24, 6, 1);
      B(-11.5, 0, 26, 1, 4, 12); B(11.5, 0, 26, 1, 4, 12); B(0, 0, 32.5, 24, 6, 1);
      for (const s of [-1, 1]) { B(s * 2.8, 0, -11.5, 0.4, 1, 17, 'accent'); B(s * 2.8, 0, 11.5, 0.4, 1, 17, 'accent'); }
      for (const z of [-12, 0, 12]) B(0, 0, z, 2.2, 1.4, 1, 'dark');
      B(0, 0, -6, 2.4, 4, 0.8, 'wall'); B(0, 0, 6, 2.4, 4, 0.8, 'wall');
      for (const s of [-1, 1]) {
        B(-6 * s, 0, -24 * s, 3, 2, 3, 'accent2'); B(6 * s, 0, -27 * s, 2, 3.5, 2, 'dark'); B(-4 * s, 0, -29 * s, 6, 1.2, 1, 'accent');
        B(10 * s, -2, 0, 5, 2, 6, 'floor');
      }
      W(0, 3, 0); W(0, 3, -26); W(0, 3, 26); W(10, 3, 0); W(-10, 3, 0); W(-8, 3, -29); W(8, 3, 29); W(0, 3, -15); W(0, 3, 15);
      S(-8, 3, -30); S(8, 3, 30); S(8, 3, -22); S(-8, 3, 22);
    },
  },
  {
    id: 'colosseum', name: { ru: 'Арена', en: 'Colosseum' }, pal: P.colosseum,
    build({ B, W, S }) {
      B(0, -1, 0, 54, 1, 54, 'floor');
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        B(Math.cos(a) * 24, 0, Math.sin(a) * 24, 6, 6 + (i % 2), 6, 'wall');
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        B(Math.cos(a) * 12, 0, Math.sin(a) * 12, 1.6, 5, 1.6, 'accent');
      }
      B(0, 0, 0, 10, 0.5, 10, 'wall'); B(0, 0.5, 0, 7, 0.5, 7, 'wall'); B(0, 1, 0, 4, 0.5, 4, 'accent2');
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        B(Math.cos(a) * 17, 0, Math.sin(a) * 17, 3, 1.3, 3, 'dark');
      }
      W(0, 4, 0); W(17 * 0.707, 4, 17 * 0.707); W(-17 * 0.707, 4, -17 * 0.707); W(17 * 0.707, 4, -17 * 0.707); W(-17 * 0.707, 4, 17 * 0.707); W(15, 3, 0); W(-15, 3, 0);
      S(0, 3, -18); S(0, 3, 18); S(18, 3, 0); S(-18, 3, 0);
    },
  },
  {
    id: 'parking', name: { ru: 'Парковка', en: 'Car Park' }, pal: P.parking,
    build({ B, W, S }) {
      enclosure(B, 44, 44, 8);
      // upper deck with a drop hole
      B(-13, 3.1, -11, 18, 0.4, 22, 'floor'); B(13, 3.1, -11, 18, 0.4, 22, 'floor');
      B(0, 3.1, -19, 8, 0.4, 6, 'floor'); B(0, 3.1, -3, 8, 0.4, 6, 'floor');
      B(-11, 3.5, 0.2, 22 - 4, 1, 0.4, 'accent'); B(13, 3.5, 0.2, 14, 1, 0.4, 'accent');
      for (const x of [-15, -5, 5, 15]) for (const z of [-15, -5]) B(x, 0, z, 1.2, 3.1, 1.2, 'wall');
      stairs(B, 2, 6.6, 0, -1, 7, { width: 3 });
      stairs(B, -20, -16 + 0, 0, 1, 0, {});
      const car = (x, z, c) => { B(x, 0, z, 2, 1.2, 4.2, c); B(x, 1.2, z + 0.3, 1.8, 0.7, 2.2, 'dark'); };
      car(-10, 8, 'accent2'); car(-6, 12, 'accent'); car(10, 10, 'dark'); car(14, 15, 'accent2'); car(-16, 16, 'accent');
      car(-10, -10, 'accent'); car(10, -10, 'accent2');
      car(-12, -18 + 0, 'dark'); car(14, -17, 'accent');
      B(0, 0, 14, 6, 1.1, 1, 'accent'); B(-20, 0, 6, 2, 2, 2, 'dark');
      W(0, 6, -12); W(-14, 6, -6); W(14, 6, -14); W(0, 2, 18); W(-18, 2, 2); W(18, 2, 4); W(0, 2, -10); W(10, 4, 10);
      S(-19, 2, 19); S(19, 2, 19); S(-19, 6, -19); S(19, 6, -4);
    },
  },
  {
    id: 'zen', name: { ru: 'Каменный сад', en: 'Stone Garden' }, pal: P.zen,
    build({ B, W, S }) {
      B(0, -1, -13, 42, 1, 16, 'floor'); B(0, -1, 13, 42, 1, 16, 'floor');
      B(0, -2.2, 0, 42, 1, 10, 'accent2');
      B(0, 0, -21.5, 44, 6, 1); B(0, 0, 21.5, 44, 6, 1); B(-21.5, -2.2, 0, 1, 8.2, 42); B(21.5, -2.2, 0, 1, 8.2, 42);
      B(0, -1.2, -5.5, 42, 0.2, 1, 'floor'); B(0, -1.2, 5.5, 42, 0.2, 1, 'floor');
      for (const x of [-10, 0, 10]) B(x, -0.2, 0, 2.2, 0.4, 10.2, 'accent');
      stairs(B, -15, -5, 0, 1, 2, { y0: -1.2, stepH: 0.6, width: 2, depth: 0.7, m: 'wall' });
      stairs(B, 15, 5, 0, -1, 2, { y0: -1.2, stepH: 0.6, width: 2, depth: 0.7, m: 'wall' });
      const rock = (x, z, s) => { B(x, 0, z, s * 2.4, s * 1.6, s * 2, 'wall'); B(x + s * 0.3, s * 1.6, z - s * 0.2, s * 1.4, s, s * 1.2, 'wall'); };
      rock(-12, -12, 1.2); rock(8, -14, 1.5); rock(14, -9, 0.8); rock(-6, 13, 1.4); rock(12, 14, 1.1); rock(-16, 10, 0.9); rock(0, -16, 0.9);
      B(-4, 0, -9, 6, 1, 1, 'dark'); B(4, 0, 9, 6, 1, 1, 'dark');
      B(-18, 0, -18, 3, 3, 3, 'accent'); B(18, 0, 18, 3, 3, 3, 'accent');
      W(0, 2, 0); W(-10, 2, 0); W(10, 2, 0); W(8, 6, -14); W(-6, 6, 13); W(-18, 5, -18); W(18, 5, 18); W(0, 3, -12); W(0, 3, 12);
      S(-18, 3, 17); S(18, 3, -17); S(-18, 3, -12); S(18, 3, 12);
    },
  },
  {
    id: 'factory', name: { ru: 'Цех', en: 'Workshop' }, pal: P.factory,
    build({ B, W, S }) {
      enclosure(B, 48, 40, 9);
      B(-12, 0, -6, 7, 4, 5, 'accent'); B(12, 0, 6, 7, 4, 5, 'accent'); B(0, 0, 0, 4, 2.4, 4, 'dark');
      B(-12, 0, 10, 4, 2.4, 3, 'accent2'); B(12, 0, -10, 4, 2.4, 3, 'accent2');
      // catwalk ring at 4m
      B(0, 3.6, -18, 46, 0.4, 2.4, 'dark'); B(0, 3.6, 18, 46, 0.4, 2.4, 'dark');
      B(-22.2, 3.6, 0, 2.4, 0.4, 33.6, 'dark'); B(22.2, 3.6, 0, 2.4, 0.4, 33.6, 'dark');
      B(0, 3.6, 0, 46, 0.4, 1.6, 'dark');
      stairs(B, -15.4, 14.5, -1, 0, 7, { width: 2.4, stepH: 0.571, depth: 0.8 });
      stairs(B, 15.4, -14.5, 1, 0, 7, { width: 2.4, stepH: 0.571, depth: 0.8 });
      B(-6, 7, 0, 0.6, 0.6, 40, 'accent'); B(6, 7, 0, 0.6, 0.6, 40, 'accent');
      B(-4, 0, -12, 3, 1.2, 1, 'accent2'); B(4, 0, 12, 3, 1.2, 1, 'accent2'); B(-18, 0, -12, 2, 2, 2, 'accent');
      W(0, 6.5, 0); W(-12, 7, -6); W(12, 7, 6); W(-20, 7, -18); W(20, 7, 18); W(-12, 3, 14); W(12, 3, -14); W(0, 3, -10); W(0, 3, 10);
      S(-21, 2, -12); S(21, 2, 12); S(-10, 2, 16); S(10, 2, -16);
    },
  },
  {
    id: 'station', name: { ru: 'Станция', en: 'Station' }, pal: P.station,
    build({ B, W, S }) {
      B(0, -1, -12, 50, 1, 16, 'floor'); B(0, -1, 12, 50, 1, 16, 'floor');
      B(0, -2.4, 0, 50, 1, 8, 'dark');
      B(0, -1.4, -2, 50, 0.15, 0.2, 'accent2'); B(0, -1.4, 2, 50, 0.15, 0.2, 'accent2');
      B(0, -2.4, -25.5, 52, 9.4, 1); B(0, -2.4, 25.5, 52, 9.4, 1); B(-25.5, -2.4, 0, 1, 9.4, 50); B(25.5, -2.4, 0, 1, 9.4, 50);
      B(-6, -1.4, -1.8, 18, 3.2, 3, 'accent');
      B(-17, -1.4, 0, 1.6, 1.4, 1.6, 'dark');
      for (const x of [-18, -9, 0, 9, 18]) { B(x, 0, -9, 1.2, 7, 1.2, 'wall'); B(x, 0, 9, 1.2, 7, 1.2, 'wall'); }
      B(-13, 0, -14, 4, 0.5, 1, 'accent'); B(13, 0, 14, 4, 0.5, 1, 'accent');
      stairs(B, 22, -6, 0, -1, 0, {});
      stairs(B, 10, 2.5, 0, 1, 0, {});
      B(20, -1.4, 0, 2, 1.0, 8, 'wall');
      B(-20, 0, 18, 6, 3, 4, 'wall'); B(20, 0, -18, 6, 3, 4, 'wall');
      B(0, 0, 18, 4, 1.2, 1, 'accent2'); B(0, 0, -18, 4, 1.2, 1, 'accent2');
      W(-6, 4, -1.8); W(0, 3, 14); W(0, 3, -14); W(-20, 5, 18); W(20, 5, -18); W(10, 0, 0); W(-14, 3, 10); W(14, 3, -10);
      S(-22, 3, -20); S(22, 3, 20); S(22, 3, -10); S(-22, 3, 10);
    },
  },
  {
    id: 'ziggurat', name: { ru: 'Зиккурат', en: 'Ziggurat' }, pal: P.ziggurat,
    build({ B, W, S, pad }) {
      enclosure(B, 50, 50, 6);
      for (let i = 0; i < 8; i++) B(0, i * 0.5, 0, 22 - i * 2.4, 0.5, 22 - i * 2.4, i % 2 ? 'wall' : 'floor');
      B(0, 4, 0, 2.5, 2.5, 0.6, 'accent');
      for (const [x, z] of [[-19, -19], [19, -19], [-19, 19], [19, 19]]) {
        B(x, 0, z, 5, 5, 5, 'accent2'); pad(x * 0.72, z * 0.72, 0);
      }
      B(-19, 0, 0, 1, 2.5, 8, 'dark'); B(19, 0, 0, 1, 2.5, 8, 'dark'); B(0, 0, -19, 8, 2.5, 1, 'dark'); B(0, 0, 19, 8, 2.5, 1, 'dark');
      W(0, 8, 2); W(-19, 8, -19); W(19, 8, 19); W(-19, 8, 19); W(19, 8, -19); W(-8, 4, 0); W(8, 4, 0); W(0, 4, -8); W(0, 4, 8);
      S(-22, 2, 0); S(22, 2, 0); S(0, 2, -22); S(0, 2, 22);
    },
  },
  {
    id: 'port', name: { ru: 'Порт', en: 'Harbour' }, pal: P.port,
    build({ B, W, S, rng }) {
      enclosure(B, 50, 44, 7);
      const cols = ['accent', 'accent2', 'dark', 'wall'];
      for (let gx = -2; gx <= 2; gx++) for (let gz = -1; gz <= 1; gz++) {
        if (gx === 0 && gz === 0) continue;
        if (rng() < 0.25) continue;
        const x = gx * 9 + (rng() - 0.5) * 2, z = gz * 12 + (rng() - 0.5) * 2;
        const along = rng() < 0.5;
        const w = along ? 6 : 2.6, d = along ? 2.6 : 6;
        B(x, 0, z, w, 2.6, d, cols[Math.floor(rng() * cols.length)]);
        if (rng() < 0.45) B(x, 2.6, z, w, 2.6, d, cols[Math.floor(rng() * cols.length)]);
        B(x + (along ? 0 : 2.2), 0, z + (along ? 2.2 : 0), 1.3, 1.3, 1.3, 'wall');
      }
      B(0, 0, 0, 3, 1.3, 3, 'accent');
      B(-22, 0, -18, 1, 9, 1, 'accent'); B(-22, 0, 18, 1, 9, 1, 'accent'); B(-22, 9, 0, 1.4, 1, 38, 'accent');
      W(0, 4, 0); W(-18, 3, 0); W(18, 3, 0); W(0, 3, -18); W(0, 3, 18); W(-9, 8, -12); W(9, 8, 12); W(18, 3, -18); W(-18, 3, 18);
      S(-23, 3, -20); S(23, 3, 20); S(23, 3, -20); S(-23, 3, 20);
    },
  },
  {
    id: 'library', name: { ru: 'Архив', en: 'Archive' }, pal: P.library,
    build({ B, W, S }) {
      enclosure(B, 40, 36, 8);
      for (let x = -12; x <= 12; x += 6) {
        B(x, 0, -9, 0.8, 3.4, 9, 'accent'); B(x, 0, 9, 0.8, 3.4, 9, 'accent');
      }
      B(-3, 0, 0, 2.4, 0.9, 1.4, 'dark'); B(3, 0, 0, 2.4, 0.9, 1.4, 'dark');
      // mezzanine on east/west sides
      B(-17.5, 3.6, 0, 5, 0.4, 36, 'floor'); B(17.5, 3.6, 0, 5, 0.4, 36, 'floor');
      B(-14.8, 4, 0, 0.4, 1, 20, 'accent2'); B(14.8, 4, 0, 0.4, 1, 20, 'accent2');
      stairs(B, -13, 16, 1, 0, 0, {});
      stairs(B, -9.2, 16.5, -1, 0, 7, { width: 2, stepH: 0.571, depth: 0.8 });
      stairs(B, 9.2, -16.5, 1, 0, 7, { width: 2, stepH: 0.571, depth: 0.8 });
      B(0, 0, -16, 4, 2, 2, 'accent2'); B(0, 0, 16, 4, 2, 2, 'accent2');
      W(0, 2, 0); W(-17, 6, 0); W(17, 6, 0); W(-9, 2, 0); W(9, 2, 0); W(0, 4, -16); W(0, 4, 16); W(-17, 6, -14); W(17, 6, 14);
      S(-18, 2, -16); S(18, 2, 16); S(-12, 2, 0); S(12, 2, 0);
    },
  },
  {
    id: 'islands', name: { ru: 'Острова', en: 'Sky Islands' }, pal: P.islands, killY: -16,
    build({ B, W, S, pad }) {
      B(0, -3, 0, 14, 3, 14, 'floor');
      B(0, 0, 0, 3, 2, 3, 'accent');
      const isl = [[-16, 0, 9, 0], [16, 0, 9, 0], [0, -16, 9, 0], [0, 16, 9, 0], [-14, -14, 7, 2.5], [14, 14, 7, 2.5], [14, -14, 7, 1], [-14, 14, 7, 1]];
      for (const [x, z, s, top] of isl) {
        B(x, top - 3, z, s, 3, s, 'floor');
        B(x, top - 6, z, s * 0.6, 3, s * 0.6, 'dark');
      }
      B(-8, -0.3, 0, 4, 0.3, 2, 'wall'); B(8, -0.3, 0, 4, 0.3, 2, 'wall');
      B(0, -0.3, -8, 2, 0.3, 4, 'wall'); B(0, -0.3, 8, 2, 0.3, 4, 'wall');
      B(-16, 0, 0, 1, 1.3, 5, 'accent2'); B(16, 0, 0, 1, 1.3, 5, 'accent2'); B(0, 0, -16, 5, 1.3, 1, 'accent2'); B(0, 0, 16, 5, 1.3, 1, 'accent2');
      B(0, 9, 0, 6, 0.6, 6, 'wall');
      pad(-4.5, 4.5, 0); pad(4.5, -4.5, 0);
      W(0, 12, 0); W(-16, 3, 2); W(16, 3, -2); W(2, 3, -16); W(-2, 3, 16); W(-14, 6, -14); W(14, 6, 14); W(14, 5, -14); W(-14, 5, 14);
      S(-16, 3, -3); S(16, 3, 3); S(3, 3, 16); S(-3, 3, -16);
    },
  },
  {
    id: 'canyon', name: { ru: 'Каньон', en: 'Canyon' }, pal: P.canyon,
    build({ B, W, S }) {
      B(0, -1, 0, 26, 1, 70, 'floor');
      B(-13.5, 0, 0, 1, 12, 70); B(13.5, 0, 0, 1, 12, 70); B(0, 0, -35.5, 28, 12, 1); B(0, 0, 35.5, 28, 12, 1);
      for (let i = 0; i < 6; i++) {
        const z = -28 + i * 11;
        const s = i % 2 ? 1 : -1;
        B(s * 10.5, 0, z, 5, 2 + (i % 3), 8, 'wall');
        B(-s * 11.5, 0, z + 4, 3, 1, 5, 'wall');
        B(-s * 12, 1, z + 4.5, 2, 1, 3, 'wall');
      }
      B(0, 0, 0, 4, 3, 4, 'accent'); B(-4, 0, -14, 2.5, 1.5, 2.5, 'accent2'); B(4, 0, 14, 2.5, 1.5, 2.5, 'accent2');
      B(3, 0, -22, 2, 2.2, 2, 'dark'); B(-3, 0, 22, 2, 2.2, 2, 'dark'); B(0, 0, -8, 6, 1.1, 0.8, 'dark'); B(0, 0, 8, 6, 1.1, 0.8, 'dark');
      W(0, 5, 0); W(-10, 6, -28); W(10, 6, 28); W(0, 3, -18); W(0, 3, 18); W(10, 6, -17); W(-10, 6, 17); W(0, 3, -30); W(0, 3, 30);
      S(0, 3, -33); S(0, 3, 33); S(-5, 3, -25); S(5, 3, 25);
    },
  },
  {
    id: 'office', name: { ru: 'Офис', en: 'Open Office' }, pal: P.office,
    build({ B, W, S }) {
      enclosure(B, 42, 36, 5);
      for (let x = -12; x <= 12; x += 8) for (let z = -6; z <= 6; z += 6) {
        B(x, 0, z, 4.4, 1.4, 0.15, 'accent'); B(x, 0, z + 2.2, 0.15, 1.4, 4.4, 'accent');
        B(x + 1.2, 0, z + 1.1, 1.8, 0.8, 1, 'dark');
      }
      for (const s of [-1, 1]) {
        B(s * 17, 0, 11.5, 0.3, 3.2, 7, 'wall'); B(s * 17, 0, -11.5, 0.3, 3.2, 7, 'wall');
        B(s * 19, 0, 7.8, 4, 3.2, 0.3, 'wall'); B(s * 19, 0, -7.8, 4, 3.2, 0.3, 'wall');
        B(s * 19, 0, 13, 2, 0.8, 3, 'accent2'); B(s * 19, 0, -13, 2, 0.8, 3, 'accent2');
      }
      for (const x of [-8, 0, 8]) { B(x, 0, -15, 1, 5, 1, 'wall'); B(x, 0, 15, 1, 5, 1, 'wall'); }
      B(0, 0, 0, 3, 1.1, 1.2, 'accent2');
      W(0, 3, 0); W(-19, 3, 13); W(19, 3, -13); W(-12, 3, -3); W(12, 3, 3); W(0, 3, -12); W(0, 3, 12); W(19, 3, 0); W(-19, 3, 0);
      S(-19, 2, -16); S(19, 2, 16); S(-19, 2, 16); S(19, 2, -16);
    },
  },
  {
    id: 'glacier', name: { ru: 'Ледник', en: 'Glacier' }, pal: P.glacier, killY: -16,
    build({ B, W, S }) {
      B(0, -6, -13, 44, 6, 22, 'floor'); B(0, -6, 13.5, 44, 6, 21, 'floor');
      B(0, 0, -24.5, 46, 6, 1, 'wall'); B(0, 0, 24.5, 46, 6, 1, 'wall'); B(-22.5, -6, 0, 1, 12, 48, 'wall'); B(22.5, -6, 0, 1, 12, 48, 'wall');
      B(-8, -0.4, 2, 3, 0.4, 3.5, 'wall'); B(9, -0.4, 2, 2.4, 0.4, 3.5, 'wall');
      const ice = (x, z, w, h, d) => B(x, 0, z, w, h, d, 'wall');
      ice(-12, -10, 4, 2.4, 3); ice(-10.5, -12, 2, 4, 2); ice(10, -14, 5, 1.5, 2); ice(14, -8, 2, 3, 2);
      ice(-14, 12, 3, 2, 5); ice(12, 12, 4, 3.2, 4); ice(0, 16, 6, 1.2, 1.5); ice(0, -16, 6, 1.2, 1.5);
      stairs(B, 12, 7.2, 0, 1, 0, {});
      B(10.2, 0, 9.4, 1.2, 1.6, 1.2, 'accent');
      B(-16, 0, -17, 3, 3, 3, 'accent'); B(16, 0, 17, 3, 3, 3, 'accent');
      W(-8, 3, 2); W(9, 3, 2); W(12, 6, 12); W(-12, 5, -10); W(0, 3, -10); W(0, 3, 10); W(-16, 6, -17); W(16, 6, 17); W(-17, 3, 4); W(17, 3, -4);
      S(-20, 2, -21); S(20, 2, 21); S(19, 2, -20); S(-19, 2, 20);
    },
  },
  {
    id: 'dusk', name: { ru: 'Сумерки', en: 'Dusk Plaza' }, pal: P.dusk,
    build({ B, W, S, pad }) {
      enclosure(B, 46, 46, 6);
      const arch = (x, z, along) => {
        if (along) { B(x - 2.5, 0, z, 1, 4, 1, 'wall'); B(x + 2.5, 0, z, 1, 4, 1, 'wall'); B(x, 4, z, 6, 0.8, 1, 'accent'); }
        else { B(x, 0, z - 2.5, 1, 4, 1, 'wall'); B(x, 0, z + 2.5, 1, 4, 1, 'wall'); B(x, 4, z, 1, 0.8, 6, 'accent'); }
      };
      arch(0, -10, true); arch(0, 10, true); arch(-10, 0, false); arch(10, 0, false);
      B(0, 0, 0, 6, 0.6, 6, 'floor'); B(0, 0.6, 0, 3, 0.4, 3, 'accent2');
      B(-15, 0, -15, 6, 3, 6, 'wall'); B(15, 0, 15, 6, 3, 6, 'wall');
      stairs(B, -15, -8.6, 0, -1, 0, {});
      pad(-15, -9.5, 0); pad(15, 9.5, 0);
      B(15, 0, -15, 2, 1.3, 6, 'accent'); B(-15, 0, 15, 6, 1.3, 2, 'accent');
      B(-6, 0, 17, 1.4, 2.2, 1.4, 'dark'); B(6, 0, -17, 1.4, 2.2, 1.4, 'dark');
      W(0, 3, 0); W(-15, 6, -15); W(15, 6, 15); W(0, 7, -10); W(0, 7, 10); W(15, 3, -11); W(-11, 3, 15); W(-19, 3, 0); W(19, 3, 0);
      S(-20, 2, 20); S(20, 2, -20); S(20, 2, 4); S(-20, 2, -4);
    },
  },
];

export function buildMapData(def) {
  const boxes = [], weapons = [], spawns = [], pads = [];
  const rng = mulberry32(def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const B = (x, y, z, w, h, d, m = 'wall') => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    boxes.push({ minX: x - w / 2, minY: y, minZ: z - d / 2, maxX: x + w / 2, maxY: y + h, maxZ: z + d / 2, mat: m, type: 'solid' });
  };
  const pad = (x, z, y = 0) => { boxes.push({ minX: x - 1, minY: y, minZ: z - 1, maxX: x + 1, maxY: y + 0.25, maxZ: z + 1, mat: 'pad', type: 'pad' }); pads.push({ x, y: y + 0.25, z }); };
  const W = (x, y, z) => weapons.push({ x, y, z });
  const S = (x, y, z) => spawns.push({ x, y, z });
  def.build({ B, W, S, pad, rng });
  return { boxes, weapons, spawns, pads };
}
