// Weapon archetypes follow the original game's rules (disposable pickups,
// 100 HP, damage in steps of 25, two hands); names and models are our own.
//
// Models live in gunmodels.js (barrel points to -Z, origin is the grip).
// fore: support-hand spot on two-handed weapons [x, y, z, pose]; view: first-person [x, y, z, yaw, pitch, scale?] override.
export const WEAPONS = {
  shilo: {
    name: { ru: 'Шило', en: 'Awl' }, hands: 1, kind: 'hitscan', ammo: 12, interval: 0.15, damage: 25, head: 2, spread: 0.008, range: 150,
    recoil: 0.025, sound: 'pistol', paint: 0x6d7466, weight: 10,
  },
  baraban: {
    name: { ru: 'Барабан', en: 'Drum' }, hands: 1, kind: 'hitscan', ammo: 6, interval: 0.32, damage: 50, head: 2, spread: 0.006, moveSpread: 0.06, range: 150,
    recoil: 0.06, sound: 'revolver', paint: 0x7a3b28, weight: 7,
  },
  otboinik: {
    name: { ru: 'Отбойник', en: 'Breaker' }, hands: 1, kind: 'hitscan', ammo: 10, interval: 0.5, damage: 50, head: 2, spread: 0.01, range: 120,
    recoil: 0.1, selfPush: 9, sound: 'heavy', paint: 0x8a4a2a, weight: 6,
  },
  strizh: {
    name: { ru: 'Стриж', en: 'Swift' }, hands: 1, kind: 'hitscan', auto: true, ammo: 24, interval: 0.055, damage: 12.5, head: 2, spread: 0.03, range: 90,
    recoil: 0.01, sound: 'smg', paint: 0x8c5a36, weight: 9,
  },
  kochegar: {
    name: { ru: 'Кочегар', en: 'Stoker' }, hands: 2, kind: 'hitscan', auto: true, ammo: 30, interval: 0.1, damage: 25, head: 4, spread: 0.018, range: 160,
    recoil: 0.016, alt: 'zoom', zoom: 0.62, sound: 'rifle', paint: 0x3f4a3a, weight: 9,
    fore: [0, 0.035, -0.3, 'under'],
  },
  pompa: {
    name: { ru: 'Помпа', en: 'Pump' }, hands: 2, kind: 'hitscan', ammo: 5, interval: 0.85, damage: 25, pellets: 8, head: 1.5, spread: 0.07, range: 40,
    recoil: 0.07, selfPush: 2, sound: 'shotgun', paint: 0x8a3d24, weight: 9,
    fore: [0, 0.05, -0.3, 'under'],
  },
  zhuravl: {
    name: { ru: 'Журавль', en: 'Crane' }, hands: 2, kind: 'hitscan', ammo: 6, interval: 1.3, damage: 250, head: 2, spread: 0.07, scopedSpread: 0.0004, range: 400,
    recoil: 0.12, alt: 'zoom', zoom: 0.27, scope: true, sound: 'sniper', paint: 0x5b4a33, weight: 5, speed: 0.92,
    fore: [0, 0.045, -0.3, 'under'],
  },
  hlopushka: {
    name: { ru: 'Хлопушка', en: 'Popper' }, hands: 2, kind: 'projectile', ammo: 4, interval: 0.6, damage: 250, recoil: 0.08, sound: 'rocket', paint: 0x55663f, weight: 5,
    projectile: { speed: 30, gravity: 0, radius: 0.15, explode: 3.6, life: 6, mesh: 'rocket' },
    fore: [0.05, -0.03, -0.28, 'grip'], view: [0.2, -0.13, -0.55, 0.25, 0.05, 0.65],
  },
  tesak: {
    name: { ru: 'Тесак', en: 'Cleaver' }, hands: 1, kind: 'melee', ammo: Infinity, interval: 0.4, damage: 50, lungeDamage: 100, range: 2.3, arc: 0.6,
    alt: 'lunge', sound: 'slash', paint: 0x6b5a45, weight: 6, speed: 1.1, wallJumps: 2,
  },
  klinok: {
    name: { ru: 'Клинок', en: 'Blade' }, hands: 2, kind: 'melee', ammo: Infinity, interval: 0.7, damage: 50, lungeDamage: 100, range: 2.8, arc: 0.55,
    alt: 'lunge', sound: 'slash', paint: 0x2b2b2b, weight: 4, speed: 1.15, jump: 1.2, wallJumps: 3,
    fore: [0.04, -0.01, 0.2, 'handle'],
  },
  limonka: {
    view: [0.2, -0.17, -0.45, 0.1, 0.0],
    name: { ru: 'Лимонка', en: 'Lemon' }, hands: 1, kind: 'grenade', ammo: 1, interval: 0.6, damage: 250, sound: 'throw', paint: 0x55603b, weight: 6,
    projectile: { speed: 18, gravity: 20, radius: 0.1, explode: 4.6, fuse: 3.0, bounce: 0.45, life: 8, mesh: 'grenade' },
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
