'use strict';

const CONFIG = {
  // ─── Viewport ────────────────────────────────────────────────
  BASE_WIDTH:  1200,
  BASE_HEIGHT: 540,

  // ─── Office scene background (wider than viewport for panning) ─
  SCENE_WIDTH: 1920,         // width of office background images
  PAN_CENTER_OFFSET: -360,   // translateX for centred view
  PAN_RANGE: 720,            // total travel: -360 left ↔ -1080 right ??? 

  // Actually: background 1920px, viewport 1200px
  // Mouse 0% → translateX = 0   (left edge shows)
  // Mouse 50% → translateX = -360 (centre shows)
  // Mouse 100% → translateX = -720 (right edge shows)
  PAN_MIN: 0,
  PAN_MAX: -720,

  // ─── Door video positions (within 1920 px background) ─────────
  DOOR_LEFT_X:   80,   // px from left of background image
  DOOR_LEFT_W:   250,
  DOOR_RIGHT_X:  1590, // px from left of background image
  DOOR_RIGHT_W:  250,
  DOOR_HEIGHT:   540,

  // ─── FNAF-1 timing (original values) ─────────────────────────
  HOUR_MS:     89_000,  // 89 s per in-game hour (6 h ≈ 8.9 min)
  TOTAL_HOURS: 6,       // 12 AM → 6 AM
  AI_TICK_MS:  5_000,   // AI die roll every 5 s
  POWER_TICK_MS: 100,   // power updates every 100 ms

  // ─── Power drain (% per second) ──────────────────────────────
  DRAIN_BASE:   0.10,
  DRAIN_DOOR:   0.25,  // per closed door
  DRAIN_LIGHT:  0.15,  // per active light
  DRAIN_CAMERA: 0.05,  // while cameras open

  // ─── AI levels per night (0–20 scale) ─────────────────────────
  AI_LEVELS: {
    1: { freddy: 0,  bonnie: 0,  chica: 0,  foxy: 1  },
    2: { freddy: 1,  bonnie: 3,  chica: 1,  foxy: 2  },
    3: { freddy: 5,  bonnie: 10, chica: 5,  foxy: 6  },
    4: { freddy: 10, bonnie: 12, chica: 10, foxy: 15 },
    5: { freddy: 15, bonnie: 18, chica: 13, foxy: 18 },
  },

  // ─── Movement routes ─────────────────────────────────────────
  ROUTES: {
    bonnie: ['STAGE','DINING','BACKSTAGE','SUPPLY_CLOSET','WEST_HALL','WEST_HALL_CORNER','LEFT_BLIND_SPOT'],
    chica:  ['STAGE','DINING','KITCHEN','EAST_HALL','EAST_HALL_CORNER','RIGHT_BLIND_SPOT'],
    freddy: ['STAGE','DINING','KITCHEN','EAST_HALL','EAST_HALL_CORNER','RIGHT_BLIND_SPOT'],
  },

  // ─── Attack ──────────────────────────────────────────────────
  ATTACK_ROLL_MAX: 20,
  ATTACK_CHANCE: 0.85,       // prob of attack when at door and door open
  ATTACK_CHECK_MS: 5_000,    // how often attack is checked

  // ─── Freddy special ──────────────────────────────────────────
  FREDDY_UNOBSERVED_ONLY: true,   // can't move while player watches him on cam
  FREDDY_LAUGH_MIN_NIGHT: 3,
  FREDDY_POWER_MUSIC_MS: 10_000,  // Toreador march before enter
  FREDDY_POWER_ENTER_MS: 5_000,   // extra delay before jumpscare

  // ─── Foxy ────────────────────────────────────────────────────
  FOXY_PHASE_INTERVAL: 15,   // seconds without watching before phase advances
  FOXY_TIMER_MAX: 60,        // total seconds → starts running
  FOXY_DECAY_RATE: 1.5,      // timer decay per second while watching
  FOXY_CHARGE_DURATION_MS: 2_500,
  FOXY_KNOCK_POWER: 1,       // % power lost per knock

  // ─── Door animation (video time in seconds) ──────────────────
  DOOR_CLOSE_FRAME: 1.0,
  DOOR_OPEN_FRAME:  2.0,

  // ─── Camera system ────────────────────────────────────────────
  STATIC_DURATION_MS: 300,
  CAM_FLICKER_INTERVAL_MS: 8_000,

  // ─── Night intro display ─────────────────────────────────────
  NIGHT_INTRO_MS: 4_000,

  // ─── Asset paths ─────────────────────────────────────────────
  ASSETS: {
    OFFICE:     'assets/images/office/',
    CAMERAS:    'assets/images/cameras/',
    UI:         'assets/images/ui/',
    JUMPSCARES: 'assets/images/jumpscares/',
    SOUNDS:     'assets/sounds/',
    VIDEOS:     'assets/videos/',
  },

  // ─── Camera definitions ──────────────────────────────────────
  CAMERAS: [
    { id: '1A', label: 'CAM 1A', name: 'Show Stage'        },
    { id: '1B', label: 'CAM 1B', name: 'Dining Area'       },
    { id: '1C', label: 'CAM 1C', name: 'Pirate Cove'       },
    { id: '2A', label: 'CAM 2A', name: 'West Hall'         },
    { id: '2B', label: 'CAM 2B', name: 'West Hall Corner'  },
    { id: '3',  label: 'CAM 3',  name: 'Supply Closet'     },
    { id: '4A', label: 'CAM 4A', name: 'East Hall'         },
    { id: '4B', label: 'CAM 4B', name: 'East Hall Corner'  },
    { id: '5',  label: 'CAM 5',  name: 'Backstage'         },
    { id: '6',  label: 'CAM 6',  name: 'Kitchen'           },
  ],

  // Camera → animatronic positions visible
  CAM_POSITIONS: {
    '1A': ['STAGE'],
    '1B': ['DINING'],
    '1C': ['PIRATE_COVE'],
    '2A': ['WEST_HALL', 'WEST_HALL_RUNNING'],
    '2B': ['WEST_HALL_CORNER'],
    '3':  ['SUPPLY_CLOSET'],
    '4A': ['EAST_HALL'],
    '4B': ['EAST_HALL_CORNER'],
    '5':  ['BACKSTAGE'],
    '6':  ['KITCHEN'],
  },

  // ─── Panel layout (normalised 0–1 relative to 1200×540) ──────
  PANELS: {
    left: {
      container: { x: 0.000, y: 0.352, w: 0.050, h: 0.296 },
      doorBtn:   { x: 0.317, y: 0.213, w: 0.483, h: 0.225 },
      lightBtn:  { x: 0.305, y: 0.539, w: 0.442, h: 0.214 },
    },
    right: {
      container: { x: 0.928, y: 0.352, w: 0.050, h: 0.296 },
      doorBtn:   { x: 0.233, y: 0.200, w: 0.467, h: 0.238 },
      lightBtn:  { x: 0.233, y: 0.538, w: 0.467, h: 0.219 },
    },
  },

  HOUR_LABELS: ['12 AM','1 AM','2 AM','3 AM','4 AM','5 AM','6 AM'],
};