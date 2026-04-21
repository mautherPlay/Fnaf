'use strict';

/**
 * SoundSystem
 * ─────────────────────────────────────────────────────────────
 * Loads and plays audio.  All files sit in CONFIG.ASSETS.SOUNDS.
 * Missing files fail silently so the game is still playable
 * without audio assets.
 *
 * Expected filenames:
 *   ambience.mp3          background hum
 *   camera_flip.mp3       open/close tablet
 *   camera_static.mp3     cam-switch static burst
 *   door_close.mp3
 *   door_open.mp3
 *   light_buzz.mp3
 *   jumpscare.mp3         generic scream (plays for all jumpscares)
 *   foxy_run.mp3
 *   freddy_laugh.mp3
 *   toreador.mp3          Toreador March (power-out)
 *   power_down.mp3
 *   6am.mp3
 *   phone_guy_night1.mp3
 *   phone_guy_night2.mp3
 *   phone_guy_night3.mp3
 *   blip.mp3              UI button click
 */
class SoundSystem {
  constructor() {
    this._cache   = {};    // id → Audio element
    this._loops   = {};    // id → Audio element (looping)
    this._muted   = false;
    this._volume  = 1.0;

    this._toPreload = [
      'ambience','camera_flip','camera_static',
      'door_close','door_open','light_buzz',
      'jumpscare','foxy_run','freddy_laugh',
      'toreador','power_down','6am',
      'phone_guy_night1','phone_guy_night2','phone_guy_night3',
      'blip',
    ];
  }

  // ── Pre-load all sounds ───────────────────────────────────────
  preload() {
    this._toPreload.forEach(id => this._load(id));
  }

  // ── Play a sound once ─────────────────────────────────────────
  play(id) {
    if (this._muted) return;
    const audio = this._get(id);
    if (!audio) return;
    audio.volume  = this._volume;
    audio.currentTime = 0;
    audio.play().catch(() => {}); // ignore AbortError when quickly stopped
  }

  // ── Start looping ambience ────────────────────────────────────
  loop(id) {
    if (this._muted) return;
    if (this._loops[id]) return; // already looping

    const audio = this._get(id);
    if (!audio) return;
    audio.loop    = true;
    audio.volume  = this._volume * 0.5;
    audio.play().catch(() => {});
    this._loops[id] = audio;
  }

  // ── Stop a specific sound/loop ────────────────────────────────
  stop(id) {
    const audio = this._cache[id];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    delete this._loops[id];
  }

  // ── Stop everything ───────────────────────────────────────────
  stopAll() {
    Object.keys(this._cache).forEach(id => {
      try {
        this._cache[id].pause();
        this._cache[id].currentTime = 0;
      } catch (e) {}
    });
    this._loops = {};
  }

  // ── Pause/resume ambience (on camera open) ────────────────────
  pauseAmbience()  { this.stop('ambience'); }
  resumeAmbience() { this.loop('ambience'); }

  // ── Volume ────────────────────────────────────────────────────
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    Object.values(this._cache).forEach(a => a.volume = this._volume);
  }

  setMuted(m) { this._muted = m; if (m) this.stopAll(); }

  // ── Private ───────────────────────────────────────────────────
  _get(id) {
    if (!this._cache[id]) this._load(id);
    return this._cache[id] || null;
  }

  _load(id) {
    const audio = new Audio();
    audio.src = `${CONFIG.ASSETS.SOUNDS}${id}.mp3`;
    audio.preload = 'auto';
    // Fail silently if file is missing
    audio.addEventListener('error', () => {
      // console.warn(`SoundSystem: missing ${id}.mp3`);
    });
    this._cache[id] = audio;
    return audio;
  }
}