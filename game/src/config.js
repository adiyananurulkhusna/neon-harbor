// Neon Harbor — tuning numbers, palette and world size in one place.
// The city is a fixed 2600x2600 world; the renderer scales the camera view to
// the window, so no rule below depends on the screen size.

export const WORLD = { width: 2600, height: 2600 };

/** Fixed simulation step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Road grid: roads run at these coordinates, both directions. */
export const ROADS = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_WIDTH = 96;
export const LANE = 24;

/** Beach band along the south edge: sand, then water at the very bottom. */
export const BEACH = { sandTop: 2360, waterTop: 2500 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  healthMax: 100,
  punchDamage: 25,
  punchRange: 46,
  punchArc: 1.1,
  pistolDamage: 34,
  pistolRange: 520,
  pistolCooldown: 0.28,
  ammoStart: 24,
  ammoMax: 120,
};

export const CAR = {
  radius: 20,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  grip: 0.94,
};

/** Traffic car kinds: colour, size, top speed and how common each is. */
export const TRAFFIC_KINDS = [
  { name: 'sedan', color: '#c94f4f', w: 44, h: 22, top: 240, weight: 5 },
  { name: 'sedan', color: '#4f7ec9', w: 44, h: 22, top: 230, weight: 5 },
  { name: 'taxi', color: '#f2c230', w: 44, h: 22, top: 250, weight: 3 },
  { name: 'hatch', color: '#7ac74f', w: 40, h: 20, top: 220, weight: 4 },
  { name: 'truck', color: '#8a8f98', w: 58, h: 26, top: 180, weight: 2 },
  { name: 'sport', color: '#e84fd0', w: 46, h: 22, top: 320, weight: 1 },
  { name: 'van', color: '#e8e2d4', w: 50, h: 24, top: 200, weight: 2 },
];

export const COP = {
  carTop: 430,
  carAccel: 520,
  footSpeed: 205,
  bustRadius: 30,
  bustTime: 1.4,
  spawnDistance: 700,
};

export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  killPed: 2,
  killCop: 2,
  decayDelay: 14,
  decayRate: 0.09,
};

export const PED_COUNT = 46;
export const TRAFFIC_COUNT = 22;

export const PALETTE = {
  ground: '#9db98a',
  groundAlt: '#a8c295',
  sidewalk: '#cfc8b8',
  road: '#3d4149',
  roadEdge: '#2c2f36',
  laneDash: '#e8d44f',
  sand: '#e8d29a',
  water: '#2f9fd8',
  waterDeep: '#1f7fc0',
  buildingEdge: '#2b2b33',
  panel: 'rgba(12, 16, 28, 0.82)',
  panelBorder: 'rgba(255, 255, 255, 0.16)',
  text: '#f4f6fb',
  muted: '#aab2c4',
  gold: '#ffd94a',
  pink: '#ff5fa2',
  cyan: '#37e0d8',
  red: '#ff4d5e',
  green: '#54e07a',
  blue: '#4f9dff',
};

/** Building roof colours, cycled through the city. */
export const ROOF_COLORS = ['#e8a34f', '#c96a5e', '#5e8fc9', '#7a5ec9', '#4fae8a', '#c95e9d', '#8a97a8', '#d8c25e'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save game is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-harbor.save.v1';
export const BEST_KEY = 'neon-harbor.best.v1';
