'use strict';

// ─────────────────────────────────────────────────────────────
// MOVEMENT GRAPH  (weighted adjacency map)
// ─────────────────────────────────────────────────────────────
const MOVEMENT_GRAPH = {

  bonnie: {
    STAGE:             [{ room:'DINING',           weight:0.45 },
                        { room:'BACKSTAGE',        weight:0.15 },
                        { room:'STAY',             weight:0.40 }],
    DINING:            [{ room:'BACKSTAGE',        weight:0.20 },
                        { room:'WEST_HALL',        weight:0.35 },
                        { room:'STAY',             weight:0.45 }],
    BACKSTAGE:         [{ room:'DINING',           weight:0.35 },
                        { room:'SUPPLY_CLOSET',    weight:0.25 },
                        { room:'STAY',             weight:0.40 }],
    SUPPLY_CLOSET:     [{ room:'WEST_HALL',        weight:0.50 },
                        { room:'BACKSTAGE',        weight:0.10 },
                        { room:'STAY',             weight:0.40 }],
    WEST_HALL:         [{ room:'WEST_HALL_CORNER', weight:0.45 },
                        { room:'DINING',           weight:0.10 },
                        { room:'STAY',             weight:0.45 }],
    WEST_HALL_CORNER:  [{ room:'LEFT_BLIND_SPOT',  weight:0.50 },
                        { room:'WEST_HALL',        weight:0.10 },
                        { room:'STAY',             weight:0.40 }],
    LEFT_BLIND_SPOT:   [{ room:'WEST_HALL_CORNER', weight:0.25 },
                        { room:'STAY',             weight:0.75 }],
  },

  chica: {
    STAGE:             [{ room:'DINING',           weight:0.45 },
                        { room:'STAY',             weight:0.55 }],
    DINING:            [{ room:'BATHROOMS',        weight:0.40 },
                        { room:'STAY',             weight:0.60 }],
    BATHROOMS:         [{ room:'KITCHEN',          weight:0.45 },
                        { room:'STAY',             weight:0.55 }],
    KITCHEN:           [{ room:'EAST_HALL',        weight:0.45 },
                        { room:'STAY',             weight:0.55 }],
    EAST_HALL:         [{ room:'EAST_HALL_CORNER', weight:0.50 },
                        { room:'KITCHEN',          weight:0.05 },
                        { room:'STAY',             weight:0.45 }],
    EAST_HALL_CORNER:  [{ room:'RIGHT_BLIND_SPOT', weight:0.55 },
                        { room:'EAST_HALL',        weight:0.05 },
                        { room:'STAY',             weight:0.40 }],
    RIGHT_BLIND_SPOT:  [{ room:'EAST_HALL_CORNER', weight:0.20 },
                        { room:'STAY',             weight:0.80 }],
  },

  freddy: {
    STAGE:             [{ room:'DINING',           weight:0.30 },
                        { room:'STAY',             weight:0.70 }],
    DINING:            [{ room:'BATHROOMS',        weight:0.30 },
                        { room:'STAY',             weight:0.70 }],
    BATHROOMS:         [{ room:'KITCHEN',          weight:0.35 },
                        { room:'STAY',             weight:0.65 }],
    KITCHEN:           [{ room:'EAST_HALL',        weight:0.40 },
                        { room:'STAY',             weight:0.60 }],
    EAST_HALL:         [{ room:'EAST_HALL_CORNER', weight:0.45 },
                        { room:'STAY',             weight:0.55 }],
    EAST_HALL_CORNER:  [{ room:'RIGHT_BLIND_SPOT', weight:0.55 },
                        { room:'STAY',             weight:0.45 }],
    RIGHT_BLIND_SPOT:  [{ room:'STAY',             weight:1.00 }],
  },
};

// ─────────────────────────────────────────────────────────────
// POST-ATTACK TELEPORT ZONES
// After being blocked by a door, the animatronic teleports to
// a random room. Zones are shared for Bonnie and Chica.
// ─────────────────────────────────────────────────────────────
const TELEPORT_ZONES = {
  bonnie: {
    far:   { rooms: ['STAGE', 'DINING'],                    weight: 0.60 },
    mid:   { rooms: ['BACKSTAGE', 'SUPPLY_CLOSET'],         weight: 0.30 },
    close: { rooms: ['WEST_HALL', 'WEST_HALL_CORNER'],      weight: 0.10 },
  },
  chica: {
    far:   { rooms: ['STAGE', 'DINING'],                    weight: 0.60 },
    mid:   { rooms: ['BATHROOMS', 'KITCHEN'],               weight: 0.30 },
    close: { rooms: ['EAST_HALL', 'EAST_HALL_CORNER'],      weight: 0.10 },
  },
};

// ─────────────────────────────────────────────────────────────
// SOUND ZONES  — probability of playing animatronic_move.mp3
// ─────────────────────────────────────────────────────────────
const SOUND_ZONES = {
  STAGE:            0.08,
  DINING:           0.12,
  BACKSTAGE:        0.10,
  BATHROOMS:        0.12,
  SUPPLY_CLOSET:    0.15,
  KITCHEN:          0.20,
  PIRATE_COVE:      0.05,
  WEST_HALL:        0.35,
  EAST_HALL:        0.35,
  WEST_HALL_CORNER: 0.55,
  EAST_HALL_CORNER: 0.55,
  LEFT_BLIND_SPOT:  0.80,
  RIGHT_BLIND_SPOT: 0.80,
};

const CONFIG = {
  BASE_WIDTH:  1200,
  BASE_HEIGHT: 540,
  SCENE_WIDTH: 1920,
  PAN_MIN: 0,
  PAN_MAX: -720,

  DOOR_LEFT_X:  80,  DOOR_LEFT_W:  250,
  DOOR_RIGHT_X: 1590,DOOR_RIGHT_W: 250,
  DOOR_HEIGHT:  540,

  HOUR_MS:       89_000,
  TOTAL_HOURS:   6,
  POWER_TICK_MS: 100,

  DRAIN_BASE:   0.10,
  DRAIN_DOOR:   0.25,
  DRAIN_LIGHT:  0.15,
  DRAIN_CAMERA: 0.05,

  AI_TICK_MS:      4_970,
  ATTACK_ROLL_MAX: 20,

  AI_LEVELS: {
    1: { freddy: 0,  bonnie: 0,  chica: 0,  foxy: 1  },
    2: { freddy: 0,  bonnie: 3,  chica: 1,  foxy: 2  },
    3: { freddy: 1,  bonnie: 7,  chica: 5,  foxy: 6  },
    4: { freddy: 2,  bonnie: 12, chica: 10, foxy: 15 },
    5: { freddy: 3,  bonnie: 16, chica: 14, foxy: 18 },
  },

  NIGHT_ESCALATION: {
    2: [{ hour:3, freddy:0, bonnie:2, chica:2, foxy:1 }],
    3: [{ hour:2, freddy:1, bonnie:3, chica:2, foxy:2 },
        { hour:4, freddy:2, bonnie:2, chica:2, foxy:1 }],
    4: [{ hour:2, freddy:3, bonnie:2, chica:2, foxy:2 },
        { hour:3, freddy:3, bonnie:1, chica:1, foxy:1 }],
    5: [{ hour:1, freddy:4, bonnie:2, chica:2, foxy:1 },
        { hour:2, freddy:4, bonnie:1, chica:1, foxy:1 }],
  },

  FREDDY_UNOBSERVED_ONLY: true,
  FREDDY_LAUGH_MIN_NIGHT: 3,
  FREDDY_POWER_MUSIC_MS:  10_800,
  FREDDY_POWER_ENTER_MS:  3_000,

  // ─── Foxy ────────────────────────────────────────────────────
  // Formula per tick: if randomInt(0,19) < aiLevel * playerModifier → tick++
  // playerModifier: cameras open = 0.05, closed = 1.0
  //
  // Speed tuned so Foxy is a real threat:
  //   FOXY_TICK_INCREMENT = 3  (was 1 — 3× faster accumulation)
  //   FOXY_PHASE_INTERVAL = 5  → phases at 5,10,15 ticks
  //   FOXY_TIMER_MAX      = 20 → runs at 20 accumulated ticks
  //
  // With aiLevel=2 (Night 2), cameras closed, every tick succeeds
  // (2/20 = 10% per tick) → ~67 ticks to run × 4.97s = ~5.5 min max.
  // With aiLevel=6 (Night 3): ~22 ticks → ~1.8 min. Much more threatening.
  FOXY_TICK_INCREMENT:     3,   // ×3 vs before
  FOXY_PHASE_INTERVAL:     5,
  FOXY_TIMER_MAX:          20,
  FOXY_CHARGE_DURATION_MS: 2_000,
  FOXY_KNOCK_POWER:        6,
  FOXY_PEEK_DELAY_MS:      3_000,

  KITCHEN_LINGER_MAX_MS: 9_000,

  DOOR_CLOSE_FRAME: 0.7,
  DOOR_OPEN_FRAME:  1.3,

  STATIC_DURATION_MS:       300,
  CAM_FLICKER_INTERVAL_MS: 8_000,

  NIGHT_INTRO_MS: 4_000,

  ASSETS: {
    OFFICE:     'assets/images/office/',
    CAMERAS:    'assets/images/cameras/',
    UI:         'assets/images/ui/',
    JUMPSCARES: 'assets/images/jumpscares/',
    SOUNDS:     'assets/sounds/',
    VIDEOS:     'assets/videos/',
  },

  CAMERAS: [
    { id:'1A', label:'CAM 1A', name:'Show Stage'    },
    { id:'1B', label:'CAM 1B', name:'Dining Area'   },
    { id:'1C', label:'CAM 1C', name:'Pirate Cove'   },
    { id:'2A', label:'CAM 2A', name:'West Hall'     },
    { id:'2B', label:'CAM 2B', name:'W.Hall Corner' },
    { id:'3',  label:'CAM 3',  name:'Supply Closet' },
    { id:'4A', label:'CAM 4A', name:'East Hall'     },
    { id:'4B', label:'CAM 4B', name:'E.Hall Corner' },
    { id:'5',  label:'CAM 5',  name:'Backstage'     },
    { id:'6',  label:'CAM 6',  name:'Kitchen'       },
    { id:'7',  label:'CAM 7',  name:'Bathrooms'     },
  ],

  CAM_POSITIONS: {
    '1A':['STAGE'],
    '1B':['DINING'],
    '1C':['PIRATE_COVE'],
    '2A':['WEST_HALL','WEST_HALL_RUNNING'],
    '2B':['WEST_HALL_CORNER'],
    '3': ['SUPPLY_CLOSET'],
    '4A':['EAST_HALL'],
    '4B':['EAST_HALL_CORNER'],
    '5': ['BACKSTAGE'],
    '6': ['KITCHEN'],
    '7': ['BATHROOMS'],
  },

  PANELS: {
    left:  { container:{x:0.000,y:0.352,w:0.050,h:0.296}, doorBtn:{x:0.317,y:0.213,w:0.483,h:0.225}, lightBtn:{x:0.305,y:0.539,w:0.442,h:0.214} },
    right: { container:{x:0.928,y:0.352,w:0.050,h:0.296}, doorBtn:{x:0.233,y:0.200,w:0.467,h:0.238}, lightBtn:{x:0.233,y:0.538,w:0.467,h:0.219} },
  },

  HOUR_LABELS: ['12 AM','1 AM','2 AM','3 AM','4 AM','5 AM','6 AM'],
};