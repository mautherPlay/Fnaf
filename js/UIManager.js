'use strict';

/**
 * UIManager
 * ─────────────────────────────────────────────────────────────
 * Manages all DOM elements that display game state:
 *   • HUD (time, power, night number)
 *   • Camera button panel (dynamic, from CONFIG.CAMERAS)
 *   • Phase-based overlay visibility
 *   • Game-over / win screens
 *
 * All updates are event-driven (via EventBus).
 * update() exists for any per-frame needs but is currently no-op.
 */
class UIManager {
  constructor(state, powerSystem, cameraSystem) {
    this.state  = state;
    this.power  = powerSystem;
    this.camera = cameraSystem;
  }

  // ── Called once after DOM is ready ──────────────────────────
  init() {
    this._buildCameraButtons();
    this._bindOverlayButtons();
    this._bindEventBus();
    // Set initial state in UI
    this.highlightCamBtn(this.state.activeCam);
    this.updateTime(0);
    this.updatePower(100);
  }

  // ── Per-frame (currently no-op — everything is event-driven) ─
  update() {}

  // ════════════════════════════════════════════════════════════
  // CAMERA BUTTONS
  // ════════════════════════════════════════════════════════════
  _buildCameraButtons() {
    const container = document.getElementById('cam-buttons-container');
    if (!container) return;
    container.innerHTML = '';

    CONFIG.CAMERAS.forEach(cam => {
      const btn = document.createElement('button');
      btn.className   = 'cam-btn';
      btn.id          = `cam-btn-${cam.id}`;
      btn.dataset.camId = cam.id;
      // Two lines: "CAM 1A" (bold) + short room name
      btn.innerHTML   = `<span class="cam-btn-id">${cam.label}</span>${cam.name}`;
      btn.addEventListener('click', () => {
        this.camera.switchTo(cam.id);
      });
      container.appendChild(btn);
    });
  }

  /** Highlight the active camera button; update the label bar */
  highlightCamBtn(camId) {
    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.camId === camId);
    });

    const def   = CONFIG.CAMERAS.find(c => c.id === camId);
    const label = document.getElementById('cam-label-text');
    if (def && label) {
      label.textContent = `${def.label} - ${def.name.toUpperCase()}`;
    }
  }

  // ════════════════════════════════════════════════════════════
  // HUD UPDATES
  // ════════════════════════════════════════════════════════════
  updateTime(hour) {
    const el = document.getElementById('time-display');
    if (el) el.textContent = CONFIG.HOUR_LABELS[hour] ?? '12 AM';
  }

  updatePower(power) {
    const pctEl  = document.getElementById('power-pct');
    const barsEl = document.getElementById('power-bars');

    if (pctEl)  pctEl.textContent  = Math.ceil(power);

    if (barsEl) {
      const devices = this.power.getActiveDevices(); // 1–6
      const TOTAL   = 6;
      const filled  = Math.min(devices, TOTAL);
      barsEl.textContent = '■'.repeat(filled) + '□'.repeat(TOTAL - filled);

      // Colour shift: green → amber → red as power depletes
      if (power > 50) {
        barsEl.style.color = '#7dff7d';
      } else if (power > 20) {
        barsEl.style.color = '#ffd060';
        if (pctEl) pctEl.style.color = '#ffd060';
      } else {
        barsEl.style.color = '#ff6060';
        if (pctEl) pctEl.style.color = '#ff6060';
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // PHASE MANAGEMENT
  // ════════════════════════════════════════════════════════════
  onPhaseChange(phase) {
    const hud    = document.getElementById('hud');
    const toggle = document.getElementById('cam-toggle-handle');

    const isPlaying = phase === 'OFFICE' || phase === 'CAMERA';

    // Show HUD only while playing
    if (hud)    hud.style.display    = isPlaying ? 'block' : 'none';
    // Camera raise handle only in office mode
    if (toggle) toggle.style.display = (phase === 'OFFICE') ? 'flex' : 'none';
  }

  onNightStarted(night) {
    const nd = document.getElementById('night-display');
    if (nd) nd.textContent = `Night ${night}`;
    this.updateTime(0);
    this.updatePower(100);
    // Reset power bar colour
    const pctEl  = document.getElementById('power-pct');
    const barsEl = document.getElementById('power-bars');
    if (pctEl)  pctEl.style.color  = '#fff';
    if (barsEl) barsEl.style.color = '#7dff7d';
  }

  // ════════════════════════════════════════════════════════════
  // GAME OVER / WIN SCREENS
  // ════════════════════════════════════════════════════════════
  showGameOver(who) {
    const overlay = document.getElementById('gameover-overlay');
    const whoEl   = document.getElementById('gameover-who');
    const hud     = document.getElementById('hud');
    const toggle  = document.getElementById('cam-toggle-handle');

    if (whoEl)   whoEl.textContent   = who || 'an animatronic';
    if (overlay) overlay.style.display = 'flex';
    if (hud)     hud.style.display     = 'none';
    if (toggle)  toggle.style.display  = 'none';
  }

  showWin(night) {
    const overlay  = document.getElementById('win-overlay');
    const subEl    = document.getElementById('win-sub');
    const nextBtn  = document.getElementById('btn-next-night');
    const hud      = document.getElementById('hud');
    const toggle   = document.getElementById('cam-toggle-handle');

    if (subEl)   subEl.textContent     = `Night ${night} complete!`;
    if (nextBtn) nextBtn.disabled      = (night >= 5);
    if (overlay) overlay.style.display = 'flex';
    if (hud)     hud.style.display     = 'none';
    if (toggle)  toggle.style.display  = 'none';
  }

  // ════════════════════════════════════════════════════════════
  // EVENT BUS BINDINGS
  // ════════════════════════════════════════════════════════════
  _bindEventBus() {
    EventBus.on('phaseChange',    (p)   => this.onPhaseChange(p));
    EventBus.on('hourChanged',    (h)   => this.updateTime(h));
    EventBus.on('powerChanged',   (p)   => this.updatePower(p));
    EventBus.on('nightStarted',   (n)   => this.onNightStarted(n));
    EventBus.on('cameraSwitched', (id)  => this.highlightCamBtn(id));
    EventBus.on('gameOver',       (who) => this.showGameOver(who));
    EventBus.on('nightComplete',  (n)   => this.showWin(n));
  }

  // ════════════════════════════════════════════════════════════
  // OVERLAY BUTTON HANDLERS
  // ════════════════════════════════════════════════════════════
  _bindOverlayButtons() {
    const $ = (id) => document.getElementById(id);

    // Game-over buttons
    const retry  = $('btn-retry');
    const menuGo = $('btn-menu-go');
    if (retry)  retry.addEventListener( 'click', () => EventBus.emit('retryNight'));
    if (menuGo) menuGo.addEventListener('click', () => { window.location.href = 'index.html'; });

    // Win buttons
    const next    = $('btn-next-night');
    const winMenu = $('btn-win-menu');
    if (next)    next.addEventListener(   'click', () => EventBus.emit('nextNight'));
    if (winMenu) winMenu.addEventListener('click', () => { window.location.href = 'index.html'; });
  }
}