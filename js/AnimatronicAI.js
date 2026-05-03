'use strict';

class AnimatronicAI {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;

    this._tickAccum     = 0;
    this._spottedLeft   = 0;
    this._spottedRight  = 0;
    this._kitchenTimers = { chica: 0, freddy: 0 };
    this._penaltyTicks  = { bonnie: 0, chica: 0, freddy: 0 };

    EventBus.on('cameraClosed',   ()   => this._onCamerasClosed());
    EventBus.on('cameraSwitched', (id) => this._onCameraSwitched(id));
  }

  // ── Update ───────────────────────────────────────────────────
  /**
   * Runs during OFFICE, CAMERA, and POWER_OUT.
   *
   * POWER_OUT behaviour:
   *   Phase 1 (deciding, 0-2 s):
   *     All animatronics tick. If Bonnie/Chica/Foxy are already at a
   *     blind spot with an open door they CAN jumpscare the player —
   *     the player should have closed the door before power ran out.
   *
   *   Phase 2+ (Freddy's sequence active):
   *     Bonnie/Chica/Foxy still MOVE (position updates continue) but
   *     are BLOCKED from firing a jumpscare. The screen belongs to Freddy.
   *     See _triggerJumpscare() for the guard.
   *
   *   Freddy's own tick is always skipped during POWER_OUT —
   *   PowerSystem owns his behaviour exclusively in that phase.
   */
  update(deltaTime) {
    const phase = this.state.phase;
    if (!this.state.isPlaying() && phase !== 'POWER_OUT') return;

    this._tickAccum += deltaTime;
    if (this._tickAccum >= CONFIG.AI_TICK_MS) {
      this._tickAccum -= CONFIG.AI_TICK_MS;
      this._doTick();
    }

    this._updateSpotted(deltaTime);
    this._updateKitchen(deltaTime);
  }

  _doTick() {
    this._tickBonnie();
    this._tickChica();
    this._tickFreddy(); // guards against POWER_OUT internally
    this._tickFoxy();
  }

  // ── Bonnie ───────────────────────────────────────────────────
  _tickBonnie() {
    const a = this.state.animatronics.bonnie;
    if (!a.active || a.aiLevel === 0) return;

    if (a.position === 'LEFT_BLIND_SPOT') {
      if (!this._roll(a)) return;

      if (this.state.isDoorClosed('left')) {
        this._penaltyTicks.bonnie = CONFIG.ATTACK_PENALTY_TICKS;
        this._forceRetreat('bonnie');
      } else {
        this._triggerJumpscare('bonnie');
      }
      return;
    }

    if (!this._roll(a)) return;
    this._graphMove('bonnie');
  }

  // ── Chica ─────────────────────────────────────────────────────
  _tickChica() {
    const a = this.state.animatronics.chica;
    if (!a.active || a.aiLevel === 0) return;

    if (a.position === 'RIGHT_BLIND_SPOT') {
      if (!this._roll(a)) return;

      if (this.state.isDoorClosed('right')) {
        this._penaltyTicks.chica = CONFIG.ATTACK_PENALTY_TICKS;
        this._forceRetreat('chica');
      } else {
        this._triggerJumpscare('chica');
      }
      return;
    }

    if (!this._roll(a)) return;
    this._graphMove('chica');
  }

  // ── Freddy ────────────────────────────────────────────────────
  /**
   * Completely skipped during POWER_OUT — PowerSystem owns Freddy then.
   * During normal play his RIGHT_BLIND_SPOT attack only fires if the door
   * is open AND the player is not shining the light (same as original).
   */
  _tickFreddy() {
    if (this.state.phase === 'POWER_OUT') return;

    const a = this.state.animatronics.freddy;
    if (!a.active || a.aiLevel === 0) return;

    if (CONFIG.FREDDY_UNOBSERVED_ONLY && this.state.cameraOpen) {
      const vis = CONFIG.CAM_POSITIONS[this.state.activeCam] || [];
      if (vis.includes(a.position)) return;
    }

    if (!this._roll(a)) return;

    if (a.position === 'RIGHT_BLIND_SPOT') {
      if (!this.state.isDoorClosed('right') && !this.state.rightLight) {
        this._triggerJumpscare('freddy');
      }
    } else {
      const oldPos = a.position;
      this._graphMove('freddy');

      if (a.position !== oldPos && a.position !== 'STAY' &&
          this.state.night >= CONFIG.FREDDY_LAUGH_MIN_NIGHT) {
        this.sound.play('freddy_laugh');
        EventBus.emit('freddyLaughed');
      }
    }
  }

  // ── Foxy ─────────────────────────────────────────────────────
  _tickFoxy() {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.active || foxy.running || foxy.waitingToRun) return;
    if (foxy.position !== 'PIRATE_COVE') return;

    const mod  = this.state.cameraOpen ? 0.05 : 1.0;
    const roll = Math.floor(Math.random() * 20);
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

  // ═══════════════════════════════════════════════════════════════
  // MOVEMENT
  // ═══════════════════════════════════════════════════════════════

  _graphMove(name) {
    const a = this.state.animatronics[name];
    const graph = MOVEMENT_GRAPH[name];
    if (!graph) return;

    const options = graph[a.position];
    if (!options || options.length === 0) return;

    let weighted = options;

    if (this._penaltyTicks[name] > 0) {
      this._penaltyTicks[name]--;
      weighted = options.map(o => {
        if (o.room === 'STAY') return { room: o.room, weight: o.weight * CONFIG.ATTACK_PENALTY_STAY_MULT };
        const targetOpts = graph[o.room];
        const isBackward = targetOpts ? targetOpts.some(t => t.room === a.position) : false;
        if (isBackward) return { room: o.room, weight: o.weight * CONFIG.ATTACK_PENALTY_BACK_MULT };
        return { room: o.room, weight: o.weight * CONFIG.ATTACK_PENALTY_FWD_MULT };
      });
    }

    const chosen = this._weightedRandom(weighted);
    if (chosen && chosen !== 'STAY') {
      this._moveTo(name, chosen);
    }
  }

  _forceRetreat(name) {
    if (name === 'freddy') return;

    const data = TELEPORT_ZONES[name];
    if (!data) return;

    const roll = Math.random();
    let selectedRooms = [];

    if (roll < data.far.weight) {
      selectedRooms = data.far.rooms;
    } else if (roll < (data.far.weight + data.mid.weight)) {
      selectedRooms = data.mid.rooms;
    } else {
      selectedRooms = data.close.rooms;
    }

    if (selectedRooms.length > 0) {
      const chosenRoom = selectedRooms[Math.floor(Math.random() * selectedRooms.length)];
      this._moveTo(name, chosenRoom);
    }
  }

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

  _moveTo(name, newRoom) {
    try {
      const a   = this.state.animatronics[name];
      const old = a.position;

      if (newRoom === old || newRoom === 'STAY') return;

      a.position = newRoom;
      EventBus.emit('animatronicMoved', { name, from: old, to: newRoom });

      this._playMoveSound(name, newRoom);

      if (name === 'chica') {
        if (String(newRoom).toUpperCase() === 'KITCHEN') {
          this.sound.play('kitchen_chica');
        }
      }
    } catch (e) {
      console.error('Error in _moveTo:', e);
    }
  }

  _playMoveSound(name, room) {
    if (name === 'freddy' && this.state.powerOutPhase === 0) return;
    const prob = SOUND_ZONES[room] ?? 0;
    if (Math.random() < prob) this.sound.play('animatronic_move');
  }

  // ═══════════════════════════════════════════════════════════════
  // FOXY
  // ═══════════════════════════════════════════════════════════════

  _foxyRun() {
    const foxy = this.state.animatronics.foxy;
    foxy.running      = true;
    foxy.runTimer     = 0;
    foxy.waitingToRun = false;
    foxy.peekShown    = false;
    foxy.position     = 'WEST_HALL';

    this.sound.play('foxy_run');
    EventBus.emit('foxyRunning');

    let lastTimestamp = performance.now();

    const step = (currentTimestamp) => {
      if (!this.state.isPlaying() && this.state.phase !== 'POWER_OUT') return;

      const dt = currentTimestamp - lastTimestamp;
      lastTimestamp = currentTimestamp;
      foxy.runTimer += dt;

      if (foxy.runTimer > 500 && foxy.position !== 'WEST_HALL_RUNNING') {
        foxy.position = 'WEST_HALL_RUNNING';
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'WEST_HALL_RUNNING' });
      }

      if (foxy.runTimer >= CONFIG.FOXY_CHARGE_DURATION_MS) {
        foxy.running  = false;
        foxy.position = 'LEFT_BLIND_SPOT';
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'LEFT_BLIND_SPOT' });
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
        foxy.position   = 'PIRATE_COVE';
        foxy.phaseTimer = 0;
        foxy.phase      = 0;
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'PIRATE_COVE' });
        EventBus.emit('foxyPhaseChanged', 0);
      }, 1200);
    } else {
      this._triggerJumpscare('foxy');
    }
  }

  _onCamerasClosed() {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.waitingToRun || foxy.running) return;
    foxy.waitingToRun = false;
    this._foxyRun();
  }

  _onCameraSwitched(camId) {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.waitingToRun || foxy.running || foxy.peekShown) return;
    if (camId !== '2A') return;
    foxy.peekShown = true;
    EventBus.emit('foxyPeekCam2A');
    setTimeout(() => {
      if (!this.state.isPlaying() && this.state.phase !== 'POWER_OUT') return;
      foxy.waitingToRun = false;
      this._foxyRun();
    }, CONFIG.FOXY_PEEK_DELAY_MS);
  }

  // ═══════════════════════════════════════════════════════════════
  // SPOTTED / KITCHEN / ROLL
  // ═══════════════════════════════════════════════════════════════

  startSpottedCountdown(side) {
    const delay = 4000 + Math.random() * 3000;
    if (side === 'left') this._spottedLeft  = delay;
    else                 this._spottedRight = delay;
  }

  cancelSpotted(side) {
    if (side === 'left') this._spottedLeft  = 0;
    else                 this._spottedRight = 0;
  }

  _updateSpotted(dt) {
    if (this._spottedLeft > 0) {
      this._spottedLeft -= dt;
      if (this._spottedLeft <= 0)  { this._spottedLeft  = 0; this._resolveSpotted('left'); }
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
    }
  }

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
        const graph   = MOVEMENT_GRAPH[name];
        const options = (graph && graph[a.position]) || [];
        const forward = options.filter(o =>
          o.room !== 'STAY' && o.room !== 'BATHROOMS' && o.room !== 'KITCHEN' &&
          o.room !== 'DINING' && o.room !== 'STAGE'
        );
        if (forward.length > 0) {
          const best = forward.reduce((b, o) => o.weight > b.weight ? o : b);
          this._moveTo(name, best.room);
        }
      }
    }
  }

  _roll(anim) {
    return Math.floor(Math.random() * CONFIG.ATTACK_ROLL_MAX) + 1 <= anim.aiLevel;
  }

  // ── Jumpscare trigger ─────────────────────────────────────────
  /**
   * Central jumpscare entry point for Bonnie, Chica, Foxy, and normal Freddy.
   * (Freddy's POWER_OUT attack goes through PowerSystem, not here.)
   *
   * Priority rule — mirrors original FNAF1 "power-out = Freddy's moment":
   *   Phase 1 (0-2 s deciding window): any animatronic can still jumpscare.
   *     The player had their chance to close the door before power ran out.
   *   Phase 2+ (Toreador March / eyes / countdown active): only Freddy's
   *     power-out sequence plays. Bonnie/Chica/Foxy are BLOCKED even if
   *     they are at a blind spot with an open door. They stay in position
   *     and continue moving, but cannot fire a jumpscare.
   *
   * Visual note: during POWER_OUT SceneRenderer ignores Bonnie/Chica
   * positions entirely and only shows backup_power / freddy_eyes images,
   * so there is zero visual conflict regardless of who is where.
   */
  _triggerJumpscare(who) {
    const s = this.state;

    // Already in a jumpscare or game-over — never double-fire
    if (s.phase === 'JUMPSCARE' || s.phase === 'GAME_OVER') return;

    // Freddy's sequence is running (phase 2+) — block all other jumpscares.
    // Phase 1 (0-2 s before the decision is made) is intentionally allowed,
    // because in that window power JUST cut out and the animatronic was
    // already standing at the door.
    if (s.phase === 'POWER_OUT' && s.powerOutPhase >= 2) return;

    s.jumpscareTarget = who;
    s.caughtBy        = who.charAt(0).toUpperCase() + who.slice(1);
    s.setPhase('JUMPSCARE');
    this.sound.stopAll();
    this.sound.play('jumpscare');
    EventBus.emit('jumpscare', who);
  }

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

  onNightStart() {
    const a = this.state.animatronics;
    a.freddy.position = 'STAGE';
    a.bonnie.position = 'STAGE';
    a.chica.position  = 'STAGE';
    a.foxy.position   = 'PIRATE_COVE';
    a.foxy.phase      = 0;
    a.foxy.phaseTimer = 0;
    this._tickAccum   = 0;
    this._penaltyTicks  = { bonnie: 0, chica: 0, freddy: 0 };
    this._kitchenTimers = { chica: 0, freddy: 0 };
  }
}