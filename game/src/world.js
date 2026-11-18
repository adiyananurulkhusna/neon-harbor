// Neon Harbor — the game's rules and state, with no drawing and no browser in
// it. step() advances one fixed step from a small `controls` object (movement,
// one-shot actions, mouse), so the live game and the screenshot autopilot
// drive the same simulation. It returns event flags the caller reacts to.

import { BEACH, CAR, COP, PED_COUNT, PLAYER, SAVE_KEY, STEP, TRAFFIC_COUNT, WANTED, WORLD } from './config.js';
import { clamp, distance } from './random.js';
import { createCity, insideBuilding, resolveCircleBuildings, beachAt, randomRoadPoint } from './city.js';
import { makeCopCar, makePlayerCar, makeTrafficCar, stepCopCar, stepPlayerCar, stepTrafficCar } from './vehicles.js';
import { makePedestrian, spawnPedestrians, stepPedestrian } from './pedestrians.js';
import { addWanted, createPoliceState, nearestCopDistance, setWanted, stepPolice } from './police.js';
import { completeMission, createMissionState, currentMission, missionTarget, startMission, updateMissions } from './missions.js';
import { killEnemy, makeBullet, makeEnemy, makePickup, playerPunch, playerShoot, stepBullets, stepEnemy, stepPickups } from './combat.js';
import { ACTION_ENTER_CAR, ACTION_PUNCH } from './input.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_CRASH = 4;

const PARKED_SPOTS = [
  { x: 600, y: 260, kind: 'sedan', color: '#c94f4f' },
  { x: 1400, y: 1240, kind: 'hatch', color: '#7ac74f' },
  { x: 1000, y: 660, kind: 'taxi', color: '#f2c230' },
  { x: 1800, y: 660, kind: 'van', color: '#e8e2d4' },
  { x: 2200, y: 1460, kind: 'sedan', color: '#4f7ec9' },
  { x: 600, y: 1860, kind: 'sport', color: '#e84fd0' },
];

const PICKUP_SPOTS = [
  { kind: 'ammo', x: 1000, y: 940 },
  { kind: 'health', x: 1400, y: 1400 },
  { kind: 'ammo', x: 600, y: 1400 },
  { kind: 'cash', x: 1800, y: 600 },
  { kind: 'health', x: 2200, y: 1800 },
  { kind: 'cash', x: 1000, y: 1800 },
];

export function createWorld(random, sfx) {
  const city = createCity(random);
  const state = {
    city,
    player: {
      x: 1000, y: 1060, angle: 0, health: PLAYER.healthMax, ammo: PLAYER.ammoStart,
      inCar: false, car: null, hidden: false,
    },
    traffic: [],
    parked: [],
    copCars: [],
    footCops: [],
    courier: null,
    goldCar: null,
    peds: [],
    enemies: [],
    bullets: [],
    pickups: [],
    sparks: [],
    money: 0,
    clockMinutes: 9 * 60 + 24,
    elapsed: 0,
    police: createPoliceState(),
    missions: createMissionState(),
    pistolCooldown: 0,
    punchCooldown: 0,
    punchAnim: 0,
    muzzle: 0,
    muzzleEnemy: null,
    shake: 0,
    hurtCooldown: 0,
    recentShot: 0,
    recentShotX: 0,
    recentShotY: 0,
    notifications: [],
    trafficTimer: 0,
    stats: { carsStolen: 0, missionsDone: 0, pedsHit: 0 },
    over: null,
  };

  function notify(text) {
    state.notifications.push({ text, t: 4.5 });
    if (state.notifications.length > 4) state.notifications.shift();
  }

  function say(text) {
    state.missions.dialogText = text;
    state.missions.dialogTimer = 5;
  }

  // The callbacks the mission, combat and police modules use to touch the world.
  const api = {
    addMoney(amount) { state.money += amount; },
    addWanted(amount) { addWanted(state.police, amount); },
    setWanted(value) { setWanted(state.police, value); },
    notify,
    say,
    jingle() { sfx.missionDone(); },
    shootSound() { sfx.shoot(); },
    enemyShootSound() { sfx.enemyShoot(); },
    punchSound() { sfx.punch(); },
    hitSound() { sfx.hit(); },
    pickupSound() { sfx.pickup(); },
    crashSound() { sfx.crash(); },
    busted() { state.over = 'busted'; sfx.busted(); },
    wasted() { state.over = 'wasted'; sfx.busted(); },
    spawnPackages(spots) {
      for (const spot of spots) state.pickups.push(makePickup('package', spot.x, spot.y));
    },
    spawnCourier(pos) {
      const car = makeTrafficCar(random, pos.x, pos.y);
      car.top = 380;
      car.color = '#ff8c1a';
      state.courier = car;
      return car.id;
    },
    courierCar(id) {
      return state.courier && state.courier.id === id ? state.courier : null;
    },
    spawnEnemies(positions) {
      state.enemies = positions.map((p) => makeEnemy(p.x, p.y));
    },
    spawnGoldCar(pos) {
      const car = makePlayerCar('sport', '#ffd94a', pos.x, pos.y, Math.PI / 2);
      car.top = 620;
      state.goldCar = car;
      state.parked.push(car);
      return car.id;
    },
    inGoldCar(id) {
      return state.player.inCar && state.player.car && state.player.car.id === id;
    },
    nearestCopDistance() { return nearestCopDistance(state); },
  };

  function spawnTraffic(count) {
    while (state.traffic.length < count) {
      const spot = randomRoadPoint(random, state.player.x, state.player.y, 500);
      state.traffic.push(makeTrafficCar(random, spot.x, spot.y));
    }
  }

  function reset() {
    state.player.x = 1000;
    state.player.y = 1060;
    state.player.angle = -Math.PI / 2;
    state.player.health = PLAYER.healthMax;
    state.player.ammo = PLAYER.ammoStart;
    state.player.inCar = false;
    state.player.car = null;
    state.traffic = [];
    state.parked = PARKED_SPOTS.map((s) => makePlayerCar(s.kind, s.color, s.x, s.y, s.kind === 'taxi' ? 0 : Math.PI / 2));
    state.copCars = [];
    state.footCops = [];
    state.courier = null;
    state.goldCar = null;
    state.enemies = [];
    state.bullets = [];
    state.sparks = [];
    state.pickups = PICKUP_SPOTS.map((s) => makePickup(s.kind, s.x, s.y));
    state.money = 0;
    state.clockMinutes = 9 * 60 + 24;
    state.elapsed = 0;
    state.police = createPoliceState();
    state.missions = createMissionState();
    state.pistolCooldown = 0;
    state.punchCooldown = 0;
    state.punchAnim = 0;
    state.muzzle = 0;
    state.shake = 0;
    state.hurtCooldown = 0;
    state.recentShot = 0;
    state.notifications = [];
    state.over = null;
    state.stats = { carsStolen: 0, missionsDone: 0, pedsHit: 0 };
    state.peds = spawnPedestrians(random, PED_COUNT, state.player.x, state.player.y);
    spawnTraffic(TRAFFIC_COUNT);
    startMission(state.missions, api);
  }

  /** The nearest stealable car (traffic, parked, gold) within range, or null. */
  function nearestStealable(px, py, range) {
    let best = null;
    let bestD = range;
    for (const car of [...state.traffic, ...state.parked]) {
      const d = distance(px, py, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  function enterCar() {
    const player = state.player;
    if (player.inCar) {
      // Get out beside the car.
      const car = player.car;
      const side = car.angle + Math.PI / 2;
      player.x = car.x + Math.cos(side) * 34;
      player.y = car.y + Math.sin(side) * 34;
      const circle = { x: player.x, y: player.y, radius: PLAYER.radius };
      resolveCircleBuildings(city, circle);
      player.x = circle.x;
      player.y = circle.y;
      player.inCar = false;
      player.car = null;
      car.speed = 0;
      car.driver = 'parked';
      if (!state.parked.includes(car)) state.parked.push(car);
      return;
    }
    const car = nearestStealable(player.x, player.y, 62);
    if (!car) return;
    state.traffic = state.traffic.filter((c) => c !== car);
    state.parked = state.parked.filter((c) => c !== car);
    // Stealing the courier's car counts as catching him: the chase mission
    // reads the distance to it, which is zero while the player drives it.
    player.inCar = true;
    player.car = car;
    car.driver = 'player';
    car.speed = 0;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    state.stats.carsStolen += 1;
    addWanted(state.police, WANTED.stealCar);
    notify(car.kind === 'taxi' ? 'Taksi dicuri! Polisi mengejarmu.' : 'Mobil dicuri! Polisi mengejarmu.');
    sfx.horn();
  }

  function stepPlayer(dt, controls) {
    const player = state.player;
    if (player.inCar) {
      const speed = stepPlayerCar(player.car, { move: () => controls.move }, dt, city);
      player.x = player.car.x;
      player.y = player.car.y;
      player.angle = player.car.angle;
      sfx.setEngine(Math.abs(speed) / CAR.maxSpeed);
      // Running over pedestrians.
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (distance(player.car.x, player.car.y, ped.x, ped.y) < 26 && Math.abs(speed) > 60) {
          ped.dead = true;
          ped.deadTimer = 0;
          state.stats.pedsHit += 1;
          addWanted(state.police, WANTED.hitPed);
          notify('Kamu menabrak warga! Polisi mengejarmu.');
          sfx.hit();
        }
      }
      // Bumping traffic cars: traffic yields and is shoved aside, the player's
      // car keeps its line (and its speed), so a passing car can never shove
      // the player off the road or wedge them against a building.
      for (const car of state.traffic) {
        const d = distance(player.car.x, player.car.y, car.x, car.y);
        if (d < 34 && d > 0.01) {
          const push = 34 - d;
          const nx = (car.x - player.car.x) / d;
          const ny = (car.y - player.car.y) / d;
          car.x += nx * push;
          car.y += ny * push;
          if (Math.abs(player.car.speed) > 260) {
            player.car.speed *= 0.9;
            state.shake = Math.max(state.shake, 0.3);
            sfx.crash();
          }
        }
      }
      // Ramming the courier completes the chase faster.
      if (state.courier && Math.abs(speed) > 200 && distance(player.car.x, player.car.y, state.courier.x, state.courier.y) < 44) {
        state.missions.chaseTime += dt * 4;
      }
      return;
    }
    sfx.setEngine(0);
    const speed = controls.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const move = controls.move;
    if (move.x !== 0 || move.y !== 0) {
      player.angle = Math.atan2(move.y, move.x);
      player.x += move.x * speed * dt;
      player.y += move.y * speed * dt;
    }
    player.x = clamp(player.x, 30, WORLD.width - 30);
    player.y = clamp(player.y, 30, WORLD.height - 30);
    if (beachAt(player.x, player.y) === 'water') player.y = BEACH.waterTop - 20;
    const circle = { x: player.x, y: player.y, radius: PLAYER.radius };
    resolveCircleBuildings(city, circle);
    player.x = circle.x;
    player.y = circle.y;
    // Aim at the mouse while shooting.
    if (controls.mouseDown || controls.click) {
      player.angle = Math.atan2(controls.mouseWorld.y - player.y, controls.mouseWorld.x - player.x);
    }
    // Traffic can knock the player down.
    for (const car of state.traffic) {
      const d = distance(player.x, player.y, car.x, car.y);
      if (d < 30) {
        const nx = (player.x - car.x) / (d || 1);
        const ny = (player.y - car.y) / (d || 1);
        player.x += nx * (30 - d);
        player.y += ny * (30 - d);
        if (car.speed > 150 && state.hurtCooldown <= 0) {
          player.health -= 12;
          state.hurtCooldown = 0.8;
          state.shake = Math.max(state.shake, 0.35);
          sfx.hit();
        }
      }
    }
  }

  function stepCourier(dt) {
    const courier = state.courier;
    if (!courier || courier.driver === 'player') return;
    // The courier flees from the player along the roads, faster than traffic.
    const player = state.player;
    const away = Math.atan2(courier.y - player.y, courier.x - player.x);
    const want = Math.round(away / (Math.PI / 2)) * (Math.PI / 2);
    let turn = want - courier.angle;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    courier.angle += clamp(turn, -2.2 * dt, 2.2 * dt);
    courier.speed = Math.min(courier.top, courier.speed + 300 * dt);
    courier.x += Math.cos(courier.angle) * courier.speed * dt;
    courier.y += Math.sin(courier.angle) * courier.speed * dt;
    courier.x = clamp(courier.x, 80, WORLD.width - 80);
    courier.y = clamp(courier.y, 80, BEACH.sandTop - 80);
    const circle = { x: courier.x, y: courier.y, radius: CAR.radius };
    if (resolveCircleBuildings(city, circle)) {
      courier.x = circle.x;
      courier.y = circle.y;
      courier.angle += Math.PI / 2;
    }
  }

  /**
   * One fixed step. `controls` is { move:{x,y}, run, actions, click, mouseDown,
   * mouseWorld:{x,y} }. Returns event flags (busted / wasted / crash).
   */
  function step(dt, controls) {
    let events = 0;
    if (state.over) return events;
    state.elapsed += dt;
    state.clockMinutes += dt * 0.5;
    if (state.clockMinutes >= 24 * 60) state.clockMinutes -= 24 * 60;
    if (state.pistolCooldown > 0) state.pistolCooldown -= dt;
    if (state.punchCooldown > 0) state.punchCooldown -= dt;
    if (state.punchAnim > 0) state.punchAnim -= dt;
    if (state.muzzle > 0) state.muzzle -= dt;
    if (state.muzzleEnemy && (state.muzzleEnemy.t -= dt) <= 0) state.muzzleEnemy = null;
    if (state.hurtCooldown > 0) state.hurtCooldown -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);
    if (state.recentShot > 0) state.recentShot -= dt;
    for (const n of state.notifications) n.t -= dt;
    state.notifications = state.notifications.filter((n) => n.t > 0);
    for (const s of state.sparks) s.t -= dt;
    state.sparks = state.sparks.filter((s) => s.t > 0);

    if (controls.actions & ACTION_ENTER_CAR) enterCar();
    if (controls.actions & ACTION_PUNCH) playerPunch(state, api);
    if ((controls.click || controls.mouseDown) && !state.player.inCar) {
      if (playerShoot(state, controls.mouseWorld.x, controls.mouseWorld.y, api)) {
        state.recentShot = 1.2;
        state.recentShotX = controls.mouseWorld.x;
        state.recentShotY = controls.mouseWorld.y;
      }
    }

    stepPlayer(dt, controls);

    // Traffic, with separation so cars do not stack on each other.
    for (const car of state.traffic) stepTrafficCar(car, dt, random, state.traffic, state.player);
    for (let i = 0; i < state.traffic.length; i += 1) {
      for (let j = i + 1; j < state.traffic.length; j += 1) {
        const a = state.traffic[i];
        const b = state.traffic[j];
        const d = distance(a.x, a.y, b.x, b.y);
        if (d < 38 && d > 0.01) {
          const push = (38 - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
    stepCourier(dt);

    // Pedestrians panic at gunfire and at a speeding car.
    let danger = null;
    if (state.recentShot > 0) danger = { x: state.recentShotX, y: state.recentShotY, radius: 320 };
    else if (state.player.inCar && Math.abs(state.player.car.speed) > 280) {
      danger = { x: state.player.car.x, y: state.player.car.y, radius: 200 };
    } else if (state.police.stars >= 3) {
      danger = { x: state.player.x, y: state.player.y, radius: 260 };
    }
    for (const ped of state.peds) stepPedestrian(ped, dt, random, danger);
    // Dead pedestrians fade away after a while.
    state.peds = state.peds.filter((p) => !p.dead || p.deadTimer < 8);

    // Enemies, bullets, pickups.
    for (const enemy of state.enemies) stepEnemy(enemy, dt, state.player, state, api);
    state.enemies = state.enemies.filter((e) => !e.dead);
    stepBullets(state, dt, city, api);
    stepPickups(state, api);

    // Police and wanted.
    stepPolice(state, dt, random, api);
    sfx.setSiren(state.police.stars > 0);
    if (state.over === 'busted') events |= EVENT_BUSTED;
    if (state.over === 'wasted') events |= EVENT_WASTED;

    // Missions.
    const before = state.missions.index;
    updateMissions(state.missions, dt, api, { x: state.player.x, y: state.player.y }, state.enemies.length);
    if (state.missions.index > before) state.stats.missionsDone += 1;

    // Slow health regen out of combat.
    if (state.police.stars === 0 && state.player.health < PLAYER.healthMax && state.hurtCooldown <= 0) {
      state.player.health = Math.min(PLAYER.healthMax, state.player.health + 1.5 * dt);
    }
    if (state.player.health <= 0 && !state.over) {
      state.over = 'wasted';
      events |= EVENT_WASTED;
      sfx.busted();
    }
    return events;
  }

  function saveGame() {
    try {
      const data = {
        money: state.money,
        missionIndex: state.missions.index,
        health: Math.round(state.player.health),
        ammo: state.player.ammo,
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        clockMinutes: Math.round(state.clockMinutes),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return null;
      reset();
      state.money = data.money || 0;
      state.player.health = data.health || PLAYER.healthMax;
      state.player.ammo = data.ammo || PLAYER.ammoStart;
      state.player.x = data.x || 1000;
      state.player.y = data.y || 1060;
      state.clockMinutes = data.clockMinutes || 9 * 60 + 24;
      // Resume at the saved mission.
      state.missions.index = Math.min(data.missionIndex || 0, 5);
      state.missions.done = false;
      startMission(state.missions, api);
      return data;
    } catch {
      return null;
    }
  }

  reset();
  return { state, reset, step, saveGame, loadGame, notify, say, api };
}
