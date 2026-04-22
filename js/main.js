'use strict';

/**
 * main.js — Game Orchestrator
 * ─────────────────────────────────────────────────────────────
 * • Creates all system instances
 * • Wires them together through EventBus
 * • Handles the requestAnimationFrame game loop
 * • Manages night start / retry / next-night flow
 * • Applies responsive CSS scale
 */

// ── System instances (module-scope, referenced by everything) ──
const saveSystem    = new SaveSystem();
const state         = new GameState();
const soundSystem   = new SoundSystem();
const nightSystem   = new NightSystem(state, saveSystem, soundSystem);
const powerSystem   = new PowerSystem(state, soundSystem);
const animAI        = new AnimatronicAI(state, soundSystem);
const cameraSystem  = new CameraSystem(state, soundSystem);
const officeSystem  = new OfficeSystem(state, soundSystem);
const sceneRenderer = new SceneRenderer(state);

// Created after DOM is ready (they need DOM elements)
let inputSystem = null;
let uiManager   = null;

// ── Night parameter from URL: game.html?night=N ──────────────
function getNightParam() {
  const params = new URLSearchParams(window.location.search);
  const n      = parseInt(params.get('night') || '1', 10);
  return (n >= 1 && n <= 5) ? n : 1;
}

// ═════════════════════════════════════════════════════════════
// EVENT BUS WIRING
// ═════════════════════════════════════════════════════════════
function wireEvents() {

  // ── Camera ↔ phase sync ─────────────────────────────────────
  // CameraSystem only toggles cameraOpen; phase must be updated here
  // so SceneRenderer's check (cameraOpen && phase==='CAMERA') works.
  EventBus.on('cameraOpened', () => {
    if (state.phase === 'OFFICE') state.setPhase('CAMERA');
  });
  EventBus.on('cameraClosed', () => {
    if (state.phase === 'CAMERA') state.setPhase('OFFICE');
  });

  // ── Camera static effect on switch ──────────────────────────
  EventBus.on('cameraStaticStart', () => sceneRenderer.showStatic());

  // ── Power out → open doors ──────────────────────────────────
  EventBus.on('powerOut', () => officeSystem.onPowerOut());

  // ── Night-start extras (AI reset, ambience, phone guy) ──────
  EventBus.on('nightStarted', (night) => {
    animAI.onNightStart();
    soundSystem.loop('ambience');
    nightSystem.playPhoneCall(night);
  });

  // ── Night restart / progress ────────────────────────────────
  EventBus.on('retryNight', () => {
    soundSystem.stopAll();
    startNight(state.night);
  });
  EventBus.on('nextNight', () => {
    soundSystem.stopAll();
    const next = Math.min(state.night + 1, 5);
    startNight(next);
  });
}

// ═════════════════════════════════════════════════════════════
// NIGHT LIFECYCLE
// ═════════════════════════════════════════════════════════════

/** Show night intro, then begin the night after NIGHT_INTRO_MS. */
function startNight(night) {
  if (!saveSystem.isNightUnlocked(night)) {
    console.warn(`Night ${night} is locked — redirecting to menu.`);
    window.location.href = 'index.html';
    return;
  }

  // Full state reset
  state.reset(night);
  powerSystem.reset();

  // Hide all HUD / overlays immediately
  const hide = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };
  ['hud', 'cam-toggle-handle',
   'gameover-overlay', 'win-overlay',
   'night-intro-overlay'].forEach(hide);

  // Show night intro overlay
  const introEl   = document.getElementById('night-intro-overlay');
  const introText = document.getElementById('night-intro-text');
  if (introEl) {
    if (introText) introText.textContent = `Night ${night}`;
    introEl.style.display = 'flex';

    setTimeout(() => {
      introEl.style.display = 'none';
      _beginNight(night);
    }, CONFIG.NIGHT_INTRO_MS);
  } else {
    _beginNight(night);
  }
}

/** Transition from intro → active gameplay. */
function _beginNight(night) {
  state.setPhase('OFFICE');    // triggers phaseChange → UIManager shows HUD
  nightSystem.startNight(night);
  // 'nightStarted' EventBus is fired inside nightSystem.startNight()
}

// ═════════════════════════════════════════════════════════════
// RESPONSIVE SCALE
// ═════════════════════════════════════════════════════════════
function applyScale() {
  const container = document.getElementById('game-container');
  if (!container) return;

  const scaleX      = window.innerWidth  / CONFIG.BASE_WIDTH;
  const scaleY      = window.innerHeight / CONFIG.BASE_HEIGHT;
  window.gameScale  = Math.min(scaleX, scaleY);
  container.style.transform = `scale(${window.gameScale})`;
}

// ═════════════════════════════════════════════════════════════
// GAME LOOP
// ═════════════════════════════════════════════════════════════
let _lastTs = 0;

function gameLoop(ts) {
  // Cap deltaTime to 100 ms (handles tab-switch / visibility pauses)
  const dt = Math.min(ts - _lastTs, 100);
  _lastTs  = ts;

  const isPlaying  = state.isPlaying();
  const isPowerOut = state.phase === 'POWER_OUT';

  // ── Simulation systems (only while game is active) ──────────
  if (isPlaying || isPowerOut) {
    nightSystem.update(dt);
    powerSystem.update(dt);
    animAI.update(dt);
    cameraSystem.update(dt);
  }

  // ── Input (lerp pan) — always update so pan is smooth ───────
  if (inputSystem) inputSystem.update(dt);

  // ── Render ──────────────────────────────────────────────────
  sceneRenderer.update();
  if (uiManager) uiManager.update();

  requestAnimationFrame(gameLoop);
}

// ═════════════════════════════════════════════════════════════
// ENTRY POINT
// ═════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // 1. Scale game to fit viewport
  applyScale();
  window.addEventListener('resize', applyScale);

  // 2. Initialise subsystems that need DOM
  officeSystem.init();
  soundSystem.preload();

  // 3. Wire all EventBus listeners
  wireEvents();

  // 4. Create input & UI managers (depend on DOM being ready)
  inputSystem = new InputSystem(state, officeSystem, cameraSystem);
  uiManager   = new UIManager(state, powerSystem, cameraSystem);
  inputSystem.init();
  uiManager.init();

  // 5. Start first night (read ?night=N from URL, default 1)
  const night = getNightParam();
  startNight(night);

  // 6. Kick off the game loop
  _lastTs = performance.now();
  requestAnimationFrame(gameLoop);
});