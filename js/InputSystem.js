'use strict';

/**
 * InputSystem
 * ─────────────────────────────────────────────────────────────
 * PC:
 *   Mouse move       → pan office
 *   Left/Right keys  → pan office
 *   Up/Down / W/S    → open/close cameras
 *   Click door btn   → toggle door
 *   Hold  light btn  → light ON while held, OFF on release
 *
 * Mobile:
 *   Touch drag X     → pan office
 *   Swipe up ≥40px   → open cameras
 *   Swipe down       → close cameras
 *   Tap  door btn    → toggle door
 *   Hold light btn   → light ON while pressed, OFF on release
 */
class InputSystem {
  constructor(state, officeSystem, cameraSystem) {
    this.state  = state;
    this.office = officeSystem;
    this.camera = cameraSystem;

    this._gc          = null;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._mouseDownY  = 0;
    this._mouseDown   = false;
    this._SWIPE_PX    = 35;
  }

  init() {
    this._gc = document.getElementById('game-container');
    if (!this._gc) { console.error('InputSystem: #game-container not found'); return; }

    this._bindMouse();
    this._bindTouch();
    this._bindPanelButtons();
    this._bindCameraHandles();
    this._bindKeyboard();
  }

  // ── Per-frame: smooth pan lerp ───────────────────────────────
  update(dt) {
    const s = this.state;
    if (!s.isPlaying() || s.cameraOpen) return;

    const alpha = 1 - Math.pow(0.008, dt / 1000);
    const diff  = s.panTarget - s.panCurrent;
    if (Math.abs(diff) > 0.0002) {
      s.panCurrent += diff * Math.min(alpha, 0.2);
    } else {
      s.panCurrent = s.panTarget;
    }
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

    gc.addEventListener('mousedown', (e) => {
      this._mouseDownY = e.clientY;
      this._mouseDown  = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (!this._mouseDown) return;
      this._mouseDown = false;

      const rect  = gc.getBoundingClientRect();
      const scale = rect.height / 540;
      const dy    = (this._mouseDownY - e.clientY) / scale;

      if (dy > this._SWIPE_PX) {
        if (!this.state.cameraOpen && this.state.isPlaying()) this.camera.open();
      } else if (dy < -this._SWIPE_PX) {
        if (this.state.cameraOpen) this.camera.close();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // TOUCH
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
      const rect = gc.getBoundingClientRect();
      const relX = (t.clientX - rect.left) / rect.width;
      this.state.panTarget = Math.max(0, Math.min(1, relX));
      e.preventDefault();
    }, { passive: false });

    gc.addEventListener('touchend', (e) => {
      const t     = e.changedTouches[0];
      const rect  = gc.getBoundingClientRect();
      const scale = rect.height / 540;
      const dx    = Math.abs(t.clientX - this._touchStartX);
      const dy    = (this._touchStartY - t.clientY) / scale;

      if (dx < 50) {
        if (dy > this._SWIPE_PX) {
          if (!this.state.cameraOpen && this.state.isPlaying()) this.camera.open();
        } else if (dy < -this._SWIPE_PX) {
          if (this.state.cameraOpen) this.camera.close();
        }
      }
      e.preventDefault();
    }, { passive: false });
  }

  // ════════════════════════════════════════════════════════════
  // PANEL BUTTONS
  // Door buttons → click/tap to toggle.
  // Light buttons → hold to activate, release to deactivate.
  // ════════════════════════════════════════════════════════════
  _bindPanelButtons() {
    const btns = document.querySelectorAll('.panel-btn');
    btns.forEach(btn => {
      const { side, action } = btn.dataset;

      if (action === 'door') {
        // ── DOOR: simple click toggle ──────────────────────
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.office.toggleDoor(side);
        });
        btn.addEventListener('touchstart', (e) => {
          e.stopPropagation();
        }, { passive: true });

      } else if (action === 'light') {
        // ── LIGHT: hold to activate ────────────────────────

        // PC: mousedown = ON, mouseup/mouseleave = OFF
        btn.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.office.setLight(side, true);
        });
        btn.addEventListener('mouseup', (e) => {
          e.stopPropagation();
          this.office.setLight(side, false);
        });
        btn.addEventListener('mouseleave', () => {
          // Release if mouse drifts off the button while held
          this.office.setLight(side, false);
        });

        // Mobile: touchstart = ON, touchend/touchcancel = OFF
        btn.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.office.setLight(side, true);
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
          e.stopPropagation();
          this.office.setLight(side, false);
        }, { passive: false });

        btn.addEventListener('touchcancel', (e) => {
          e.stopPropagation();
          this.office.setLight(side, false);
        }, { passive: false });
      }
    });

    // Safety net: if mouse is released anywhere on the window, turn lights off.
    // Handles the case where mouseup fires outside the button after a fast click.
    window.addEventListener('mouseup', () => {
      this.office.setLight('left',  false);
      this.office.setLight('right', false);
    });
  }

  // ════════════════════════════════════════════════════════════
  // CAMERA HANDLES
  // ════════════════════════════════════════════════════════════
  _bindCameraHandles() {
    const openHandle  = document.getElementById('cam-toggle-handle');
    const closeHandle = document.getElementById('cam-close-handle');

    if (openHandle) {
      openHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.isPlaying() && !this.state.cameraOpen) this.camera.open();
      });
    }
    if (closeHandle) {
      closeHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.cameraOpen) this.camera.close();
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  // KEYBOARD
  // ════════════════════════════════════════════════════════════
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.state.isPlaying()) return;
      switch (e.code) {
        case 'ArrowLeft':
          e.preventDefault();
          this.state.panTarget = Math.max(0, this.state.panTarget - 0.12);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.state.panTarget = Math.min(1, this.state.panTarget + 0.12);
          break;
        case 'ArrowUp': case 'KeyW':
          e.preventDefault();
          if (!this.state.cameraOpen) this.camera.open();
          break;
        case 'ArrowDown': case 'KeyS':
          e.preventDefault();
          if (this.state.cameraOpen) this.camera.close();
          break;
        // Keyboard light buttons (Q = left, E = right) — hold key
        case 'KeyQ':
          e.preventDefault();
          this.office.setLight('left', true);
          break;
        case 'KeyE':
          e.preventDefault();
          this.office.setLight('right', true);
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyQ') this.office.setLight('left',  false);
      if (e.code === 'KeyE') this.office.setLight('right', false);
    });
  }
}