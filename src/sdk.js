// Thin wrapper over the Yandex Games SDK that degrades to no-ops when the
// game runs outside Yandex (local dev, other hosts).
let ysdk = null;
let gameplayOn = false;
const handlers = { pause: [], resume: [] };

function loadScript(src, timeout) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    s.onload = () => { clearTimeout(t); resolve(); };
    s.onerror = () => { clearTimeout(t); reject(new Error('load error')); };
    document.head.appendChild(s);
  });
}

export const SDK = {
  async init() {
    try {
      if (!window.YaGames) await loadScript('/sdk.js', 4000);
      if (window.YaGames) {
        ysdk = await window.YaGames.init();
        ysdk.on?.('game_api_pause', () => handlers.pause.forEach((h) => h()));
        ysdk.on?.('game_api_resume', () => handlers.resume.forEach((h) => h()));
      }
    } catch (e) {
      ysdk = null;
    }
    return !!ysdk;
  },
  get available() { return !!ysdk; },
  lang() {
    const l = ysdk?.environment?.i18n?.lang || navigator.language || 'ru';
    return l.slice(0, 2).toLowerCase();
  },
  isMobile() {
    try { if (ysdk?.deviceInfo) return ysdk.deviceInfo.isMobile() || ysdk.deviceInfo.isTablet(); } catch (e) { /* ignore */ }
    return matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
  },
  ready() { try { ysdk?.features?.LoadingAPI?.ready(); } catch (e) { /* ignore */ } },
  gameplayStart() {
    if (gameplayOn) return;
    gameplayOn = true;
    try { ysdk?.features?.GameplayAPI?.start(); } catch (e) { /* ignore */ }
  },
  gameplayStop() {
    if (!gameplayOn) return;
    gameplayOn = false;
    try { ysdk?.features?.GameplayAPI?.stop(); } catch (e) { /* ignore */ }
  },
  onPause(h) { handlers.pause.push(h); },
  onResume(h) { handlers.resume.push(h); },
  // Resolves after the ad closes (or immediately without the SDK).
  showFullscreenAd(onOpen, onClose) {
    return new Promise((resolve) => {
      if (!ysdk) { resolve(false); return; }
      let opened = false;
      try {
        ysdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => { opened = true; onOpen?.(); },
            onClose: (wasShown) => { onClose?.(); resolve(!!wasShown); },
            onError: () => { if (opened) onClose?.(); resolve(false); },
            onOffline: () => { resolve(false); },
          },
        });
      } catch (e) { resolve(false); }
    });
  },
};
