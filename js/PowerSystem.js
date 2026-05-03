'use strict';

/**
 * PowerSystem
 * ─────────────────────────────────────────────────────────────
 * Drains power; at 0 triggers the Freddy power-out sequence.
 *
 * Full sequence (original FNAF1 spirit):
 *
 *   Phase 1  — power_down sound, everything cut.
 *              Dark office (backup_power.png). Others still tick.
 *
 *   Phase 2  — Freddy decides to attack (probability by position).
 *              If YES: Toreador March starts + fast eye flicker.
 *              If NO : stays dark forever, others can reach player.
 *
 *   Phase 3  — After FREDDY_POWER_MUSIC_MS (16 s):
 *              Music fades out over FREDDY_POWER_FADE_MS (2 s).
 *              Eye flicker CONTINUES during fade.
 *              When fade finishes: flicker stops, eyes go dark.
 *              Phase 3 = silent pitch-black office. No sound, no eyes.
 *              Player waits in dread.
 *
 *   Phase 4  — Random delay (FREDDY_POWER_DARK_MIN–MAX).
 *              Jumpscare fires.
 *
 * Eye flicker speed:
 *   ON  : 300–800 ms  (faster than before, more erratic)
 *   OFF : 80–300  ms
 *   Initial pause 1.2 s so the music "lands" first.
 */
class PowerSystem {
  constructor(state, soundSystem) {
    this.state  = state;
    this.sound  = soundSystem;

    this._tickAccum       = 0;
    this._powerOutSeq     = false;
    this._eyeFlickerTimer = null;
  }

  // ── Game loop ────────────────────────────────────────────────
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

  // ── Drain ────────────────────────────────────────────────────
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

  // ── Power-out entry ───────────────────────────────────────────
  _startPowerOut() {
    const state = this.state;

    // Cut everything immediately
    state.power      = 0;
    state.leftLight  = false;
    state.rightLight = false;
    state.leftDoor   = 'OPEN';
    state.rightDoor  = 'OPEN';
    state.cameraOpen = false;

    state.powerOutPhase      = 1;
    state.powerOutFreddyEyes = false;
    state.setPhase('POWER_OUT');

    this.sound.stopAll();
    this.sound.play('power_down');
    EventBus.emit('powerOut');

    // ── 2 s: decide Freddy's fate ─────────────────────────────
    setTimeout(() => {
      if (state.phase !== 'POWER_OUT') return;

      if (!this._canFreddyAttack()) return; // Freddy too far — stay dark

      // Phase 2: music + eye flicker
      state.powerOutPhase = 2;
      this.sound.play('toreador');
      this._startEyeFlicker();

      // ── After music plays: fade it out ─────────────────────
      setTimeout(() => {
        if (state.phase !== 'POWER_OUT') return;

        // Fade the march over FREDDY_POWER_FADE_MS
        // Eye flicker continues during the fade
        this.sound.fadeOut('toreador', CONFIG.FREDDY_POWER_FADE_MS, () => {
          if (state.phase !== 'POWER_OUT') return;

          // Flicker stops, eyes go dark — pure silent darkness
          this._stopEyeFlicker();
          state.powerOutFreddyEyes = false;
          state.powerOutPhase      = 3;

          // ── Random silent delay then jumpscare ──────────────
          const darkDelay =
            CONFIG.FREDDY_POWER_DARK_MIN +
            Math.random() * (CONFIG.FREDDY_POWER_DARK_MAX - CONFIG.FREDDY_POWER_DARK_MIN);

          setTimeout(() => {
            if (state.phase !== 'POWER_OUT') return;

            this.sound.stopAll();
            this.sound.play('jumpscare');

            state.jumpscareTarget = 'freddy_power';
            state.caughtBy        = 'Freddy Fazbear';
            state.setPhase('JUMPSCARE');
            EventBus.emit('jumpscare', 'freddy_power');

          }, darkDelay);
        });

      }, CONFIG.FREDDY_POWER_MUSIC_MS);

    }, 2_000);
  }

  // ── Can Freddy attack? ────────────────────────────────────────
  _canFreddyAttack() {
    const pos = this.state.animatronics.freddy.position;
    const PROBABILITY = {
      RIGHT_BLIND_SPOT: 0.90,
      EAST_HALL_CORNER: 0.70,
      EAST_HALL:        0.50,
      KITCHEN:          0.25,
      BATHROOMS:        0.15,
    };
    const prob = PROBABILITY[pos];
    if (prob === undefined) return false;
    return Math.random() < prob;
  }

  // ── Eye flicker ───────────────────────────────────────────────
  /**
   * Faster, more erratic than before.
   * ON  : 300 – 800 ms  (short, punchy)
   * OFF : 80  – 300 ms  (brief gaps)
   * First flicker delayed 1.2 s so Toreador March has time to land.
   */
  _startEyeFlicker() {
    const state = this.state;

    const flicker = () => {
      if (state.phase !== 'POWER_OUT' || state.powerOutPhase < 2) return;

      state.powerOutFreddyEyes = !state.powerOutFreddyEyes;

      const delay = state.powerOutFreddyEyes
        ? 300 + Math.random() * 500   // ON:  300–800 ms
        : 80  + Math.random() * 220;  // OFF: 80–300 ms

      this._eyeFlickerTimer = setTimeout(flicker, delay);
    };

    this._eyeFlickerTimer = setTimeout(flicker, 1_200);
  }

  _stopEyeFlicker() {
    if (this._eyeFlickerTimer) {
      clearTimeout(this._eyeFlickerTimer);
      this._eyeFlickerTimer = null;
    }
  }

  // ── Reset ─────────────────────────────────────────────────────
  reset() {
    this._stopEyeFlicker();
    this._tickAccum               = 0;
    this._powerOutSeq             = false;
    this.state.power              = 100;
    this.state.powerOutFreddyEyes = false;
  }
}