const KEY = 'perekat_settings_v1';
const DEFAULTS = {
  name: '', sens: 1.0, fov: 95, music: 0.5, sfx: 0.8, quality: 1, rollCam: true, difficulty: 1, rounds: 4, invertY: false,
};

export const settings = { ...DEFAULTS };

export function loadSettings() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  return settings;
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

const SKEY = 'perekat_stats_v1';
export const stats = { kills: 0, deaths: 0, wins: 0, matches: 0 };
export function loadStats() { try { Object.assign(stats, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) { /* ignore */ } return stats; }
export function saveStats() { try { localStorage.setItem(SKEY, JSON.stringify(stats)); } catch (e) { /* ignore */ } }
