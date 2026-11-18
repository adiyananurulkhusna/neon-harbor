// The screenshot scenes behind ?shot=cover|drive|foot|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a small autopilot (drive toward the mission marker along the
// roads, walk toward the objective, shoot the nearest enemy), so the frame is
// what real play looks like and the same seed always gives the same frame.
// The cover shows a police chase with wanted stars, the minimap and a mission
// objective all at once.

import { ROADS, STEP } from './config.js';
import { LANDMARKS, nearestRoad } from './city.js';
import { angleDelta, clamp } from './random.js';
import { SCREEN_PLAY } from './render.js';
import { makeEnemy } from './combat.js';
import { makeCopCar, makePlayerCar, roadHeading } from './vehicles.js';
import { startMission } from './missions.js';

const SAMPLE = 1 / 30;

/** Scripted controls for one step of the autopilot. */
function controlsFor(world, move, mouseWorld, click, mouseDown) {
  return {
    move,
    run: false,
    actions: 0,
    click,
    mouseDown,
    mouseWorld: mouseWorld || { x: world.state.player.x, y: world.state.player.y },
  };
}

/**
 * Steer a car toward a target along the road grid: drive along the current
 * road to the next intersection, then turn onto the road that closes the
 * bigger gap. Turning mid-block would ram a building, so the axis only
 * changes at an intersection.
 */
export function driveToward(world, tx, ty) {
  const player = world.state.player;
  const car = player.car;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 110) return controlsFor(world, { x: 0, y: 0 }, null, false, false);
  const nearX = nearestRoad(car.x);
  const nearY = nearestRoad(car.y);
  const onH = Math.abs(car.y - nearY) < 34;
  const onV = Math.abs(car.x - nearX) < 34;
  const angle = roadHeading(car.x, car.y, tx, ty, car.angle);
  const turn = angleDelta(car.angle, angle);
  const steer = turn > 0.15 ? 1 : turn < -0.15 ? -1 : 0;
  // The next intersection ahead on the current road, and whether the car
  // turns there: going straight through needs no braking.
  let turnAhead = false;
  let distToTurn = Infinity;
  if (onH && !onV) {
    const aheadX = dx > 0
      ? (ROADS.find((r) => r > car.x + 30) ?? ROADS[ROADS.length - 1])
      : ([...ROADS].reverse().find((r) => r < car.x - 30) ?? ROADS[0]);
    distToTurn = Math.abs(aheadX - car.x);
    turnAhead = Math.abs(tx - aheadX) < Math.abs(dy);
  } else if (onV && !onH) {
    const aheadY = dy > 0
      ? (ROADS.find((r) => r > car.y + 30) ?? ROADS[ROADS.length - 1])
      : ([...ROADS].reverse().find((r) => r < car.y - 30) ?? ROADS[0]);
    distToTurn = Math.abs(aheadY - car.y);
    turnAhead = Math.abs(tx - car.x) >= Math.abs(ty - aheadY);
  } else if (onH && onV) {
    turnAhead = Math.abs(turn) > 0.5;
    distToTurn = 0;
  }
  // Brake for a turn (then turn on the spot): never throttle while the nose
  // is more than half a radian off the road, or the car drifts off the road
  // while turning. Brake early for a coming turn so the car stops AT the
  // intersection instead of past it, and otherwise cruise at a speed the
  // corners can take.
  let throttle = -1;
  const speed = Math.abs(car.speed);
  if (Math.abs(turn) > 0.5) throttle = speed > 60 ? 1 : 0;
  else if (turnAhead && distToTurn < (speed * speed) / (2 * 620) + 34 && speed > 30) throttle = 1;
  else if (dist < 320 && speed > 150) throttle = 0; // slow down for the arrival
  else if (speed > 420) throttle = 0;
  return controlsFor(world, { x: steer, y: throttle }, null, false, false);
}

/** Walk toward a target on foot. */
function walkToward(world, tx, ty) {
  const player = world.state.player;
  const dx = tx - player.x;
  const dy = ty - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 30) return controlsFor(world, { x: 0, y: 0 }, null, false, false);
  return controlsFor(world, { x: dx / dist, y: dy / dist }, null, false, false);
}

/** Put the player in a car at (x, y) on a road, facing along it. */
function putPlayerInCar(world, car) {
  const player = world.state.player;
  world.state.traffic = world.state.traffic.filter((c) => c !== car);
  world.state.parked = world.state.parked.filter((c) => c !== car);
  player.inCar = true;
  player.car = car;
  car.driver = 'player';
  car.speed = 120;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
}

/** Spawn police cars around the player, already in pursuit. */
function spawnChase(world, count) {
  const player = world.state.player;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.7;
    const cop = makeCopCar(player.x + Math.cos(angle) * 420, player.y + Math.sin(angle) * 420);
    cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.speed = 300;
    world.state.copCars.push(cop);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Unknown names stage the cover.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  const shot = name === 'drive' || name === 'foot' || name === 'mission' ? name : 'cover';

  if (shot === 'cover') {
    // Police chase: wanted 3, mission 5 (escape) active, player driving fast
    // through downtown traffic with cops on his tail.
    state.missions.index = 4;
    state.missions.started = false;
    startMission(state.missions, world.api);
    const car = makePlayerCar('sport', '#e84fd0', 1000, 1000, 0);
    state.parked.push(car);
    putPlayerInCar(world, car);
    spawnChase(world, 3);
    state.player.x = 1000;
    state.player.y = 1000;
    for (let i = 0; i < 11 / STEP; i += 1) {
      world.step(STEP, driveToward(world, LANDMARKS.safehouse.x, LANDMARKS.safehouse.y));
    }
    return { screen: SCREEN_PLAY };
  }

  if (shot === 'drive') {
    // Cruising downtown in traffic, mission 1 active, no heat.
    const car = makePlayerCar('sedan', '#4f7ec9', 600, 600, 0);
    state.parked.push(car);
    putPlayerInCar(world, car);
    for (let i = 0; i < 14 / STEP; i += 1) {
      world.step(STEP, driveToward(world, LANDMARKS.pier.x, LANDMARKS.pier.y));
    }
    return { screen: SCREEN_PLAY };
  }

  if (shot === 'foot') {
    // On foot in the park plaza, mission 2 (collect packages) active,
    // pedestrians strolling around the player.
    state.missions.index = 1;
    state.missions.started = false;
    startMission(state.missions, world.api);
    state.player.x = LANDMARKS.plaza.x - 40;
    state.player.y = LANDMARKS.plaza.y + 60;
    for (let i = 0; i < 8 / STEP; i += 1) {
      world.step(STEP, walkToward(world, LANDMARKS.plaza.x, LANDMARKS.plaza.y));
    }
    return { screen: SCREEN_PLAY };
  }

  // mission: the warehouse shootout, mid-fight, enemies visible and firing.
  state.missions.index = 3;
  state.missions.started = false;
  startMission(state.missions, world.api);
  state.player.x = LANDMARKS.warehouse.x - 250;
  state.player.y = LANDMARKS.warehouse.y + 60;
  state.player.ammo = 48;
  world.api.say('Raka: "Gudang itu dijaga empat orang. Aku harus berani."');
  // A short firefight: the player lands a few shots, but the gang is still
  // standing and shooting back when the frame is taken.
  for (let i = 0; i < 2.8 / STEP; i += 1) {
    const enemy = state.enemies.find((e) => !e.dead);
    const target = enemy ? { x: enemy.x, y: enemy.y } : { x: state.player.x + 100, y: state.player.y };
    world.step(STEP, controlsFor(world, { x: 0, y: 0 }, target, i % 30 === 0, false));
  }
  return { screen: SCREEN_PLAY };
}
