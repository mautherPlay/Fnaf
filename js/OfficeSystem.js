'use strict';

/**
 * OfficeSystem
 * ─────────────────────────────────────────────────────────────
 * Controls door open/close (video animation) and lights.
 * Doors are separate video overlays, NOT part of the scene image.
 *
 * Video format:
 *   0 s = open
 *   1 s = closed (pause here when closing)
 *   2 s = open   (pause here after opening)
 *
 * Filenames: assets/videos/door_left.mp4 / door_right.mp4
 */
class OfficeSystem {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;

    this._doorLeft  = null;  // <video> element, set in init()
    this._doorRight = null;
    this._raf       = {};    // rafId for each door animation
  }

  // ── Called once DOM is ready ─────────────────────────────────
  init() {
    this._doorLeft  = document.getElementById('door-left-video');
    this._doorRight = document.getElementById('door-right-video');

    this._initVideo(this._doorLeft,  'left');
    this._initVideo(this._doorRight, 'right');
  }

  _initVideo(vid, side) {
    if (!vid) return;
    vid.src      = `${CONFIG.ASSETS.VIDEOS}door_${side}.mp4`;
    vid.muted    = true;
    vid.preload  = 'auto';
    vid.currentTime = 0;
    vid.pause();
    vid.style.visibility = 'hidden';
  }

  // ── Toggle door ──────────────────────────────────────────────
  toggleDoor(side) {
    if (this.state.power <= 0) return; // Powerless — can't toggle
    const door = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    if (door === 'OPEN' || door === 'OPENING') {
      this.closeDoor(side);
    } else {
      this.openDoor(side);
    }
  }

  closeDoor(side) {
    const current = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    if (current === 'CLOSED' || current === 'CLOSING') return;

    this._setDoor(side, 'CLOSING');
    this.sound.play('door_close');

    const vid = side === 'left' ? this._doorLeft : this._doorRight;
    if (vid) {
      vid.style.visibility = 'visible';
      vid.currentTime = 0;
      vid.play().catch(() => {});
      this._animateTo(side, vid, CONFIG.DOOR_CLOSE_FRAME, 'CLOSED');
    } else {
      this._setDoor(side, 'CLOSED');
    }
    EventBus.emit('doorChanged', { side, state: 'CLOSING' });
  }

  openDoor(side) {
    const current = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    if (current === 'OPEN' || current === 'OPENING') return;

    this._setDoor(side, 'OPENING');
    this.sound.play('door_open');

    const vid = side === 'left' ? this._doorLeft : this._doorRight;
    if (vid) {
      vid.play().catch(() => {});
      this._animateTo(side, vid, CONFIG.DOOR_OPEN_FRAME, 'OPEN', () => {
        vid.style.visibility = 'hidden';
      });
    } else {
      this._setDoor(side, 'OPEN');
    }
    EventBus.emit('doorChanged', { side, state: 'OPENING' });
  }

  // ── Toggle light ─────────────────────────────────────────────
  toggleLight(side) {
    if (this.state.power <= 0) return;
    if (side === 'left') {
      this.state.leftLight = !this.state.leftLight;
      if (this.state.leftLight) this.sound.play('light_buzz');
    } else {
      this.state.rightLight = !this.state.rightLight;
      if (this.state.rightLight) this.sound.play('light_buzz');
    }
    EventBus.emit('lightChanged', { side, on: side === 'left' ? this.state.leftLight : this.state.rightLight });
  }

  // ── Private: animate video to a target time ──────────────────
  _animateTo(side, vid, targetTime, finalState, onDone) {
    // Cancel any in-flight animation for this side
    if (this._raf[side]) cancelAnimationFrame(this._raf[side]);

    const check = () => {
      if (vid.currentTime >= targetTime) {
        vid.pause();
        vid.currentTime = targetTime;
        this._setDoor(side, finalState);
        EventBus.emit('doorChanged', { side, state: finalState });
        if (onDone) onDone();
        this._raf[side] = null;
        return;
      }
      this._raf[side] = requestAnimationFrame(check);
    };
    this._raf[side] = requestAnimationFrame(check);
  }

  _setDoor(side, value) {
    if (side === 'left')  this.state.leftDoor  = value;
    else                  this.state.rightDoor = value;
  }

  // ── Power-out: force doors open (powerless) ──────────────────
  onPowerOut() {
    const vL = this._doorLeft;
    const vR = this._doorRight;
    if (vL) { vL.pause(); vL.style.visibility = 'hidden'; }
    if (vR) { vR.pause(); vR.style.visibility = 'hidden'; }
    this.state.leftDoor  = 'OPEN';
    this.state.rightDoor = 'OPEN';
    EventBus.emit('doorChanged', { side: 'left',  state: 'OPEN' });
    EventBus.emit('doorChanged', { side: 'right', state: 'OPEN' });
  }
}