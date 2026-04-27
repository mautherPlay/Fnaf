'use strict';

/**
 * AnimatronicAI
 * ─────────────────────────────────────────────────────────────
 * Graph-based FNAF1-accurate movement with:
 *  • Weighted random picks from adjacency graph
 *  • STAY state for natural pauses
 *  • 5-tick post-attack suppression (significant retreat reluctance)
 *  • Distance-based movement sounds
 *  • Chica/Freddy forward-only progression (no back-to-STAGE trap)
 *  • Foxy: playerModifier + waitingToRun + CAM-2A peek mechanic
 */
class AnimatronicAI {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;

    this._tickAccum     = 0;
    this._spottedLeft   = 0;
    this._spottedRight  = 0;
    this._kitchenTimers = { chica: 0, freddy: 0 };

    // Post-attack penalty ticks remaining per animatronic.
    // While > 0 forward weight is heavily suppressed.
    this._penaltyTicks = { bonnie: 0, chica: 0, freddy: 0 };

    EventBus.on('cameraClosed',   ()   => this._onCamerasClosed());
    EventBus.on('cameraSwitched', (id) => this._onCameraSwitched(id));
  }

  // ── Main update ──────────────────────────────────────────────
  update(deltaTime) {
    if (!this.state.isPlaying()) return;

    this._tickAccum += deltaTime;
    if (this._tickAccum >= CONFIG.AI_TICK_MS) {
      this._tickAccum -= CONFIG.AI_TICK_MS;
      this._doTick();
    }

    this._updateSpotted(deltaTime);
    this._updateKitchen(deltaTime);
  }

  // ═════════════════════════════════════════════════════════════
  // GLOBAL AI TICK  (every 4.97 s)
  // ═════════════════════════════════════════════════════════════
  _doTick() {
    this._tickBonnie();
    this._tickChica();
    this._tickFreddy();
    this._tickFoxy();
  }

  // ── Bonnie ───────────────────────────────────────────────────
  _tickBonnie() {
    const a = this.state.animatronics.bonnie;
    if (!a.active || a.aiLevel === 0) return;
    if (!this._roll(a)) return;

    if (a.position === 'LEFT_BLIND_SPOT') {
      if (this.state.isDoorClosed('left')) {
        this._penaltyTicks.bonnie = CONFIG.ATTACK_PENALTY_TICKS;
        this._forceRetreat('bonnie');
      } else {
        this._triggerJumpscare('bonnie');
      }
    } else {
      this._graphMove('bonnie');
    }
  }

  // ── Chica ─────────────────────────────────────────────────────
  _tickChica() {
    const a = this.state.animatronics.chica;
    if (!a.active || a.aiLevel === 0) return;
    if (!this._roll(a)) return;

    if (a.position === 'RIGHT_BLIND_SPOT') {
      if (this.state.isDoorClosed('right')) {
        this._penaltyTicks.chica = CONFIG.ATTACK_PENALTY_TICKS;
        this._forceRetreat('chica');
      } else {
        this._triggerJumpscare('chica');
      }
    } else {
      this._graphMove('chica');
    }
  }

  // ── Freddy ────────────────────────────────────────────────────
  _tickFreddy() {
    const a = this.state.animatronics.freddy;
    if (!a.active || a.aiLevel === 0) return;

    // Freeze while observed on camera
    if (CONFIG.FREDDY_UNOBSERVED_ONLY && this.state.cameraOpen) {
      const vis = CONFIG.CAM_POSITIONS[this.state.activeCam] || [];
      if (vis.includes(a.position)) return;
    }

    if (!this._roll(a)) return;

    if (a.position === 'RIGHT_BLIND_SPOT') {
      if (!this.state.isDoorClosed('right') && !this.state.rightLight) {
        this._triggerJumpscare('freddy');
      }
      // Freddy never retreats; if door closed he just stays
    } else {
      const oldPos = a.position;
      this._graphMove('freddy');

      // Freddy laugh on nights ≥ 3 when he advances
      if (a.position !== oldPos && a.position !== 'STAY' &&
          this.state.night >= CONFIG.FREDDY_LAUGH_MIN_NIGHT) {
        this.sound.play('freddy_laugh');
        EventBus.emit('freddyLaughed');
      }
    }
  }

  // ── Foxy tick ─────────────────────────────────────────────────
  _tickFoxy() {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.active || foxy.running || foxy.waitingToRun) return;
    if (foxy.position !== 'PIRATE_COVE') return;

    // playerModifier: cameras open → nearly frozen (0.05), closed → full (1.0)
    const mod  = this.state.cameraOpen ? 0.05 : 1.0;
    const roll = Math.floor(Math.random() * 20); // 0–19
    if (roll >= foxy.aiLevel * mod) return;

    foxy.phaseTimer = Math.min(foxy.phaseTimer + CONFIG.FOXY_TICK_INCREMENT, CONFIG.FOXY_TIMER_MAX);

    const newPhase = Math.min(3, Math.floor(foxy.phaseTimer / CONFIG.FOXY_PHASE_INTERVAL));
    if (newPhase !== foxy.phase) {
      foxy.phase = newPhase;
      EventBus.emit('foxyPhaseChanged', newPhase);
    }

    if (foxy.phaseTimer >= CONFIG.FOXY_TIMER_MAX) {
      if (this.state.cameraOpen) {
        foxy.waitingToRun = true;
        foxy.peekShown    = false;
        EventBus.emit('foxyWaitingToRun');
      } else {
        this._foxyRun();
      }
    }
  }

  // ═════════════════════════════════════════════════════════════
  // GRAPH MOVEMENT
  // ═════════════════════════════════════════════════════════════
  _graphMove(name) {
    const a     = this.state.animatronics[name];
    const graph = MOVEMENT_GRAPH[name];
    if (!graph) return;

    const options = graph[a.position];
    if (!options || options.length === 0) return;

    let weighted = options;

    // Apply post-attack penalty: suppress forward, boost STAY / backward
    if (this._penaltyTicks[name] > 0) {
      this._penaltyTicks[name]--;

      weighted = options.map(o => {
        if (o.room === 'STAY') {
          return { room: o.room, weight: o.weight * CONFIG.ATTACK_PENALTY_STAY_MULT };
        }
        // Detect backward rooms: target's graph contains current pos as an option
        const targetOpts = graph[o.room];
        const isBackward = targetOpts
          ? targetOpts.some(t => t.room === a.position)
          : false;

        if (isBackward) {
          return { room: o.room, weight: o.weight * CONFIG.ATTACK_PENALTY_BACK_MULT };
        }
        // Forward room: nearly zero weight
        return { room: o.room, weight: o.weight * CONFIG.ATTACK_PENALTY_FWD_MULT };
      });
    }

    const chosen = this._weightedRandom(weighted);
    if (chosen && chosen !== 'STAY') {
      this._moveTo(name, chosen);
    }
  }

  /**
   * Force the animatronic one step backward along the graph.
   * Used when blocked at blind spot by a closed door.
   * Picks the backward room with the highest weight.
   */
  _forceRetreat(name) {
    const a     = this.state.animatronics[name];
    const graph = MOVEMENT_GRAPH[name];
    if (!graph) return;

    const options = graph[a.position];
    if (!options) return;

    // Backward = rooms whose own graph contains current pos
    const backwards = options.filter(o => {
      if (o.room === 'STAY') return false;
      const targetOpts = graph[o.room];
      return targetOpts && targetOpts.some(t => t.room === a.position);
    });

    if (backwards.length > 0) {
      const best = backwards.reduce((b, o) => o.weight > b.weight ? o : b);
      this._moveTo(name, best.room);
    }
    // If no backward room found — animatronic stays put
  }

  /** Weighted random pick from { room, weight }[] */
  _weightedRandom(options) {
    const total = options.reduce((s, o) => s + Math.max(0, o.weight), 0);
    if (total <= 0) return 'STAY';
    let r = Math.random() * total;
    for (const o of options) {
      r -= Math.max(0, o.weight);
      if (r <= 0) return o.room;
    }
    return options[options.length - 1].room;
  }

  /** Commit movement + emit event + play distance-based sound */
  _moveTo(name, newRoom) {
    const a   = this.state.animatronics[name];
    const old = a.position;
    if (newRoom === old || newRoom === 'STAY') return;

    a.position = newRoom;
    EventBus.emit('animatronicMoved', { name, from: old, to: newRoom });

    // Play movement sound based on destination proximity
    this._playMoveSound(name, newRoom);
  }

  // ─── Distance-based movement sound ───────────────────────────
  // animatronic_move.mp3 plays at probability defined in SOUND_ZONES.
  // Freddy only plays this sound after power has fully drained.
  _playMoveSound(name, room) {
    // Freddy: only after power-out (powerOutPhase > 0)
    if (name === 'freddy') {
      if (this.state.powerOutPhase === 0) return;
    }

    const prob = SOUND_ZONES[room] ?? 0;
    if (Math.random() < prob) {
      this.sound.play('animatronic_move');
    }
  }

  // ═════════════════════════════════════════════════════════════
  // FOXY RUN SEQUENCE
  // ═════════════════════════════════════════════════════════════
  _foxyRun() {
    const foxy        = this.state.animatronics.foxy;
    foxy.running      = true;
    foxy.runTimer     = 0;
    foxy.waitingToRun = false;
    foxy.peekShown    = false;
    foxy.position     = 'WEST_HALL';
    this.sound.play('foxy_run');
    EventBus.emit('foxyRunning');

    const step = () => {
      if (!this.state.isPlaying()) return;
      foxy.runTimer += 16;

      if (foxy.runTimer > 400 && foxy.position !== 'WEST_HALL_RUNNING') {
        foxy.position = 'WEST_HALL_RUNNING';
        EventBus.emit('animatronicMoved', { name:'foxy', to:'WEST_HALL_RUNNING' });
      }

      if (foxy.runTimer >= CONFIG.FOXY_CHARGE_DURATION_MS) {
        foxy.running  = false;
        foxy.runTimer = 0;
        foxy.position = 'LEFT_BLIND_SPOT';
        EventBus.emit('animatronicMoved', { name:'foxy', to:'LEFT_BLIND_SPOT' });
        this._foxyAtDoor();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _foxyAtDoor() {
    const state = this.state;
    const foxy  = state.animatronics.foxy;

    if (state.isDoorClosed('left')) {
      EventBus.emit('foxyDoorHit');
      state.power = Math.max(0, state.power - CONFIG.FOXY_KNOCK_POWER);
      EventBus.emit('powerChanged', state.power);
      EventBus.emit('foxyKnock');

      setTimeout(() => {
        foxy.position     = 'PIRATE_COVE';
        foxy.phaseTimer   = 0;
        foxy.phase        = 0;
        foxy.running      = false;
        foxy.runTimer     = 0;
        foxy.waitingToRun = false;
        foxy.peekShown    = false;
        EventBus.emit('animatronicMoved', { name:'foxy', to:'PIRATE_COVE' });
        EventBus.emit('foxyPhaseChanged', 0);
      }, 1_200);
    } else {
      this._triggerJumpscare('foxy');
    }
  }

  // ── waitingToRun: cameras closed ─────────────────────────────
  _onCamerasClosed() {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.waitingToRun || foxy.running) return;
    foxy.waitingToRun = false;
    this._foxyRun();
  }

  // ── waitingToRun: player switches to CAM 2A ──────────────────
  _onCameraSwitched(camId) {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.waitingToRun || foxy.running || foxy.peekShown) return;
    if (camId !== '2A') return;

    foxy.peekShown = true;
    EventBus.emit('foxyPeekCam2A');

    setTimeout(() => {
      if (!this.state.isPlaying()) return;
      foxy.waitingToRun = false;
      this._foxyRun();
    }, CONFIG.FOXY_PEEK_DELAY_MS);
  }

  // ═════════════════════════════════════════════════════════════
  // SPOTTED COUNTDOWN
  // ═════════════════════════════════════════════════════════════
  startSpottedCountdown(side) {
    const delay = 4_000 + Math.random() * 3_000;
    if (side === 'left')  this._spottedLeft  = delay;
    else                  this._spottedRight = delay;
  }

  cancelSpotted(side) {
    if (side === 'left')  this._spottedLeft  = 0;
    else                  this._spottedRight = 0;
  }

  _updateSpotted(dt) {
    if (this._spottedLeft > 0) {
      this._spottedLeft -= dt;
      if (this._spottedLeft <= 0) { this._spottedLeft = 0; this._resolveSpotted('left'); }
    }
    if (this._spottedRight > 0) {
      this._spottedRight -= dt;
      if (this._spottedRight <= 0) { this._spottedRight = 0; this._resolveSpotted('right'); }
    }
  }

  _resolveSpotted(side) {
    if (side === 'left') {
      const b = this.state.animatronics.bonnie;
      if (b.position === 'LEFT_BLIND_SPOT' && !this.state.isDoorClosed('left')) {
        this._forceRetreat('bonnie');
      }
    } else {
      const c = this.state.animatronics.chica;
      if (c.position === 'RIGHT_BLIND_SPOT' && !this.state.isDoorClosed('right')) {
        this._forceRetreat('chica');
      }
      // Freddy does not retreat when spotted
    }
  }

  // ═════════════════════════════════════════════════════════════
  // KITCHEN / BATHROOM LINGER
  // ═════════════════════════════════════════════════════════════
  _updateKitchen(dt) {
    for (const name of ['chica', 'freddy']) {
      const a = this.state.animatronics[name];
      if (a.position !== 'KITCHEN' && a.position !== 'BATHROOMS') {
        this._kitchenTimers[name] = 0;
        continue;
      }
      this._kitchenTimers[name] += dt;
      if (this._kitchenTimers[name] >= CONFIG.KITCHEN_LINGER_MAX_MS) {
        this._kitchenTimers[name] = 0;
        // Force forward move — pick only non-back, non-stay options
        const graph   = MOVEMENT_GRAPH[name];
        const options = (graph && graph[a.position]) || [];
        const forward = options.filter(o =>
          o.room !== 'STAY' &&
          o.room !== 'BATHROOMS' &&
          o.room !== 'KITCHEN' &&
          o.room !== 'DINING' &&
          o.room !== 'STAGE'
        );
        if (forward.length > 0) {
          const best = forward.reduce((b, o) => o.weight > b.weight ? o : b);
          this._moveTo(name, best.room);
        }
      }
    }
  }

  // ═════════════════════════════════════════════════════════════
  // HELPERS
  // ═════════════════════════════════════════════════════════════
  _roll(anim) {
    // Roll 1–20: success if roll ≤ aiLevel
    return Math.floor(Math.random() * CONFIG.ATTACK_ROLL_MAX) + 1 <= anim.aiLevel;
  }

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

  // ═════════════════════════════════════════════════════════════
  // NIGHT ESCALATION  (called by NightSystem on hour change)
  // ═════════════════════════════════════════════════════════════
  applyEscalation(night, hour) {
    const steps = CONFIG.NIGHT_ESCALATION[night];
    if (!steps) return;
    const step = steps.find(s => s.hour === hour);
    if (!step) return;
    const a = this.state.animatronics;
    a.freddy.aiLevel = Math.min(20, a.freddy.aiLevel + (step.freddy || 0));
    a.bonnie.aiLevel = Math.min(20, a.bonnie.aiLevel + (step.bonnie || 0));
    a.chica.aiLevel  = Math.min(20, a.chica.aiLevel  + (step.chica  || 0));
    a.foxy.aiLevel   = Math.min(20, a.foxy.aiLevel   + (step.foxy   || 0));
    if (a.freddy.aiLevel > 0) a.freddy.active = true;
    EventBus.emit('aiEscalated', { night, hour });
  }

  // ═════════════════════════════════════════════════════════════
  // NIGHT RESET
  // ═════════════════════════════════════════════════════════════
  onNightStart() {
    const a = this.state.animatronics;
    a.freddy.position = 'STAGE'; a.freddy.facingCamera = false;
    a.bonnie.position = 'STAGE'; a.bonnie.facingCamera = false;
    a.chica.position  = 'STAGE'; a.chica.facingCamera  = false;

    const foxy = a.foxy;
    foxy.position     = 'PIRATE_COVE';
    foxy.phase        = 0;
    foxy.phaseTimer   = 0;
    foxy.running      = false;
    foxy.runTimer     = 0;
    foxy.waitingToRun = false;
    foxy.peekShown    = false;

    this._tickAccum      = 0;
    this._spottedLeft    = 0;
    this._spottedRight   = 0;
    this._kitchenTimers  = { chica: 0, freddy: 0 };
    this._penaltyTicks   = { bonnie: 0, chica: 0, freddy: 0 };
  }
}