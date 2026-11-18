// Vehicles: traffic cars that follow the road grid, the player's drivable car
// with simple arcade physics, and police cars that chase. A car is a circle
// for collisions (its radius) and a rotated rectangle for drawing; traffic
// cars only ever point along a road, which keeps their steering trivial and
// their driving believable.

import { BEACH, CAR, LANE, ROADS, TRAFFIC_KINDS, WORLD } from './config.js';
import { angleDelta, clamp, distance, pickWeighted } from './random.js';
import { beachAt, insideBuilding, nearestRoad, onRoad, resolveCircleBuildings } from './city.js';

let nextCarId = 1;

/** Make a traffic car of a random kind, placed on a road. */
export function makeTrafficCar(random, x, y) {
  const kind = pickWeighted(random, TRAFFIC_KINDS);
  const horizontal = random() < 0.5;
  const road = nearestRoad(horizontal ? y : x);
  const dir = random() < 0.5 ? 1 : -1;
  const lane = (random() < 0.5 ? -1 : 1) * 24;
  return {
    id: nextCarId++,
    kind: kind.name,
    color: kind.color,
    w: kind.w,
    h: kind.h,
    top: kind.top * (0.85 + random() * 0.3),
    x: horizontal ? x : road + (dir > 0 ? lane : -lane),
    y: horizontal ? road + (dir > 0 ? -lane : lane) : y,
    angle: horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    speed: kind.top * (0.6 + random() * 0.3),
    driver: 'traffic',
    brakeLight: false,
    honkTimer: 0,
  };
}

/** Make a drivable car (the player's, or a parked one to steal). */
export function makePlayerCar(kindName, color, x, y, angle) {
  const kind = TRAFFIC_KINDS.find((k) => k.name === kindName) || TRAFFIC_KINDS[0];
  return {
    id: nextCarId++,
    kind: kind.name,
    color,
    w: kind.w,
    h: kind.h,
    top: kind.top,
    x, y, angle,
    speed: 0,
    driver: 'player',
    brakeLight: false,
    honkTimer: 0,
  };
}

/** Make a police car. */
export function makeCopCar(x, y) {
  return {
    id: nextCarId++,
    kind: 'cop',
    color: '#1d3fae',
    w: 46,
    h: 22,
    top: 430,
    x, y,
    angle: 0,
    speed: 0,
    driver: 'cop',
    brakeLight: false,
    honkTimer: 0,
  };
}

function nearestIntersection(x, y) {
  // Distance along the car's axis to the next road crossing.
  let best = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(r - x);
    if (d > 4 && d < best) best = d;
    const d2 = Math.abs(r - y);
    if (d2 > 4 && d2 < best) best = d2;
  }
  return best;
}

/** One traffic step: drive forward, turn at intersections, slow for the car ahead. */
export function stepTrafficCar(car, dt, random, cars, player) {
  // Slow down when another car (or the player) is right ahead.
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  let blocked = false;
  for (const other of cars) {
    if (other === car) continue;
    if (distance(aheadX, aheadY, other.x, other.y) < 34) { blocked = true; break; }
  }
  if (!blocked && player && player.inCar) {
    const px = player.car.x;
    const py = player.car.y;
    if (distance(aheadX, aheadY, px, py) < 36) blocked = true;
  }
  const target = blocked ? 0 : car.top;
  car.speed += clamp(target - car.speed, -500 * dt, 260 * dt);
  if (car.speed < 0) car.speed = 0;

  // At an intersection, sometimes turn left or right (never a U-turn).
  const nearCross = nearestIntersection(car.x, car.y) < 14 && car.speed > 40;
  if (nearCross && random() < 0.28) {
    const turn = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    car.angle += turn;
    // Snap onto the new road's lane (not its centre line), so the car never
    // ends up head-on with oncoming traffic and deadlocks the street.
    if (Math.abs(Math.cos(car.angle)) < 0.5) {
      car.x = nearestRoad(car.x) + (Math.sin(car.angle) > 0 ? LANE : -LANE);
    } else {
      car.y = nearestRoad(car.y) + (Math.cos(car.angle) > 0 ? -LANE : LANE);
    }
  }

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Wrap around the city edge so traffic never runs out.
  if (car.x < 60) { car.x = WORLD.width - 70; }
  if (car.x > WORLD.width - 60) { car.x = 70; }
  if (car.y < 60) { car.y = BEACH.sandTop - 80; }
  if (car.y > BEACH.sandTop - 60) { car.y = 70; }
  // Traffic never drives onto the beach: push it back onto the roads.
  if (beachAt(car.x, car.y) !== 'land') {
    car.y = BEACH.sandTop - 100;
    car.angle = -Math.PI / 2;
  }
  car.brakeLight = blocked;
}

/** One player-car step: arcade throttle, steering and building collision. */
export function stepPlayerCar(car, input, dt, city) {
  const move = input.move();
  const forward = move.y < 0;
  const back = move.y > 0;
  const steer = move.x;
  if (forward) car.speed += CAR.accel * dt;
  else if (back) {
    // Brake toward a stop, never past it: reversing only starts from nearly
    // stopped, so a brake can never flip the car into reverse by itself.
    if (car.speed > 5) car.speed = Math.max(0, car.speed - CAR.brake * dt);
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    // Coast down.
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 220 * dt);
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  // Steering only bites while moving, and bites less at full speed; a nearly
  // stopped car can turn on the spot, so a U-turn at an intersection works.
  const steerFactor = Math.abs(car.speed) < 40 ? 1 : clamp(Math.abs(car.speed) / 160, 0.35, 1);
  const steerPower = CAR.steer * steerFactor * (car.speed < 0 ? -1 : 1);
  car.angle += steer * steerPower * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Stay inside the world and off the water.
  car.x = clamp(car.x, 40, WORLD.width - 40);
  car.y = clamp(car.y, 40, WORLD.height - 40);
  if (beachAt(car.x, car.y) === 'water') {
    car.y = BEACH.waterTop - 30;
    car.speed *= -0.3;
  }
  const circle = { x: car.x, y: car.y, radius: CAR.radius };
  const oldX = car.x;
  const oldY = car.y;
  if (resolveCircleBuildings(city, circle)) {
    // A hard hit scrubs speed; the push direction also deflects the heading
    // a little each step, so the car slides along a building face instead of
    // sticking to it — but only a little, or the deflection fights steering.
    const pushX = circle.x - oldX;
    const pushY = circle.y - oldY;
    if (Math.hypot(pushX, pushY) > 0.01) {
      car.angle += clamp(angleDelta(car.angle, Math.atan2(pushY, pushX)), -0.06, 0.06);
    }
    car.speed *= Math.abs(car.speed) > 200 ? 0.7 : 0.85;
    car.x = circle.x;
    car.y = circle.y;
  }
  car.brakeLight = back;
  return Math.abs(car.speed);
}

/** The heading a car should take toward (tx, ty) if it stays on the roads:
 * along the current road to the next intersection, then onto the road that
 * closes the bigger gap. Turning mid-block would ram a building, so the axis
 * only changes at an intersection. `heading` is the car's current angle: when
 * both gaps are near-equal at an intersection, the car stays on the axis it
 * already travels instead of flip-flopping between the two.
 */
export function roadHeading(x, y, tx, ty, heading) {
  const dx = tx - x;
  const dy = ty - y;
  const nearX = nearestRoad(x);
  const nearY = nearestRoad(y);
  const onH = Math.abs(y - nearY) < 34;
  const onV = Math.abs(x - nearX) < 34;
  if (onH && onV) {
    const hDist = Math.abs(dx);
    const vDist = Math.abs(dy);
    const hAngle = dx > 0 ? 0 : Math.PI;
    const vAngle = dy > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (Math.max(hDist, vDist) < Math.min(hDist, vDist) * 1.15 && typeof heading === 'number') {
      return Math.abs(angleDelta(heading, hAngle)) <= Math.abs(angleDelta(heading, vAngle)) ? hAngle : vAngle;
    }
    return hDist >= vDist ? hAngle : vAngle;
  }
  if (onH) return dx > 0 ? 0 : Math.PI;
  if (onV) return dy > 0 ? Math.PI / 2 : -Math.PI / 2;
  // Off the grid (a corner cut): head back to the nearest intersection first.
  return Math.atan2(nearestRoad(y) - y, nearestRoad(x) - x);
}

/** One police-car step: steer toward the target and ram it, steering around buildings. */
export function stepCopCar(car, targetX, targetY, dt, city) {
  const dist0 = distance(car.x, car.y, targetX, targetY);
  // Follow the roads like any driver; only cut straight at the target when
  // close AND the way is open (no building on the line), so a chase never
  // wedges itself against a building it could have driven around.
  let direct = false;
  if (dist0 < 220) {
    direct = true;
    for (let f = 0.25; f < 1; f += 0.25) {
      if (insideBuilding(city, car.x + (targetX - car.x) * f, car.y + (targetY - car.y) * f, 12)) {
        direct = false;
        break;
      }
    }
  }
  const want = direct ? Math.atan2(targetY - car.y, targetX - car.x) : roadHeading(car.x, car.y, targetX, targetY, car.angle);
  // If a building is right ahead, slide around it instead of ramming it: turn
  // aside (flipping side when stuck) until the way ahead is clear again.
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  if (car.speed < 80) car.stuckTime = (car.stuckTime || 0) + dt;
  else car.stuckTime = 0;
  if ((car.stuckTime || 0) > 1.2) {
    // Wedged against a building: reverse out briefly, turning aside.
    car.reverseTimer = 0.6;
    car.avoidDir = -(car.avoidDir || 1);
    car.stuckTime = 0;
  }
  if ((car.reverseTimer || 0) > 0) {
    car.reverseTimer -= dt;
    car.angle += 2.2 * dt * (car.avoidDir || 1);
    car.speed = Math.max(-170, car.speed - 500 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, WORLD.height - 40);
    const circle = { x: car.x, y: car.y, radius: CAR.radius };
    if (resolveCircleBuildings(city, circle)) {
      car.speed *= 0.6;
      car.x = circle.x;
      car.y = circle.y;
    }
    return distance(car.x, car.y, targetX, targetY);
  }
  if (insideBuilding(city, aheadX, aheadY, 12)) {
    car.angle += 2.2 * dt * (car.avoidDir || 1);
    car.speed = Math.min(car.speed, 220);
  } else {
    const turn = clamp(angleDelta(car.angle, want), -3.5 * dt, 3.5 * dt);
    car.angle += turn;
  }
  const dist = distance(car.x, car.y, targetX, targetY);
  const targetSpeed = dist > 120 ? car.top : car.top * 0.45;
  car.speed += clamp(targetSpeed - car.speed, -600 * dt, CAR.accel * 1.2 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 40, WORLD.width - 40);
  car.y = clamp(car.y, 40, WORLD.height - 40);
  if (beachAt(car.x, car.y) === 'water') {
    car.y = BEACH.waterTop - 30;
    car.speed *= 0.4;
  }
  const circle = { x: car.x, y: car.y, radius: CAR.radius };
  if (resolveCircleBuildings(city, circle)) {
    car.speed *= 0.5;
    car.x = circle.x;
    car.y = circle.y;
  }
  // Police cars cut across grass and plazas; they only avoid buildings.
  return dist;
}

/** Is the point (x, y) close enough to a road to be a sensible spawn? */
export function nearRoad(x, y) {
  return onRoad(x, y);
}
