'use strict';

/**
 * OfficeSystem
 * ─────────────────────────────────────────────────────────────
 * Doors + lights.
 *
 * Blind-spot sound fix (bug 1.1):
 *   blind_spot_hit plays at most ONCE per animatronic visit to the
 *   blind spot.  We track _blindSpotAlerted per side and reset it
 *   when the animatronic leaves (detected via EventBus 'animatronicMoved').
 *
 * Spotted countdown:
 *   When light turns ON and animatronic is present, we call
 *   animAI.startSpottedCountdown(side) so the animatronic will
 *   eventually retreat if the door wasn't closed.
 */
class OfficeSystem {
  constructor(state, soundSystem, animAI) {
    this.state  = state;
    this.sound  = soundSystem;
    this.animAI = animAI;   // injected by main.js

    this._doorLeft  = null;
    this._doorRight = null;
    this._raf     = { left:null, right:null };
    this._timeout = { left:null, right:null };

    // Track whether blind_spot_hit has already played for current visit
    this._blindSpotAlerted = { left: false, right: false };

    EventBus.on('foxyDoorHit', () => this.sound.play('foxy_door_hit'));

    // Reset alert flag when animatronic leaves blind spot
    EventBus.on('animatronicMoved', ({ name, from }) => {
      if (from === 'LEFT_BLIND_SPOT')  this._blindSpotAlerted.left  = false;
      if (from === 'RIGHT_BLIND_SPOT') this._blindSpotAlerted.right = false;
    });
  }

  init() {
    this._doorLeft  = document.getElementById('door-left-video');
    this._doorRight = document.getElementById('door-right-video');
    this._initVideo(this._doorLeft,  'left');
    this._initVideo(this._doorRight, 'right');
  }

  _initVideo(vid, side) {
    if (!vid) return;
    vid.src = `${CONFIG.ASSETS.VIDEOS}door_${side}.mp4`;
    vid.muted = true; vid.preload = 'auto';
    vid.currentTime = 0; vid.pause();
    vid.style.display = 'none';
  }

  // ── Door ─────────────────────────────────────────────────────
  toggleDoor(side) {
    if (this.state.power <= 0) { this.sound.play('error_buzz'); return; }
    const door = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    (door === 'OPEN' || door === 'OPENING') ? this.closeDoor(side) : this.openDoor(side);
  }

  closeDoor(side) {
    const cur = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    if (cur === 'CLOSED' || cur === 'CLOSING') return;
    this._setDoor(side, 'CLOSING');
    this.sound.play('door_close');
    const vid = this._getVid(side);
    if (vid) { vid.currentTime = 0; vid.play().catch(()=>{}); this._animateTo(side, vid, CONFIG.DOOR_CLOSE_FRAME, 'CLOSED'); }
    else this._setDoor(side, 'CLOSED');
  }

  openDoor(side) {
    const cur = side === 'left' ? this.state.leftDoor : this.state.rightDoor;
    if (cur === 'OPEN' || cur === 'OPENING') return;
    this._setDoor(side, 'OPENING');
    this.sound.play('door_open');
    const vid = this._getVid(side);
    if (vid) { vid.play().catch(()=>{}); this._animateTo(side, vid, CONFIG.DOOR_OPEN_FRAME, 'OPEN'); }
    else this._setDoor(side, 'OPEN');
  }

  // ── Light (hold-to-activate) ─────────────────────────────────
  setLight(side, on) {
    if (this.state.power <= 0) { if (on) this.sound.play('error_buzz'); return; }

    const cur = side === 'left' ? this.state.leftLight : this.state.rightLight;
    if (cur === on) return;

    if (side === 'left') this.state.leftLight  = on;
    else                 this.state.rightLight = on;

    if (on) {
      this.sound.play('light_buzz');
      this.sound.startLightHum();
      this._checkBlindSpotSound(side);
      // Start spotted countdown in AI
      if (this.animAI) this.animAI.startSpottedCountdown(side);
    } else {
      this.sound.stopLightHum();
      // Cancel spotted countdown — player stopped looking
      if (this.animAI) this.animAI.cancelSpotted(side);
    }

    EventBus.emit('lightChanged', { side, on });
  }

  _checkBlindSpotSound(side) {
    if (this._blindSpotAlerted[side]) return;  // already played for this visit

    const a = this.state.animatronics;
    const hit = side === 'left'
      ? a.bonnie.position === 'LEFT_BLIND_SPOT'
      : a.chica.position  === 'RIGHT_BLIND_SPOT';

    if (hit) {
      this.sound.play('blind_spot_hit');
      this._blindSpotAlerted[side] = true;  // lock until they leave and return
    }
  }

  toggleLight(side) {
    const cur = side === 'left' ? this.state.leftLight : this.state.rightLight;
    this.setLight(side, !cur);
  }

  // ── _setDoor: single source of truth ─────────────────────────
  _setDoor(side, value) {
    if (side === 'left')  this.state.leftDoor  = value;
    else                  this.state.rightDoor = value;
    const vid = this._getVid(side);
    if (vid) vid.style.display = (value === 'OPEN') ? 'none' : 'block';
    EventBus.emit('doorChanged', { side, state: value });
  }

  _animateTo(side, vid, targetTime, finalState) {
    if (this._raf[side])     { cancelAnimationFrame(this._raf[side]);  this._raf[side]     = null; }
    if (this._timeout[side]) { clearTimeout(this._timeout[side]);       this._timeout[side] = null; }

    const complete = () => {
      if (this._raf[side])     { cancelAnimationFrame(this._raf[side]);  this._raf[side]     = null; }
      if (this._timeout[side]) { clearTimeout(this._timeout[side]);       this._timeout[side] = null; }
      vid.pause();
      this._setDoor(side, finalState);
    };

    this._timeout[side] = setTimeout(complete, 3_500);
    const check = () => {
      if (vid.currentTime >= targetTime) { complete(); return; }
      this._raf[side] = requestAnimationFrame(check);
    };
    this._raf[side] = requestAnimationFrame(check);
  }

  _getVid(side) { return side === 'left' ? this._doorLeft : this._doorRight; }

  onPowerOut() {
    ['left','right'].forEach(side => {
      if (this._raf[side])     { cancelAnimationFrame(this._raf[side]);  this._raf[side]     = null; }
      if (this._timeout[side]) { clearTimeout(this._timeout[side]);       this._timeout[side] = null; }
      const vid = this._getVid(side);
      if (vid) vid.pause();
      this._setDoor(side, 'OPEN');
    });
    this.state.leftLight  = false;
    this.state.rightLight = false;
    this.sound.stopLightHum();
  }
}