'use strict';

/**
 * NightSystem
 * ─────────────────────────────────────────────────────────────
 * Manages the in-game clock (12 AM → 6 AM).
 * One in-game hour = CONFIG.HOUR_MS milliseconds.
 * Emits 'hourChanged' and 'nightComplete'.
 */
class NightSystem {
  constructor(state, saveSystem, soundSystem) {
    this.state  = state;
    this.save   = saveSystem;
    this.sound  = soundSystem;
    this._elapsed = 0;
  }

  // ── Called each game loop frame ──────────────────────────────
  update(deltaTime) {
    if (!this.state.nightRunning) return;

    this._elapsed += deltaTime;

    const newHour = Math.floor(this._elapsed / CONFIG.HOUR_MS);

    if (newHour !== this.state.hour && newHour <= CONFIG.TOTAL_HOURS) {
      this.state.hour = newHour;
      EventBus.emit('hourChanged', newHour);
    }

    if (newHour >= CONFIG.TOTAL_HOURS) {
      this._onNightComplete();
    }
  }

  // ── Start a new night ────────────────────────────────────────
  startNight(night) {
    this._elapsed        = 0;
    this.state.night     = night;
    this.state.hour      = 0;
    this.state.nightRunning = true;

    // Apply AI levels from config
    const levels = CONFIG.AI_LEVELS[night] || CONFIG.AI_LEVELS[5];
    const a = this.state.animatronics;
    a.freddy.aiLevel = levels.freddy;
    a.bonnie.aiLevel = levels.bonnie;
    a.chica.aiLevel  = levels.chica;
    a.foxy.aiLevel   = levels.foxy;

    a.freddy.active = levels.freddy > 0;
    a.bonnie.active = true;
    a.chica.active  = true;
    a.foxy.active   = true;

    EventBus.emit('nightStarted', night);
  }

  // ── Phone call ───────────────────────────────────────────────
  playPhoneCall(night) {
    if (night <= 3) {
      this.sound.play(`phone_guy_night${night}`);
    }
  }

  // ── Night over (6 AM) ────────────────────────────────────────
  _onNightComplete() {
    if (!this.state.nightRunning) return;
    this.state.nightRunning = false;

    this.sound.stopAll();
    this.sound.play('6am');

    this.save.completeNight(this.state.night);

    EventBus.emit('nightComplete', this.state.night);

    if (this.state.night >= 5) {
      this.state.setPhase('WIN');
    } else {
      this.state.setPhase('WIN');   // show night-complete screen (reused as WIN phase)
    }
  }
}