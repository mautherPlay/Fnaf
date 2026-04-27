'use strict';

/**
 * PowerSystem
 * ─────────────────────────────────────────────────────────────
 * Drains power; at 0 triggers the Freddy power-out sequence.
 *
 * Power-out sequence (mirrors original FNAF1):
 *   Phase 1 — power_down sound, everything disabled.
 *             Office shows "backup power" dim state.
 *   Phase 2 — Toreador March plays (~10 s).
 *             Office still shows backup state.
 *   Phase 3 — Freddy appears in LEFT doorway (eyes in dark).
 *             State = 'powerOutFreddyLeft'.
 *             Office switches to "freddy in left doorway" image.
 *   Phase 4 — Jumpscare: jumpscare_freddy_power.mp4
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

  _calcDrain() {
    let d = CONFIG.DRAIN_BASE;
    if (this.state.leftDoor  === 'CLOSED') d += CONFIG.DRAIN_DOOR;
    if (this.state.rightDoor === 'CLOSED') d += CONFIG.DRAIN_DOOR;
    if (this.state.leftLight)              d += CONFIG.DRAIN_LIGHT;
    if (this.state.rightLight)             d += CONFIG.DRAIN_LIGHT;
    if (this.state.cameraOpen)             d += CONFIG.DRAIN_CAMERA;
    return d;
  }

  getActiveDevices() {
    let n = 1;
    if (this.state.leftDoor  === 'CLOSED') n++;
    if (this.state.rightDoor === 'CLOSED') n++;
    if (this.state.leftLight)              n++;
    if (this.state.rightLight)             n++;
    if (this.state.cameraOpen)             n++;
    return n;
  }

  _startPowerOut() {
    const state = this.state;

    // Immediately cut everything
    state.power      = 0;
    state.leftLight  = false;
    state.rightLight = false;
    state.leftDoor   = 'OPEN';
    state.rightDoor  = 'OPEN';
    state.cameraOpen = false;

    // Phase 1: backup dim office
    state.powerOutPhase = 1;           // SceneRenderer shows backup_power.png
    state.setPhase('POWER_OUT');

    this.sound.stopAll();
    this.sound.play('power_down');

    EventBus.emit('powerOut');

    // Phase 2: Toreador March after 2 s
    setTimeout(() => {
      if (state.phase !== 'POWER_OUT') return;
      state.powerOutPhase = 2;
      this.sound.play('toreador');

      // Phase 3: Freddy appears in left doorway after the march
      setTimeout(() => {
        if (state.phase !== 'POWER_OUT') return;
        state.powerOutPhase = 3;       // SceneRenderer shows power_out_freddy_left.png
        state.animatronics.freddy.position = 'IN_OFFICE';
        EventBus.emit('freddyEntersOffice');

        // Phase 4: Jumpscare
        setTimeout(() => {
          if (state.phase !== 'POWER_OUT') return;
          state.jumpscareTarget = 'freddy_power';
          state.caughtBy        = 'Freddy Fazbear';
          state.setPhase('JUMPSCARE');
          EventBus.emit('jumpscare', 'freddy_power');
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