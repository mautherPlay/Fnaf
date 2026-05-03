'use strict';

/**
 * UIManager
 * ─────────────────────────────────────────────────────────────
 * Drives the single HUD overlay (#hud) that sits on top of
 * BOTH office and camera views (z-index 25).
 * The camera view no longer has its own power/time readout —
 * the shared HUD handles everything.
 *
 * Bug fix: removed _updateCamHud() and the per-frame cam-power /
 * cam-clock / cam-night-label updates that caused duplicate readouts.
 */
class UIManager {
  constructor(state, powerSystem, cameraSystem) {
    this.state  = state;
    this.power  = powerSystem;
    this.camera = cameraSystem;
    this._goAudio = null;
  }

  init() {
    this._buildMinimapListeners();
    this._bindOverlayButtons();
    this._bindEventBus();
    this.updateTime(0);
    this.updatePower(100);

    // Ensure trigger zones start in correct state
    const ot = document.getElementById('office-trigger-zone');
    const ct = document.getElementById('cam-trigger-zone');
    if (ot) ot.style.display = 'none';  // shown when phase = OFFICE
    if (ct) ct.style.display = 'none';  // shown when phase = CAMERA
  }

  // ── Per-frame: only update minimap active node ────────────────
  update() {
    if (this.state.cameraOpen && this.state.phase === 'CAMERA') {
      this._highlightMapNode(this.state.activeCam);
      // Update room name (cheap text write)
      this._updateRoomName(this.state.activeCam);
    }
  }

  // ── Room name in camera top-centre ───────────────────────────
  _updateRoomName(camId) {
    const def    = CONFIG.CAMERAS.find(c => c.id === camId);
    const nameEl = document.getElementById('cam-room-name');
    if (nameEl && def) nameEl.textContent = def.name.toUpperCase();
  }

// ── Minimap active highlight ──────────────────────────────────
  _highlightMapNode(camId) {
    document.querySelectorAll('.map-node').forEach(g => {
      // Проверяем, что camId совпадает с data-cam
      if (g.dataset.cam === camId) {
        g.classList.add('map-active');
      } else {
        g.classList.remove('map-active');
      }
    });
  }

  // Make minimap nodes clickable
  _buildMinimapListeners() {
    document.querySelectorAll('.map-node').forEach(g => {
      const id = g.dataset.cam;
      if (!id) return;

      // Создаем одну функцию для обработки нажатия
      const handlePress = (e) => {
        // Если планшет закрыт — ничего не делаем
        if (!this.state.cameraOpen) return;

        e.preventDefault();
        e.stopPropagation();

        console.log("Нажата камера:", id);

        // ПРОВЕРКА: вызываем метод switchTo
        if (this.camera && typeof this.camera.switchTo === 'function') {
          this.camera.switchTo(id);
        } else {
          console.error("Ошибка: this.camera или switchTo не найден!");
        }
      };

      // Слушаем тач для телефонов
      g.addEventListener('touchstart', handlePress, { passive: false });
      
      // Слушаем клик для ПК
      g.addEventListener('click', (e) => {
        // detail === 0 бывает при эмуляции тача, тогда игнорируем, чтобы не нажать дважды
        if (e.detail !== 0) handlePress(e);
      });
    });
  }

  // ── HUD updates (shared, always-on-top) ──────────────────────
  updateTime(hour) {
    const el = document.getElementById('time-display');
    if (el) el.textContent = CONFIG.HOUR_LABELS[hour] ?? '12 AM';
  }

  updatePower(power) {
    const pctEl  = document.getElementById('power-pct');
    const barsEl = document.getElementById('power-bars');
    if (pctEl) pctEl.textContent = Math.ceil(power);
    if (barsEl) {
      const filled = Math.min(this.power.getActiveDevices(), 6);
      barsEl.innerHTML = '&#x25AE;'.repeat(filled) + '&#x25AF;'.repeat(6 - filled);
      if (power > 50)      { barsEl.style.color = '#7dff7d'; if(pctEl) pctEl.style.color = '#fff'; }
      else if (power > 20) { barsEl.style.color = '#ffd060'; if(pctEl) pctEl.style.color = '#ffd060'; }
      else                 { barsEl.style.color = '#ff6060'; if(pctEl) pctEl.style.color = '#ff6060'; }
    }
  }

  // ── Phase management ─────────────────────────────────────────
  onPhaseChange(phase) {
    const hud = document.getElementById('hud');
    const ot  = document.getElementById('office-trigger-zone');
    const ct  = document.getElementById('cam-trigger-zone');

    // HUD (время + ночь + энергия) видно во время игры И во время power-out
    const showHud = phase === 'OFFICE' || phase === 'CAMERA' || phase === 'POWER_OUT';
    if (hud) hud.style.display = showHud ? 'block' : 'none';

    // Триггерные зоны (планшет) — только во время обычной игры
    if (phase === 'OFFICE') {
      if (ot) ot.style.display = 'flex';
      if (ct) ct.style.display = 'none';
    } else if (phase === 'CAMERA') {
      if (ot) ot.style.display = 'none';
      if (ct) ct.style.display = 'flex';
    } else {
      // POWER_OUT, JUMPSCARE, GAME_OVER, WIN — планшет недоступен
      if (ot) ot.style.display = 'none';
      if (ct) ct.style.display = 'none';
    }
  }

  onNightStarted(night) {
    const nd = document.getElementById('night-display');
    if (nd) nd.textContent = `Night ${night}`;
    this.updateTime(0);
    this.updatePower(100);
    const pctEl  = document.getElementById('power-pct');
    const barsEl = document.getElementById('power-bars');
    if (pctEl)  pctEl.style.color  = '#fff';
    if (barsEl) barsEl.style.color = '#7dff7d';
    this._stopGoMusic();
  }

  // ── Game Over ────────────────────────────────────────────────
showGameOver(who) {
    const overlay = document.getElementById('gameover-overlay');
    const hud     = document.getElementById('hud');
    // Внутри метода showGameOver(who)
const helpBtn = document.getElementById('btn-how-to');

if (helpBtn) {
    const handleHelp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Сохраняем флаг, как ты и хотел
        sessionStorage.setItem('fnaf_warned', '1');
        
        // Останавливаем музыку и уходим на страницу помощи
        this._stopGoMusic();
        window.location.href = 'info.html';
    };

    // Привязываем тач и клик
    helpBtn.addEventListener('touchstart', handleHelp, { passive: false });
    helpBtn.addEventListener('click', handleHelp);
}
    // Скрываем лишнее
    if (hud) hud.style.display = 'none';
    document.getElementById('office-trigger-zone')?.style.setProperty('display', 'none');
    document.getElementById('cam-trigger-zone')?.style.setProperty('display', 'none');

    if (overlay) {
        overlay.style.display = 'flex';
        
        // ФИКС КНОПОК: Перепривязываем события прямо здесь
        const retryBtn = document.getElementById('btn-retry');
        const menuBtn = document.getElementById('btn-menu-go');

        const bindButton = (btn, callback) => {
            if (!btn) return;
            // Очищаем старые слушатели (чтобы не дублировались)
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                callback();
            };

            newBtn.addEventListener('touchstart', handler, { passive: false });
            newBtn.addEventListener('click', handler);
        };

        bindButton(retryBtn, () => {
            this._stopGoMusic();
            EventBus.emit('retryNight');
        });

        bindButton(menuBtn, () => {
            this._stopGoMusic();
            window.location.href = 'index.html';
        });
    }

    this._playGoMusic();
}

  _playGoMusic() {
    this._stopGoMusic();
    this._goAudio = new Audio('assets/sounds/gameover_music.mp3');
    this._goAudio.volume = 0.8;
    this._goAudio.play().catch(() => {});
  }
  _stopGoMusic() {
    if (this._goAudio) { this._goAudio.pause(); this._goAudio = null; }
  }

  // ── Win ──────────────────────────────────────────────────────
  showWin(night) {
    const overlay = document.getElementById('win-overlay');
    const subEl   = document.getElementById('win-sub');
    const nextBtn = document.getElementById('btn-next-night');
    const hud     = document.getElementById('hud');
    const ot      = document.getElementById('office-trigger-zone');
    const ct      = document.getElementById('cam-trigger-zone');

    if (subEl)   subEl.textContent     = `Night ${night} complete!`;
    if (nextBtn) nextBtn.disabled      = (night >= 5);
    if (overlay) overlay.style.display = 'flex';
    if (hud)     hud.style.display     = 'none';
    if (ot)      ot.style.display      = 'none';
    if (ct)      ct.style.display      = 'none';
  }

  // ── EventBus ─────────────────────────────────────────────────
  _bindEventBus() {
    EventBus.on('phaseChange',    p  => this.onPhaseChange(p));
    EventBus.on('hourChanged',    h  => this.updateTime(h));
    EventBus.on('powerChanged',   p  => this.updatePower(p));
    EventBus.on('nightStarted',   n  => this.onNightStarted(n));
    EventBus.on('cameraSwitched', id => {
      this._highlightMapNode(id);
      this._updateRoomName(id);
    });
    EventBus.on('gameOver',      w  => this.showGameOver(w));
    EventBus.on('nightComplete', n  => this.showWin(n));
  }

  // ── Overlay buttons ──────────────────────────────────────────
  _bindOverlayButtons() {
    const $ = id => document.getElementById(id);
    const buttons = [
      { el: $('btn-retry'),     action: () => { this._stopGoMusic(); EventBus.emit('retryNight'); } },
      { el: $('btn-menu-go'),   action: () => { this._stopGoMusic(); window.location.href = 'index.html'; } },
      { el: $('btn-next-night'), action: () => EventBus.emit('nextNight') },
      { el: $('btn-win-menu'),  action: () => { window.location.href = 'index.html'; } }
    ];

    buttons.forEach(btn => {
      if (!btn.el) return;

      const handlePress = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.action();
      };

      // Быстрое касание для мобилок
      btn.el.addEventListener('touchstart', handlePress, { passive: false });
      
      // Обычный клик для ПК
      btn.el.addEventListener('click', (e) => {
        // Проверка e.detail предотвращает повторный вызов после touchstart
        if (e.detail !== 0) handlePress(e);
      });
    });
  }
}