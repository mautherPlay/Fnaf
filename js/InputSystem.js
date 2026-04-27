'use strict';

/**
 * InputSystem
 * ─────────────────────────────────────────────────────────────
 * PC:
 *   Mouse move      → pan office
 *   Click trigger zone → open / close cameras
 *   Hold light btn  → light on while pressed
 *   Click door btn  → toggle door
 *   Q / E keys      → hold for left / right light
 *   ↑↓ keys         → open / close cameras
 *   ←→ keys         → pan office
 *
 * Mobile:
 *   Touch drag X    → pan office
 *   Swipe UP  ≥50px → open cameras
 *   Swipe DOWN≥50px → close cameras
 *   Hold light btn  → light on while pressed
 *   Tap door btn    → toggle door
 *
 * Camera protection: must be open for ≥800 ms before close works.
 */
class InputSystem {
  constructor(state, officeSystem, cameraSystem) {
    this.state  = state;
    this.office = officeSystem;
    this.camera = cameraSystem;

    this._gc           = null;
    this._touchStartX  = 0;
    this._touchStartY  = 0;

    this._CAMERA_MIN_OPEN_MS = 800;
    this._cameraOpenedAt     = 0;
  }

  init() {
    this._gc = document.getElementById('game-container');
    if (!this._gc) return;

    this._bindMouse();
    this._bindTouch();
    this._bindPanelButtons();
    this._bindTriggerZones();
    this._bindKeyboard();
  }

  // ── Per-frame lerp ───────────────────────────────────────────
  update(dt) {
    const s = this.state;
    if (!s.isPlaying() || s.cameraOpen) return;
    const alpha = 1 - Math.pow(0.008, dt / 1000);
    const diff  = s.panTarget - s.panCurrent;
    if (Math.abs(diff) > 0.0002) s.panCurrent += diff * Math.min(alpha, 0.2);
    else s.panCurrent = s.panTarget;
  }

  // ════════════════════════════════════════════════════════════
  // MOUSE
  // ════════════════════════════════════════════════════════════
  _bindMouse() {
    const gc = this._gc;
    gc.addEventListener('mousemove', (e) => {
      if (!this.state.isPlaying() || this.state.cameraOpen) return;
      const rect = gc.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      this.state.panTarget = Math.max(0, Math.min(1, relX));
    });
  }

  // ════════════════════════════════════════════════════════════
  // TOUCH  (swipe up = open, swipe down = close)
  // ════════════════════════════════════════════════════════════
  _bindTouch() {
    const gc = this._gc;

    gc.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      this._touchStartX = t.clientX;
      this._touchStartY = t.clientY;
      e.preventDefault();
    }, { passive: false });

    gc.addEventListener('touchmove', (e) => {
      if (this.state.cameraOpen || !this.state.isPlaying()) return;
      const t    = e.touches[0];
      const dx   = Math.abs(t.clientX - this._touchStartX);
      const dy   = Math.abs(t.clientY - this._touchStartY);
      // Only pan if mostly horizontal
      if (dx > dy) {
        const rect = gc.getBoundingClientRect();
        const relX = (t.clientX - rect.left) / rect.width;
        this.state.panTarget = Math.max(0, Math.min(1, relX));
      }
      e.preventDefault();
    }, { passive: false });

    gc.addEventListener('touchend', (e) => {
      const t     = e.changedTouches[0];
      const rect  = gc.getBoundingClientRect();
      const scale = rect.height / 540;
      const dx    = Math.abs(t.clientX - this._touchStartX);
      const dy    = (this._touchStartY - t.clientY) / scale; // +ve = upward

      // Only treat as vertical swipe if mostly vertical
      if (Math.abs(dy) > 50 && dx < 60 && this.state.isPlaying()) {
        if (dy > 0 && !this.state.cameraOpen) {
          this._openCameras();
        } else if (dy < 0 && this.state.cameraOpen) {
          this._tryCloseCameras();
        }
      }
      e.preventDefault();
    }, { passive: false });
  }

  // ════════════════════════════════════════════════════════════
  // TRIGGER ZONES  — CLICK on PC, handled separately for touch
  // ════════════════════════════════════════════════════════════
  _bindTriggerZones() {
    const openZone  = document.getElementById('office-trigger-zone');
    const closeZone = document.getElementById('cam-trigger-zone');

    // ── Office zone: click → open cameras ─────────────────────
    if (openZone) {
      openZone.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.state.isPlaying() || this.state.cameraOpen) return;
        this._openCameras();
      });
    }

    // ── Camera zone: click → close cameras ────────────────────
    if (closeZone) {
      closeZone.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.state.cameraOpen) return;
        this._tryCloseCameras();
      });
    }
  }

  // ── Open cameras ─────────────────────────────────────────────
  _openCameras() {
    if (!this.state.isPlaying() || this.state.cameraOpen) return;
    this._cameraOpenedAt = performance.now();
    this.camera.open();

    const ot = document.getElementById('office-trigger-zone');
    const ct = document.getElementById('cam-trigger-zone');
    if (ot) ot.style.display = 'none';
    if (ct) ct.style.display = 'flex';
  }

  // ── Close cameras (with accidental-close protection) ─────────
  _tryCloseCameras() {
    if (!this.state.cameraOpen) return;
    if (performance.now() - this._cameraOpenedAt < this._CAMERA_MIN_OPEN_MS) return;

    this.camera.close();

    const ot = document.getElementById('office-trigger-zone');
    const ct = document.getElementById('cam-trigger-zone');
    if (ot) ot.style.display = 'flex';
    if (ct) ct.style.display = 'none';
  }

  // ════════════════════════════════════════════════════════════
  // PANEL BUTTONS
  // ════════════════════════════════════════════════════════════
  _bindPanelButtons() {
    document.querySelectorAll('.panel-btn').forEach(btn => {
      const { side, action } = btn.dataset;

      if (action === 'door') {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.office.toggleDoor(side); });
        btn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });

      } else if (action === 'light') {
        btn.addEventListener('mousedown',  (e) => { e.stopPropagation(); e.preventDefault(); this.office.setLight(side, true); });
        btn.addEventListener('mouseup',    (e) => { e.stopPropagation(); this.office.setLight(side, false); });
        btn.addEventListener('mouseleave', ()  => { this.office.setLight(side, false); });
        btn.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); this.office.setLight(side, true); }, { passive: false });
        btn.addEventListener('touchend',   (e) => { e.stopPropagation(); this.office.setLight(side, false); }, { passive: false });
        btn.addEventListener('touchcancel',(e) => { e.stopPropagation(); this.office.setLight(side, false); }, { passive: false });
      }
    });

    window.addEventListener('mouseup', () => {
      this.office.setLight('left',  false);
      this.office.setLight('right', false);
    });
  }

  // ════════════════════════════════════════════════════════════
  // KEYBOARD
  // ════════════════════════════════════════════════════════════
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.state.isPlaying()) return;
      switch (e.code) {
        case 'ArrowLeft':  e.preventDefault(); this.state.panTarget = Math.max(0, this.state.panTarget - 0.12); break;
        case 'ArrowRight': e.preventDefault(); this.state.panTarget = Math.min(1, this.state.panTarget + 0.12); break;
        case 'ArrowUp':  case 'KeyW':
          e.preventDefault();
          if (!this.state.cameraOpen) this._openCameras();
          break;
        case 'ArrowDown': case 'KeyS':
          e.preventDefault();
          if (this.state.cameraOpen) this._tryCloseCameras();
          break;
        case 'KeyQ': e.preventDefault(); this.office.setLight('left',  true);  break;
        case 'KeyE': e.preventDefault(); this.office.setLight('right', true);  break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyQ') this.office.setLight('left',  false);
      if (e.code === 'KeyE') this.office.setLight('right', false);
    });
  }
}