'use strict';

/**
 * SoundSystem
 * ─────────────────────────────────────────────────────────────
 * Root cause of "no sound": browsers block audio until the user
 * has interacted with the page (Web Audio / HTMLAudioElement both
 * require a user gesture before the first .play() call succeeds).
 *
 * Fix: we create an AudioContext and resume it on the first click
 * or keydown, then all subsequent play() calls work normally.
 *
 * New sounds added:
 *   camera_flip_up.mp3       tablet raised (open cameras)
 *   camera_flip_down.mp3     tablet lowered (close cameras)
 *   error_buzz.mp3           door/light pressed while no power
 *   light_hum.mp3            continuous hum while blind-spot light held
 *   blind_spot_hit.mp3       animatronic present when light turns on
 *   foxy_door_hit.mp3        Foxy hitting the closed left door
 *   phone_guy_night4.mp3     Phone Guy — Night 4
 */
class SoundSystem {
  constructor() {
    this._cache  = {};   // id → HTMLAudioElement
    this._loops  = {};   // id → HTMLAudioElement (currently looping)
    this._muted  = false;
    this._volume = 1.0;
    this._ready  = false;  // true after first user gesture

    // All sound file IDs the game uses
    this._allIds = [
      'ambience',
      'camera_flip_up',    // NEW: tablet raised
      'camera_flip_down',  // NEW: tablet lowered
      'camera_static',
      'door_close',
      'door_open',
      'light_hum',         // NEW: continuous hum while light held
      'blind_spot_hit',    // NEW: animatronic visible under light
      'error_buzz',        // NEW: door/light disabled (no power)
      'jumpscare',
      'foxy_run',
      'foxy_door_hit',     // NEW: Foxy knocks closed door
      'freddy_laugh',
      'toreador',
      'power_down',
      '6am',
      'phone_guy_night1',
      'phone_guy_night2',
      'phone_guy_night3',
      'phone_guy_night4',  // NEW
      'kitchen_chica'
    ];

    this._unlockBound = this._unlock.bind(this);
  }

  // ── Preload + set up user-gesture unlock ─────────────────────
  preload() {
    this._allIds.forEach(id => this._load(id));

    // Настройка разблокировки звука
    window.addEventListener('click', this._unlockBound, { once: true });
    window.addEventListener('keydown', this._unlockBound, { once: true });
    window.addEventListener('touchstart', this._unlockBound, { once: true });
  }

  // Внутренний метод загрузки (проверьте, есть ли он у вас, если нет — добавьте)
  _load(id) {
    const audio = new Audio(`assets/sounds/${id}.mp3`);
    audio.preload = 'auto'; // Важно для GitHub Pages
    this._cache[id] = audio;
  }

  _unlock() {
    this._ready = true;
    console.log("SoundSystem: Audio unlocked");
    
    // Попытка возобновить заблокированные цикличные звуки
    Object.keys(this._loops).forEach(id => {
      const audio = this._loops[id];
      if (audio.paused) {
        audio.play().catch(() => {});
      }
    });

    window.removeEventListener('click', this._unlockBound);
    window.removeEventListener('keydown', this._unlockBound);
    window.removeEventListener('touchstart', this._unlockBound);
  }

  // ── Play once ────────────────────────────────────────────────
  play(id) {
    if (this._muted) return;
    const audio = this._get(id);
    if (!audio) return;

    // КРИТИЧЕСКИЙ ИСПРАВЛЕНИЕ: Останавливаем старую попытку перед новой
    audio.pause();
    audio.currentTime = 0;
    audio.volume = this._volume;

    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch(error => {
        // Ошибка "NotAllowedError" — ждем клика. Остальные — проблемы сети/формата.
        if (error.name === 'NotAllowedError') {
          const retry = () => { audio.play().catch(() => {}); };
          window.addEventListener('click', retry, { once: true });
          window.addEventListener('touchstart', retry, { once: true });
        } else {
          console.warn(`SoundSystem: Playback failed for [${id}]:`, error.message);
        }
      });
    }
  }

  // ── Start a looping sound ────────────────────────────────────
  loop(id, volumeScale = 0.5) {
    if (this._muted) return;
    if (this._loops[id]) return; 

    const audio = this._get(id);
    if (!audio) return;

    audio.loop = true;
    audio.volume = this._volume * volumeScale;

    this._loops[id] = audio;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        const retry = () => { 
          if (!this._muted && this._loops[id]) audio.play().catch(() => {}); 
        };
        window.addEventListener('click', retry, { once: true });
        window.addEventListener('touchstart', retry, { once: true });
      });
    }
  }

  // ── Stop a specific sound ────────────────────────────────────
  stop(id) {
    const audio = this._cache[id];
    if (!audio) return;
    
    audio.pause();
    audio.currentTime = 0;
    delete this._loops[id];
  }

  // ── Stop everything ──────────────────────────────────────────
  stopAll() {
    Object.keys(this._cache).forEach(id => {
      try {
        const audio = this._cache[id];
        audio.pause();
        audio.currentTime = 0;
        audio.loop = false; // Сбрасываем флаг цикла
      } catch (e) {
        console.error("Error stopping sound:", id, e);
      }
    });
    this._loops = {};
  }
  _get(id) {
    return this._cache[id];
  }

  // ── Ambience helpers ─────────────────────────────────────────
  pauseAmbience()  { this.stop('ambience'); }
  resumeAmbience() { this.loop('ambience', 0.4); }

  // ── Light hum (while button held) ────────────────────────────
  startLightHum()  { this.loop('light_hum', 0.6); }
  stopLightHum()   { this.stop('light_hum'); }

  // ── Volume ───────────────────────────────────────────────────
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    Object.values(this._cache).forEach(a => {
      // Keep loop volumes scaled
      a.volume = this._volume;
    });
  }
  setMuted(m) { this._muted = m; if (m) this.stopAll(); }

  // ── Private ──────────────────────────────────────────────────
  _get(id) {
    if (!this._cache[id]) this._load(id);
    return this._cache[id] || null;
  }

  _load(id) {
    const audio   = new Audio();
    audio.src     = `${CONFIG.ASSETS.SOUNDS}${id}.mp3`;
    audio.preload = 'auto';
    audio.addEventListener('error', () => {
      // File missing — remove from cache so play() is a no-op
      delete this._cache[id];
    });
    this._cache[id] = audio;
    return audio;
  }
}