'use strict';

/**
 * GameState — single source of truth.
 */
class GameState {
  constructor() { this._init(); }

  _init() {
    this.phase = 'MENU';
    this.night = 1;
    this.hour  = 0;
    this.power = 100;

    this.leftDoor  = 'OPEN';
    this.rightDoor = 'OPEN';
    this.leftLight  = false;
    this.rightLight = false;

    this.cameraOpen          = false;
    this.activeCam           = '1A';
    this.cameraTransitioning = false;

    this.panTarget  = 0.5;
    this.panCurrent = 0.5;
    this.panSpeed   = 0; // Добавляем: текущая скорость поворота

    this.animatronics = {
      freddy: this._makeAnim('STAGE', false),
      bonnie: this._makeAnim('STAGE', true),
      chica:  this._makeAnim('STAGE', true),
      foxy:   this._makeFoxy(),
    };

    this.jumpscareTarget = null;
    this.caughtBy        = '';
    this.powerOutPhase   = 0;
    this.nightRunning    = false;
  }

  _makeAnim(startPos, active) {
    return {
      position:     startPos,
      active,
      aiLevel:      0,
      routeIndex:   0,
      facingCamera: false,
    };
  }

  _makeFoxy() {
    return {
      position:      'PIRATE_COVE',
      active:        true,
      aiLevel:       0,
      // Phase curtain state (0–3)
      phase:         0,
      phaseTimer:    0,    // accumulated "ready-time" in seconds
      // Run state
      running:       false,
      runTimer:      0,
      // New: waiting to run while cameras are open
      waitingToRun:  false,
      // New: peek video already shown for this run cycle
      peekShown:     false,
    };
  }

  setPhase(p) {
    if (this.phase === p) return;
    this.phase = p;
    EventBus.emit('phaseChange', p);
  }

  isPlaying() {
    return this.phase === 'OFFICE' || this.phase === 'CAMERA';
  }

  isDoorClosed(side) {
    const d = side === 'left' ? this.leftDoor : this.rightDoor;
    return d === 'CLOSED' || d === 'CLOSING';
  }

  reset(night) {
    const n = night || this.night;
    this._init();
    this.night = n;
  }
}