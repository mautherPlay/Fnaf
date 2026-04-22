'use strict';

/**
 * OfficeSystem
 * ─────────────────────────────────────────────────────────────
 * Root cause of bug #1 (light not visible after door was closed):
 *
 *   The old _animateTo() used requestAnimationFrame to poll
 *   vid.currentTime until it reached targetTime. But if the
 *   video file is missing, vid.play() fails silently and
 *   currentTime never advances — the loop ran forever and
 *   vid.style.display = 'none' was never called.
 *   The door video stayed visible even after "opening",
 *   blocking the scene image and hiding the corridor light.
 *
 * Fix:
 *   1. _setDoor() is now the SINGLE owner of door state AND
 *      video display. State OPEN → display:none. Everything
 *      else → display:block.
 *   2. _animateTo() has a 3.5 s setTimeout fallback so the
 *      animation always completes regardless of video load.
 */
class OfficeSystem {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;

    this._doorLeft  = null;
    this._doorRight = null;
    this._raf     = { left: null, right: null };
    this._timeout = { left: null, right: null };
  }

  init() {
    this._doorLeft  = document.getElementById('door-left-video');
    this._doorRight = document.getElementById('door-right-video');
    this._initVideo(this._doorLeft,  'left');
    this._initVideo(this._doorRight, 'right');
  }

  _initVideo(vid, side) {
    if (!vid) return;
    vid.src         = `${CONFIG.ASSETS.VIDEOS}door_${side}.mp4`;
    vid.muted       = true;
    vid.preload     = 'auto';
    vid.currentTime = 0;
    vid.pause();
    vid.style.display = 'none';  // OPEN state = hidden
  }

  // ── Toggle door ──────────────────────────────────────────────
  toggleDoor(side) {
    if (this.state.power <= 0) return;
    const door = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    (door === 'OPEN' || door === 'OPENING') ? this.closeDoor(side) : this.openDoor(side);
  }

  closeDoor(side) {
    const cur = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    if (cur === 'CLOSED' || cur === 'CLOSING') return;

    this._setDoor(side, 'CLOSING');  // display:block
    this.sound.play('door_close');

    const vid = this._getVid(side);
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
      this._animateTo(side, vid, CONFIG.DOOR_CLOSE_FRAME, 'CLOSED');
    } else {
      this._setDoor(side, 'CLOSED');
    }
  }

  openDoor(side) {
    const cur = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    if (cur === 'OPEN' || cur === 'OPENING') return;

    this._setDoor(side, 'OPENING');  // display:block (still showing closed frame)
    this.sound.play('door_open');

    const vid = this._getVid(side);
    if (vid) {
      vid.play().catch(() => {});
      // When complete: _setDoor('OPEN') → display:none → corridor visible again
      this._animateTo(side, vid, CONFIG.DOOR_OPEN_FRAME, 'OPEN');
    } else {
      this._setDoor(side, 'OPEN');
    }
  }

  // ── Light (hold-to-activate) ─────────────────────────────────
  setLight(side, on) {
    if (this.state.power <= 0 && on) return;
    if (side === 'left') {
      if (this.state.leftLight === on) return;
      this.state.leftLight = on;
    } else {
      if (this.state.rightLight === on) return;
      this.state.rightLight = on;
    }
    if (on) this.sound.play('light_buzz');
    EventBus.emit('lightChanged', { side, on });
  }

  toggleLight(side) {
    const cur = side === 'left' ? this.state.leftLight : this.state.rightLight;
    this.setLight(side, !cur);
  }

  // ─────────────────────────────────────────────────────────────
  // _setDoor — SINGLE SOURCE OF TRUTH
  //
  //   state   | video display
  //   --------|---------------
  //   OPEN    |  none   ← scene visible, corridor / light shows through
  //   OPENING |  block  ← animation playing
  //   CLOSING |  block  ← animation playing
  //   CLOSED  |  block  ← frozen on closed frame
  // ─────────────────────────────────────────────────────────────
  _setDoor(side, value) {
    if (side === 'left')  this.state.leftDoor  = value;
    else                  this.state.rightDoor = value;

    const vid = this._getVid(side);
    if (vid) vid.style.display = (value === 'OPEN') ? 'none' : 'block';

    EventBus.emit('doorChanged', { side, state: value });
  }

  // ─────────────────────────────────────────────────────────────
  // _animateTo — always completes (timeout fallback for missing video)
  // ─────────────────────────────────────────────────────────────
  _animateTo(side, vid, targetTime, finalState) {
    // Cancel anything in flight for this side
    if (this._raf[side])     { cancelAnimationFrame(this._raf[side]);  this._raf[side]     = null; }
    if (this._timeout[side]) { clearTimeout(this._timeout[side]);       this._timeout[side] = null; }

    const complete = () => {
      if (this._raf[side])     { cancelAnimationFrame(this._raf[side]);  this._raf[side]     = null; }
      if (this._timeout[side]) { clearTimeout(this._timeout[side]);       this._timeout[side] = null; }
      vid.pause();
      // _setDoor handles both state update AND display:none/block
      this._setDoor(side, finalState);
    };

    // Fallback: if video never plays (missing file), force-complete after 3.5 s
    this._timeout[side] = setTimeout(complete, 1000);

    const check = () => {
      if (vid.currentTime >= targetTime) {
        complete();
        return;
      }
      this._raf[side] = requestAnimationFrame(check);
    };
    this._raf[side] = requestAnimationFrame(check);
  }

  _getVid(side) {
    return side === 'left' ? this._doorLeft : this._doorRight;
  }

  // ── Power-out: force both doors open immediately ──────────────
  onPowerOut() {
    ['left', 'right'].forEach(side => {
      if (this._raf[side])     { cancelAnimationFrame(this._raf[side]);  this._raf[side]     = null; }
      if (this._timeout[side]) { clearTimeout(this._timeout[side]);       this._timeout[side] = null; }
      const vid = this._getVid(side);
      if (vid) vid.pause();
      this._setDoor(side, 'OPEN');  // → display:none
    });
    this.state.leftLight  = false;
    this.state.rightLight = false;
  }
}