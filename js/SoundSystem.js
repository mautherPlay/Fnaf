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
 * Added: fadeOut(id, durationMs, onComplete)
 *   Smoothly reduces volume to 0 over durationMs, then stops the
 *   audio and resets its volume for the next play() call.
 *   Used by PowerSystem to fade the Toreador March.
 */
class SoundSystem {
  constructor() {
    this._cache  = {};
    this._loops  = {};
    this._muted  = false;
    this._volume = 1.0;
    this._ready  = false;

    this._allIds = [
      'ambience',
      'camera_flip_up',
      'camera_flip_down',
      'camera_static',
      'door_close',
      'door_open',
      'light_hum',
      'blind_spot_hit',
      'error_buzz',
      'jumpscare',
      'foxy_run',
      'foxy_door_hit',
      'freddy_laugh',
      'toreador',
      'power_down',
      '6am',
      'phone_guy_night1',
      'phone_guy_night2',
      'phone_guy_night3',
      'phone_guy_night4',
      'kitchen_chica',
    ];

    this._unlockBound = this._unlock.bind(this);
  }

  // ── Preload ───────────────────────────────────────────────────
  preload() {
    this._allIds.forEach(id => this._load(id));
    window.addEventListener('click',      this._unlockBound, { once: true });
    window.addEventListener('keydown',    this._unlockBound, { once: true });
    window.addEventListener('touchstart', this._unlockBound, { once: true });
  }

  _unlock() {
    this._ready = true;
    Object.keys(this._loops).forEach(id => {
      const audio = this._loops[id];
      if (audio.paused) audio.play().catch(() => {});
    });
    window.removeEventListener('click',      this._unlockBound);
    window.removeEventListener('keydown',    this._unlockBound);
    window.removeEventListener('touchstart', this._unlockBound);
  }

  // ── Play once ────────────────────────────────────────────────
  play(id) {
    if (this._muted) return;
    const audio = this._get(id);
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    audio.volume = this._volume;

    const p = audio.play();
    if (p !== undefined) {
      p.catch(error => {
        if (error.name === 'NotAllowedError') {
          const retry = () => { audio.play().catch(() => {}); };
          window.addEventListener('click',      retry, { once: true });
          window.addEventListener('touchstart', retry, { once: true });
        } else {
          console.warn(`SoundSystem: [${id}]:`, error.message);
        }
      });
    }
  }

  // ── Fade out ──────────────────────────────────────────────────
  /**
   * Gradually reduces the volume of a playing sound to 0 over
   * durationMs milliseconds, then stops it and resets its volume
   * so the next play() call starts at full volume.
   *
   * @param {string}   id          Sound ID (same as used in play())
   * @param {number}   durationMs  Fade duration in milliseconds
   * @param {Function} onComplete  Called after fade finishes (optional)
   */
  fadeOut(id, durationMs = 2000, onComplete = null) {
    const audio = this._cache[id];
    if (!audio || audio.paused) {
      if (onComplete) onComplete();
      return;
    }

    const STEPS     = 30;
    const stepTime  = durationMs / STEPS;
    const startVol  = audio.volume;
    const stepSize  = startVol / STEPS;
    let   step      = 0;

    const tick = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol - stepSize * step);

      if (step >= STEPS) {
        clearInterval(tick);
        audio.pause();
        audio.currentTime = 0;
        audio.volume      = this._volume; // restore for next play()
        if (onComplete) onComplete();
      }
    }, stepTime);
  }

  // ── Loop ─────────────────────────────────────────────────────
  loop(id, volumeScale = 0.5) {
    if (this._muted) return;
    if (this._loops[id]) return;

    const audio = this._get(id);
    if (!audio) return;

    audio.loop   = true;
    audio.volume = this._volume * volumeScale;
    this._loops[id] = audio;

    const p = audio.play();
    if (p !== undefined) {
      p.catch(() => {
        const retry = () => {
          if (!this._muted && this._loops[id]) audio.play().catch(() => {});
        };
        window.addEventListener('click',      retry, { once: true });
        window.addEventListener('touchstart', retry, { once: true });
      });
    }
  }

  // ── Stop one ─────────────────────────────────────────────────
  stop(id) {
    const audio = this._cache[id];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    delete this._loops[id];
  }

  // ── Stop all ─────────────────────────────────────────────────
  stopAll() {
    Object.keys(this._cache).forEach(id => {
      try {
        const audio = this._cache[id];
        audio.pause();
        audio.currentTime = 0;
        audio.loop   = false;
        audio.volume = this._volume; // reset volume in case fadeOut was interrupted
      } catch (e) {
        console.error('Error stopping sound:', id, e);
      }
    });
    this._loops = {};
  }

  // ── Ambience helpers ─────────────────────────────────────────
  pauseAmbience()  { this.stop('ambience'); }
  resumeAmbience() { this.loop('ambience', 0.4); }

  // ── Light hum ────────────────────────────────────────────────
  startLightHum() { this.loop('light_hum', 0.6); }
  stopLightHum()  { this.stop('light_hum'); }

  // ── Volume ───────────────────────────────────────────────────
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    Object.values(this._cache).forEach(a => { a.volume = this._volume; });
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
    audio.addEventListener('error', () => { delete this._cache[id]; });
    this._cache[id] = audio;
    return audio;
  }
}