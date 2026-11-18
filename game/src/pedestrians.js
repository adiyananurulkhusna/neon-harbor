// Pedestrians: people walking the sidewalks of Neon Harbor. They stroll along
// the pavement beside the roads, wait at corners, and run away from gunfire,
// crashes and police chases. Each one is a small coloured figure with a walk
// cycle the renderer draws.

import { ROADS, WORLD } from './config.js';
import { distance } from './random.js';
import { beachAt, nearestRoad } from './city.js';

const SHIRT_COLORS = ['#e86a6a', '#6aa8e8', '#e8c96a', '#8ae86a', '#c96ae8', '#e8e8e8', '#6ad8e8', '#e89a6a'];
const SKIN_COLORS = ['#f2c89b', '#d9a06b', '#a06b3f', '#8a5a30'];

/** Make one pedestrian near (x, y), on a sidewalk. */
export function makePedestrian(random, x, y) {
  return {
    x, y,
    angle: random() * Math.PI * 2,
    speed: 55 + random() * 45,
    shirt: SHIRT_COLORS[Math.floor(random() * SHIRT_COLORS.length)],
    skin: SKIN_COLORS[Math.floor(random() * SKIN_COLORS.length)],
    walkPhase: random() * Math.PI * 2,
    state: 'walk',
    panic: 0,
    targetX: x,
    targetY: y,
    waitTimer: random() * 3,
    dead: false,
    deadTimer: 0,
  };
}

/** Pick a new strolling destination: a sidewalk corner (road line ± 56 px). */
function pickStrollTarget(random, ped) {
  const roadX = ROADS[Math.floor(random() * ROADS.length)];
  const roadY = ROADS[Math.floor(random() * ROADS.length)];
  ped.targetX = roadX + (random() < 0.5 ? -1 : 1) * 56;
  ped.targetY = roadY + (random() < 0.5 ? -1 : 1) * 56;
  ped.targetY = Math.min(ped.targetY, 2340);
}

/** One pedestrian step. `danger` is {x, y, radius} when something scary is near. */
export function stepPedestrian(ped, dt, random, danger) {
  if (ped.dead) {
    ped.deadTimer += dt;
    return;
  }
  ped.walkPhase += dt * (ped.state === 'panic' ? 14 : 7);
  if (danger && distance(ped.x, ped.y, danger.x, danger.y) < danger.radius) {
    ped.state = 'panic';
    ped.panic = 2.5;
    // Run away along a sidewalk axis, never through a building: prefer the
    // axis of the sidewalk the pedestrian is already on.
    const dx = ped.x - danger.x;
    const dy = ped.y - danger.y;
    const onH = Math.abs(ped.y - nearestRoad(ped.y)) < 70;
    const onV = Math.abs(ped.x - nearestRoad(ped.x)) < 70;
    let away;
    if (onH && !onV) away = Math.atan2(0, dx);
    else if (onV && !onH) away = Math.atan2(dy, 0);
    else away = Math.abs(dx) >= Math.abs(dy) ? Math.atan2(0, dx) : Math.atan2(dy, 0);
    ped.angle = away;
    const speed = 240;
    ped.x += Math.cos(away) * speed * dt;
    ped.y += Math.sin(away) * speed * dt;
  } else if (ped.state === 'panic') {
    ped.panic -= dt;
    ped.x += Math.cos(ped.angle) * 230 * dt;
    ped.y += Math.sin(ped.angle) * 230 * dt;
    if (ped.panic <= 0) ped.state = 'walk';
  } else if (ped.waitTimer > 0) {
    ped.waitTimer -= dt;
  } else {
    // Stroll one axis at a time, starting with the axis of the sidewalk the
    // pedestrian is already on: a pedestrian on a vertical sidewalk walks
    // along it first, so the walk never cuts through a building.
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const onH = Math.abs(ped.y - nearestRoad(ped.y)) < 70;
    const onV = Math.abs(ped.x - nearestRoad(ped.x)) < 70;
    const arrived = () => {
      ped.waitTimer = 1 + random() * 4;
      pickStrollTarget(random, ped);
    };
    if (onH && !onV) {
      if (Math.abs(dx) > 12) {
        ped.angle = dx > 0 ? 0 : Math.PI;
        ped.x += Math.sign(dx) * ped.speed * dt;
      } else if (Math.abs(dy) > 12) {
        ped.angle = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
        ped.y += Math.sign(dy) * ped.speed * dt;
      } else arrived();
    } else if (onV) {
      if (Math.abs(dy) > 12) {
        ped.angle = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
        ped.y += Math.sign(dy) * ped.speed * dt;
      } else if (Math.abs(dx) > 12) {
        ped.angle = dx > 0 ? 0 : Math.PI;
        ped.x += Math.sign(dx) * ped.speed * dt;
      } else arrived();
    } else {
      // Off the sidewalks (only after a panic): head for the nearest road line.
      if (Math.abs(ped.x - nearestRoad(ped.x)) < Math.abs(ped.y - nearestRoad(ped.y))) {
        const tx = nearestRoad(ped.x);
        ped.angle = tx > ped.x ? 0 : Math.PI;
        ped.x += Math.sign(tx - ped.x) * ped.speed * dt;
      } else {
        const ty = nearestRoad(ped.y);
        ped.angle = ty > ped.y ? Math.PI / 2 : -Math.PI / 2;
        ped.y += Math.sign(ty - ped.y) * ped.speed * dt;
      }
    }
  }
  ped.x = Math.max(30, Math.min(WORLD.width - 30, ped.x));
  ped.y = Math.max(30, Math.min(WORLD.height - 30, ped.y));
  if (beachAt(ped.x, ped.y) === 'water') ped.y = 2480;
}

/** Spawn pedestrians spread over the city, away from the player's start. */
export function spawnPedestrians(random, count, avoidX, avoidY) {
  const peds = [];
  let tries = 0;
  while (peds.length < count && tries < count * 20) {
    tries += 1;
    const road = ROADS[Math.floor(random() * ROADS.length)];
    const horizontal = random() < 0.5;
    const along = 120 + random() * (WORLD.width - 240);
    const side = (random() < 0.5 ? -1 : 1) * 56;
    const x = horizontal ? along : road + side;
    const y = horizontal ? road + side : along;
    if (y > 2340) continue;
    if (distance(x, y, avoidX, avoidY) < 260) continue;
    const ped = makePedestrian(random, x, y);
    pickStrollTarget(random, ped);
    peds.push(ped);
  }
  return peds;
}
