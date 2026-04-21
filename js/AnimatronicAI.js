'use strict';

/**
 * AnimatronicAI
 * ─────────────────────────────────────────────────────────────
 * Implements FNAF-1 movement & attack for Freddy, Bonnie,
 * Chica, and Foxy.
 *
 * Movement: every AI_TICK_MS, roll a 1-20 die.
 *           If roll ≤ aiLevel → animatronic advances its route.
 * Attack:   checked every ATTACK_CHECK_MS while at a blind spot.
 *           Separate ATTACK_CHANCE probability.
 * Freddy:   cannot move while the player is watching his camera.
 * Foxy:     timer-based phase system; charges left door.
 */
class AnimatronicAI {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;
  }

  // ── Main update ──────────────────────────────────────────────
  update(deltaTime) {
    const s = this.state;
    if (!s.isPlaying()) return;

    this._tickBonnie(deltaTime);
    this._tickChica(deltaTime);
    this._tickFreddy(deltaTime);
    this._tickFoxy(deltaTime);

    this._checkLeftAttack(deltaTime);
    this._checkRightAttack(deltaTime);
  }

  // ── Bonnie ───────────────────────────────────────────────────
  _tickBonnie(dt) {
    const a = this.state.animatronics.bonnie;
    if (!a.active || a.aiLevel === 0) return;
    if (a.position === 'LEFT_BLIND_SPOT') return;

    a.tickTimer += dt;
    if (a.tickTimer >= this._tickInterval(a)) {
      a.tickTimer = 0;
      if (this._roll(a)) this._advance('bonnie');
    }
  }

  // ── Chica ─────────────────────────────────────────────────────
  _tickChica(dt) {
    const a = this.state.animatronics.chica;
    if (!a.active || a.aiLevel === 0) return;
    if (a.position === 'RIGHT_BLIND_SPOT') return;

    a.tickTimer += dt;
    if (a.tickTimer >= this._tickInterval(a)) {
      a.tickTimer = 0;
      if (this._roll(a)) this._advance('chica');
    }
  }

  // ── Freddy ────────────────────────────────────────────────────
  _tickFreddy(dt) {
    const a = this.state.animatronics.freddy;
    if (!a.active || a.aiLevel === 0) return;
    if (a.position === 'RIGHT_BLIND_SPOT') return;

    // Freddy only moves when NOT observed on camera
    if (CONFIG.FREDDY_UNOBSERVED_ONLY && this.state.cameraOpen) {
      const visiblePositions = CONFIG.CAM_POSITIONS[this.state.activeCam] || [];
      if (visiblePositions.includes(a.position)) {
        a.tickTimer = 0; // Reset while watched
        return;
      }
    }

    a.tickTimer += dt;
    if (a.tickTimer >= this._tickInterval(a)) {
      a.tickTimer = 0;
      if (this._roll(a)) {
        const prevIdx = a.routeIndex;
        this._advance('freddy');
        // Freddy laughs on later nights when he moves
        if (a.routeIndex > prevIdx && this.state.night >= CONFIG.FREDDY_LAUGH_MIN_NIGHT) {
          this.sound.play('freddy_laugh');
          EventBus.emit('freddyLaughed');
        }
      }
    }
  }

  // ── Foxy ──────────────────────────────────────────────────────
  _tickFoxy(dt) {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.active) return;

    // Running sequence
    if (foxy.running) {
      foxy.runTimer += dt;

      // Brief appearance in West Hall
      if (foxy.runTimer > 500 && foxy.position !== 'WEST_HALL_RUNNING') {
        foxy.position = 'WEST_HALL_RUNNING';
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'WEST_HALL_RUNNING' });
      }

      // Arrives at left door
      if (foxy.runTimer >= CONFIG.FOXY_CHARGE_DURATION_MS) {
        foxy.running  = false;
        foxy.runTimer = 0;
        foxy.position = 'LEFT_BLIND_SPOT';
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'LEFT_BLIND_SPOT' });
        this._foxyAtDoor();
      }
      return;
    }

    if (foxy.position !== 'PIRATE_COVE') return;

    // Advance or decay phase timer
    const watching = this.state.cameraOpen && this.state.activeCam === '1C';
    if (watching) {
      foxy.phaseTimer = Math.max(0, foxy.phaseTimer - (dt / 1000) * CONFIG.FOXY_DECAY_RATE);
    } else {
      const speed = 0.5 + (foxy.aiLevel * 0.025);
      foxy.phaseTimer += (dt / 1000) * speed;
    }

    // Update phase (0-3)
    const newPhase = Math.min(3, Math.floor(foxy.phaseTimer / CONFIG.FOXY_PHASE_INTERVAL));
    if (newPhase !== foxy.phase) {
      foxy.phase = newPhase;
      EventBus.emit('foxyPhaseChanged', newPhase);
    }

    // Launch run
    if (foxy.phaseTimer >= CONFIG.FOXY_TIMER_MAX) {
      this._foxyRun();
    }
  }

  _foxyRun() {
    const foxy = this.state.animatronics.foxy;
    foxy.running  = true;
    foxy.runTimer = 0;
    foxy.position = 'WEST_HALL';
    this.sound.play('foxy_run');
    EventBus.emit('foxyRunning');
  }

  _foxyAtDoor() {
    const state = this.state;
    const foxy  = state.animatronics.foxy;

    if (state.isDoorClosed('left')) {
      // Foxy knocks — drain a chunk of power
      state.power = Math.max(0, state.power - CONFIG.FOXY_KNOCK_POWER * 3);
      this.sound.play('foxy_run'); // Use knock/hit sound if available
      EventBus.emit('foxyKnock');

      // Retreat back to Pirate Cove at lower phase
      setTimeout(() => {
        foxy.position   = 'PIRATE_COVE';
        foxy.phaseTimer = Math.max(0, foxy.phaseTimer - 25);
        foxy.phase      = Math.min(3, Math.floor(foxy.phaseTimer / CONFIG.FOXY_PHASE_INTERVAL));
        foxy.running    = false;
        foxy.runTimer   = 0;
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'PIRATE_COVE' });
      }, 1_500);
    } else {
      this._triggerJumpscare('foxy');
    }
  }

  // ── Left-door attack (Bonnie / Foxy handled separately) ──────
  _checkLeftAttack(dt) {
    const bonnie = this.state.animatronics.bonnie;
    if (bonnie.position !== 'LEFT_BLIND_SPOT') { bonnie.attackTimer = 0; return; }
    if (this.state.isDoorClosed('left')) { bonnie.attackTimer = 0; return; }
    if (!this.state.isPlaying()) return;

    bonnie.attackTimer += dt;
    if (bonnie.attackTimer >= CONFIG.ATTACK_CHECK_MS) {
      bonnie.attackTimer = 0;
      if (this._roll(bonnie) && Math.random() < CONFIG.ATTACK_CHANCE) {
        this._triggerJumpscare('bonnie');
      }
    }
  }

  // ── Right-door attack (Chica / Freddy) ───────────────────────
  _checkRightAttack(dt) {
    this._checkRightFor('chica', dt);
    this._checkRightFor('freddy', dt);
  }

  _checkRightFor(name, dt) {
    const a = this.state.animatronics[name];
    if (a.position !== 'RIGHT_BLIND_SPOT') { a.attackTimer = 0; return; }
    if (this.state.isDoorClosed('right'))   { a.attackTimer = 0; return; }
    if (!this.state.isPlaying()) return;

    // Freddy extra condition: attacks only when right light is OFF
    if (name === 'freddy' && this.state.rightLight) return;

    a.attackTimer += dt;
    if (a.attackTimer >= CONFIG.ATTACK_CHECK_MS) {
      a.attackTimer = 0;
      if (this._roll(a) && Math.random() < CONFIG.ATTACK_CHANCE) {
        this._triggerJumpscare(name);
      }
    }
  }

  // ── Route advancement ────────────────────────────────────────
  _advance(name) {
    const a     = this.state.animatronics[name];
    const route = CONFIG.ROUTES[name];
    if (!route) return;

    let idx = route.indexOf(a.position);
    if (idx === -1) idx = 0;

    // 80% chance to advance, 15% stay, 5% retreat one step
    const r = Math.random();
    if (r < 0.80 && idx < route.length - 1) {
      idx++;
    } else if (r < 0.85 && idx > 0) {
      idx--;
    }
    // else stay

    const newPos = route[idx];
    if (newPos !== a.position) {
      const oldPos = a.position;
      a.position   = newPos;
      a.routeIndex = idx;
      EventBus.emit('animatronicMoved', { name, from: oldPos, to: newPos });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────
  _roll(anim) {
    return Math.floor(Math.random() * CONFIG.ATTACK_ROLL_MAX) + 1 <= anim.aiLevel;
  }

  _tickInterval(anim) {
    // Faster ticks with higher AI level, minimum 1 s
    return Math.max(1_000, CONFIG.AI_TICK_MS - anim.aiLevel * 150);
  }

  // ── Jumpscare trigger ────────────────────────────────────────
  _triggerJumpscare(who) {
    const s = this.state;
    if (s.phase === 'JUMPSCARE' || s.phase === 'GAME_OVER') return;

    s.jumpscareTarget = who;
    s.caughtBy        = who.charAt(0).toUpperCase() + who.slice(1);
    s.setPhase('JUMPSCARE');

    this.sound.stopAll();
    this.sound.play('jumpscare');
    EventBus.emit('jumpscare', who);
  }

  // ── Night start (called by NightSystem) ─────────────────────
  onNightStart() {
    const a = this.state.animatronics;

    // Reset positions
    a.freddy.position = 'STAGE'; a.freddy.routeIndex = 0;
    a.bonnie.position = 'STAGE'; a.bonnie.routeIndex = 0;
    a.chica.position  = 'STAGE'; a.chica.routeIndex  = 0;
    a.foxy.position   = 'PIRATE_COVE';
    a.foxy.phase      = 0;
    a.foxy.phaseTimer = 0;
    a.foxy.running    = false;
    a.foxy.runTimer   = 0;

    // Reset timers
    [a.freddy, a.bonnie, a.chica].forEach(x => {
      x.tickTimer   = 0;
      x.attackTimer = 0;
      x.facingCamera = false;
    });
  }
}