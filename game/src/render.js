// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player (zoomed out a little while driving), the city is
// drawn top-down in flat sun-soaked colours, and the HUD — health, money,
// wanted stars, clock, objective, minimap — is drawn in screen space on top.
// Text that holds a number is rebuilt only when the number changes.

import { BEACH, CAR, FONT, PALETTE, PLAYER, ROADS, ROAD_WIDTH, WORLD } from './config.js';
import { LANDMARKS, beachAt } from './city.js';
import { missionObjectiveText, missionTarget, currentMission, MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MINIMAP = { x: 16, y: 0, size: 190, margin: 16 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const camera = { x: 1000, y: 1060, zoom: 1 };
  const moneyLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('');
  const clockLabel = cachedLabel('');
  const fonts = new Map();

  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}px ${FONT}`;
    if (!fonts.has(key)) fonts.set(key, key);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    MINIMAP.y = canvas.height / ratio - MINIMAP.size - MINIMAP.margin;
  }

  function cssWidth() {
    return canvas.width / (window.devicePixelRatio || 1);
  }

  function cssHeight() {
    return canvas.height / (window.devicePixelRatio || 1);
  }

  /** Turn a screen point (CSS pixels) into world coordinates. */
  function screenToWorld(sx, sy) {
    const ratio = window.devicePixelRatio || 1;
    const w = cssWidth();
    const h = cssHeight();
    return {
      x: camera.x + (sx - w / 2) / camera.zoom,
      y: camera.y + (sy - h / 2) / camera.zoom,
    };
  }

  function drawGround(state) {
    const city = state.city;
    // Grass base with a subtle checker of mowing strips.
    context.fillStyle = PALETTE.ground;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    context.fillStyle = PALETTE.groundAlt;
    for (let gx = 0; gx < WORLD.width; gx += 400) {
      for (let gy = 0; gy < BEACH.sandTop; gy += 400) {
        if (((gx + gy) / 400) % 2 === 0) context.fillRect(gx, gy, 200, 200);
      }
    }
    // Beach sand and water.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, BEACH.sandTop, WORLD.width, BEACH.waterTop - BEACH.sandTop);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, BEACH.waterTop, WORLD.width, WORLD.height - BEACH.waterTop);
    context.fillStyle = PALETTE.waterDeep;
    for (let wx = 0; wx < WORLD.width; wx += 160) {
      context.fillRect(wx + 40, BEACH.waterTop + 30, 90, 6);
      context.fillRect(wx + 100, BEACH.waterTop + 70, 60, 6);
    }
    // Parks.
    for (const park of city.parks) {
      context.fillStyle = '#7cb35e';
      context.fillRect(park.x, park.y, park.w, park.h);
      context.fillStyle = '#8fc46e';
      context.fillRect(park.x + park.w / 2 - 8, park.y, 16, park.h);
      context.fillRect(park.x, park.y + park.h / 2 - 8, park.w, 16);
    }
    // Sidewalks: pale strips along every road.
    context.fillStyle = PALETTE.sidewalk;
    for (const r of ROADS) {
      context.fillRect(0, r - ROAD_WIDTH / 2 - 14, WORLD.width, ROAD_WIDTH + 28);
      context.fillRect(r - ROAD_WIDTH / 2 - 14, 0, ROAD_WIDTH + 28, BEACH.sandTop);
    }
    // Asphalt.
    context.fillStyle = PALETTE.road;
    for (const r of ROADS) {
      context.fillRect(0, r - ROAD_WIDTH / 2, WORLD.width, ROAD_WIDTH);
      context.fillRect(r - ROAD_WIDTH / 2, 0, ROAD_WIDTH, BEACH.sandTop);
    }
    // Lane dashes.
    context.fillStyle = PALETTE.laneDash;
    for (const r of ROADS) {
      for (let d = 40; d < WORLD.width; d += 90) context.fillRect(d, r - 2, 44, 4);
      for (let d = 40; d < BEACH.sandTop; d += 90) context.fillRect(r - 2, d, 4, 44);
    }
    // Crosswalks at every intersection.
    context.fillStyle = '#e8e8e8';
    for (const rx of ROADS) {
      for (const ry of ROADS) {
        for (let i = -3; i <= 3; i += 1) {
          context.fillRect(rx - ROAD_WIDTH / 2 + 8, ry + i * 12 - 3, 14, 6);
          context.fillRect(rx + ROAD_WIDTH / 2 - 22, ry + i * 12 - 3, 14, 6);
          context.fillRect(rx + i * 12 - 3, ry - ROAD_WIDTH / 2 + 8, 6, 14);
          context.fillRect(rx + i * 12 - 3, ry + ROAD_WIDTH / 2 - 22, 6, 14);
        }
      }
    }
  }

  function drawBuildings(state) {
    const city = state.city;
    // Harbor pier and moored boats.
    context.fillStyle = '#b98a5a';
    context.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
    context.fillStyle = '#8a6a44';
    for (let py = city.pier.y + 20; py < city.pier.y + city.pier.h; py += 34) {
      context.fillRect(city.pier.x, py, city.pier.w, 4);
    }
    for (const boat of city.boats) {
      context.save();
      context.translate(boat.x, boat.y);
      context.rotate(boat.angle);
      context.fillStyle = boat.color;
      context.beginPath();
      context.ellipse(0, 0, 34, 13, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2b2b33';
      context.fillRect(-8, -5, 16, 10);
      context.restore();
    }
    // Buildings: shadow, roof, windows, and a height lip.
    for (const b of city.buildings) {
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255, 255, 255, 0.22)';
      context.fillRect(b.x, b.y, b.w, 6);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(20, 30, 50, 0.55)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          context.fillRect(b.x + 9 + cx * 26, b.y + 9 + cy * 26, 12, 12);
        }
      }
      if (b.height > 1) {
        context.fillStyle = 'rgba(255, 255, 255, 0.35)';
        context.font = font(15, true);
        context.textAlign = 'center';
        context.fillText(`${b.height}F`, b.x + b.w / 2, b.y + b.h / 2 + 5);
      }
    }
    // Trees.
    for (const tree of city.trees) {
      context.fillStyle = 'rgba(0, 0, 0, 0.15)';
      context.beginPath();
      context.arc(tree.x + 3, tree.y + 4, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3f8f4f';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#57a864';
      context.beginPath();
      context.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.25, tree.r * 0.55, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCarShape(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
    context.beginPath();
    context.ellipse(3, 4, car.w / 2 + 2, car.h / 2 + 4, 0, 0, Math.PI * 2);
    context.fill();
    // Body.
    context.fillStyle = car.color;
    context.beginPath();
    context.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 7);
    context.fill();
    context.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    context.lineWidth = 1.5;
    context.stroke();
    // Windshield and rear window.
    context.fillStyle = 'rgba(20, 40, 60, 0.75)';
    context.fillRect(car.w * 0.12, -car.h / 2 + 3, car.w * 0.18, car.h - 6);
    context.fillRect(-car.w * 0.32, -car.h / 2 + 3, car.w * 0.14, car.h - 6);
    // Wheels.
    context.fillStyle = '#14161a';
    context.fillRect(-car.w / 2 + 4, -car.h / 2 - 3, 10, 5);
    context.fillRect(-car.w / 2 + 4, car.h / 2 - 2, 10, 5);
    context.fillRect(car.w / 2 - 14, -car.h / 2 - 3, 10, 5);
    context.fillRect(car.w / 2 - 14, car.h / 2 - 2, 10, 5);
    // Headlights.
    context.fillStyle = '#fff8c9';
    context.fillRect(car.w / 2 - 2, -car.h / 2 + 4, 3, 5);
    context.fillRect(car.w / 2 - 2, car.h / 2 - 9, 3, 5);
    if (car.brakeLight) {
      context.fillStyle = '#ff2d2d';
      context.fillRect(-car.w / 2 - 1, -car.h / 2 + 4, 3, 5);
      context.fillRect(-car.w / 2 - 1, car.h / 2 - 9, 3, 5);
    }
    if (car.kind === 'taxi') {
      context.fillStyle = '#14161a';
      context.fillRect(-6, -5, 12, 10);
      context.fillStyle = '#ffd94a';
      context.font = font(7, true);
      context.textAlign = 'center';
      context.fillText('TAXI', 0, 3);
    }
    if (car.kind === 'cop') {
      context.fillStyle = '#f4f6fb';
      context.fillRect(-car.w / 2 + 6, -car.h / 2 + 2, car.w - 12, 5);
      context.fillStyle = '#ff2d2d';
      context.fillRect(-4, -car.h / 2 - 2, 4, 4);
      context.fillStyle = '#2d7bff';
      context.fillRect(0, -car.h / 2 - 2, 4, 4);
    }
    if (isPlayer) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, car.w / 2 + 7, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, shirt, skin, walkPhase, dead, flash) {
    if (dead) {
      context.save();
      context.translate(x, y);
      context.rotate(angle + Math.PI / 2);
      context.fillStyle = shirt;
      context.beginPath();
      context.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = skin;
      context.beginPath();
      context.arc(13, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    const bob = Math.sin(walkPhase) * 2;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    context.beginPath();
    context.ellipse(2, 3, 12, 9, 0, 0, Math.PI * 2);
    context.fill();
    // Legs stepping.
    context.fillStyle = '#2b2b33';
    context.fillRect(-6, -7 + bob, 5, 6);
    context.fillRect(-6, 1 - bob, 5, 6);
    // Body.
    context.fillStyle = flash > 0 ? '#ffffff' : shirt;
    context.beginPath();
    context.roundRect(-8, -8, 18, 16, 6);
    context.fill();
    // Head.
    context.fillStyle = skin;
    context.beginPath();
    context.arc(13, 0, 7, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawMarker(state, time) {
    const target = missionTarget(state.missions);
    if (!target) return;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    const x = target.x;
    const y = target.y;
    // Beacon column so the target is visible from far away.
    const grad = context.createLinearGradient(x, y - 260, x, y);
    grad.addColorStop(0, 'rgba(255, 217, 74, 0)');
    grad.addColorStop(1, 'rgba(255, 217, 74, 0.35)');
    context.fillStyle = grad;
    context.fillRect(x - 14, y - 260, 28, 260);
    // Pulsing diamond on the ground.
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = '#ffd94a';
    context.strokeStyle = '#7a5c00';
    context.lineWidth = 2;
    const s = 16 * pulse;
    context.fillRect(-s / 2, -s / 2, s, s);
    context.strokeRect(-s / 2, -s / 2, s, s);
    context.restore();
    context.font = font(14, true);
    context.textAlign = 'center';
    context.fillStyle = '#ffd94a';
    context.fillText(target.label, x, y - 34);
  }

  function drawWorld(state, time) {
    drawGround(state);
    drawBuildings(state);
    // Pickups.
    for (const pickup of state.pickups) {
      const bob = Math.sin(pickup.bob) * 3;
      context.save();
      context.translate(pickup.x, pickup.y + bob);
      if (pickup.kind === 'ammo') {
        context.fillStyle = '#2b2b33';
        context.fillRect(-9, -6, 18, 12);
        context.fillStyle = '#ffd94a';
        context.font = font(10, true);
        context.textAlign = 'center';
        context.fillText('AMMO', 0, 4);
      } else if (pickup.kind === 'health') {
        context.fillStyle = '#ffffff';
        context.fillRect(-10, -10, 20, 20);
        context.fillStyle = '#ff4d5e';
        context.fillRect(-3, -7, 6, 14);
        context.fillRect(-7, -3, 14, 6);
      } else if (pickup.kind === 'cash') {
        context.fillStyle = '#54e07a';
        context.beginPath();
        context.arc(0, 0, 10, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#0c5c26';
        context.font = font(12, true);
        context.textAlign = 'center';
        context.fillText('$', 0, 4);
      } else {
        // Package: a glowing parcel.
        context.fillStyle = '#ffd94a';
        context.fillRect(-9, -9, 18, 18);
        context.fillStyle = '#7a5c00';
        context.fillRect(-9, -2, 18, 4);
        context.fillRect(-2, -9, 4, 18);
      }
      context.restore();
    }
    // Parked and traffic cars, then the courier and the gold car.
    for (const car of state.parked) drawCarShape(car, false);
    for (const car of state.traffic) drawCarShape(car, false);
    if (state.courier) {
      drawCarShape(state.courier, false);
      context.font = font(13, true);
      context.textAlign = 'center';
      context.fillStyle = '#ff8c1a';
      context.fillText('KURIR LIAR', state.courier.x, state.courier.y - 26);
    }
    if (state.goldCar && !state.player.inCar) drawCarShape(state.goldCar, false);
    // Police cars with a flashing light halo.
    for (const car of state.copCars) {
      drawCarShape(car, false);
      const on = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = on ? 'rgba(255, 45, 45, 0.35)' : 'rgba(45, 123, 255, 0.35)';
      context.beginPath();
      context.arc(car.x, car.y, 34, 0, Math.PI * 2);
      context.fill();
    }
    // Foot cops.
    for (const cop of state.footCops) {
      drawPerson(cop.x, cop.y, cop.angle, '#1d3fae', '#f2c89b', time * 8, false, 0);
      context.fillStyle = '#1d3fae';
      context.beginPath();
      context.arc(cop.x, cop.y, 15, 0, Math.PI * 2);
      context.stroke();
    }
    // Pedestrians.
    for (const ped of state.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, ped.dead, 0);
    }
    // Enemies with a red ring and health bar.
    for (const enemy of state.enemies) {
      drawPerson(enemy.x, enemy.y, enemy.angle, '#3a2b2b', '#d9a06b', time * 6, false, enemy.flash);
      context.strokeStyle = '#ff4d5e';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(enemy.x, enemy.y, 19, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#222';
      context.fillRect(enemy.x - 16, enemy.y - 30, 32, 5);
      context.fillStyle = '#ff4d5e';
      context.fillRect(enemy.x - 16, enemy.y - 30, 32 * Math.max(0, enemy.health / 100), 5);
    }
    // Bullets as tracers.
    context.strokeStyle = '#ffe27a';
    context.lineWidth = 3;
    for (const bullet of state.bullets) {
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
    // Sparks.
    for (const spark of state.sparks) {
      context.fillStyle = '#ffe27a';
      context.beginPath();
      context.arc(spark.x, spark.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Muzzle flash.
    if (state.muzzle > 0) {
      const p = state.player;
      const mx = p.x + Math.cos(p.angle) * 24;
      const my = p.y + Math.sin(p.angle) * 24;
      context.fillStyle = '#ffe27a';
      context.beginPath();
      context.arc(mx, my, 9, 0, Math.PI * 2);
      context.fill();
    }
    if (state.muzzleEnemy) {
      context.fillStyle = '#ffb27a';
      context.beginPath();
      context.arc(state.muzzleEnemy.x, state.muzzleEnemy.y, 8, 0, Math.PI * 2);
      context.fill();
    }
    // The player: on foot a bright-jacketed figure, in a car the car itself.
    const player = state.player;
    if (player.inCar && player.car) {
      drawCarShape(player.car, true);
    } else {
      // Punch swing arc.
      if (state.punchAnim > 0) {
        context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(player.x, player.y, 34, player.angle - 0.9, player.angle + 0.9);
        context.stroke();
      }
      drawPerson(player.x, player.y, player.angle, '#ff5fa2', '#f2c89b', time * 9, false, 0);
      // White ring so the player is always findable.
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, 19, 0, Math.PI * 2);
      context.stroke();
    }
    drawMarker(state, time);
  }

  function drawMinimap(state) {
    const w = cssWidth();
    const scale = MINIMAP.size / WORLD.width;
    const x0 = MINIMAP.margin;
    const y0 = cssHeight() - MINIMAP.size - MINIMAP.margin;
    context.save();
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(x0 - 6, y0 - 6, MINIMAP.size + 12, MINIMAP.size + 12, 10);
    context.fill();
    context.stroke();
    // Water and sand.
    context.fillStyle = PALETTE.water;
    context.fillRect(x0, y0 + BEACH.waterTop * scale, MINIMAP.size, MINIMAP.size - BEACH.waterTop * scale);
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, y0 + BEACH.sandTop * scale, MINIMAP.size, (BEACH.waterTop - BEACH.sandTop) * scale);
    // Roads.
    context.fillStyle = '#6a6f7a';
    for (const r of ROADS) {
      context.fillRect(x0, y0 + (r - ROAD_WIDTH / 2) * scale, MINIMAP.size, ROAD_WIDTH * scale);
      context.fillRect(x0 + (r - ROAD_WIDTH / 2) * scale, y0, ROAD_WIDTH * scale, MINIMAP.size);
    }
    // Buildings.
    context.fillStyle = 'rgba(20, 24, 36, 0.7)';
    for (const b of state.city.buildings) {
      context.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
    }
    const dot = (x, y, color, r) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x0 + x * scale, y0 + y * scale, r, 0, Math.PI * 2);
      context.fill();
    };
    for (const car of state.traffic) dot(car.x, car.y, '#c8ccd6', 1.6);
    for (const car of state.copCars) dot(car.x, car.y, '#4f9dff', 3);
    for (const cop of state.footCops) dot(cop.x, cop.y, '#4f9dff', 2.5);
    for (const enemy of state.enemies) dot(enemy.x, enemy.y, '#ff4d5e', 3);
    const target = missionTarget(state.missions);
    if (target) {
      const pulse = 3 + Math.sin(Date.now() / 240) * 1.2;
      context.strokeStyle = '#ffd94a';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x0 + target.x * scale, y0 + target.y * scale, pulse + 3, 0, Math.PI * 2);
      context.stroke();
      dot(target.x, target.y, '#ffd94a', 3.5);
    }
    // Player last, on top.
    const player = state.player;
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#14161a';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x0 + player.x * scale, y0 + player.y * scale, 4.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.font = font(13, true);
    context.textAlign = 'left';
    context.fillStyle = PALETTE.text;
    context.fillText('NEON HARBOR', x0, y0 - 12);
    context.restore();
  }

  function drawHud(state, muted) {
    const w = cssWidth();
    const player = state.player;
    // Top-left: health bar and money.
    context.fillStyle = PALETTE.panel;
    context.beginPath();
    context.roundRect(16, 14, 230, 84, 10);
    context.fill();
    context.font = font(15, true);
    context.textAlign = 'left';
    context.fillStyle = PALETTE.muted;
    context.fillText('RAKA', 28, 36);
    context.fillStyle = '#ff4d5e';
    context.beginPath();
    context.roundRect(28, 44, 180, 12, 6);
    context.fill();
    context.fillStyle = '#54e07a';
    context.beginPath();
    context.roundRect(28, 44, 180 * Math.max(0, player.health / PLAYER.healthMax), 12, 6);
    context.fill();
    context.font = font(20, true);
    context.fillStyle = PALETTE.gold;
    context.fillText(moneyLabel(state.money), 28, 84);
    context.font = font(15, false);
    context.fillStyle = PALETTE.text;
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
      context.fillText(`${kmh} km/h`, 128, 84);
    } else {
      context.fillText(`Ammo ${player.ammo}`, 128, 84);
    }
    // Top-right: wanted stars and clock.
    const stars = state.police.stars;
    context.fillStyle = PALETTE.panel;
    context.beginPath();
    context.roundRect(w - 236, 14, 220, 84, 10);
    context.fill();
    context.font = font(26, false);
    context.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      context.fillStyle = i < stars ? '#ffd94a' : 'rgba(255, 255, 255, 0.22)';
      context.fillText('★', w - 208 + i * 34, 48);
    }
    const hours = Math.floor(state.clockMinutes / 60);
    const minutes = Math.floor(state.clockMinutes % 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    context.font = font(18, true);
    context.fillStyle = PALETTE.text;
    context.fillText(clockLabel(clock), w - 126, 74);
    context.font = font(13, false);
    context.fillStyle = muted ? PALETTE.gold : PALETTE.muted;
    context.fillText(muted ? 'Suara: mati (M)' : 'Neon Harbor  •  M: suara', w - 126, 92);
    // Top-centre: mission objective.
    const mission = currentMission(state.missions);
    const objective = missionObjectiveText(state.missions);
    context.font = font(16, true);
    const objWidth = context.measureText(objective).width + 48;
    context.fillStyle = PALETTE.panel;
    context.beginPath();
    context.roundRect(w / 2 - objWidth / 2, 14, objWidth, 46, 10);
    context.fill();
    context.fillStyle = PALETTE.gold;
    context.textAlign = 'center';
    context.fillText(mission ? `MISI ${state.missions.index + 1}/6 — ${mission.title}` : 'NEON HARBOR', w / 2, 34);
    context.font = font(15, false);
    context.fillStyle = PALETTE.text;
    context.fillText(objective, w / 2, 54);
    // Dialog subtitle at the bottom centre.
    if (state.missions.dialogTimer > 0 && state.missions.dialogText) {
      context.font = font(18, false);
      const dw = context.measureText(state.missions.dialogText).width + 40;
      context.fillStyle = 'rgba(0, 0, 0, 0.72)';
      context.beginPath();
      context.roundRect(w / 2 - dw / 2, cssHeight() - 116, dw, 36, 8);
      context.fill();
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.fillText(state.missions.dialogText, w / 2, cssHeight() - 92);
    }
    // Notifications under the objective.
    context.font = font(15, false);
    context.textAlign = 'center';
    let ny = 76;
    for (const n of state.notifications) {
      context.fillStyle = n.t < 1 ? `rgba(244, 246, 251, ${Math.max(0, n.t)})` : PALETTE.text;
      context.fillText(n.text, w / 2, ny);
      ny += 22;
    }
    // Hints at the bottom-right.
    context.font = font(13, false);
    context.textAlign = 'right';
    context.fillStyle = PALETTE.muted;
    context.fillText('WASD jalan / nyetir  •  Klik: tembak  •  P: jeda  •  E: mobil', w - 16, cssHeight() - 16);
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = cssWidth();
    const h = cssHeight();
    const width = 640;
    const height = 150 + lines.length * 34 + 70;
    const x = (w - width) / 2;
    const y = (h - height) / 2;
    context.fillStyle = 'rgba(8, 10, 18, 0.55)';
    context.fillRect(0, 0, w, h);
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(x, y, width, height, 14);
    context.fill();
    context.stroke();
    context.textAlign = 'center';
    context.font = font(42, true);
    context.fillStyle = accent || PALETTE.text;
    context.fillText(title, w / 2, y + 72);
    context.font = font(18, false);
    for (let i = 0; i < lines.length; i += 1) {
      context.fillStyle = PALETTE.muted;
      context.fillText(lines[i], w / 2, y + 118 + i * 34);
    }
    context.font = font(20, true);
    context.fillStyle = PALETTE.gold;
    context.fillText(prompt, w / 2, y + height - 30);
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel. */
  function draw(state, screen, best, muted, time) {
    const ratio = window.devicePixelRatio || 1;
    const w = cssWidth();
    const h = cssHeight();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#0b0e16';
    context.fillRect(0, 0, w, h);
    // Camera follows the player smoothly; driving zooms out a little.
    const player = state.player;
    const wantZoom = player.inCar ? 0.85 : 1;
    camera.zoom += (wantZoom - camera.zoom) * 0.04;
    camera.x += (player.x - camera.x) * 0.12;
    camera.y += (player.y - camera.y) * 0.12;
    let shakeX = 0;
    let shakeY = 0;
    if (state.shake > 0) {
      shakeX = (Math.random() - 0.5) * state.shake * 18;
      shakeY = (Math.random() - 0.5) * state.shake * 18;
    }
    const viewW = w / camera.zoom;
    const viewH = h / camera.zoom;
    camera.x = Math.max(viewW / 2 - 100, Math.min(WORLD.width - viewW / 2 + 100, camera.x));
    camera.y = Math.max(viewH / 2 - 100, Math.min(WORLD.height - viewH / 2 + 100, camera.y));
    context.save();
    context.translate(w / 2 + shakeX, h / 2 + shakeY);
    context.scale(camera.zoom, camera.zoom);
    context.translate(-camera.x, -camera.y);
    drawWorld(state, time);
    context.restore();

    if (screen === SCREEN_TITLE) {
      // Title banner over the live city.
      context.fillStyle = 'rgba(8, 10, 18, 0.45)';
      context.fillRect(0, 0, w, h);
      context.textAlign = 'center';
      context.font = font(76, true);
      context.fillStyle = '#ff5fa2';
      context.fillText('NEON', w / 2, h / 2 - 96);
      context.fillStyle = '#37e0d8';
      context.fillText('HARBOR', w / 2, h / 2 - 22);
      context.font = font(20, false);
      context.fillStyle = PALETTE.text;
      context.fillText('Kota terbuka di tepi laut. Curi mobil, jalani misi, hindari polisi.', w / 2, h / 2 + 22);
      context.font = font(17, false);
      context.fillStyle = PALETTE.muted;
      context.fillText('WASD bergerak / menyetir  •  E naik & turun mobil  •  Klik menembak  •  F memukul  •  P jeda', w / 2, h / 2 + 56);
      context.fillText('6 misi cerita Raka & Mara  •  Wanted 0–5 bintang  •  Simpan otomatis di browser ini', w / 2, h / 2 + 84);
      context.font = font(22, true);
      context.fillStyle = PALETTE.gold;
      context.fillText(best && best.hasSave ? 'Tekan Spasi: Lanjutkan  •  N: Permainan baru' : 'Tekan Spasi atau klik untuk bermain', w / 2, h / 2 + 132);
      return;
    }
    drawHud(state, muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Jeda', ['Permainan tersimpan di browser ini.', 'Lanjutkan kapan saja dari layar judul.'], 'P: lanjut  •  S: simpan  •  Q: kembali ke judul', PALETTE.cyan);
    } else if (screen === SCREEN_OVER) {
      drawPanel('Permainan Selesai', [`Uang terkumpul: $${state.money}`, `Misi selesai: ${state.stats.missionsDone} dari 6`], 'Spasi: main lagi', PALETTE.text);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('TERTANGKAP!', ['Polisi menangkap Raka di jalan.', `Uang jaminan: -$200  •  Sisa uang: $${state.money}`], 'Spasi: keluar dari RS Harapan', PALETTE.blue);
    } else if (screen === SCREEN_WASTED) {
      drawPanel('RAKA TUMBANG', ['Raka dibawa ke RS Harapan.', `Biaya rumah sakit: -$200  •  Sisa uang: $${state.money}`], 'Spasi: keluar dari RS Harapan', PALETTE.red);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    screenToWorld,
    cssWidth,
    cssHeight,
    /** Put the camera straight onto the player (screenshot staging). */
    snapCamera(state) {
      camera.x = state.player.x;
      camera.y = state.player.y;
    },
  };
}
