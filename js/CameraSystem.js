'use strict';

/**
 * CameraSystem
 * ─────────────────────────────────────────────────────────────
 * Manages camera-mode open/close and camera switching.
 *
 * Audio change: separate sounds for raising vs lowering the tablet.
 *   camera_flip_up.mp3   — played when cameras open
 *   camera_flip_down.mp3 — played when cameras close
 */
class CameraSystem {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;
    this._flickerTimer = 0;
  }

  open() {
    if (this.state.cameraOpen || this.state.phase === 'POWER_OUT') return;
    this.state.cameraOpen = true;
    this.sound.play('camera_flip_up');
    EventBus.emit('cameraOpened');
  }

  close() {
    if (!this.state.cameraOpen) return;
    this.state.cameraOpen = false;
    this.sound.play('camera_flip_down');
    EventBus.emit('cameraClosed');
  }

  toggle() { this.state.cameraOpen ? this.close() : this.open(); }

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

  update(deltaTime) {
    if (!this.state.cameraOpen) return;
    this._flickerTimer += deltaTime;
    if (this._flickerTimer >= CONFIG.CAM_FLICKER_INTERVAL_MS) {
      this._flickerTimer = 0;
      EventBus.emit('cameraFlicker');
    }
  }

  isWatchingFreddy() {
    const pos  = this.state.animatronics.freddy.position;
    const cams = CONFIG.CAM_POSITIONS[this.state.activeCam] || [];
    return this.state.cameraOpen && cams.includes(pos);
  }

  isWatchingPirateCove() {
    return this.state.cameraOpen && this.state.activeCam === '1C';
  }

  getActiveLabel() {
    const def = CONFIG.CAMERAS.find(c => c.id === this.state.activeCam);
    return def ? `${def.label} - ${def.name}` : '';
  }
}