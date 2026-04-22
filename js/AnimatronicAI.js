'use strict';

/**
 * AnimatronicAI
 * ─────────────────────────────────────────────────────────────
 * Faithful FNAF-1 AI for Freddy, Bonnie, Chica, and Foxy.
 *
 * Movement mechanic (Bonnie / Chica / Freddy):
 *   Every _tickInterval ms → roll 1-20 die.
 *   If roll ≤ aiLevel → advance one step along route.
 *   aiLevel 0 = never moves.  aiLevel 20 = always moves.
 *
 * _tickInterval:
 *   Base: CONFIG.AI_TICK_MS (4970 ms).
 *   Reduced by 100ms per aiLevel point, floor at 2000ms.
 *   (Old floor was 1000ms which made high-level nights too fast.)
 *
 * Foxy (reworked):
 *   phaseTimer accumulates while NOT watching CAM 1C.
 *   Watching CAM 1C SLOWLY decays the timer (FOXY_DECAY_RATE = 0.3 s/s).
 *   Phase changes at multiples of FOXY_PHASE_INTERVAL (20 s).
 *   When timer ≥ FOXY_TIMER_MAX (90 s) → Foxy runs.
 *   On reaching left door:
 *     - Door CLOSED  → knocks, loses some power, retreats.
 *     - Door OPEN    → emits 'foxyPeek' → SceneRenderer plays peek video
 *                      → then jumpscare triggers.
 *
 * Freddy:
 *   Only moves while NOT being watched on his current camera.
 *   Right-door attack: only when light is OFF (Freddy in dark).
 */
class AnimatronicAI {
  constructor(state, soundSystem) {
    this.state = state;
    this.sound = soundSystem;
  }

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

    // Freddy freezes while player watches his camera
    if (CONFIG.FREDDY_UNOBSERVED_ONLY && this.state.cameraOpen) {
      const visible = CONFIG.CAM_POSITIONS[this.state.activeCam] || [];
      if (visible.includes(a.position)) {
        a.tickTimer = 0;
        return;
      }
    }

    a.tickTimer += dt;
    if (a.tickTimer >= this._tickInterval(a)) {
      a.tickTimer = 0;
      if (this._roll(a)) {
        const prevIdx = a.routeIndex;
        this._advance('freddy');
        if (a.routeIndex > prevIdx && this.state.night >= CONFIG.FREDDY_LAUGH_MIN_NIGHT) {
          this.sound.play('freddy_laugh');
          EventBus.emit('freddyLaughed');
        }
      }
    }
  }

  // ── Foxy (reworked) ───────────────────────────────────────────
  _tickFoxy(dt) {
    const foxy = this.state.animatronics.foxy;
    if (!foxy.active) return;

    // ── Running sequence ──────────────────────────────────────
    if (foxy.running) {
      foxy.runTimer += dt;

      if (foxy.runTimer > 500 && foxy.position !== 'WEST_HALL_RUNNING') {
        foxy.position = 'WEST_HALL_RUNNING';
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'WEST_HALL_RUNNING' });
      }

      if (foxy.runTimer >= CONFIG.FOXY_CHARGE_DURATION_MS) {
        foxy.running  = false;
        foxy.runTimer = 0;
        foxy.position = 'LEFT_BLIND_SPOT';
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'LEFT_BLIND_SPOT' });
        this._foxyAtDoor();
      }
      return;
    }

    // ── Only accumulate timer while in Pirate Cove ────────────
    if (foxy.position !== 'PIRATE_COVE') return;

    const watching = this.state.cameraOpen && this.state.activeCam === '1C';

    if (watching) {
      // Watching gently rolls back progress (0.3 s/s — much slower than old 1.5)
      foxy.phaseTimer = Math.max(0, foxy.phaseTimer - (dt / 1000) * CONFIG.FOXY_DECAY_RATE);
    } else {
      // Not watching: timer advances based on aiLevel
      const speed = CONFIG.FOXY_SPEED_BASE + (foxy.aiLevel * CONFIG.FOXY_SPEED_PER_LEVEL);
      foxy.phaseTimer += (dt / 1000) * speed;
    }

    // ── Phase update (0–3) ───────────────────────────────────
    const newPhase = Math.min(3, Math.floor(foxy.phaseTimer / CONFIG.FOXY_PHASE_INTERVAL));
    if (newPhase !== foxy.phase) {
      foxy.phase = newPhase;
      EventBus.emit('foxyPhaseChanged', newPhase);
    }

    // ── Launch run at timer max ──────────────────────────────
    if (foxy.phaseTimer >= CONFIG.FOXY_TIMER_MAX) {
      this._foxyRun();
    }
  }

  _foxyRun() {
    const foxy = this.state.animatronics.foxy;
    foxy.running    = true;
    foxy.runTimer   = 0;
    foxy.position   = 'WEST_HALL';
    this.sound.play('foxy_run');
    EventBus.emit('foxyRunning');
  }

  _foxyAtDoor() {
    const state = this.state;
    const foxy  = state.animatronics.foxy;

    if (state.isDoorClosed('left')) {
      // ── Blocked: knock and drain power ──────────────────
      const drain = CONFIG.FOXY_KNOCK_POWER * 3;
      state.power = Math.max(0, state.power - drain);
      EventBus.emit('foxyKnock');
      EventBus.emit('powerChanged', state.power);

      // Retreat to Pirate Cove at reduced phase
      setTimeout(() => {
        foxy.position   = 'PIRATE_COVE';
        foxy.phaseTimer = Math.max(0, foxy.phaseTimer - 30);
        foxy.phase      = Math.min(3, Math.floor(foxy.phaseTimer / CONFIG.FOXY_PHASE_INTERVAL));
        foxy.running    = false;
        foxy.runTimer   = 0;
        EventBus.emit('animatronicMoved', { name: 'foxy', to: 'PIRATE_COVE' });
      }, 1_500);

    } else {
      // ── Door open: emit peek event ────────────────────────
      // SceneRenderer listens for 'foxyPeek' and plays the peek video,
      // then triggers the jumpscare itself.
      this.sound.stopAll();
      this.sound.play('jumpscare');
      EventBus.emit('foxyPeek');
    }
  }

  // ── Left-door attack check (Bonnie) ──────────────────────────
  _checkLeftAttack(dt) {
    const bonnie = this.state.animatronics.bonnie;
    if (bonnie.position !== 'LEFT_BLIND_SPOT') { bonnie.attackTimer = 0; return; }
    if (this.state.isDoorClosed('left'))        { bonnie.attackTimer = 0; return; }
    if (!this.state.isPlaying()) return;

    bonnie.attackTimer += dt;
    if (bonnie.attackTimer >= CONFIG.ATTACK_CHECK_MS) {
      bonnie.attackTimer = 0;
      if (this._roll(bonnie) && Math.random() < CONFIG.ATTACK_CHANCE) {
        this._triggerJumpscare('bonnie');
      }
    }
  }

  // ── Right-door attack check (Chica / Freddy) ─────────────────
  _checkRightAttack(dt) {
    this._checkRightFor('chica', dt);
    this._checkRightFor('freddy', dt);
  }

  _checkRightFor(name, dt) {
    const a = this.state.animatronics[name];
    if (a.position !== 'RIGHT_BLIND_SPOT') { a.attackTimer = 0; return; }
    if (this.state.isDoorClosed('right'))   { a.attackTimer = 0; return; }
    if (!this.state.isPlaying()) return;

    // Freddy only attacks in the dark (light off)
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

    const r = Math.random();
    if (r < 0.80 && idx < route.length - 1) {
      idx++;
    } else if (r < 0.85 && idx > 0) {
      idx--;
    }
    // else stay at same position

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
    // Original FNAF mechanic: roll 1-20, move if ≤ aiLevel
    return Math.floor(Math.random() * CONFIG.ATTACK_ROLL_MAX) + 1 <= anim.aiLevel;
  }

  _tickInterval(anim) {
    // Higher aiLevel = shorter interval, minimum 2000 ms
    // (old: 1000 ms min made very high-level nights too brutal)
    return Math.max(2_000, CONFIG.AI_TICK_MS - anim.aiLevel * 100);
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

  // ── Called by NightSystem on night start ─────────────────────
  onNightStart() {
    const a = this.state.animatronics;

    a.freddy.position  = 'STAGE';  a.freddy.routeIndex = 0;
    a.bonnie.position  = 'STAGE';  a.bonnie.routeIndex = 0;
    a.chica.position   = 'STAGE';  a.chica.routeIndex  = 0;
    a.foxy.position    = 'PIRATE_COVE';
    a.foxy.phase       = 0;
    a.foxy.phaseTimer  = 0;
    a.foxy.running     = false;
    a.foxy.runTimer    = 0;

    [a.freddy, a.bonnie, a.chica].forEach(x => {
      x.tickTimer    = 0;
      x.attackTimer  = 0;
      x.facingCamera = false;
    });
  }
}