'use strict';

/**
 * main.js — Game Orchestrator
 */

const saveSystem    = new SaveSystem();
const state         = new GameState();
const soundSystem   = new SoundSystem();
const animAI        = new AnimatronicAI(state, soundSystem);
const nightSystem   = new NightSystem(state, saveSystem, soundSystem, animAI);
const powerSystem   = new PowerSystem(state, soundSystem);
const cameraSystem  = new CameraSystem(state, soundSystem);
const officeSystem  = new OfficeSystem(state, soundSystem, animAI);
const sceneRenderer = new SceneRenderer(state);
const fanSystem     = new FanSystem(state);

let inputSystem = null;
let uiManager   = null;

function getNightParam() {
  const params = new URLSearchParams(window.location.search);
  const n = parseInt(params.get('night') || '1', 10);
  return (n >= 1 && n <= 5) ? n : 1;
}

function wireEvents() {
  EventBus.on('cameraOpened', () => { if (state.phase === 'OFFICE') state.setPhase('CAMERA'); });
  EventBus.on('cameraClosed', () => { if (state.phase === 'CAMERA') state.setPhase('OFFICE'); });
  EventBus.on('cameraStaticStart', () => sceneRenderer.showStatic());

  // Power-out: stop fan ambience (no electricity), open doors
  EventBus.on('powerOut', () => {
    officeSystem.onPowerOut();
    fanSystem.stopAmbience();
  });

  // Night started: reset AI, resume fan ambience, play phone call
  EventBus.on('nightStarted', (night) => {
    animAI.onNightStart();
    fanSystem.resumeIfOn();       // restart seamless ambience loop
    nightSystem.playPhoneCall(night);
  });

  // Retry / next night
  EventBus.on('retryNight', () => {
    soundSystem.stopAll();
    fanSystem.stopAmbience();
    startNight(state.night);
  });
  EventBus.on('nextNight', () => {
    soundSystem.stopAll();
    fanSystem.stopAmbience();
    startNight(Math.min(state.night + 1, 5));
  });
}

function startNight(night) {
  if (!saveSystem.isNightUnlocked(night)) {
    window.location.href = 'index.html';
    return;
  }
  state.reset(night);
  powerSystem.reset();

  ['hud','cam-toggle-handle','gameover-overlay','win-overlay','night-intro-overlay']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

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

function _beginNight(night) {
  state.setPhase('OFFICE');
  nightSystem.startNight(night);
}

function applyScale() {
  const container = document.getElementById('game-container');
  if (!container) return;
  const scaleX = window.innerWidth  / CONFIG.BASE_WIDTH;
  const scaleY = window.innerHeight / CONFIG.BASE_HEIGHT;
  window.gameScale = Math.min(scaleX, scaleY);
  container.style.transform = `scale(${window.gameScale})`;
}

let _lastTs = 0;
function gameLoop(ts) {
  const dt = Math.min(ts - _lastTs, 100);
  _lastTs  = ts;

  const isPlaying  = state.isPlaying();
  const isPowerOut = state.phase === 'POWER_OUT';

  if (isPlaying || isPowerOut) {
    nightSystem.update(dt);
    powerSystem.update(dt);
    animAI.update(dt);
    cameraSystem.update(dt);
  }

  if (inputSystem) inputSystem.update(dt);
  sceneRenderer.update();
  if (uiManager) uiManager.update();

  requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', () => {
  applyScale();
  window.addEventListener('resize', applyScale);

  officeSystem.init();
  soundSystem.preload();
  fanSystem.init();   // sets up fan video + nose button + Web Audio
  wireEvents();

  inputSystem = new InputSystem(state, officeSystem, cameraSystem);
  uiManager   = new UIManager(state, powerSystem, cameraSystem);
  inputSystem.init();
  uiManager.init();

  startNight(getNightParam());

  _lastTs = performance.now();
  requestAnimationFrame(gameLoop);
});