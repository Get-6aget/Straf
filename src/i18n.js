const STR = {
  ru: {
    title: 'ПЕРЕКАТ', subtitle: 'арена-шутер с раундами за секунды',
    play1v1: '1 на 1', play2v2: '2 на 2', playFfa: 'Все против всех', settings: 'Настройки', controls: 'Управление',
    difficulty: 'Сложность ботов', diff0: 'Лёгкие', diff1: 'Нормальные', diff2: 'Жёсткие', rounds: 'Раундов до победы',
    resume: 'Продолжить', toMenu: 'В меню', again: 'Ещё матч', back: 'Назад', paused: 'Пауза',
    sens: 'Чувствительность мыши', fov: 'Поле зрения', music: 'Музыка', sfx: 'Звуки', quality: 'Графика',
    q0: 'Низкая', q1: 'Средняя', q2: 'Высокая', rollCam: 'Вращение камеры при перекате', invertY: 'Инверсия по вертикали', name: 'Ник', lang: 'Язык',
    loading: 'Загрузка…', clickToPlay: 'Кликни, чтобы играть',
    round: 'РАУНД', take: 'Тейк', fight: 'В БОЙ!', youWinTake: 'Тейк твой', youLoseTake: 'Тейк проигран', draw: 'Ничья — тейк обоим',
    takeWonBy: 'Тейк забирает', roundWonBy: 'Раунд за', youWinRound: 'Раунд твой!', matchWon: 'ПОБЕДА', matchLost: 'ПОРАЖЕНИЕ', winner: 'Победитель',
    you: 'Ты', team: 'Команда', killedBy: 'Тебя убил', spectating: 'Наблюдение', fellVoid: 'сорвался в пропасть', selfKill: 'подорвал себя',
    hp: 'ОЗ', ammo: 'патроны', noWeapon: 'Найди оружие', altFire: 'ПКМ', pickup: 'F — подобрать', swap: 'F — взять', throwHint: 'G — бросить',
    tagHead: 'в голову', tagAir: 'в полёте', tagNoscope: 'без прицела', tagRic: 'рикошет', tagThrown: 'бросок', tagLunge: 'рывок', tagChain: 'цепь', tagBounce: 'отскок', tagVoid: 'в пропасть', tagSlide: 'в подкате', tagRoll: 'в перекате',
    kills: 'Убийства', deaths: 'Смерти', score: 'Счёт', map: 'Карта', mapOf: 'из',
    ctrlMove: 'WASD — движение', ctrlJump: 'Пробел — прыжок / отскок от стены в воздухе', ctrlSlide: 'C — присесть / подкат на бегу', ctrlRoll: 'Shift — перекат (в воздухе — нырок)',
    ctrlFire: 'ЛКМ — огонь (пустым оружием — бросок)', ctrlAlt: 'ПКМ — способность оружия', ctrlPick: 'F — подобрать / сменить оружие', ctrlThrow: 'G — бросить оружие (урон!)', ctrlLean: 'Q / E — выглянуть', ctrlTab: 'Tab — таблица, Esc — пауза',
    tips: ['Подкат после прыжка сохраняет скорость', 'Прыжок в воздухе у стены — отскок, до 3 раз', 'Нырок в воздухе переходит в перекат при приземлении', 'Брошенное оружие бьёт на 30 и оглушает', 'Гарпун в стену — притянет тебя, во врага — притянет его', 'Резонатором можно сбросить врага в пропасть', 'Перекат уменьшает силуэт — сложнее попасть', 'Ракета под ноги — высокий прыжок'],
    hintTouch: 'Левый стик — движение, правая половина — обзор',
    mobileFire: 'ОГОНЬ', mobileAlt: 'АЛЬТ', mobileJump: 'ПРЫЖОК', mobileSlide: 'ПОДКАТ', mobileRoll: 'ПЕРЕКАТ', mobilePick: 'ВЗЯТЬ', mobileThrow: 'БРОС',
    stats: 'Статистика', matches: 'Матчей', wins: 'Побед',
  },
  en: {
    title: 'PEREKAT', subtitle: 'arena shooter with seconds-long rounds',
    play1v1: '1 vs 1', play2v2: '2 vs 2', playFfa: 'Free for all', settings: 'Settings', controls: 'Controls',
    difficulty: 'Bot difficulty', diff0: 'Easy', diff1: 'Normal', diff2: 'Hard', rounds: 'Rounds to win',
    resume: 'Resume', toMenu: 'Main menu', again: 'Play again', back: 'Back', paused: 'Paused',
    sens: 'Mouse sensitivity', fov: 'Field of view', music: 'Music', sfx: 'Sound', quality: 'Graphics',
    q0: 'Low', q1: 'Medium', q2: 'High', rollCam: 'Camera spin on roll', invertY: 'Invert Y', name: 'Nickname', lang: 'Language',
    loading: 'Loading…', clickToPlay: 'Click to play',
    round: 'ROUND', take: 'Take', fight: 'FIGHT!', youWinTake: 'Take won', youLoseTake: 'Take lost', draw: 'Draw — both score',
    takeWonBy: 'Take goes to', roundWonBy: 'Round to', youWinRound: 'Round won!', matchWon: 'VICTORY', matchLost: 'DEFEAT', winner: 'Winner',
    you: 'You', team: 'Team', killedBy: 'Killed by', spectating: 'Spectating', fellVoid: 'fell into the void', selfKill: 'blew themselves up',
    hp: 'HP', ammo: 'ammo', noWeapon: 'Find a weapon', altFire: 'RMB', pickup: 'F — pick up', swap: 'F — swap', throwHint: 'G — throw',
    tagHead: 'headshot', tagAir: 'airborne', tagNoscope: 'no-scope', tagRic: 'ricochet', tagThrown: 'thrown', tagLunge: 'lunge', tagChain: 'chain', tagBounce: 'bounce', tagVoid: 'into the void', tagSlide: 'sliding', tagRoll: 'rolling',
    kills: 'Kills', deaths: 'Deaths', score: 'Score', map: 'Map', mapOf: 'of',
    ctrlMove: 'WASD — move', ctrlJump: 'Space — jump / wall bounce in the air', ctrlSlide: 'C — crouch / slide while running', ctrlRoll: 'Shift — roll (dive in the air)',
    ctrlFire: 'LMB — fire (empty gun gets thrown)', ctrlAlt: 'RMB — weapon ability', ctrlPick: 'F — pick up / swap', ctrlThrow: 'G — throw weapon (it hurts!)', ctrlLean: 'Q / E — lean', ctrlTab: 'Tab — scoreboard, Esc — pause',
    tips: ['Slide after a jump keeps your speed', 'Jump next to a wall mid-air to bounce, up to 3 times', 'A mid-air dive turns into a roll on landing', 'Thrown weapons deal 30 and stun', 'Harpoon a wall to fly to it, an enemy to yank them', 'The Resonator can push enemies into the void', 'Rolling shrinks your hitbox', 'Rocket at your feet for a big jump'],
    hintTouch: 'Left stick moves, right half looks',
    mobileFire: 'FIRE', mobileAlt: 'ALT', mobileJump: 'JUMP', mobileSlide: 'SLIDE', mobileRoll: 'ROLL', mobilePick: 'TAKE', mobileThrow: 'THROW',
    stats: 'Stats', matches: 'Matches', wins: 'Wins',
  },
};

let lang = 'ru';
export function setLang(l) { lang = STR[l] ? l : (['be', 'kk', 'uk', 'uz'].includes(l) ? 'ru' : 'en'); return lang; }
export function getLang() { return lang; }
export function t(key) { return STR[lang][key] ?? STR.en[key] ?? key; }
