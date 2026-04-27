'use strict';

/**
 * NightSystem
 * ─────────────────────────────────────────────────────────────
 * Manages the in-game clock (12 AM → 6 AM).
 * On each hour change, calls animAI.applyEscalation() to
 * simulate the FNAF1 "gets harder as the night goes on" feeling.
 */
class NightSystem {
  constructor(state, saveSystem, soundSystem, animAI) {
    this.state   = state;
    this.save    = saveSystem;
    this.sound   = soundSystem;
    this.animAI  = animAI;   // reference injected by main.js
    this._elapsed = 0;
  }

  update(deltaTime) {
    if (!this.state.nightRunning) return;
    this._elapsed += deltaTime;

    const newHour = Math.floor(this._elapsed / CONFIG.HOUR_MS);

    if (newHour !== this.state.hour && newHour <= CONFIG.TOTAL_HOURS) {
      this.state.hour = newHour;
      EventBus.emit('hourChanged', newHour);

      // Mid-night escalation
      if (this.animAI) this.animAI.applyEscalation(this.state.night, newHour);
    }

    if (newHour >= CONFIG.TOTAL_HOURS) {
      this._onNightComplete();
    }
  }

  startNight(night) {
    this._elapsed           = 0;
    this.state.night        = night;
    this.state.hour         = 0;
    this.state.nightRunning = true;

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

  playPhoneCall(night) {
    if (night >= 1 && night <= 4) {
      this.sound.play(`phone_guy_night${night}`);
    }
  }

  _onNightComplete() {
    if (!this.state.nightRunning) return;
    this.state.nightRunning = false;
    this.sound.stopAll();
    this.sound.play('6am');
    this.save.completeNight(this.state.night);
    EventBus.emit('nightComplete', this.state.night);
    this.state.setPhase('WIN');
  }
}