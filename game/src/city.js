// The city of Neon Harbor: a road grid, building blocks, parks, a beach and a
// harbor pier, all laid out once from the seeded random. This file owns the
// layout and the geometry questions the rest of the game asks about it:
// is a point on a road, does a circle hit a building, where is the nearest road.

import { BEACH, ROADS, ROAD_WIDTH, ROOF_COLORS, WORLD } from './config.js';
import { clamp } from './random.js';

/** Is (x, y) on a road (within the asphalt of any grid line)? */
export function onRoad(x, y) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= ROAD_WIDTH / 2 || Math.abs(y - r) <= ROAD_WIDTH / 2) return true;
  }
  return false;
}

/** Nearest road coordinate to a value on one axis. */
export function nearestRoad(value) {
  let best = ROADS[0];
  for (const r of ROADS) if (Math.abs(r - value) < Math.abs(best - value)) best = r;
  return best;
}

/** Is (x, y) inside the beach sand or the water? */
export function beachAt(x, y) {
  if (y < BEACH.sandTop) return 'land';
  if (y < BEACH.waterTop) return 'sand';
  return 'water';
}

/** Push a circle (x, y, radius) out of every building it overlaps; returns true if it hit one. */
export function resolveCircleBuildings(city, circle) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(circle.x, b.x, b.x + b.w);
    const cy = clamp(circle.y, b.y, b.y + b.h);
    const dx = circle.x - cx;
    const dy = circle.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= circle.radius * circle.radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (circle.radius - d) / d;
      circle.x += dx * push;
      circle.y += dy * push;
    } else {
      // Centre inside the building: push out along the smallest penetration.
      const left = circle.x - b.x;
      const right = b.x + b.w - circle.x;
      const top = circle.y - b.y;
      const bottom = b.y + b.h - circle.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) circle.x = b.x - circle.radius;
      else if (m === right) circle.x = b.x + b.w + circle.radius;
      else if (m === top) circle.y = b.y - circle.radius;
      else circle.y = b.y + b.h + circle.radius;
    }
  }
  return hit;
}

/** Is a circle inside any building? */
export function insideBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return true;
  }
  return false;
}

/** A point on a road at least `minDist` from (x, y), for spawning traffic and police. */
export function randomRoadPoint(random, x, y, minDist) {
  for (let tries = 0; tries < 20; tries += 1) {
    const horizontal = random() < 0.5;
    const road = ROADS[Math.floor(random() * ROADS.length)];
    const along = 120 + random() * (WORLD.width - 240);
    const px = horizontal ? along : road;
    const py = horizontal ? road : along;
    if (Math.hypot(px - x, py - y) >= minDist && beachAt(px, py) === 'land') return { x: px, y: py };
  }
  return { x: ROADS[2], y: ROADS[2] };
}

/** Build the city from the seeded random. */
export function createCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  let colorIndex = 0;

  // Blocks sit between neighbouring road lines. A block is a park, a plaza or
  // one to four buildings; the two blocks by the pier are the harbor yards.
  for (let i = 0; i < ROADS.length - 1; i += 1) {
    for (let j = 0; j < ROADS.length - 1; j += 1) {
      const x0 = ROADS[i] + ROAD_WIDTH / 2 + 14;
      const x1 = ROADS[i + 1] - ROAD_WIDTH / 2 - 14;
      const y0 = ROADS[j] + ROAD_WIDTH / 2 + 14;
      const y1 = ROADS[j + 1] - ROAD_WIDTH / 2 - 14;
      if (y1 > BEACH.sandTop - 10) continue; // the beach strip stays open
      const roll = random();
      if (roll < 0.16) {
        // Park: grass, trees and a path.
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const count = 5 + Math.floor(random() * 6);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: x0 + 24 + random() * (x1 - x0 - 48), y: y0 + 24 + random() * (y1 - y0 - 48), r: 12 + random() * 8 });
        }
        continue;
      }
      if (roll < 0.22) continue; // empty plaza with a fountain square
      const cols = random() < 0.5 ? 1 : 2;
      const rows = random() < 0.5 ? 1 : 2;
      const cw = (x1 - x0 - (cols - 1) * 26) / cols;
      const ch = (y1 - y0 - (rows - 1) * 26) / rows;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          const bw = cw * (0.62 + random() * 0.3);
          const bh = ch * (0.62 + random() * 0.3);
          const bx = x0 + c * (cw + 26) + (cw - bw) / 2;
          const by = y0 + r * (ch + 26) + (ch - bh) / 2;
          buildings.push({
            x: bx, y: by, w: bw, h: bh,
            color: ROOF_COLORS[colorIndex % ROOF_COLORS.length],
            height: 1 + Math.floor(random() * 3),
          });
          colorIndex += 1;
        }
      }
    }
  }

  // Harbor pier on the east edge, jutting into the bay, with moored boats.
  const pier = { x: 2430, y: 1560, w: 130, h: 420 };
  const boats = [];
  for (let b = 0; b < 4; b += 1) {
    boats.push({ x: 2470 + (b % 2) * 44, y: 1620 + Math.floor(b / 2) * 150, angle: 0.35 + random() * 0.2, color: ['#f4f6fb', '#ffd94a', '#37e0d8', '#ff5fa2'][b] });
  }
  // Boardwalk trees along the beach.
  for (let t = 0; t < 10; t += 1) {
    trees.push({ x: 120 + t * 230 + random() * 60, y: BEACH.sandTop - 26 + random() * 10, r: 14 + random() * 6 });
  }

  return { buildings, parks, trees, pier, boats };
}

/** Fixed landmarks the missions and the minimap refer to. */
export const LANDMARKS = {
  pier: { x: 2495, y: 1770, name: 'Dermaga Neon' },
  plaza: { x: 1000, y: 1000, name: 'Plaza Merdeka' },
  park: { x: 1400, y: 600, name: 'Taman Bunga' },
  warehouse: { x: 1800, y: 1800, name: 'Gudang Pelabuhan' },
  safehouse: { x: 600, y: 600, name: 'Rumah Aman' },
  hospital: { x: 1000, y: 1400, name: 'RS Harapan' },
  goldCar: { x: 2200, y: 1000, name: 'Showroom Kilau' },
  dropoff: { x: 200, y: 2200, name: 'Gudang Selatan' },
};
