'use strict';

/**
 * PowerSystem
 * ─────────────────────────────────────────────────────────────
 * Drains power based on active devices.
 * At 0% triggers the power-out sequence (lights off, Freddy enters).
 */
class PowerSystem {
  constructor(state, soundSystem) {
    this.state  = state;
    this.sound  = soundSystem;
    this._tickAccum   = 0;
    this._powerOutSeq = false;
  }

  update(deltaTime) {
    if (!this.state.isPlaying()) return;

    this._tickAccum += deltaTime;

    if (this._tickAccum >= CONFIG.POWER_TICK_MS) {
      const ticks = Math.floor(this._tickAccum / CONFIG.POWER_TICK_MS);
      this._tickAccum -= ticks * CONFIG.POWER_TICK_MS;

      const drainPerTick = this._calcDrain() * (CONFIG.POWER_TICK_MS / 1000);
      this.state.power = Math.max(0, this.state.power - drainPerTick * ticks);

      EventBus.emit('powerChanged', this.state.power);

      if (this.state.power <= 0 && !this._powerOutSeq) {
        this._powerOutSeq = true;
        this._startPowerOut();
      }
    }
  }

  // ── Drain calculation ────────────────────────────────────────
  _calcDrain() {
    let d = CONFIG.DRAIN_BASE;

    if (this.state.leftDoor  === 'CLOSED') d += CONFIG.DRAIN_DOOR;
    if (this.state.rightDoor === 'CLOSED') d += CONFIG.DRAIN_DOOR;
    if (this.state.leftLight)              d += CONFIG.DRAIN_LIGHT;
    if (this.state.rightLight)             d += CONFIG.DRAIN_LIGHT;
    if (this.state.cameraOpen)             d += CONFIG.DRAIN_CAMERA;

    return d;
  }

  /** Number of active devices (used by UIManager for usage display) */
  getActiveDevices() {
    let n = 1; // base always active
    if (this.state.leftDoor  === 'CLOSED') n++;
    if (this.state.rightDoor === 'CLOSED') n++;
    if (this.state.leftLight)              n++;
    if (this.state.rightLight)             n++;
    if (this.state.cameraOpen)             n++;
    return n;
  }

  // ── Power-out sequence ───────────────────────────────────────
  _startPowerOut() {
    const state = this.state;
    state.power      = 0;
    state.leftLight  = false;
    state.rightLight = false;
    // Doors are powerless — they open
    state.leftDoor   = 'OPEN';
    state.rightDoor  = 'OPEN';
    state.cameraOpen = false;
    state.setPhase('POWER_OUT');
    state.powerOutPhase = 1;

    this.sound.stopAll();
    this.sound.play('power_down');

    EventBus.emit('powerOut');

    // After short pause → play Toreador march
    setTimeout(() => {
      if (state.phase !== 'POWER_OUT') return;
      this.sound.play('toreador');
      state.powerOutPhase = 2;

      // After march → Freddy enters
      setTimeout(() => {
        if (state.phase !== 'POWER_OUT') return;
        state.powerOutPhase = 3;
        state.animatronics.freddy.position = 'IN_OFFICE';
        EventBus.emit('freddyEntersOffice');

        // Final delay → jumpscare
        setTimeout(() => {
          if (state.phase !== 'POWER_OUT') return;
          EventBus.emit('jumpscare', 'freddy_power');
          state.jumpscareTarget = 'freddy_power';
          state.caughtBy        = 'Freddy Fazbear';
          state.setPhase('JUMPSCARE');
        }, CONFIG.FREDDY_POWER_ENTER_MS);

      }, CONFIG.FREDDY_POWER_MUSIC_MS);
    }, 2_000);
  }

  reset() {
    this._tickAccum   = 0;
    this._powerOutSeq = false;
    this.state.power  = 100;
  }
}