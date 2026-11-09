// Weapon definitions. Models are lists of primitives:
// [shape, x, y, z, sx, sy, sz, material]  shape: b=box, c=cylinder along Z (sx=radius, sz=length), s=sphere(sx)
// Barrel points to -Z, origin is the grip.
// kind: hitscan | projectile | melee | cone | tesla | throwable
export const WEAPONS = {
  fists: {
    name: { ru: 'Кулаки', en: 'Fists' }, kind: 'melee', ammo: Infinity, rate: 2.6, damage: 25, range: 2.0, arc: 0.75,
    alt: 'shove', altName: { ru: 'Толчок', en: 'Shove' }, knock: 6, color: 0xe0c9a6, noDrop: true,
    model: [],
  },
  pistol: {
    name: { ru: 'Оса', en: 'Wasp' }, kind: 'hitscan', ammo: 12, rate: 5, damage: 30, headMult: 2, spread: 0.012, range: 120,
    recoil: 0.025, alt: 'fan', altName: { ru: 'Веер: 3 выстрела', en: 'Fan: 3 shots' }, color: 0xd8b04c, sound: 'pistol', weight: 10,
    model: [['b', 0, 0.06, -0.08, 0.05, 0.07, 0.26, 'm'], ['b', 0, -0.03, 0.02, 0.045, 0.13, 0.07, 'a'], ['c', 0, 0.075, -0.24, 0.015, 0, 0.06, 'l']],
  },
  revolver: {
    name: { ru: 'Бульдог', en: 'Bulldog' }, kind: 'hitscan', ammo: 6, rate: 2.2, damage: 55, headMult: 2, spread: 0.006, range: 140,
    recoil: 0.06, alt: 'ricochet', altName: { ru: 'Рикошет', en: 'Ricochet' }, color: 0xb35a3a, sound: 'revolver', weight: 7,
    model: [['c', 0, 0.08, -0.18, 0.022, 0, 0.3, 'l'], ['c', 0, 0.06, -0.02, 0.045, 0, 0.09, 'm'], ['b', 0, -0.03, 0.05, 0.045, 0.14, 0.07, 'w']],
  },
  smg: {
    name: { ru: 'Шершень', en: 'Hornet' }, kind: 'hitscan', ammo: 36, rate: 12, auto: true, damage: 15, headMult: 1.6, spread: 0.035, range: 90,
    recoil: 0.012, alt: 'zoom', zoom: 0.78, altName: { ru: 'Прицел', en: 'Aim' }, color: 0x4f86a8, sound: 'smg', weight: 9,
    model: [['b', 0, 0.06, -0.12, 0.07, 0.09, 0.38, 'm'], ['b', 0, -0.06, -0.12, 0.035, 0.16, 0.06, 'a'], ['b', 0, -0.03, 0.03, 0.045, 0.12, 0.06, 'm'], ['c', 0, 0.06, -0.35, 0.018, 0, 0.1, 'l']],
  },
  rifle: {
    name: { ru: 'Карабин', en: 'Carbine' }, kind: 'hitscan', ammo: 25, rate: 8, auto: true, damage: 24, headMult: 1.8, spread: 0.02, range: 150,
    recoil: 0.016, alt: 'zoom', zoom: 0.6, altName: { ru: 'Прицел', en: 'Aim' }, color: 0x6c7a4a, sound: 'rifle', weight: 8,
    model: [['b', 0, 0.06, -0.18, 0.07, 0.1, 0.55, 'm'], ['b', 0, 0.03, 0.18, 0.06, 0.12, 0.22, 'a'], ['b', 0, -0.07, -0.12, 0.04, 0.16, 0.08, 'm'], ['c', 0, 0.07, -0.5, 0.017, 0, 0.18, 'l'], ['b', 0, 0.13, -0.14, 0.03, 0.04, 0.12, 'l']],
  },
  shotgun: {
    name: { ru: 'Помпа', en: 'Pump' }, kind: 'hitscan', ammo: 6, rate: 1.3, damage: 13, pellets: 8, headMult: 1.4, spread: 0.075, range: 45,
    recoil: 0.07, selfKnock: 3, alt: 'slug', altName: { ru: 'Пуля-жакан', en: 'Slug' }, color: 0x8a5a33, sound: 'shotgun', weight: 9,
    model: [['c', 0, 0.07, -0.25, 0.03, 0, 0.62, 'm'], ['b', 0, 0.02, -0.26, 0.06, 0.05, 0.2, 'w'], ['b', 0, 0.03, 0.15, 0.06, 0.11, 0.25, 'w']],
  },
  doublebarrel: {
    name: { ru: 'Двустволка', en: 'Double' }, kind: 'hitscan', ammo: 2, rate: 3, damage: 12, pellets: 10, headMult: 1.4, spread: 0.09, range: 35,
    recoil: 0.1, selfKnock: 5, alt: 'both', altName: { ru: 'Залп из двух', en: 'Both barrels' }, color: 0x7b4b2a, sound: 'shotgun', weight: 6,
    model: [['c', -0.025, 0.07, -0.25, 0.025, 0, 0.6, 'm'], ['c', 0.025, 0.07, -0.25, 0.025, 0, 0.6, 'm'], ['b', 0, 0.02, 0.12, 0.06, 0.1, 0.3, 'w']],
  },
  sniper: {
    name: { ru: 'Цапля', en: 'Heron' }, kind: 'hitscan', ammo: 4, rate: 0.8, damage: 110, headMult: 2, spread: 0.06, scopedSpread: 0.0005, range: 300,
    recoil: 0.12, alt: 'zoom', zoom: 0.25, scope: true, altName: { ru: 'Оптика', en: 'Scope' }, color: 0x445566, sound: 'sniper', weight: 5,
    model: [['c', 0, 0.07, -0.35, 0.02, 0, 0.8, 'm'], ['b', 0, 0.03, 0.15, 0.06, 0.12, 0.35, 'a'], ['c', 0, 0.15, -0.1, 0.035, 0, 0.25, 'm'], ['b', 0, -0.05, -0.02, 0.04, 0.12, 0.06, 'm']],
  },
  minigun: {
    name: { ru: 'Мясорубка', en: 'Grinder' }, kind: 'hitscan', ammo: 120, rate: 16, auto: true, damage: 10, headMult: 1.5, spread: 0.05, range: 80,
    recoil: 0.006, spinup: 0.55, slow: 0.62, alt: 'spin', altName: { ru: 'Раскрутка', en: 'Spin up' }, color: 0x9a9a9a, sound: 'smg', weight: 4,
    model: [['c', 0, 0.05, -0.25, 0.085, 0, 0.55, 'm'], ['c', 0, 0.05, -0.55, 0.06, 0, 0.1, 'l'], ['b', 0, -0.06, 0.05, 0.12, 0.14, 0.2, 'a']],
  },
  rocket: {
    name: { ru: 'Хлопушка', en: 'Popper' }, kind: 'projectile', ammo: 3, rate: 1.1, damage: 100, projectile: { speed: 26, gravity: 0, radius: 0.15, explode: 4.6, life: 6, mesh: 'rocket' },
    selfKnock: 0, recoil: 0.08, alt: 'detonate', altName: { ru: 'Подрыв в воздухе', en: 'Air detonate' }, color: 0x8a3b3b, sound: 'rocket', weight: 5,
    model: [['c', 0, 0.1, -0.15, 0.08, 0, 0.75, 'a'], ['c', 0, 0.1, -0.53, 0.095, 0, 0.06, 'm'], ['b', 0, -0.03, -0.05, 0.04, 0.13, 0.06, 'm']],
  },
  grenade: {
    name: { ru: 'Яблоко', en: 'Apple' }, kind: 'throwable', ammo: 2, rate: 1.2, damage: 110, projectile: { speed: 17, gravity: 20, radius: 0.12, explode: 5, fuse: 2.0, bounce: 0.45, life: 6, mesh: 'grenade' },
    alt: 'underhand', altName: { ru: 'Катнуть', en: 'Underhand roll' }, color: 0x4d6b3a, sound: 'throw', weight: 6,
    model: [['s', 0, 0.05, -0.05, 0.08, 0, 0, 'a'], ['b', 0, 0.14, -0.05, 0.03, 0.04, 0.03, 'l']],
  },
  crossbow: {
    name: { ru: 'Самострел', en: 'Bolter' }, kind: 'projectile', ammo: 5, rate: 1.1, damage: 100, headMult: 1.5, projectile: { speed: 70, gravity: 6, radius: 0.06, life: 4, mesh: 'bolt', pin: true },
    recoil: 0.05, alt: 'zoom', zoom: 0.5, altName: { ru: 'Прицел', en: 'Aim' }, color: 0x6a4a2a, sound: 'bow', weight: 6,
    model: [['b', 0, 0.06, -0.12, 0.05, 0.06, 0.5, 'w'], ['b', 0, 0.06, -0.33, 0.5, 0.03, 0.04, 'm'], ['b', 0, 0.1, -0.12, 0.012, 0.012, 0.45, 'l']],
  },
  katana: {
    name: { ru: 'Катана', en: 'Katana' }, kind: 'melee', ammo: Infinity, rate: 1.8, damage: 100, range: 2.7, arc: 0.6,
    alt: 'lunge', altName: { ru: 'Рывок-удар', en: 'Lunge slash' }, color: 0xdedede, sound: 'slash', weight: 5,
    model: [['b', 0, 0, 0.06, 0.035, 0.035, 0.22, 'a'], ['b', 0, 0, -0.06, 0.1, 0.02, 0.025, 'm'], ['b', 0, 0, -0.5, 0.01, 0.05, 0.85, 'l']],
  },
  knife: {
    name: { ru: 'Финка', en: 'Shiv' }, kind: 'melee', ammo: Infinity, rate: 2.5, damage: 55, range: 2.1, arc: 0.7,
    alt: 'throwknife', altName: { ru: 'Метнуть (100 урона)', en: 'Throw (100 dmg)' }, color: 0x333333, sound: 'slash', weight: 7,
    projectile: { speed: 40, gravity: 6, radius: 0.08, life: 3, mesh: 'knife' },
    model: [['b', 0, 0, 0.04, 0.03, 0.035, 0.12, 'a'], ['b', 0, 0, -0.1, 0.012, 0.04, 0.2, 'l']],
  },
  // --- Original signature weapons ---
  harpoon: {
    name: { ru: 'Гарпун', en: 'Harpoon' }, kind: 'projectile', ammo: 4, rate: 1.0, damage: 35, projectile: { speed: 60, gravity: 2, radius: 0.08, life: 2, mesh: 'harpoon', harpoon: true },
    recoil: 0.05, alt: 'reel', altName: { ru: 'Попал в стену — тянет тебя, в врага — его', en: 'Wall hit pulls you, enemy hit pulls them' }, color: 0x2f6f7a, sound: 'bow', weight: 6,
    model: [['c', 0, 0.06, -0.2, 0.04, 0, 0.5, 'a'], ['c', 0, 0.06, -0.5, 0.015, 0, 0.18, 'l'], ['b', 0, -0.04, 0, 0.04, 0.12, 0.06, 'm'], ['s', 0, 0.06, 0.1, 0.06, 0, 0, 'm']],
  },
  resonator: {
    name: { ru: 'Резонатор', en: 'Resonator' }, kind: 'cone', ammo: 5, rate: 1.1, damage: 22, range: 13, arc: 0.55, knock: 22,
    alt: 'selfblast', altName: { ru: 'Отдача-прыжок', en: 'Blast jump' }, color: 0x8f62b8, sound: 'boom', weight: 6,
    model: [['c', 0, 0.06, -0.1, 0.05, 0, 0.3, 'm'], ['c', 0, 0.06, -0.32, 0.11, 0, 0.14, 'a'], ['c', 0, 0.06, -0.4, 0.13, 0, 0.03, 'g'], ['b', 0, -0.04, 0.03, 0.04, 0.12, 0.06, 'm']],
  },
  bouncer: {
    name: { ru: 'Попрыгун', en: 'Bouncer' }, kind: 'projectile', ammo: 9, rate: 2.2, damage: 45, projectile: { speed: 32, gravity: 9, radius: 0.13, life: 4, bounces: 4, bounce: 0.9, mesh: 'ball' },
    recoil: 0.04, alt: 'triple', altName: { ru: 'Тройной (3 заряда)', en: 'Triple (3 ammo)' }, color: 0xd9578a, sound: 'pop', weight: 6,
    model: [['b', 0, 0.06, -0.12, 0.09, 0.1, 0.36, 'a'], ['s', 0, 0.06, -0.32, 0.07, 0, 0, 'g'], ['b', 0, -0.04, 0.02, 0.04, 0.12, 0.06, 'm']],
  },
  tesla: {
    name: { ru: 'Искра', en: 'Spark' }, kind: 'tesla', ammo: 22, rate: 4.5, auto: true, damage: 26, range: 26, chain: 9, chainDamage: 16,
    alt: 'overload', altName: { ru: 'Перегрузка вокруг (5+ зарядов)', en: 'Overload nova (5+ ammo)' }, color: 0x52b7d6, sound: 'zap', weight: 5,
    model: [['b', 0, 0.05, -0.1, 0.07, 0.08, 0.32, 'm'], ['c', 0, 0.05, -0.3, 0.03, 0, 0.12, 'l'], ['s', 0, 0.05, -0.38, 0.045, 0, 0, 'g'], ['b', 0, -0.05, 0.02, 0.04, 0.12, 0.06, 'a']],
  },
  stickymine: {
    name: { ru: 'Липучка', en: 'Sticky' }, kind: 'throwable', ammo: 2, rate: 1.4, damage: 95, projectile: { speed: 15, gravity: 18, radius: 0.12, explode: 4, life: 60, sticky: true, mesh: 'mine' },
    alt: 'remote', altName: { ru: 'Взорвать свои', en: 'Detonate yours' }, color: 0xc7a23a, sound: 'throw', weight: 5,
    model: [['c', 0, 0.05, -0.05, 0.08, 0, 0.05, 'a'], ['s', 0, 0.05, -0.08, 0.03, 0, 0, 'g']],
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS).filter((k) => k !== 'fists');

export function weaponName(id, lang) {
  const w = WEAPONS[id];
  if (!w) return id;
  return w.name[lang] || w.name.en;
}

export function newWeaponInstance(id) {
  const def = WEAPONS[id];
  return { id, def, ammo: def.ammo, cd: 0, altCd: 0, spin: 0, zoomed: false, rocket: null };
}
