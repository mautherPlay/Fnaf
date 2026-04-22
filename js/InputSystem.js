'use strict';

/**
 * InputSystem
 * ─────────────────────────────────────────────────────────────
 * Handles all user input for the game.
 *
 * PC:
 *   • Mouse move       → pan office (left/right)
 *   • Left/Right keys  → pan office
 *   • Up/Down keys     → open/close cameras
 *   • Click panel btns → door / light toggle
 *
 * Mobile:
 *   • Touch drag X     → pan office
 *   • Swipe up (≥40px) → open cameras
 *   • Swipe down       → close cameras
 *   • Tap panel btns   → door / light toggle
 *
 * Coordinate note:
 *   All coordinates are divided by the CSS scale so that
 *   game-space positions are always in the 1200×540 system.
 */
class InputSystem {
  constructor(state, officeSystem, cameraSystem) {
    this.state  = state;
    this.office = officeSystem;
    this.camera = cameraSystem;

    this._gc            = null;   // #game-container element
    this._touchStartX   = 0;
    this._touchStartY   = 0;
    this._mouseDownY    = 0;
    this._mouseDown     = false;
    this._SWIPE_PX      = 35;    // minimum vertical distance to trigger swipe
  }

  // ── init (call after DOMContentLoaded) ───────────────────────
  init() {
    this._gc = document.getElementById('game-container');
    if (!this._gc) { console.error('InputSystem: #game-container not found'); return; }

    this._bindMouse();
    this._bindTouch();
    this._bindPanelButtons();
    this._bindCameraHandles();
    this._bindKeyboard();
  }

  // ── Per-frame update: smooth lerp toward panTarget ───────────
  update(dt) {
    const s = this.state;
    if (!s.isPlaying() || s.cameraOpen) return;

    // Time-consistent exponential lerp
    // Tuned so pan reaches target in ~150 ms regardless of frame rate
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

    // Pan on mouse move (only in office, not while cameras open)
    gc.addEventListener('mousemove', (e) => {
      if (!this.state.isPlaying() || this.state.cameraOpen) return;
      const rect = gc.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      this.state.panTarget = Math.max(0, Math.min(1, relX));
    });

    // Track mousedown for drag-up-to-open-camera
    gc.addEventListener('mousedown', (e) => {
      this._mouseDownY = e.clientY;
      this._mouseDown  = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (!this._mouseDown) return;
      this._mouseDown = false;

      const rect  = gc.getBoundingClientRect();
      const scale = rect.height / 540;
      const dy    = (this._mouseDownY - e.clientY) / scale; // positive = upward

      if (dy > this._SWIPE_PX) {
        // Drag up → open camera
        if (!this.state.cameraOpen && this.state.isPlaying()) {
          this.camera.open();
        }
      } else if (dy < -this._SWIPE_PX) {
        // Drag down → close camera
        if (this.state.cameraOpen) {
          this.camera.close();
        }
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
      if (this.state.cameraOpen) return;
      if (!this.state.isPlaying()) return;

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

      const dx = Math.abs(t.clientX - this._touchStartX);
      const dy = (this._touchStartY - t.clientY) / scale; // positive = upward

      // Only treat as vertical swipe if not a horizontal pan gesture
      if (dx < 50) {
        if (dy > this._SWIPE_PX) {
          if (!this.state.cameraOpen && this.state.isPlaying()) {
            this.camera.open();
          }
        } else if (dy < -this._SWIPE_PX) {
          if (this.state.cameraOpen) {
            this.camera.close();
          }
        }
      }
      e.preventDefault();
    }, { passive: false });
  }

  // ════════════════════════════════════════════════════════════
  // PANEL BUTTONS (door & light hitboxes on button panels)
  // ════════════════════════════════════════════════════════════
  _bindPanelButtons() {
    // Use direct selectors — the buttons are real DOM elements inside
    // #scene-background and receive native click events correctly.
    const btns = document.querySelectorAll('.panel-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { side, action } = btn.dataset;
        if (action === 'door') {
          this.office.toggleDoor(side);
        } else if (action === 'light') {
          this.office.toggleLight(side);
        }
      });

      // Mobile: touchstart → immediate response (no 300ms delay)
      btn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: true });
    });
  }

  // ════════════════════════════════════════════════════════════
  // CAMERA TOGGLE HANDLES
  // ════════════════════════════════════════════════════════════
  _bindCameraHandles() {
    // Raise monitor handle (in office view, bottom of screen)
    const openHandle = document.getElementById('cam-toggle-handle');
    if (openHandle) {
      openHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.isPlaying() && !this.state.cameraOpen) {
          this.camera.open();
        }
      });
    }

    // Lower monitor handle (in camera view, bottom)
    const closeHandle = document.getElementById('cam-close-handle');
    if (closeHandle) {
      closeHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.cameraOpen) {
          this.camera.close();
        }
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  // KEYBOARD  (PC convenience)
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
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault();
          if (!this.state.cameraOpen) this.camera.open();
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          if (this.state.cameraOpen) this.camera.close();
          break;
      }
    });
  }
}