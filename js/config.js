'use strict';

const CONFIG = {
  // ─── Viewport ────────────────────────────────────────────────
  BASE_WIDTH:  1200,
  BASE_HEIGHT: 540,

  // ─── Office scene background ──────────────────────────────────
  SCENE_WIDTH: 1920,
  PAN_MIN: 0,
  PAN_MAX: -720,

  // ─── Door video positions (within 1920 px background) ─────────
  DOOR_LEFT_X:   80,
  DOOR_LEFT_W:   250,
  DOOR_RIGHT_X:  1590,
  DOOR_RIGHT_W:  250,
  DOOR_HEIGHT:   540,

  // ─── FNAF-1 timing ────────────────────────────────────────────
  HOUR_MS:       89_000,   // 89 s per in-game hour  → full night ≈ 8.9 min
  TOTAL_HOURS:   6,
  AI_TICK_MS:    4_970,    // original: 4.97 s per AI tick
  POWER_TICK_MS: 100,

  // ─── Power drain (% per second) ──────────────────────────────
  DRAIN_BASE:   0.10,
  DRAIN_DOOR:   0.25,
  DRAIN_LIGHT:  0.15,
  DRAIN_CAMERA: 0.05,

  // ─── AI levels per night (0–20 scale) ─────────────────────────
  // Original FNAF1 Night 1: Freddy=0, Bonnie=0, Chica=0, Foxy=1
  // NOTE: AI level 0 = animatronic NEVER moves (correct for Freddy on N1).
  // Bonnie/Chica bumped to 1 so the player sees some activity on Night 1;
  // this is cosmetically close to original where Night 1 feels "calm but alive".
  AI_LEVELS: {
    1: { freddy: 0,  bonnie: 1,  chica: 1,  foxy: 2  },
    2: { freddy: 1,  bonnie: 3,  chica: 1,  foxy: 3  },
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
  ATTACK_CHANCE:   0.85,
  ATTACK_CHECK_MS: 5_000,

  // ─── Freddy special ──────────────────────────────────────────
  FREDDY_UNOBSERVED_ONLY:  true,
  FREDDY_LAUGH_MIN_NIGHT:  3,
  FREDDY_POWER_MUSIC_MS:   10_000,
  FREDDY_POWER_ENTER_MS:   5_000,

  // ─── Foxy (reworked — slower, more forgiving) ─────────────────
  // Phase intervals: how many "not-watching seconds" advance each phase.
  // Total to reach phase 3 = 3 × FOXY_PHASE_INTERVAL = 60 s
  FOXY_PHASE_INTERVAL:     20,    // was 15 — each phase takes longer
  FOXY_TIMER_MAX:          90,    // was 60 — longer before the run
  // Decay: how many timer-seconds are removed per real second while watching.
  // 0.3 means watching CAM 1C for 10 s only removes 3 s of progress.
  // Keeps the "you must keep checking" tension without instant reset.
  FOXY_DECAY_RATE:         0.3,   // was 1.5 — much gentler rollback
  FOXY_SPEED_BASE:         0.4,   // base phase-timer increment per second (aiLevel 0)
  FOXY_SPEED_PER_LEVEL:    0.015, // additional increment per aiLevel point
  FOXY_CHARGE_DURATION_MS: 2_500,
  FOXY_KNOCK_POWER:        1,     // % power lost per knock

  // ─── Door animation (video time in seconds) ──────────────────
  DOOR_CLOSE_FRAME: 0.8,   // pause at 1 s → door fully closed
  DOOR_OPEN_FRAME:  2.0,   // pause at 2 s → door fully open

  // ─── Camera system ────────────────────────────────────────────
  STATIC_DURATION_MS:     300,
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
    { id: '2B', label: 'CAM 2B', name: 'W.Hall Corner'     },
    { id: '3',  label: 'CAM 3',  name: 'Supply Closet'     },
    { id: '4A', label: 'CAM 4A', name: 'East Hall'         },
    { id: '4B', label: 'CAM 4B', name: 'E.Hall Corner'     },
    { id: '5',  label: 'CAM 5',  name: 'Backstage'         },
    { id: '6',  label: 'CAM 6',  name: 'Kitchen'           },
  ],

  // Camera → animatronic positions visible (used to freeze Freddy when watched)
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