const STR = {
  ru: {
    title: 'ПЕРЕКАТ', subtitle: 'дуэли на маленьких аренах',
    play1v1: '1 на 1', play2v2: '2 на 2', playFfa: 'Каждый сам за себя', settings: 'Настройки', controls: 'Управление',
    difficulty: 'Боты', diff0: 'Лёгкие', diff1: 'Нормальные', diff2: 'Жёсткие', rounds: 'Раундов до победы',
    resume: 'Продолжить', toMenu: 'В меню', again: 'Реванш', back: 'Назад', paused: 'Пауза',
    sens: 'Чувствительность', fov: 'Поле зрения', music: 'Музыка', sfx: 'Звуки', quality: 'Графика',
    q0: 'Низкая', q1: 'Средняя', q2: 'Высокая', invertY: 'Инверсия по вертикали', autoSprint: 'Бег по умолчанию (Shift — шаг)', speedo: 'Спидометр', name: 'Ник',
    clickToPlay: 'Кликни, чтобы играть', loading: 'Загрузка',
    round: 'Раунд', take: 'Тейк', fight: 'Вперёд', draw: 'Ничья — тейк обоим',
    wonTake: 'выиграл тейк', wonTakePl: 'выиграли тейк', wonRound: 'забирает раунд', wonRoundPl: 'забирают раунд',
    victory: 'Победа', defeat: 'Поражение', wonRounds: 'раундов',
    you: 'Ты', team: 'Команда',
    kfKilled: 'убит из', kfHead: 'получил пулю в голову из', kfThrown: 'сбит брошенным', kfBy: '—', kfVoid: 'упал в пустоту', kfPushed: 'сброшен в пустоту —', kfSelf: 'погиб от своего', kfNoscope: 'без прицела', kfLunge: 'выпадом', kfAir: 'в полёте', kfSlide: 'в слайде',
    killedBy: 'Тебя убил', hintEmpty: 'Пусто — ЛКМ, чтобы бросить',
    kills: 'Убийства', deaths: 'Смерти', score: 'Раунды', map: 'Карта',
    ctrl: [
      ['WASD', 'движение'], ['Shift', 'спринт'], ['Пробел', 'прыжок · у стены — отскок · с разбега вдоль стены — бег по стене'],
      ['C / Ctrl', 'присесть · на бегу — слайд (раз в 2 с)'], ['Слайд + Пробел', 'слайд-джамп (ещё рывок)'], ['Пробел + W у уступа', 'подтянуться'],
      ['ЛКМ', 'огонь правой рукой'], ['ПКМ', 'левая рука · прицел · выпад клинком (ПКМ+ЛКМ)'], ['F', 'подобрать / выбросить'], ['G', 'швырнуть оружие'],
      ['Q / E', 'выглянуть'], ['Tab', 'таблица'], ['Esc', 'пауза'],
    ],
    tips: ['Прыгай сразу при приземлении — скорость сохранится', 'Слайд со спринта сильнее, чем с шага', 'Слайд под горку только разгоняется', 'Одноручное оружие можно взять в обе руки', 'Пустое оружие — тоже оружие: швырни его', 'Снайперка без прицела убивает так же', 'Клинок даёт три отскока от стен'],
    stats: 'Статистика', matches: 'Матчей', wins: 'Побед',
    nowPlaying: 'Сейчас играет', inGameMusic: 'Музыка в игре',
    mobileFire: 'ОГОНЬ', mobileAlt: 'ЛЕВ', mobileJump: 'ПРЫЖОК', mobileSlide: 'СЛАЙД', mobileSprint: 'БЕГ', mobilePick: 'ВЗЯТЬ', mobileThrow: 'БРОС',
  },
  en: {
    title: 'PEREKAT', subtitle: 'duels in tiny arenas',
    play1v1: '1 vs 1', play2v2: '2 vs 2', playFfa: 'Free for all', settings: 'Settings', controls: 'Controls',
    difficulty: 'Bots', diff0: 'Easy', diff1: 'Normal', diff2: 'Hard', rounds: 'Rounds to win',
    resume: 'Resume', toMenu: 'Main menu', again: 'Rematch', back: 'Back', paused: 'Paused',
    sens: 'Sensitivity', fov: 'Field of view', music: 'Music', sfx: 'Sound', quality: 'Graphics',
    q0: 'Low', q1: 'Medium', q2: 'High', invertY: 'Invert Y', autoSprint: 'Run by default (Shift walks)', speedo: 'Speedometer', name: 'Nickname',
    clickToPlay: 'Click to play', loading: 'Loading',
    round: 'Round', take: 'Take', fight: 'Go', draw: 'Draw — both score',
    wonTake: 'won the take', wonTakePl: 'won the take', wonRound: 'takes the round', wonRoundPl: 'take the round',
    victory: 'Victory', defeat: 'Defeat', wonRounds: 'rounds',
    you: 'You', team: 'Team',
    kfKilled: 'was killed with', kfHead: 'was headshot with', kfThrown: 'was hit by a thrown', kfBy: 'by', kfVoid: 'fell into the void', kfPushed: 'was pushed into the void by', kfSelf: 'died to their own', kfNoscope: 'no-scope', kfLunge: 'lunge', kfAir: 'mid-air', kfSlide: 'sliding',
    killedBy: 'Killed by', hintEmpty: 'Empty — LMB to throw it',
    kills: 'Kills', deaths: 'Deaths', score: 'Rounds', map: 'Map',
    ctrl: [
      ['WASD', 'move'], ['Shift', 'sprint'], ['Space', 'jump · near a wall — wall jump · run along a wall — wall run'],
      ['C / Ctrl', 'crouch · while running — slide (every 2 s)'], ['Slide + Space', 'slide jump'], ['Space + W at a ledge', 'mantle'],
      ['LMB', 'fire right hand'], ['RMB', 'left hand · aim · blade lunge (RMB+LMB)'], ['F', 'pick up / drop'], ['G', 'throw weapon'],
      ['Q / E', 'lean'], ['Tab', 'scoreboard'], ['Esc', 'pause'],
    ],
    tips: ['Jump right as you land to keep your speed', 'Sprint slides are stronger than walk slides', 'Slides only speed up downhill', 'One-handed guns can be dual-wielded', 'An empty gun is still a weapon: throw it', 'The sniper kills without scoping too', 'The blade grants three wall jumps'],
    stats: 'Stats', matches: 'Matches', wins: 'Wins',
    nowPlaying: 'Now playing', inGameMusic: 'In-game music',
    mobileFire: 'FIRE', mobileAlt: 'LEFT', mobileJump: 'JUMP', mobileSlide: 'SLIDE', mobileSprint: 'RUN', mobilePick: 'TAKE', mobileThrow: 'THROW',
  },
};

let lang = 'ru';
export function setLang(l) { lang = STR[l] ? l : (['be', 'kk', 'uk', 'uz'].includes(l) ? 'ru' : 'en'); return lang; }
export function getLang() { return lang; }
export function t(key) { return STR[lang][key] ?? STR.en[key] ?? key; }
