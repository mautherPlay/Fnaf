'use strict';

/**
 * FanSystem
 * ─────────────────────────────────────────────────────────────
 * Fan video + seamless ambience (Web Audio) + nose honk.
 *
 * Audio start rule:
 *   Ambience starts ONLY when EventBus emits 'phaseChange' → 'OFFICE'.
 *   This prevents double-play during the Night intro overlay.
 *
 * Power rule:
 *   Fan cannot be turned ON when state.power === 0.
 *   If power runs out while the fan is on, FanSystem.stopAmbience()
 *   is called from main.js via the 'powerOut' event, which cuts the
 *   audio. The fan video is hidden by SceneRenderer during POWER_OUT.
 *   On the next night start, resumeIfOn() restores the fan video and
 *   the 'phaseChange' → 'OFFICE' event restarts the audio.
 */
class FanSystem {
  constructor(state) {
    this.state    = state;
    this._fanOn   = true;

    this._actx    = null;
    this._ambBuf  = null;
    this._ambNode = null;
    this._ambGain = null;
    this._honkBuf = null;

    this._audioReady = false;

    this._fanVideo = null;
    this._fanBtn   = null;
    this._noseBtn  = null;
  }

  // ── Called once after DOMContentLoaded ────────────────────────
  init() {
    this._fanVideo = document.getElementById('fan-video');
    this._fanBtn   = document.getElementById('fan-hitbox');
    this._noseBtn  = document.getElementById('nose-hitbox');

    if (this._fanVideo) {
      this._fanVideo.loop        = true;
      this._fanVideo.muted       = true;
      this._fanVideo.playsInline = true;
      this._fanVideo.play().catch(() => {});
    }

    // Fan hitbox — tap to toggle, ignore swipes
    if (this._fanBtn) {
      this._fanTouchData = { startY: 0, startX: 0, isMoving: false };

      this._fanBtn.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        this._fanTouchData.startY    = t.clientY;
        this._fanTouchData.startX    = t.clientX;
        this._fanTouchData.isMoving  = false;
      }, { passive: true });

      this._fanBtn.addEventListener('touchmove', (e) => {
        const t  = e.touches[0];
        const dy = Math.abs(t.clientY - this._fanTouchData.startY);
        const dx = Math.abs(t.clientX - this._fanTouchData.startX);
        if (dy > 15 || dx > 15) this._fanTouchData.isMoving = true;
      }, { passive: true });

      this._fanBtn.addEventListener('touchend', (e) => {
        if (!this._fanTouchData.isMoving) {
          this._toggleFan();
          if (e.cancelable) e.preventDefault();
        }
      }, { passive: false });

      this._fanBtn.addEventListener('click', (e) => {
        if (e.detail !== 0) this._toggleFan();
      });
    }

    // Nose hitbox
    if (this._noseBtn) {
      ['mousedown', 'touchstart'].forEach(evt =>
        this._noseBtn.addEventListener(evt, e => {
          e.stopPropagation();
          e.preventDefault();
        }, { passive: false })
      );
      this._noseBtn.addEventListener('click',    e => { e.stopPropagation(); this._honk(); });
      this._noseBtn.addEventListener('touchend', e => {
        e.stopPropagation();
        e.preventDefault();
        this._honk();
      }, { passive: false });
    }

    this._loadAudio();

    // Start ambience only when the OFFICE phase begins
    EventBus.on('phaseChange', (phase) => {
      if (phase === 'OFFICE' && this._fanOn) {
        setTimeout(() => this._startAmbience(), 100);
      }
      if (phase === 'GAME_OVER' || phase === 'WIN' || phase === 'POWER_OUT') {
        this._stopAmbience();
      }
    });
  }

  // ── Load buffers ───────────────────────────────────────────────
  _loadAudio() {
    try {
      this._actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('FanSystem: Web Audio not available');
      return;
    }

    if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});

    const load = (url) =>
      fetch(url).then(r => r.arrayBuffer()).then(ab => this._actx.decodeAudioData(ab));

    load('assets/sounds/ambience.mp3')
      .then(buf => { this._ambBuf = buf; this._audioReady = true; })
      .catch(e => console.warn('FanSystem: could not load ambience.mp3', e));

    load('assets/sounds/freddy_nose_honk.mp3')
      .then(buf => { this._honkBuf = buf; })
      .catch(() => {});
  }

  // ── Ambience: start ────────────────────────────────────────────
  _startAmbience() {
    if (!this._actx || !this._ambBuf) return;
    if (this._ambNode) return;

    if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});

    this._ambGain = this._actx.createGain();
    this._ambGain.gain.value = 0.10;
    this._ambGain.connect(this._actx.destination);

    this._ambNode = this._actx.createBufferSource();
    this._ambNode.buffer = this._ambBuf;
    this._ambNode.loop   = true;
    this._ambNode.connect(this._ambGain);
    this._ambNode.start(0);
  }

  // ── Ambience: stop ────────────────────────────────────────────
  _stopAmbience() {
    if (this._ambNode) {
      try { this._ambNode.stop(); }      catch (_) {}
      try { this._ambNode.disconnect(); } catch (_) {}
      this._ambNode = null;
    }
    if (this._ambGain) {
      try { this._ambGain.disconnect(); } catch (_) {}
      this._ambGain = null;
    }
  }

  // ── Fan toggle ────────────────────────────────────────────────
  /**
   * Blocked when power === 0.
   * The fan has no electricity — it cannot spin.
   * Attempting to turn it on when dead is silently ignored.
   */
  _toggleFan() {
    // Cannot turn the fan ON without power
    if (!this._fanOn && this.state.power <= 0) return;

    this._fanOn = !this._fanOn;

    if (this._fanOn) {
      if (this._fanVideo) {
        this._fanVideo.style.display = 'block';
        this._fanVideo.play().catch(() => {});
      }
      if (this.state.isPlaying()) this._startAmbience();
    } else {
      if (this._fanVideo) {
        this._fanVideo.pause();
        this._fanVideo.style.display = 'none';
      }
      this._stopAmbience();
    }

    EventBus.emit('fanToggled', this._fanOn);
  }

  // ── Freddy nose honk ──────────────────────────────────────────
  _honk() {
    if (this._actx && this._honkBuf) {
      const src  = this._actx.createBufferSource();
      const gain = this._actx.createGain();
      src.buffer      = this._honkBuf;
      gain.gain.value = 0.9;
      src.connect(gain);
      gain.connect(this._actx.destination);
      src.start(0);
    } else {
      const a = new Audio('assets/sounds/freddy_nose_honk.mp3');
      a.volume = 0.9;
      a.play().catch(() => {});
    }
  }

  // ── Public API ────────────────────────────────────────────────

  stopAmbience() { this._stopAmbience(); }

  resumeIfOn() {
    if (!this._fanOn) return;
    if (this._fanVideo) {
      this._fanVideo.style.display = 'block';
      this._fanVideo.play().catch(() => {});
    }
    // Audio is restarted by 'phaseChange' → 'OFFICE' event
  }

  get fanOn() { return this._fanOn; }
}