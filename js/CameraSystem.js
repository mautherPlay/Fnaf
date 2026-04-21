'use strict';

/**
 * CameraSystem
 * ─────────────────────────────────────────────────────────────
 * Manages camera-mode open/close and camera switching.
 * Emits 'cameraOpened', 'cameraClosed', 'cameraSwitched'.
 */
class CameraSystem {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;
    this._staticTimer   = 0;
    this._flickerTimer  = 0;
  }

  // ── Open/close cameras ───────────────────────────────────────
  open() {
    if (this.state.cameraOpen || this.state.phase === 'POWER_OUT') return;
    this.state.cameraOpen = true;
    this.sound.play('camera_flip');
    EventBus.emit('cameraOpened');
  }

  close() {
    if (!this.state.cameraOpen) return;
    this.state.cameraOpen = false;
    this.sound.play('camera_flip');
    EventBus.emit('cameraClosed');
  }

  toggle() {
    this.state.cameraOpen ? this.close() : this.open();
  }

  // ── Switch to a specific camera ──────────────────────────────
  switchTo(camId) {
    if (!this.state.cameraOpen) return;
    if (this.state.cameraTransitioning) return;
    if (this.state.activeCam === camId) return;

    this.state.cameraTransitioning = true;
    this.state.activeCam = camId;
    this.sound.play('camera_static');
    EventBus.emit('cameraStaticStart');

    setTimeout(() => {
      this.state.cameraTransitioning = false;
      EventBus.emit('cameraSwitched', camId);
    }, CONFIG.STATIC_DURATION_MS);
  }

  // ── Called each frame ────────────────────────────────────────
  update(deltaTime) {
    if (!this.state.cameraOpen) return;

    // Periodic CRT flicker
    this._flickerTimer += deltaTime;
    if (this._flickerTimer >= CONFIG.CAM_FLICKER_INTERVAL_MS) {
      this._flickerTimer = 0;
      EventBus.emit('cameraFlicker');
    }
  }

  // ── Query helpers ────────────────────────────────────────────
  isWatchingFreddy() {
    const pos = this.state.animatronics.freddy.position;
    const cams = CONFIG.CAM_POSITIONS[this.state.activeCam] || [];
    return this.state.cameraOpen && cams.includes(pos);
  }

  isWatchingPirateCove() {
    return this.state.cameraOpen && this.state.activeCam === '1C';
  }

  /** Camera label for current active cam */
  getActiveLabel() {
    const def = CONFIG.CAMERAS.find(c => c.id === this.state.activeCam);
    return def ? `${def.label} - ${def.name}` : '';
  }
}