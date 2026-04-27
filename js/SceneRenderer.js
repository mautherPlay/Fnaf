'use strict';

/**
 * SceneRenderer — STATE → SINGLE SCENE IMAGE
 *
 * CAM 7 (Bathrooms) added: chica and freddy can appear there.
 * Camera filter brightness raised from 0.6 → 0.72 (less dark).
 */
class SceneRenderer {
  constructor(state) {
    this.state = state;

    this.$bg            = document.getElementById('scene-background');
    this.$sceneImg      = document.getElementById('scene-image');
    this.$officeView    = document.getElementById('office-view');

    this.$camImg        = document.getElementById('camera-image');
    this.$camFoxyVideo  = document.getElementById('cam-foxy-video');
    this.$cameraView    = document.getElementById('camera-view');
    this.$static        = document.getElementById('camera-static');
    this.$kitchenOverlay= document.getElementById('cam-kitchen-disabled');

    this.$powerView     = document.getElementById('power-out-view');
    this.$powerImg      = document.getElementById('power-out-image');

    this.$panelLeftImg  = document.getElementById('panel-left-img');
    this.$panelRightImg = document.getElementById('panel-right-img');

    this.$jumpOverlay   = document.getElementById('jumpscare-overlay');
    this.$jumpVideo     = document.getElementById('jumpscare-video');

    this._lastOfficeImg    = '';
    this._lastCamImg       = '';
    this._lastPanelL       = '';
    this._lastPanelR       = '';
    this._foxyVideoPlaying = false;
    this._jumpActive       = false;

    if (this.$camFoxyVideo) {
      this.$camFoxyVideo.src   = `${CONFIG.ASSETS.VIDEOS}cam2a_foxy_running.mp4`;
      this.$camFoxyVideo.loop  = true;
      this.$camFoxyVideo.muted = true;
      this.$camFoxyVideo.style.display = 'none';
    }
  }

  update() {
    const s = this.state;

    if (s.phase === 'MENU' || s.phase === 'NIGHT_INTRO' ||
        s.phase === 'GAME_OVER' || s.phase === 'WIN') {
      this._hideAllLayers();
      if (s.phase === 'GAME_OVER' || s.phase === 'WIN') this._hideJumpscare();
      return;
    }

    if (s.phase === 'JUMPSCARE') { this._showJumpscare(); return; }
    if (this._jumpActive)          this._hideJumpscare();

    if (s.phase === 'POWER_OUT') { this._showPowerOut(); return; }

    if (s.cameraOpen && s.phase === 'CAMERA') { this._showCameraMode(); return; }
    this._showOfficeMode();
  }

  _hideAllLayers() {
    if (this.$officeView) this.$officeView.style.display = 'none';
    if (this.$cameraView) this.$cameraView.style.display = 'none';
    if (this.$powerView)  this.$powerView.style.display  = 'none';
    this._stopFoxyVideo();
  }

  // ── Office ───────────────────────────────────────────────────
  _showOfficeMode() {
    this.$officeView.style.display = 'block';
    this.$cameraView.style.display = 'none';
    this.$powerView.style.display  = 'none';
    this._stopFoxyVideo();

    const img = this._getOfficeImage();
    if (img !== this._lastOfficeImg) {
      if (this.$sceneImg) this.$sceneImg.src = img;
      this._lastOfficeImg = img;
    }
    this._updatePanelImages();
    this._applyPan();
  }

  _getOfficeImage() {
    const s = this.state, a = s.animatronics, O = CONFIG.ASSETS.OFFICE;
    if (s.leftLight) {
      if (a.bonnie.position === 'LEFT_BLIND_SPOT') return O + 'left_lit_bonnie.png';
      return O + 'left_lit_empty.png';
    }
    if (s.rightLight) {
      if (a.chica.position === 'RIGHT_BLIND_SPOT') return O + 'right_lit_chica.png';
      return O + 'right_lit_empty.png';
    }
    return O + 'base.png';
  }

  // ── Power-out ─────────────────────────────────────────────────
  _showPowerOut() {
    this.$officeView.style.display = 'none';
    this.$cameraView.style.display = 'none';
    this.$powerView.style.display  = 'block';
    this._stopFoxyVideo();

    const O = CONFIG.ASSETS.OFFICE;
    const img = (this.state.powerOutPhase >= 3 &&
                 this.state.animatronics.freddy.position === 'IN_OFFICE')
      ? O + 'power_out_freddy_left.png'
      : O + 'backup_power.png';
    if (this.$powerImg) this.$powerImg.src = img;
  }

  // ── Camera mode ───────────────────────────────────────────────
  _showCameraMode() {
    this.$officeView.style.display = 'none';
    this.$cameraView.style.display = 'block';
    this.$powerView.style.display  = 'none';

    const isKitchen    = this.state.activeCam === '6';
    const isFoxyRunCam = this.state.activeCam === '2A' &&
                         this.state.animatronics.foxy.position === 'WEST_HALL_RUNNING';

    if (this.$kitchenOverlay)
      this.$kitchenOverlay.style.display = isKitchen ? 'flex' : 'none';

    if (isFoxyRunCam) {
      if (this.$camImg) this.$camImg.style.display = 'none';
      if (this.$camFoxyVideo) {
        this.$camFoxyVideo.style.display = 'block';
        if (!this._foxyVideoPlaying) {
          this.$camFoxyVideo.currentTime = 0;
          this.$camFoxyVideo.play().catch(() => {});
          this._foxyVideoPlaying = true;
        }
      }
      return;
    }

    this._stopFoxyVideo();
    if (!isKitchen) {
      if (this.$camImg) this.$camImg.style.display = 'block';
      const img = this._getCameraImage();
      if (img !== this._lastCamImg) {
        if (this.$camImg) this.$camImg.src = img;
        this._lastCamImg = img;
      }
    } else {
      if (this.$camImg) this.$camImg.style.display = 'none';
    }
  }

  _stopFoxyVideo() {
    if (!this._foxyVideoPlaying) return;
    this._foxyVideoPlaying = false;
    if (this.$camFoxyVideo) { this.$camFoxyVideo.pause(); this.$camFoxyVideo.style.display = 'none'; }
    if (this.$camImg) this.$camImg.style.display = 'block';
  }

  _getCameraImage() {
    const s = this.state, a = s.animatronics, C = CONFIG.ASSETS.CAMERAS;

    switch (s.activeCam) {
      case '1A': {
        const f=a.freddy.position==='STAGE', b=a.bonnie.position==='STAGE', c=a.chica.position==='STAGE';
        if (a.freddy.facingCamera) return C+'cam1a_freddy_facing.png';
        if (f&&b&&c) return C+'cam1a_all.png';
        if (f&&c)    return C+'cam1a_no_bonnie.png';
        if (f&&b)    return C+'cam1a_no_chica.png';
        if (f)       return C+'cam1a_freddy_only.png';
        return C+'cam1a_empty.png';
      }
      case '1B':
        if (a.freddy.position==='DINING') return C+'cam1b_freddy.png';
        if (a.chica.position ==='DINING') return C+'cam1b_chica.png';
        if (a.bonnie.position==='DINING') return C+'cam1b_bonnie.png';
        return C+'cam1b_empty.png';
      case '1C':
        if (a.foxy.position!=='PIRATE_COVE') return C+'cam1c_empty.png';
        return C+`cam1c_phase${a.foxy.phase}.png`;
      case '2A':
        if (a.bonnie.position==='WEST_HALL') return C+'cam2a_bonnie.png';
        return C+'cam2a_empty.png';
      case '2B':
        if (a.bonnie.position==='WEST_HALL_CORNER') return C+'cam2b_bonnie.png';
        return C+'cam2b_empty.png';
      case '3':
        if (a.bonnie.position==='SUPPLY_CLOSET') return C+'cam3_bonnie.png';
        return C+'cam3_empty.png';
      case '4A':
        if (a.freddy.position==='EAST_HALL') return C+'cam4a_freddy.png';
        if (a.chica.position ==='EAST_HALL') return C+'cam4a_chica.png';
        return C+'cam4a_empty.png';
      case '4B':
        if (a.freddy.position==='EAST_HALL_CORNER') return C+'cam4b_freddy.png';
        if (a.chica.position ==='EAST_HALL_CORNER') return C+'cam4b_chica.png';
        return C+'cam4b_empty.png';
      case '5':
        if (a.bonnie.position==='BACKSTAGE') return C+'cam5_bonnie.png';
        return C+'cam5_empty.png';
      case '6':
        return ''; // kitchen: handled by disabled overlay
      case '7':
        // Bathrooms — Chica and Freddy can appear here
        if (a.freddy.position==='BATHROOMS') return C+'cam7_freddy.png';
        if (a.chica.position ==='BATHROOMS') return C+'cam7_chica.png';
        return C+'cam7_empty.png';
      default:
        return C+`cam${s.activeCam.toLowerCase()}_empty.png`;
    }
  }

  // ── Panels ────────────────────────────────────────────────────
  _updatePanelImages() {
    const s=this.state, UI=CONFIG.ASSETS.UI;
    const lC=s.leftDoor==='CLOSED'||s.leftDoor==='CLOSING';
    const rC=s.rightDoor==='CLOSED'||s.rightDoor==='CLOSING';
    const lImg=UI+(lC?(s.leftLight?'panel_left_door_lit.png':'panel_left_door.png'):(s.leftLight?'panel_left_lit.png':'panel_left_normal.png'));
    const rImg=UI+(rC?(s.rightLight?'panel_right_door_lit.png':'panel_right_door.png'):(s.rightLight?'panel_right_lit.png':'panel_right_normal.png'));
    if(lImg!==this._lastPanelL&&this.$panelLeftImg){this.$panelLeftImg.src=lImg;this._lastPanelL=lImg;}
    if(rImg!==this._lastPanelR&&this.$panelRightImg){this.$panelRightImg.src=rImg;this._lastPanelR=rImg;}
  }

  _applyPan() {
    const tx=CONFIG.PAN_MIN+this.state.panCurrent*(CONFIG.PAN_MAX-CONFIG.PAN_MIN);
    if(this.$bg) this.$bg.style.transform=`translateX(${tx}px)`;
  }

  // ── Jumpscare ────────────────────────────────────────────────
  _showJumpscare() {
    if (this._jumpActive) return;
    this._jumpActive = true;
    this._stopFoxyVideo();
    const who = this.state.jumpscareTarget;
    if (this.$jumpVideo) {
      this.$jumpVideo.src = `${CONFIG.ASSETS.VIDEOS}jumpscare_${who}.mp4`;
      this.$jumpVideo.currentTime = 0;
      this.$jumpVideo.play().catch(() => {});
    }
    if (this.$jumpOverlay) this.$jumpOverlay.style.display = 'flex';
    if (this.$jumpVideo) {
      this.$jumpVideo.onended = () => {
        this._hideJumpscare();
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

  showStatic() {
    if (!this.$static) return;
    this.$static.classList.add('active');
    setTimeout(() => this.$static.classList.remove('active'), CONFIG.STATIC_DURATION_MS);
  }
}