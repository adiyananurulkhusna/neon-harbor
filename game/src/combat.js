// Combat: the player's pistol and fists, gang enemies who shoot back, and
// pickups (ammo, health, cash). Bullets are fast short-lived points with a
// tracer the renderer draws; enemies are simple state machines that chase the
// player when close and fire with poor aim.

import { PLAYER } from './config.js';
import { distance } from './random.js';

export function makeEnemy(x, y) {
  return {
    x, y,
    angle: 0,
    health: 100,
    speed: 150,
    shootTimer: 1 + Math.random() * 1.5,
    state: 'guard',
    dead: false,
    flash: 0,
  };
}

export function makeBullet(x, y, angle, fromPlayer) {
  return {
    x, y,
    vx: Math.cos(angle) * 900,
    vy: Math.sin(angle) * 900,
    life: 0.6,
    fromPlayer,
    dead: false,
  };
}

export function makePickup(kind, x, y) {
  return { kind, x, y, bob: Math.random() * Math.PI * 2, taken: false };
}

/** Fire the player's pistol toward (tx, ty). Returns true if a shot went out. */
export function playerShoot(state, tx, ty, api) {
  const player = state.player;
  if (state.pistolCooldown > 0 || player.ammo <= 0 || player.inCar) return false;
  const angle = Math.atan2(ty - player.y, tx - player.x);
  player.ammo -= 1;
  state.pistolCooldown = PLAYER.pistolCooldown;
  state.bullets.push(makeBullet(player.x + Math.cos(angle) * 20, player.y + Math.sin(angle) * 20, angle, true));
  state.muzzle = 0.07;
  state.player.angle = angle;
  api.shootSound();
  api.addWanted(0.4);
  return true;
}

/** Swing the player's fist at whatever is in front of them. */
export function playerPunch(state, api) {
  const player = state.player;
  if (state.punchCooldown > 0 || player.inCar) return;
  state.punchCooldown = 0.45;
  state.punchAnim = 0.18;
  const px = player.x;
  const py = player.y;
  const pa = player.angle;
  api.punchSound();
  let hitSomething = false;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const d = distance(px, py, enemy.x, enemy.y);
    if (d > PLAYER.punchRange + 14) continue;
    const ang = Math.atan2(enemy.y - py, enemy.x - px);
    let diff = Math.abs(ang - pa) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < PLAYER.punchArc) {
      enemy.health -= PLAYER.punchDamage;
      enemy.flash = 0.12;
      hitSomething = true;
      if (enemy.health <= 0) killEnemy(state, enemy, api);
    }
  }
  // A punch can also shove a nearby pedestrian (a crime, of course).
  for (const ped of state.peds) {
    if (ped.dead) continue;
    const d = distance(px, py, ped.x, ped.y);
    if (d < PLAYER.punchRange) {
      ped.dead = true;
      ped.deadTimer = 0;
      hitSomething = true;
      api.addWanted(1);
      api.notify('Kamu menyerang warga! Polisi mengejarmu.');
    }
  }
  if (hitSomething) api.hitSound();
}

export function killEnemy(state, enemy, api) {
  enemy.dead = true;
  api.addMoney(25);
  api.notify('Geng tumbang! +$25');
  if (Math.random() < 0.5) state.pickups.push(makePickup('ammo', enemy.x, enemy.y));
  else if (Math.random() < 0.4) state.pickups.push(makePickup('health', enemy.x, enemy.y));
}

/** One enemy step: approach the player and shoot when in range. */
export function stepEnemy(enemy, dt, player, state, api) {
  if (enemy.dead) return;
  if (enemy.flash > 0) enemy.flash -= dt;
  const d = distance(enemy.x, enemy.y, player.x, player.y);
  const playerVisible = d < 560 && !player.hidden;
  if (playerVisible) {
    enemy.state = 'fight';
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    if (d > 260) {
      enemy.x += Math.cos(enemy.angle) * enemy.speed * dt;
      enemy.y += Math.sin(enemy.angle) * enemy.speed * dt;
    }
    enemy.shootTimer -= dt;
    if (enemy.shootTimer <= 0 && d < 480) {
      enemy.shootTimer = 1.1 + Math.random() * 0.9;
      const spread = (Math.random() - 0.5) * 0.35;
      state.bullets.push(makeBullet(enemy.x, enemy.y, enemy.angle + spread, false));
      state.muzzleEnemy = { x: enemy.x, y: enemy.y, t: 0.06 };
      api.enemyShootSound();
    }
  } else {
    enemy.state = 'guard';
    enemy.shootTimer = Math.max(enemy.shootTimer, 0.6);
  }
}

/** Move bullets and resolve hits against enemies, the player and buildings. */
export function stepBullets(state, dt, city, api) {
  for (const bullet of state.bullets) {
    if (bullet.dead) continue;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life <= 0) { bullet.dead = true; continue; }
    if (bullet.fromPlayer) {
      for (const enemy of state.enemies) {
        if (enemy.dead) continue;
        if (distance(bullet.x, bullet.y, enemy.x, enemy.y) < 18) {
          enemy.health -= PLAYER.pistolDamage;
          enemy.flash = 0.12;
          bullet.dead = true;
          api.hitSound();
          if (enemy.health <= 0) killEnemy(state, enemy, api);
          break;
        }
      }
      if (bullet.dead) continue;
      // Shooting a pedestrian is a crime too.
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (distance(bullet.x, bullet.y, ped.x, ped.y) < 14) {
          ped.dead = true;
          ped.deadTimer = 0;
          bullet.dead = true;
          api.addWanted(1.5);
          api.notify('Warga tertembak! Polisi mengejarmu.');
          break;
        }
      }
      if (bullet.dead) continue;
      // Hitting a cop car raises the heat.
      for (const cop of state.copCars) {
        if (distance(bullet.x, bullet.y, cop.x, cop.y) < 24) {
          bullet.dead = true;
          api.addWanted(0.6);
          break;
        }
      }
    } else {
      const player = state.player;
      if (!player.inCar && distance(bullet.x, bullet.y, player.x, player.y) < 14) {
        player.health -= 9;
        bullet.dead = true;
        api.hitSound();
      } else if (player.inCar && distance(bullet.x, bullet.y, player.car.x, player.car.y) < 22) {
        bullet.dead = true;
      }
    }
    if (bullet.dead) continue;
    // Bullets stop at buildings.
    if (city.buildings.some((b) => bullet.x > b.x && bullet.x < b.x + b.w && bullet.y > b.y && bullet.y < b.y + b.h)) {
      bullet.dead = true;
      state.sparks.push({ x: bullet.x, y: bullet.y, t: 0.15 });
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
}

/** Pick up whatever the player walks over. */
export function stepPickups(state, api) {
  const player = state.player;
  const px = player.inCar ? player.car.x : player.x;
  const py = player.inCar ? player.car.y : player.y;
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    pickup.bob += 0.1;
    if (distance(px, py, pickup.x, pickup.y) < 30) {
      pickup.taken = true;
      if (pickup.kind === 'ammo') {
        player.ammo = Math.min(PLAYER.ammoMax, player.ammo + 24);
        api.notify('Amunisi +24');
      } else if (pickup.kind === 'health') {
        player.health = Math.min(PLAYER.healthMax, player.health + 40);
        api.notify('Nyawa +40');
      } else if (pickup.kind === 'cash') {
        api.addMoney(50);
        api.notify('Uang +$50');
      } else if (pickup.kind === 'package') {
        const spot = state.missions.packageSpots.find((s) => !s.taken && distance(s.x, s.y, pickup.x, pickup.y) < 5);
        if (spot) spot.taken = true;
        api.notify('Paket diambil!');
      }
      api.pickupSound();
    }
  }
  state.pickups = state.pickups.filter((p) => !p.taken);
}
