// Wanted level and police: crimes raise the heat, patrol cars and foot cops
// spawn and chase the player, and the stars fade when the player stays out of
// trouble and out of sight. Getting caught on foot means BUSTED; losing all
// health means WASTED. Both send Raka to the hospital, lighter in the wallet.

import { COP, PLAYER, WANTED } from './config.js';
import { distance } from './random.js';
import { makeCopCar, stepCopCar } from './vehicles.js';
import { randomRoadPoint } from './city.js';

export function createPoliceState() {
  return {
    wanted: 0,
    stars: 0,
    sinceCrime: 99,
    bustTimer: 0,
    copSpawnTimer: 0,
    footCopTimer: 0,
  };
}

export function addWanted(police, amount) {
  police.wanted = Math.min(5, police.wanted + amount);
  police.stars = Math.ceil(police.wanted - 0.001);
  police.sinceCrime = 0;
}

export function setWanted(police, value) {
  police.wanted = value;
  police.stars = Math.ceil(value - 0.001);
  police.sinceCrime = 0;
}

/** How many police cars and foot cops the current heat calls for. */
export function wantedForce(stars) {
  return {
    cars: stars === 0 ? 0 : stars <= 1 ? 1 : stars <= 2 ? 2 : stars <= 3 ? 3 : stars <= 4 ? 4 : 5,
    foot: stars === 0 ? 0 : stars <= 2 ? 1 : stars <= 3 ? 2 : 3,
  };
}

/** One police step: spawn, chase, bust, and let the heat cool down. */
export function stepPolice(state, dt, random, api) {
  const police = state.police;
  const player = state.player;
  const px = player.inCar ? player.car.x : player.x;
  const py = player.inCar ? player.car.y : player.y;
  police.sinceCrime += dt;
  police.stars = Math.ceil(police.wanted - 0.001);

  // Heat cools off when the player has been quiet and unseen for a while.
  const nearestCop = nearestCopDistance(state);
  if (police.wanted > 0 && police.sinceCrime > WANTED.decayDelay && nearestCop > 420) {
    police.wanted = Math.max(0, police.wanted - WANTED.decayRate * dt);
    police.stars = Math.ceil(police.wanted - 0.001);
  }

  const force = wantedForce(police.stars);
  // Spawn police cars up to the force size, on roads away from the player.
  police.copSpawnTimer -= dt;
  if (state.copCars.length < force.cars && police.copSpawnTimer <= 0) {
    police.copSpawnTimer = 1.2;
    const spot = randomRoadPoint(random, px, py, COP.spawnDistance);
    const car = makeCopCar(spot.x, spot.y);
    car.angle = Math.atan2(py - spot.y, px - spot.x);
    state.copCars.push(car);
  }
  // Spawn foot cops near the player when on foot crime is afoot.
  police.footCopTimer -= dt;
  if (!player.inCar && state.footCops.length < force.foot && police.footCopTimer <= 0) {
    police.footCopTimer = 2.0;
    const spot = randomRoadPoint(random, px, py, 320);
    state.footCops.push({ x: spot.x, y: spot.y, angle: 0, speed: COP.footSpeed });
  }
  // Despawn the force when the heat is gone.
  if (police.stars === 0) {
    state.copCars.length = 0;
    state.footCops.length = 0;
    police.bustTimer = 0;
    return;
  }

  // Cop cars chase and ram.
  for (const cop of state.copCars) {
    const dist = stepCopCar(cop, px, py, dt, state.city);
    if (dist < 46) {
      // A ram hurts the player (or their car) and shakes the camera.
      if (player.inCar) {
        player.car.speed *= 0.6;
        state.shake = Math.max(state.shake, 0.25);
        api.crashSound();
      } else if (state.hurtCooldown <= 0) {
        player.health -= 8;
        state.hurtCooldown = 0.8;
        state.shake = Math.max(state.shake, 0.3);
        api.hitSound();
      }
      // Push the cop car back so it does not sit inside the player.
      const away = Math.atan2(cop.y - py, cop.x - px);
      cop.x += Math.cos(away) * 30;
      cop.y += Math.sin(away) * 30;
    }
  }

  // Foot cops chase on foot; touching one for long enough means BUSTED.
  let touching = false;
  for (const cop of state.footCops) {
    const d = distance(cop.x, cop.y, player.x, player.y);
    if (player.inCar) {
      // On foot cops give up when the player drives away.
      cop.x += Math.cos(cop.angle) * 0;
      continue;
    }
    cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
    if (d > COP.bustRadius) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
    } else {
      touching = true;
    }
  }
  if (touching && !player.inCar) {
    police.bustTimer += dt;
    if (police.bustTimer >= COP.bustTime) api.busted();
  } else {
    police.bustTimer = Math.max(0, police.bustTimer - dt * 2);
  }
  if (player.health <= 0) api.wasted();
}

/** Distance to the nearest cop (car or foot), Infinity when there is none. */
export function nearestCopDistance(state) {
  const player = state.player;
  const px = player.inCar ? player.car.x : player.x;
  const py = player.inCar ? player.car.y : player.y;
  let best = Infinity;
  for (const cop of state.copCars) best = Math.min(best, distance(px, py, cop.x, cop.y));
  for (const cop of state.footCops) best = Math.min(best, distance(px, py, cop.x, cop.y));
  return best;
}

/** The player is hidden from the police while inside a building shadow — unused for now. */
export function playerHidden() {
  return false;
}
