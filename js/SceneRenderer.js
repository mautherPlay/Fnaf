'use strict';

/**
 * SceneRenderer
 * ─────────────────────────────────────────────────────────────
 * STATE → SINGLE SCENE IMAGE RENDER SYSTEM
 *
 * Key rules:
 *   • ONE image displayed at all times
 *   • Animatronics are NOT objects — they live inside scene images
 *   • Scenes never layer/combine (except door video overlay)
 *   • Priority: Jumpscare > Foxy-peek > Power-out > Camera > Office
 *
 * Light logic (simplified, no "both lights" scenarios):
 *   • Lights are HOLD-to-activate (InputSystem handles press/release)
 *   • At most ONE light is ever shown in a scene image
 *   • left_lit_*  when leftLight === true
 *   • right_lit_* when rightLight === true
 *   • (If both happen to be true, left takes priority — edge case)
 *
 * Removed scenarios:
 *   • both_lit_*      — lights are mutually exclusive in scene images
 *   • left_lit_foxy   — Foxy at open left door triggers peek VIDEO, not still image
 *   • right_lit_freddy — Freddy cannot be seen with the light on (attacks in dark)
 */
class SceneRenderer {
  constructor(state) {
    this.state = state;

    // Office view elements
    this.$bg            = document.getElementById('scene-background');
    this.$sceneImg      = document.getElementById('scene-image');
    this.$officeView    = document.getElementById('office-view');

    // Camera view elements
    this.$camImg        = document.getElementById('camera-image');
    this.$cameraView    = document.getElementById('camera-view');
    this.$static        = document.getElementById('camera-static');
    this.$kitchenOverlay= document.getElementById('cam-kitchen-disabled');

    // Power-out view
    this.$powerView     = document.getElementById('power-out-view');
    this.$powerImg      = document.getElementById('power-out-image');

    // Panel images (button state textures)
    this.$panelLeftImg  = document.getElementById('panel-left-img');
    this.$panelRightImg = document.getElementById('panel-right-img');

    // Jumpscare overlay
    this.$jumpOverlay   = document.getElementById('jumpscare-overlay');
    this.$jumpVideo     = document.getElementById('jumpscare-video');

    // Foxy peek video (plays before jumpscare when Foxy reaches open door)
    this.$foxyPeekOverlay = document.getElementById('foxy-peek-overlay');
    this.$foxyPeekVideo   = document.getElementById('foxy-peek-video');

    // Dirty-check caches to avoid redundant src assignments
    this._lastOfficeImg = '';
    this._lastCamImg    = '';
    this._lastPanelL    = '';
    this._lastPanelR    = '';

    this._jumpActive    = false;
    this._foxyPeekActive = false;

    // Listen for Foxy peek event (emitted by AnimatronicAI)
    EventBus.on('foxyPeek', () => this._startFoxyPeek());
  }

  // ── Main render loop (called every frame) ────────────────────
  update() {
    const s = this.state;

    // ── Jumpscare (highest priority) ─────────────────────────
    if (s.phase === 'JUMPSCARE') {
      this._showJumpscare();
      return;
    }
    if (this._jumpActive) this._hideJumpscare();

    // ── Foxy peek (before jumpscare) ─────────────────────────
    if (this._foxyPeekActive) return;  // freeze scene while peeking

    // ── Power out ─────────────────────────────────────────────
    if (s.phase === 'POWER_OUT') {
      this._showPowerOut();
      return;
    }

    // ── Camera mode ───────────────────────────────────────────
    if (s.cameraOpen && s.phase === 'CAMERA') {
      this._showCameraMode();
      return;
    }

    // ── Office mode ───────────────────────────────────────────
    this._showOfficeMode();
  }

  // ═════════════════════════════════════════════════════════════
  // OFFICE SCENE
  // ═════════════════════════════════════════════════════════════
  _showOfficeMode() {
    this.$officeView.style.display = 'block';
    this.$cameraView.style.display = 'none';
    this.$powerView.style.display  = 'none';

    const img = this._getOfficeImage();
    if (img !== this._lastOfficeImg) {
      if (this.$sceneImg) this.$sceneImg.src = img;
      this._lastOfficeImg = img;
    }

    this._updatePanelImages();
    this._applyPan();
  }

  _getOfficeImage() {
    const s = this.state;
    const a = s.animatronics;
    const O = CONFIG.ASSETS.OFFICE;

    const bonnieAtLeft = a.bonnie.position === 'LEFT_BLIND_SPOT';
    const chicaAtRight = a.chica.position  === 'RIGHT_BLIND_SPOT';

    // ── Left corridor light (held down) ─────────────────────
    // Foxy at left → NOT shown as still image. AnimatronicAI emits
    // 'foxyPeek' → _startFoxyPeek() plays the video instead.
    if (s.leftLight) {
      if (bonnieAtLeft) return O + 'left_lit_bonnie.png';
      return O + 'left_lit_empty.png';
    }

    // ── Right corridor light (held down) ────────────────────
    // Freddy at right blind spot is never revealed by light — he attacks
    // only when the light is OFF (and the door is open).
    if (s.rightLight) {
      if (chicaAtRight) return O + 'right_lit_chica.png';
      return O + 'right_lit_empty.png';
    }

    // ── Default: dark office ─────────────────────────────────
    return O + 'base.png';
  }

  // ═════════════════════════════════════════════════════════════
  // BUTTON PANEL IMAGES (4 states per side)
  // ═════════════════════════════════════════════════════════════
  _updatePanelImages() {
    const s  = this.state;
    const UI = CONFIG.ASSETS.UI;

    const lClosed = s.leftDoor  === 'CLOSED' || s.leftDoor  === 'CLOSING';
    const rClosed = s.rightDoor === 'CLOSED' || s.rightDoor === 'CLOSING';

    const lImg = UI + (lClosed
      ? (s.leftLight  ? 'panel_left_door_lit.png'  : 'panel_left_door.png')
      : (s.leftLight  ? 'panel_left_lit.png'        : 'panel_left_normal.png'));

    const rImg = UI + (rClosed
      ? (s.rightLight ? 'panel_right_door_lit.png' : 'panel_right_door.png')
      : (s.rightLight ? 'panel_right_lit.png'       : 'panel_right_normal.png'));

    if (lImg !== this._lastPanelL) {
      if (this.$panelLeftImg) this.$panelLeftImg.src = lImg;
      this._lastPanelL = lImg;
    }
    if (rImg !== this._lastPanelR) {
      if (this.$panelRightImg) this.$panelRightImg.src = rImg;
      this._lastPanelR = rImg;
    }
  }

  // ═════════════════════════════════════════════════════════════
  // PAN
  // ═════════════════════════════════════════════════════════════
  _applyPan() {
    const pan = this.state.panCurrent;  // 0 = left, 1 = right
    const tx  = CONFIG.PAN_MIN + pan * (CONFIG.PAN_MAX - CONFIG.PAN_MIN);
    if (this.$bg) this.$bg.style.transform = `translateX(${tx}px)`;
  }

  // ═════════════════════════════════════════════════════════════
  // CAMERA SCENE
  // ═════════════════════════════════════════════════════════════
  _showCameraMode() {
    this.$officeView.style.display = 'none';
    this.$cameraView.style.display = 'block';
    this.$powerView.style.display  = 'none';

    const isKitchen = this.state.activeCam === '6';

    // Kitchen cam: show "disabled" overlay, hide image
    if (this.$kitchenOverlay) {
      this.$kitchenOverlay.style.display = isKitchen ? 'flex' : 'none';
    }
    if (this.$camImg) {
      this.$camImg.style.display = isKitchen ? 'none' : 'block';
    }

    if (!isKitchen) {
      const img = this._getCameraImage();
      if (img !== this._lastCamImg) {
        if (this.$camImg) this.$camImg.src = img;
        this._lastCamImg = img;
      }
    }
  }

  _getCameraImage() {
    const s   = this.state;
    const a   = s.animatronics;
    const cam = s.activeCam;
    const C   = CONFIG.ASSETS.CAMERAS;

    switch (cam) {
      case '1A': {
        const f = a.freddy.position === 'STAGE';
        const b = a.bonnie.position === 'STAGE';
        const c = a.chica.position  === 'STAGE';
        if (a.freddy.facingCamera) return C + 'cam1a_freddy_facing.png';
        if (f && b && c)           return C + 'cam1a_all.png';
        if (f && c)                return C + 'cam1a_no_bonnie.png';
        if (f && b)                return C + 'cam1a_no_chica.png';
        if (f)                     return C + 'cam1a_freddy_only.png';
        return C + 'cam1a_empty.png';
      }
      case '1B': {
        if (a.freddy.position === 'DINING') return C + 'cam1b_freddy.png';
        if (a.chica.position  === 'DINING') return C + 'cam1b_chica.png';
        if (a.bonnie.position === 'DINING') return C + 'cam1b_bonnie.png';
        return C + 'cam1b_empty.png';
      }
      case '1C': {
        if (a.foxy.position !== 'PIRATE_COVE') return C + 'cam1c_empty.png';
        return C + `cam1c_phase${a.foxy.phase}.png`;
      }
      case '2A': {
        if (a.foxy.position  === 'WEST_HALL_RUNNING') return C + 'cam2a_foxy_running.png';
        if (a.bonnie.position === 'WEST_HALL')         return C + 'cam2a_bonnie.png';
        return C + 'cam2a_empty.png';
      }
      case '2B': {
        if (a.bonnie.position === 'WEST_HALL_CORNER') return C + 'cam2b_bonnie.png';
        return C + 'cam2b_empty.png';
      }
      case '3': {
        if (a.bonnie.position === 'SUPPLY_CLOSET') return C + 'cam3_bonnie.png';
        return C + 'cam3_empty.png';
      }
      case '4A': {
        if (a.freddy.position === 'EAST_HALL') return C + 'cam4a_freddy.png';
        if (a.chica.position  === 'EAST_HALL') return C + 'cam4a_chica.png';
        return C + 'cam4a_empty.png';
      }
      case '4B': {
        if (a.freddy.position === 'EAST_HALL_CORNER') return C + 'cam4b_freddy.png';
        if (a.chica.position  === 'EAST_HALL_CORNER') return C + 'cam4b_chica.png';
        return C + 'cam4b_empty.png';
      }
      case '5': {
        if (a.bonnie.position === 'BACKSTAGE') return C + 'cam5_bonnie.png';
        return C + 'cam5_empty.png';
      }
      case '6':
        // Handled by kitchen overlay — should not reach here
        return '';
      default:
        return C + `cam${cam.toLowerCase()}_empty.png`;
    }
  }

  // ═════════════════════════════════════════════════════════════
  // POWER OUT
  // ═════════════════════════════════════════════════════════════
  _showPowerOut() {
    this.$officeView.style.display = 'none';
    this.$cameraView.style.display = 'none';
    this.$powerView.style.display  = 'block';

    const img = this.state.animatronics.freddy.position === 'IN_OFFICE'
      ? CONFIG.ASSETS.OFFICE + 'power_out_freddy.png'
      : CONFIG.ASSETS.OFFICE + 'power_out.png';

    if (this.$powerImg) this.$powerImg.src = img;
  }

  // ═════════════════════════════════════════════════════════════
  // FOXY PEEK VIDEO (before jumpscare when left door was open)
  // Video file: assets/videos/foxy_peek_office.mp4
  // ═════════════════════════════════════════════════════════════
  _startFoxyPeek() {
    if (this._foxyPeekActive || this._jumpActive) return;
    this._foxyPeekActive = true;

    if (this.$foxyPeekVideo) {
      this.$foxyPeekVideo.src = `${CONFIG.ASSETS.VIDEOS}foxy_peek_office.mp4`;
      this.$foxyPeekVideo.currentTime = 0;
      this.$foxyPeekVideo.play().catch(() => {});
    }
    if (this.$foxyPeekOverlay) this.$foxyPeekOverlay.style.display = 'flex';

    // After peek video ends → jumpscare
    const onEnd = () => {
      if (this.$foxyPeekOverlay) this.$foxyPeekOverlay.style.display = 'none';
      this._foxyPeekActive = false;
      // Trigger the actual jumpscare
      this.state.jumpscareTarget = 'foxy';
      this.state.caughtBy        = 'Foxy';
      this.state.setPhase('JUMPSCARE');
    };

    if (this.$foxyPeekVideo) {
      this.$foxyPeekVideo.onended = onEnd;
      // Fallback: if video can't play (missing file), jump straight to scare
      this.$foxyPeekVideo.onerror = onEnd;
    } else {
      // No video element in DOM → go straight to scare
      onEnd();
    }
  }

  // ═════════════════════════════════════════════════════════════
  // JUMPSCARE
  // ═════════════════════════════════════════════════════════════
  _showJumpscare() {
    if (this._jumpActive) return;
    this._jumpActive = true;

    const who = this.state.jumpscareTarget;
    if (this.$jumpVideo) {
      this.$jumpVideo.src = `${CONFIG.ASSETS.VIDEOS}jumpscare_${who}.mp4`;
      this.$jumpVideo.currentTime = 0;
      this.$jumpVideo.play().catch(() => {});
    }
    if (this.$jumpOverlay) this.$jumpOverlay.style.display = 'flex';

    if (this.$jumpVideo) {
      this.$jumpVideo.onended = () => {
        this.state.setPhase('GAME_OVER');
        EventBus.emit('gameOver', this.state.caughtBy);
      };
    }
  }

  _hideJumpscare() {
    this._jumpActive = false;
    if (this.$jumpOverlay) this.$jumpOverlay.style.display = 'none';
    if (this.$jumpVideo)   { this.$jumpVideo.pause(); this.$jumpVideo.onended = null; }
  }

  // ── Static overlay (camera switch) ──────────────────────────
  showStatic() {
    if (!this.$static) return;
    this.$static.classList.add('active');
    setTimeout(() => this.$static.classList.remove('active'), CONFIG.STATIC_DURATION_MS);
  }
}