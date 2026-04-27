'use strict';

/**
 * FanSystem
 * ─────────────────────────────────────────────────────────────
 * Fan video + seamless ambience (Web Audio) + nose honk.
 *
 * Audio start rule:
 *   Ambience starts ONLY when EventBus emits 'phaseChange' → 'OFFICE'.
 *   This prevents double-play during the Night intro overlay.
 *   There is ONE audio path — no fallback <audio> running in parallel.
 *
 * Seamless loop:
 *   AudioBufferSourceNode.loop = true — zero gap between iterations.
 */
class FanSystem {
  constructor(state) {
    this.state    = state;
    this._fanOn   = true;

    this._actx    = null;   // AudioContext
    this._ambBuf  = null;   // AudioBuffer for ambience.mp3
    this._ambNode = null;   // currently playing BufferSourceNode
    this._ambGain = null;   // GainNode (volume)
    this._honkBuf = null;   // AudioBuffer for freddy_nose_honk.mp3

    this._audioReady = false;  // true once actx + ambBuf are loaded

    this._fanVideo = null;
    this._fanBtn   = null;
    this._noseBtn  = null;
  }

  // ── Called once after DOMContentLoaded ────────────────────────
  init() {
    this._fanVideo = document.getElementById('fan-video');
    this._fanBtn   = document.getElementById('fan-hitbox');
    this._noseBtn  = document.getElementById('nose-hitbox');

    // Fan video — muted, loops visually, starts immediately
    if (this._fanVideo) {
      this._fanVideo.loop       = true;
      this._fanVideo.muted      = true;
      this._fanVideo.playsInline = true;
      this._fanVideo.play().catch(() => {});
    }

    // Fan hitbox
    if (this._fanBtn) {
      ['mousedown', 'touchstart'].forEach(evt =>
        this._fanBtn.addEventListener(evt, e => e.stopPropagation(), { passive: true })
      );
      this._fanBtn.addEventListener('click', e => {
        e.stopPropagation();
        this._toggleFan();
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
      this._noseBtn.addEventListener('click', e => {
        e.stopPropagation();
        this._honk();
      });
      this._noseBtn.addEventListener('touchend', e => {
        e.stopPropagation();
        e.preventDefault();
        this._honk();
      }, { passive: false });
    }

    // Load audio buffers immediately (warning modal already clicked = user gesture done)
    this._loadAudio();

    // Start ambience only when the OFFICE phase begins
    EventBus.on('phaseChange', (phase) => {
      if (phase === 'OFFICE' && this._fanOn) {
        // Small delay so the intro animation finishes before sound
        setTimeout(() => this._startAmbience(), 100);
      }
      if (phase === 'GAME_OVER' || phase === 'WIN' || phase === 'POWER_OUT') {
        this._stopAmbience();
      }
    });
  }

  // ── Load buffers via Web Audio API ────────────────────────────
  _loadAudio() {
    try {
      this._actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('FanSystem: Web Audio not available');
      return;
    }

    if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});

    const load = (url) => fetch(url).then(r => r.arrayBuffer()).then(ab => this._actx.decodeAudioData(ab));

    load('assets/sounds/ambience.mp3')
      .then(buf => { this._ambBuf = buf; this._audioReady = true; })
      .catch(e => console.warn('FanSystem: could not load ambience.mp3', e));

    load('assets/sounds/freddy_nose_honk.mp3')
      .then(buf => { this._honkBuf = buf; })
      .catch(() => {});
  }

  // ── Ambience: start (only one instance ever runs) ─────────────
  _startAmbience() {
    if (!this._actx || !this._ambBuf) return;
    if (this._ambNode) return;  // already playing — do NOT create a second one

    if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});

    this._ambGain = this._actx.createGain();
    this._ambGain.gain.value = 0.28;   // quiet background hum
    this._ambGain.connect(this._actx.destination);

    this._ambNode = this._actx.createBufferSource();
    this._ambNode.buffer = this._ambBuf;
    this._ambNode.loop   = true;  // gap-free loop
    this._ambNode.connect(this._ambGain);
    this._ambNode.start(0);
  }

  // ── Ambience: stop ────────────────────────────────────────────
  _stopAmbience() {
    if (this._ambNode) {
      try { this._ambNode.stop(); } catch (_) {}
      try { this._ambNode.disconnect(); } catch (_) {}
      this._ambNode = null;
    }
    if (this._ambGain) {
      try { this._ambGain.disconnect(); } catch (_) {}
      this._ambGain = null;
    }
  }

  // ── Fan toggle ────────────────────────────────────────────────
  _toggleFan() {
    this._fanOn = !this._fanOn;

    if (this._fanOn) {
      if (this._fanVideo) {
        this._fanVideo.style.display = 'block';
        this._fanVideo.play().catch(() => {});
      }
      // Only start sound if we're in the office (game is playing)
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

  // ── Public API (called from main.js) ─────────────────────────

  /** Stop ambience — called on power-out or game-over */
  stopAmbience() { this._stopAmbience(); }

  /** Resume after night restart (called by 'nightStarted' event) */
  resumeIfOn() {
    if (!this._fanOn) return;
    if (this._fanVideo) {
      this._fanVideo.style.display = 'block';
      this._fanVideo.play().catch(() => {});
    }
    // Don't start audio here — phaseChange → OFFICE will trigger it
  }

  get fanOn() { return this._fanOn; }
}