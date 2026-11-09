// Weapon archetypes follow the original game's rules (disposable pickups,
// 100 HP, damage in steps of 25, two hands); names and models are our own.
//
// Model parts: [shape, x, y, z, sx, sy, sz, material, rx?]
//   b = rounded box, c = cylinder along Z (sx = radius, sz = length),
//   x = cylinder along X, y = cylinder along Y, s = sphere (sx = radius)
//   materials: rust | dark | paint | wood | grip | brass | glow
// Barrel points to -Z; origin is the grip.
export const WEAPONS = {
  shilo: {
    name: { ru: 'Шило', en: 'Awl' }, hands: 1, kind: 'hitscan', ammo: 12, interval: 0.15, damage: 25, head: 2, spread: 0.008, range: 150,
    recoil: 0.025, sound: 'pistol', paint: 0x6d7466, weight: 10,
    model: [
      ['b', 0, 0.065, -0.07, 0.045, 0.06, 0.24, 'paint'], ['b', 0, 0.105, -0.07, 0.04, 0.025, 0.23, 'dark'],
      ['b', 0, -0.03, 0.02, 0.04, 0.13, 0.065, 'grip', 0.25], ['c', 0, 0.075, -0.21, 0.012, 0, 0.05, 'dark'],
      ['b', 0, 0.01, -0.06, 0.012, 0.04, 0.05, 'dark'],
    ],
  },
  baraban: {
    name: { ru: 'Барабан', en: 'Drum' }, hands: 1, kind: 'hitscan', ammo: 6, interval: 0.32, damage: 50, head: 2, spread: 0.006, moveSpread: 0.06, range: 150,
    recoil: 0.06, sound: 'revolver', paint: 0x7a3b28, weight: 7,
    model: [
      ['c', 0, 0.085, -0.17, 0.02, 0, 0.28, 'rust'], ['b', 0, 0.105, -0.17, 0.012, 0.02, 0.26, 'rust'],
      ['x', 0, 0.065, -0.02, 0.048, 0, 0.07, 'dark'], ['b', 0, 0.06, 0.03, 0.04, 0.05, 0.08, 'rust'],
      ['b', 0, -0.035, 0.07, 0.042, 0.14, 0.07, 'wood', 0.35],
    ],
  },
  otboinik: {
    name: { ru: 'Отбойник', en: 'Breaker' }, hands: 1, kind: 'hitscan', ammo: 10, interval: 0.5, damage: 50, head: 2, spread: 0.01, range: 120,
    recoil: 0.1, selfPush: 9, sound: 'heavy', paint: 0x8a4a2a, weight: 6,
    model: [
      ['b', 0, 0.07, -0.13, 0.075, 0.1, 0.36, 'rust'], ['b', 0, 0.13, -0.13, 0.06, 0.03, 0.34, 'paint'],
      ['c', 0, 0.07, -0.33, 0.03, 0, 0.06, 'dark'], ['b', 0, -0.05, 0.02, 0.05, 0.15, 0.07, 'grip', 0.2],
    ],
  },
  strizh: {
    name: { ru: 'Стриж', en: 'Swift' }, hands: 1, kind: 'hitscan', auto: true, ammo: 24, interval: 0.055, damage: 12.5, head: 2, spread: 0.03, range: 90,
    recoil: 0.01, sound: 'smg', paint: 0x8c5a36, weight: 9,
    model: [
      ['b', 0, 0.07, -0.08, 0.07, 0.12, 0.26, 'paint'], ['c', 0, 0.09, -0.26, 0.015, 0, 0.1, 'dark'],
      ['b', 0, -0.07, -0.12, 0.035, 0.17, 0.05, 'dark'], ['b', 0, -0.04, 0.03, 0.04, 0.12, 0.06, 'grip', 0.15],
      ['b', 0, 0.14, -0.02, 0.02, 0.03, 0.12, 'rust'],
    ],
  },
  kochegar: {
    name: { ru: 'Кочегар', en: 'Stoker' }, hands: 2, kind: 'hitscan', auto: true, ammo: 30, interval: 0.1, damage: 25, head: 4, spread: 0.018, range: 160,
    recoil: 0.016, alt: 'zoom', zoom: 0.62, sound: 'rifle', paint: 0x3f4a3a, weight: 9,
    model: [
      ['b', 0, 0.07, -0.16, 0.06, 0.09, 0.42, 'dark'], ['b', 0, 0.06, -0.42, 0.055, 0.06, 0.18, 'wood'],
      ['c', 0, 0.09, -0.6, 0.014, 0, 0.26, 'rust'], ['c', 0, 0.12, -0.42, 0.012, 0, 0.18, 'rust'],
      ['b', 0, -0.07, -0.18, 0.035, 0.17, 0.07, 'rust', -0.3], ['b', 0, -0.04, -0.02, 0.035, 0.12, 0.05, 'wood', 0.25],
      ['b', 0, 0.04, 0.2, 0.05, 0.12, 0.28, 'wood'], ['b', 0, 0.13, -0.15, 0.02, 0.025, 0.06, 'dark'],
    ],
  },
  pompa: {
    name: { ru: 'Помпа', en: 'Pump' }, hands: 2, kind: 'hitscan', ammo: 5, interval: 0.85, damage: 25, pellets: 8, head: 1.5, spread: 0.07, range: 40,
    recoil: 0.07, selfPush: 2, sound: 'shotgun', paint: 0x8a3d24, weight: 9,
    model: [
      ['c', 0, 0.09, -0.32, 0.026, 0, 0.66, 'dark'], ['c', 0, 0.045, -0.3, 0.022, 0, 0.56, 'dark'],
      ['b', 0, 0.05, -0.36, 0.05, 0.05, 0.2, 'paint'], ['b', 0, 0.06, -0.04, 0.055, 0.1, 0.22, 'rust'],
      ['b', 0, 0.02, 0.2, 0.05, 0.11, 0.3, 'paint'], ['b', 0, -0.05, 0.05, 0.035, 0.11, 0.05, 'paint', 0.3],
    ],
  },
  zhuravl: {
    name: { ru: 'Журавль', en: 'Crane' }, hands: 2, kind: 'hitscan', ammo: 6, interval: 1.3, damage: 250, head: 2, spread: 0.07, scopedSpread: 0.0004, range: 400,
    recoil: 0.12, alt: 'zoom', zoom: 0.27, scope: true, sound: 'sniper', paint: 0x5b4a33, weight: 5, speed: 0.92,
    model: [
      ['c', 0, 0.08, -0.45, 0.018, 0, 0.9, 'rust'], ['b', 0, 0.06, -0.08, 0.055, 0.09, 0.4, 'paint'],
      ['c', 0, 0.17, -0.1, 0.032, 0, 0.32, 'dark'], ['c', 0, 0.17, -0.27, 0.042, 0, 0.04, 'dark'],
      ['b', 0, 0.03, 0.25, 0.05, 0.13, 0.32, 'wood'], ['b', 0, -0.05, 0.02, 0.035, 0.12, 0.05, 'grip', 0.25],
      ['y', 0, -0.06, -0.62, 0.008, 0.14, 0, 'dark'],
    ],
  },
  hlopushka: {
    name: { ru: 'Хлопушка', en: 'Popper' }, hands: 2, kind: 'projectile', ammo: 4, interval: 0.6, damage: 250, recoil: 0.08, sound: 'rocket', paint: 0x55663f, weight: 5,
    projectile: { speed: 30, gravity: 0, radius: 0.15, explode: 3.6, life: 6, mesh: 'rocket' },
    model: [
      ['c', 0, 0.12, -0.12, 0.085, 0, 0.82, 'paint'], ['c', 0, 0.12, -0.54, 0.1, 0, 0.07, 'rust'], ['c', 0, 0.12, 0.3, 0.095, 0, 0.06, 'rust'],
      ['b', 0, -0.02, -0.06, 0.04, 0.13, 0.06, 'grip', 0.2], ['b', -0.1, 0.16, -0.18, 0.03, 0.06, 0.1, 'dark'],
    ],
  },
  tesak: {
    name: { ru: 'Тесак', en: 'Cleaver' }, hands: 1, kind: 'melee', ammo: Infinity, interval: 0.4, damage: 50, lungeDamage: 100, range: 2.3, arc: 0.6,
    alt: 'lunge', sound: 'slash', paint: 0x6b5a45, weight: 6, speed: 1.1, wallJumps: 2,
    model: [
      ['b', 0, 0, 0.05, 0.03, 0.035, 0.15, 'wood'], ['b', 0, 0.015, -0.03, 0.05, 0.05, 0.02, 'dark'],
      ['b', 0, 0.03, -0.27, 0.008, 0.085, 0.44, 'rust'],
    ],
  },
  klinok: {
    name: { ru: 'Клинок', en: 'Blade' }, hands: 2, kind: 'melee', ammo: Infinity, interval: 0.7, damage: 50, lungeDamage: 100, range: 2.8, arc: 0.55,
    alt: 'lunge', sound: 'slash', paint: 0x2b2b2b, weight: 4, speed: 1.15, jump: 1.2, wallJumps: 3,
    model: [
      ['b', 0, 0, 0.1, 0.032, 0.032, 0.24, 'grip'], ['x', 0, 0, -0.03, 0.06, 0, 0.012, 'brass'],
      ['b', 0, 0.01, -0.5, 0.008, 0.05, 0.86, 'rust'],
    ],
  },
  limonka: {
    name: { ru: 'Лимонка', en: 'Lemon' }, hands: 1, kind: 'grenade', ammo: 1, interval: 0.6, damage: 250, sound: 'throw', paint: 0x55603b, weight: 6,
    projectile: { speed: 18, gravity: 20, radius: 0.1, explode: 4.6, fuse: 3.0, bounce: 0.45, life: 8, mesh: 'grenade' },
    model: [['s', 0, 0.05, -0.05, 0.075, 0, 0, 'paint'], ['y', 0, 0.14, -0.05, 0.022, 0.05, 0, 'rust'], ['b', 0.03, 0.12, -0.03, 0.01, 0.07, 0.02, 'rust']],
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export function weaponName(id, lang = 'ru') {
  const w = WEAPONS[id];
  if (!w) return lang === 'ru' ? 'кулаки' : 'fists';
  return w.name[lang] || w.name.en;
}

export function newWeaponInstance(id) {
  const def = WEAPONS[id];
  return { id, def, ammo: def.ammo, cd: 0, zoomed: false, pump: 0, cookT: -1 };
}
