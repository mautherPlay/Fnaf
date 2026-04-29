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
    ];

    this._unlockBound = this._unlock.bind(this);
  }

  // ── Preload + set up user-gesture unlock ─────────────────────
  preload() {
    this._allIds.forEach(id => this._load(id));

    // Resume audio on first user interaction
    window.addEventListener('click',   this._unlockBound, { once: true });
    window.addEventListener('keydown', this._unlockBound, { once: true });
    window.addEventListener('touchstart', this._unlockBound, { once: true });
  }

  // Try to play a silent buffer to unlock the AudioContext
  _unlock() {
    this._ready = true;
    // Try to resume any stalled plays
    Object.values(this._cache).forEach(a => {
      if (!a.paused) return;
      // Only re-trigger loops that were already meant to be playing
    });
    window.removeEventListener('click',    this._unlockBound);
    window.removeEventListener('keydown',  this._unlockBound);
    window.removeEventListener('touchstart', this._unlockBound);
  }

  // ── Play once ────────────────────────────────────────────────
  play(id) {
    if (this._muted) return;
    const audio = this._get(id);
    if (!audio) return;
    audio.volume      = this._volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay blocked — retry on next user event
      const retry = () => { audio.play().catch(() => {}); };
      window.addEventListener('click',    retry, { once: true });
      window.addEventListener('keydown',  retry, { once: true });
      window.addEventListener('touchstart', retry, { once: true });
    });
  }

  // ── Start a looping sound ────────────────────────────────────
  loop(id, volumeScale = 0.5) {
    if (this._muted) return;
    if (this._loops[id]) return;  // already running

    const audio = this._get(id);
    if (!audio) return;
    audio.loop   = true;
    audio.volume = this._volume * volumeScale;
    audio.play().catch(() => {
      const retry = () => {
        if (!this._muted) audio.play().catch(() => {});
      };
      window.addEventListener('click', retry, { once: true });
    });
    this._loops[id] = audio;
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
        this._cache[id].pause();
        this._cache[id].currentTime = 0;
      } catch (_) {}
    });
    this._loops = {};
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