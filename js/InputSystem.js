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

  const delta = dt || 16.6;

  // Если скорость задана (палец прижат), прибавляем её к текущей позиции
  if (s.panSpeed !== 0) {
    s.panCurrent += s.panSpeed * (delta / 16.6);
  }

  // Ограничители
  if (s.panCurrent < 0) s.panCurrent = 0;
  if (s.panCurrent > 1) s.panCurrent = 1;

  const scene = document.getElementById('scene-background');
  if (scene) {
    const xOffset = -s.panCurrent * 720;
    scene.style.transform = `translate3d(${xOffset}px, 0, 0)`;
  }
}

  // ════════════════════════════════════════════════════════════
  // MOUSE
  // ════════════════════════════════════════════════════════════
  _bindMouse() {
  const gc = this._gc;
  
  gc.addEventListener('mousemove', (e) => {
    if (!this.state.isPlaying() || this.state.cameraOpen) {
      this.state.panSpeed = 0;
      return;
    }

    const rect = gc.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * 2 - 1;

    const deadzone = 0.15;
    const maxSpeed = 0.045; // Повышенная скорость для ноутбука

    if (Math.abs(relX) < deadzone) {
      this.state.panSpeed = 0;
    } else {
      const direction = relX > 0 ? 1 : -1;
      const force = (Math.abs(relX) - deadzone) / (1 - deadzone);
      this.state.panSpeed = direction * force * maxSpeed;
    }
  });

  gc.addEventListener('mouseleave', () => { this.state.panSpeed = 0; });
}

  // ════════════════════════════════════════════════════════════
  // TOUCH  (swipe up = open, swipe down = close)
  // ════════════════════════════════════════════════════════════
  _bindTouch() {
  const gc = this._gc;

  const updatePanFromTouch = (e) => {
    const t = e.touches[0];
    const rect = gc.getBoundingClientRect();
    // Определяем положение пальца: -1 (лево), 0 (центр), 1 (право)
    const relX = ((t.clientX - rect.left) / rect.width) * 2 - 1;

    const deadzone = 0.1; 
    const maxSpeed = 0.05; // Ещё быстрее для телефона

    if (Math.abs(relX) < deadzone) {
      this.state.panSpeed = 0;
    } else {
      const direction = relX > 0 ? 1 : -1;
      const force = (Math.abs(relX) - deadzone) / (1 - deadzone);
      // Математика разгона
      this.state.panSpeed = direction * Math.pow(force, 1.1) * maxSpeed;
    }
  };

  gc.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    this._touchStartX = t.clientX;
    this._touchStartY = t.clientY;
    
    if (!this.state.cameraOpen) {
      updatePanFromTouch(e); // Сразу вычисляем скорость при касании
    }
  }, { passive: false });

  gc.addEventListener('touchmove', (e) => {
    if (!this.state.cameraOpen && this.state.isPlaying()) {
      updatePanFromTouch(e); // Обновляем скорость при движении пальца
    }
    e.preventDefault();
  }, { passive: false });

  gc.addEventListener('touchend', (e) => {
    this.state.panSpeed = 0; // Останавливаем камеру, когда палец поднят

    // ТВОЙ КОД СВАЙПА КАМЕР (ОБНОВЛЕННЫЙ)
    const t = e.changedTouches[0];
    const rect = gc.getBoundingClientRect();
    const scale = rect.height / 540;
    const dx = Math.abs(t.clientX - this._touchStartX);
    const dy = (this._touchStartY - t.clientY) / scale;

    // ПАРАМЕТРЫ ЗАЩИТЫ: 
    // dy > 100 (длина свайпа), dx < 40 (вертикальность), bottom - 120 (зона у нижнего края)
    const isBottomZone = this._touchStartY > (rect.bottom - 180 * scale);
    const isLongSwipe = Math.abs(dy) > 100;
    const isVertical = dx < 60;

    if (isLongSwipe && isVertical && this.state.isPlaying()) {
      if (dy > 0 && isBottomZone && !this.state.cameraOpen) {
        this._openCameras();
      } 
      else if (dy < 0 && this.state.cameraOpen) {
        this._tryCloseCameras();
      }
    }

    if (e.cancelable) e.preventDefault();
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

    // Универсальная функция для переключения (двери, вентилятор и т.д.)
    const handleToggle = (e) => {
      e.preventDefault();    // Убирает задержку в 300мс и фантомные клики
      e.stopPropagation();   // Чтобы камера не дергалась при нажатии на кнопку
      
      if (action === 'door') {
        this.office.toggleDoor(side);
      } else if (action === 'fan') {
        this.office.toggleFan(); // Сделаем задел на будущее для вентилятора
      }
    };

    if (action === 'door' || action === 'fan') {
      // Для мобилок
      btn.addEventListener('touchstart', handleToggle, { passive: false });
      // для ПК
      btn.addEventListener('click', (e) => {
        // Если это был настоящий клик мышкой (а не эмуляция после тача)
        if (e.detail !== 0) { 
          e.stopPropagation();
          this.office.toggleDoor(side); 
        }
      });

    } else if (action === 'light') {
      // Оставляем как есть, тут логика зажатия (hold) реализована верно
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); this.office.setLight(side, true); });
      btn.addEventListener('mouseup',   (e) => { e.stopPropagation(); this.office.setLight(side, false); });
      btn.addEventListener('mouseleave', ()  => { this.office.setLight(side, false); });
      
      btn.addEventListener('touchstart', (e) => { 
        e.stopPropagation(); 
        e.preventDefault(); 
        this.office.setLight(side, true); 
      }, { passive: false });
      
      btn.addEventListener('touchend', (e) => { 
        e.stopPropagation(); 
        e.preventDefault();
        this.office.setLight(side, false); 
      }, { passive: false });
      
      btn.addEventListener('touchcancel', (e) => { 
        e.stopPropagation(); 
        this.office.setLight(side, false); 
      }, { passive: false });
    }
  });

  window.addEventListener('mouseup', () => {
    this.office.setLight('left', false);
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