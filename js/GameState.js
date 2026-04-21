'use strict';

/**
 * GameState — single source of truth for the entire game.
 * No logic here; only data + helpers.
 */
class GameState {
  constructor() {
    this._init();
  }

  _init() {
    // ── Meta ────────────────────────────────────────────────────
    this.phase = 'MENU';
    // Phases: MENU | NIGHT_INTRO | OFFICE | CAMERA |
    //         JUMPSCARE | POWER_OUT | GAME_OVER | WIN

    this.night = 1;
    this.hour  = 0;   // 0 = 12 AM … 6 = 6 AM

    // ── Power ────────────────────────────────────────────────────
    this.power = 100;

    // ── Doors & lights ───────────────────────────────────────────
    this.leftDoor  = 'OPEN';   // OPEN | CLOSING | CLOSED | OPENING
    this.rightDoor = 'OPEN';
    this.leftLight  = false;
    this.rightLight = false;

    // ── Camera UI ────────────────────────────────────────────────
    this.cameraOpen         = false;
    this.activeCam          = '1A';
    this.cameraTransitioning = false;

    // ── Office pan (0 = left, 0.5 = centre, 1 = right) ──────────
    this.panTarget  = 0.5;
    this.panCurrent = 0.5;

    // ── Animatronics ─────────────────────────────────────────────
    this.animatronics = {
      freddy: this._makeAnim('STAGE', false),
      bonnie: this._makeAnim('STAGE', true),
      chica:  this._makeAnim('STAGE', true),
      foxy:   this._makeFoxy(),
    };

    // ── Jumpscare ────────────────────────────────────────────────
    this.jumpscareTarget = null;
    this.caughtBy        = '';

    // ── Power-out state ──────────────────────────────────────────
    this.powerOutPhase = 0;
    // 0 = idle, 1 = music playing, 2 = freddy at doorway, 3 = jumpscare

    // ── Misc flags ───────────────────────────────────────────────
    this.foxyKnocking   = false;
    this.staticActive   = false;
    this.nightRunning   = false;
  }

  // ── Factories ─────────────────────────────────────────────────
  _makeAnim(startPos, active) {
    return {
      position:     startPos,
      active,
      aiLevel:      0,
      tickTimer:    0,       // accumulated ms since last AI tick
      attackTimer:  0,       // accumulated ms since last attack check
      routeIndex:   0,
      facingCamera: false,   // Freddy special: facing camera flag
    };
  }

  _makeFoxy() {
    return {
      position:   'PIRATE_COVE',
      active:     true,
      aiLevel:    0,
      phase:      0,         // 0-3 curtain stage
      phaseTimer: 0,         // seconds without looking at Pirate Cove
      running:    false,
      runTimer:   0,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────
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

  /** Reset everything for a fresh night */
  reset(night) {
    const oldNight = this.night;
    this._init();
    this.night = night || oldNight;
  }
}