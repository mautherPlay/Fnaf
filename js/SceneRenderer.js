'use strict';

/**
 * SceneRenderer
 * ─────────────────────────────────────────────────────────────
 * Core of the FNAF architecture.
 *
 * STATE → SINGLE SCENE IMAGE
 *
 * Rules:
 *   • ONE image is displayed at all times (office OR camera)
 *   • Animatronics are NOT objects — they exist as part of scene images
 *   • Scenes never layer or combine (except door video overlay)
 *   • Priority: Jumpscare > Power-out > Camera > Office
 *
 * ─── Office image selection priority ────────────────────────
 *   1. Power out state
 *   2. Both lights active
 *   3. Left light only
 *   4. Right light only
 *   5. Default (dark/base)
 *
 * ─── Camera image selection ─────────────────────────────────
 *   Image chosen by: active cam + which animatronic is present
 */
class SceneRenderer {
  constructor(state) {
    this.state = state;

    // DOM elements
    this.$bg           = document.getElementById('scene-background');
    this.$sceneImg     = document.getElementById('scene-image');
    this.$camImg       = document.getElementById('camera-image');
    this.$jumpOverlay  = document.getElementById('jumpscare-overlay');
    this.$jumpVideo    = document.getElementById('jumpscare-video');
    this.$static       = document.getElementById('camera-static');
    this.$officeView   = document.getElementById('office-view');
    this.$cameraView   = document.getElementById('camera-view');
    this.$powerView    = document.getElementById('power-out-view');
    this.$powerImg     = document.getElementById('power-out-image');
    this.$panelLeftImg  = document.getElementById('panel-left-img');
    this.$panelRightImg = document.getElementById('panel-right-img');

    this._lastOfficeImg = '';
    this._lastCamImg    = '';
    this._lastPanelL    = '';
    this._lastPanelR    = '';

    this._jumpActive = false;
  }

  // ── Main update (called every frame) ────────────────────────
  update() {
    const s = this.state;

    // ── Jumpscare ────────────────────────────────────────────
    if (s.phase === 'JUMPSCARE') {
      this._showJumpscare();
      return;
    }

    // Hide jumpscare when not active
    if (this._jumpActive) {
      this._hideJumpscare();
    }

    // ── Power out ────────────────────────────────────────────
    if (s.phase === 'POWER_OUT') {
      this._showPowerOut();
      return;
    }

    // ── Camera mode ──────────────────────────────────────────
    if (s.cameraOpen && s.phase === 'CAMERA') {
      this._showCameraMode();
      return;
    }

    // ── Office mode ──────────────────────────────────────────
    this._showOfficeMode();
  }

  // ═════════════════════════════════════════════════════════════
  // OFFICE SCENE
  // ═════════════════════════════════════════════════════════════
  _showOfficeMode() {
    this.$officeView.style.display  = 'block';
    this.$cameraView.style.display  = 'none';
    this.$powerView.style.display   = 'none';

    const img = this._getOfficeImage();
    if (img !== this._lastOfficeImg) {
      if (this.$sceneImg) this.$sceneImg.src = img;
      this._lastOfficeImg = img;
    }

    this._updatePanelImages();
    this._applyPan();
  }

  _getOfficeImage() {
    const s    = this.state;
    const a    = s.animatronics;
    const O    = CONFIG.ASSETS.OFFICE;

    const bonnieAtLeft  = a.bonnie.position === 'LEFT_BLIND_SPOT';
    const foxyAtLeft    = a.foxy.position   === 'LEFT_BLIND_SPOT';
    const chicaAtRight  = a.chica.position  === 'RIGHT_BLIND_SPOT';
    const freddyAtRight = a.freddy.position === 'RIGHT_BLIND_SPOT';

    // Both lights on
    if (s.leftLight && s.rightLight) {
      if (bonnieAtLeft && chicaAtRight)  return O + 'both_lit_bonnie_chica.png';
      if (bonnieAtLeft)                  return O + 'both_lit_bonnie.png';
      if (foxyAtLeft   && chicaAtRight)  return O + 'both_lit_foxy_chica.png';
      if (foxyAtLeft)                    return O + 'both_lit_foxy.png';
      if (chicaAtRight)                  return O + 'both_lit_chica.png';
      if (freddyAtRight)                 return O + 'both_lit_freddy.png';
      return O + 'both_lit_empty.png';
    }

    // Left light only
    if (s.leftLight) {
      if (bonnieAtLeft) return O + 'left_lit_bonnie.png';
      if (foxyAtLeft)   return O + 'left_lit_foxy.png';
      return O + 'left_lit_empty.png';
    }

    // Right light only
    if (s.rightLight) {
      if (chicaAtRight)  return O + 'right_lit_chica.png';
      if (freddyAtRight) return O + 'right_lit_freddy.png';
      return O + 'right_lit_empty.png';
    }

    // Default
    return O + 'base.png';
  }

  // ═════════════════════════════════════════════════════════════
  // BUTTON PANELS (state-dependent images)
  // ═════════════════════════════════════════════════════════════
  _updatePanelImages() {
    const s  = this.state;
    const UI = CONFIG.ASSETS.UI;

    // Left panel: 4 states
    const lClosed = s.leftDoor  === 'CLOSED' || s.leftDoor  === 'CLOSING';
    const lKey    = (lClosed ? 'door' : 'normal') + (s.leftLight  ? '_lit' : '');
    const lImg    = UI + `panel_left_${lClosed && s.leftLight ? 'door_lit' : lClosed ? 'door' : s.leftLight ? 'lit' : 'normal'}.png`;

    if (lImg !== this._lastPanelL) {
      if (this.$panelLeftImg) this.$panelLeftImg.src = lImg;
      this._lastPanelL = lImg;
    }

    // Right panel: 4 states
    const rClosed = s.rightDoor === 'CLOSED' || s.rightDoor === 'CLOSING';
    const rImg    = UI + `panel_right_${rClosed && s.rightLight ? 'door_lit' : rClosed ? 'door' : s.rightLight ? 'lit' : 'normal'}.png`;

    if (rImg !== this._lastPanelR) {
      if (this.$panelRightImg) this.$panelRightImg.src = rImg;
      this._lastPanelR = rImg;
    }
  }

  // ═════════════════════════════════════════════════════════════
  // PAN (office background translateX)
  // ═════════════════════════════════════════════════════════════
  _applyPan() {
    const s   = this.state;
    const pan = s.panCurrent; // 0 = left, 1 = right
    // translateX: CONFIG.PAN_MIN (0) at left, CONFIG.PAN_MAX (-720) at right
    const tx  = CONFIG.PAN_MIN + pan * (CONFIG.PAN_MAX - CONFIG.PAN_MIN);
    if (this.$bg) this.$bg.style.transform = `translateX(${tx}px)`;
  }

  // ═════════════════════════════════════════════════════════════
  // CAMERA SCENE
  // ═════════════════════════════════════════════════════════════
  _showCameraMode() {
    this.$officeView.style.display  = 'none';
    this.$cameraView.style.display  = 'block';
    this.$powerView.style.display   = 'none';

    const img = this._getCameraImage();
    if (img !== this._lastCamImg) {
      if (this.$camImg) this.$camImg.src = img;
      this._lastCamImg = img;
    }
  }

  _getCameraImage() {
    const s   = this.state;
    const a   = s.animatronics;
    const cam = s.activeCam;
    const C   = CONFIG.ASSETS.CAMERAS;

    switch (cam) {
      // ── CAM 1A: Show Stage ─────────────────────────────────
      case '1A': {
        const f = a.freddy.position === 'STAGE';
        const b = a.bonnie.position === 'STAGE';
        const c = a.chica.position  === 'STAGE';
        if (a.freddy.facingCamera)      return C + 'cam1a_freddy_facing.png';
        if (f && b && c)               return C + 'cam1a_all.png';
        if (f && c)                    return C + 'cam1a_no_bonnie.png';
        if (f && b)                    return C + 'cam1a_no_chica.png';
        if (f)                         return C + 'cam1a_freddy_only.png';
        return C + 'cam1a_empty.png';
      }

      // ── CAM 1B: Dining Area ────────────────────────────────
      case '1B': {
        if (a.freddy.position === 'DINING') return C + 'cam1b_freddy.png';
        if (a.chica.position  === 'DINING') return C + 'cam1b_chica.png';
        if (a.bonnie.position === 'DINING') return C + 'cam1b_bonnie.png';
        return C + 'cam1b_empty.png';
      }

      // ── CAM 1C: Pirate Cove ────────────────────────────────
      case '1C': {
        if (a.foxy.position !== 'PIRATE_COVE') return C + 'cam1c_empty.png';
        return C + `cam1c_phase${a.foxy.phase}.png`;
      }

      // ── CAM 2A: West Hall ──────────────────────────────────
      case '2A': {
        if (a.foxy.position  === 'WEST_HALL_RUNNING') return C + 'cam2a_foxy_running.png';
        if (a.bonnie.position === 'WEST_HALL')        return C + 'cam2a_bonnie.png';
        return C + 'cam2a_empty.png';
      }

      // ── CAM 2B: West Hall Corner ───────────────────────────
      case '2B': {
        if (a.bonnie.position === 'WEST_HALL_CORNER') return C + 'cam2b_bonnie.png';
        return C + 'cam2b_empty.png';
      }

      // ── CAM 3: Supply Closet ───────────────────────────────
      case '3': {
        if (a.bonnie.position === 'SUPPLY_CLOSET') return C + 'cam3_bonnie.png';
        return C + 'cam3_empty.png';
      }

      // ── CAM 4A: East Hall ──────────────────────────────────
      case '4A': {
        if (a.freddy.position === 'EAST_HALL') return C + 'cam4a_freddy.png';
        if (a.chica.position  === 'EAST_HALL') return C + 'cam4a_chica.png';
        return C + 'cam4a_empty.png';
      }

      // ── CAM 4B: East Hall Corner ───────────────────────────
      case '4B': {
        if (a.freddy.position === 'EAST_HALL_CORNER') return C + 'cam4b_freddy.png';
        if (a.chica.position  === 'EAST_HALL_CORNER') return C + 'cam4b_chica.png';
        return C + 'cam4b_empty.png';
      }

      // ── CAM 5: Backstage ───────────────────────────────────
      case '5': {
        if (a.bonnie.position === 'BACKSTAGE') return C + 'cam5_bonnie.png';
        return C + 'cam5_empty.png';
      }

      // ── CAM 6: Kitchen (audio only — static image) ─────────
      case '6':
        return C + 'cam6_kitchen.png';

      default:
        return C + `cam${cam.toLowerCase()}_empty.png`;
    }
  }

  // ═════════════════════════════════════════════════════════════
  // POWER OUT
  // ═════════════════════════════════════════════════════════════
  _showPowerOut() {
    this.$officeView.style.display  = 'none';
    this.$cameraView.style.display  = 'none';
    this.$powerView.style.display   = 'block';

    const img = this.state.animatronics.freddy.position === 'IN_OFFICE'
      ? CONFIG.ASSETS.OFFICE + 'power_out_freddy.png'
      : CONFIG.ASSETS.OFFICE + 'power_out.png';

    if (this.$powerImg) this.$powerImg.src = img;
  }

  // ═════════════════════════════════════════════════════════════
  // JUMPSCARE
  // ═════════════════════════════════════════════════════════════
  _showJumpscare() {
    if (this._jumpActive) return;
    this._jumpActive = true;

    const who = this.state.jumpscareTarget;
    this.$jumpVideo.src = `${CONFIG.ASSETS.VIDEOS}jumpscare_${who}.mp4`;
    this.$jumpVideo.currentTime = 0;
    this.$jumpVideo.play().catch(() => {});
    this.$jumpOverlay.style.display = 'flex';

    // When video ends → Game Over
    this.$jumpVideo.onended = () => {
      this.state.setPhase('GAME_OVER');
      EventBus.emit('gameOver', this.state.caughtBy);
    };
  }

  _hideJumpscare() {
    this._jumpActive = false;
    this.$jumpOverlay.style.display = 'none';
    this.$jumpVideo.pause();
    this.$jumpVideo.onended = null;
  }

  // ── Static overlay (camera switch) ──────────────────────────
  showStatic() {
    if (!this.$static) return;
    this.$static.classList.add('active');
    setTimeout(() => this.$static.classList.remove('active'), CONFIG.STATIC_DURATION_MS);
  }
}