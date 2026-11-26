// Sky Courier — the flight model.
// A light prop plane: throttle sets thrust, pitch sets climb, bank turns
// the heading, and below stall speed the wing stops flying. Flaps and the
// airbrake trade speed for lift and drag; the gear only matters on the
// ground. Wind pushes the plane sideways; gusts come in the storm.
import { clamp, wrapAngle } from './random.js';
import { PLANE } from './config.js';

export function createPlane(start, fuel) {
  return {
    x: start.x,
    z: start.z,
    alt: start.alt,
    heading: start.heading,
    pitch: 0,
    roll: 0,
    speed: start.speed,
    throttle: 0.62,
    flaps: false,
    gearDown: true,
    airbrake: false,
    fuel,
    damage: 0,
    onGround: false,
    verticalSpeed: 0,
    windX: 0,
    windZ: 0,
    // Previous position, for ring crossing tests.
    prevX: start.x,
    prevZ: start.z,
    prevAlt: start.alt,
  };
}

export function updatePlane(p, input, wind, gust, dt, terrainHeight) {
  p.prevX = p.x;
  p.prevZ = p.z;
  p.prevAlt = p.alt;

  // --- Controls -----------------------------------------------------------
  const pitchIn = (input.held('pitchUp') ? 1 : 0) - (input.held('pitchDown') ? 1 : 0);
  const rollIn = (input.held('rollRight') ? 1 : 0) - (input.held('rollLeft') ? 1 : 0);
  if (input.held('throttleUp')) p.throttle = clamp(p.throttle + dt * 0.55, 0, 1);
  if (input.held('throttleDown')) p.throttle = clamp(p.throttle - dt * 0.55, 0, 1);
  p.airbrake = input.held('airbrake');

  const targetRoll = rollIn * 0.9;
  const targetPitch = clamp(pitchIn * 0.42, -0.42, 0.42);
  p.roll += (targetRoll - p.roll) * Math.min(1, dt * 4.5);
  p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 3.2);

  // --- Speed, lift and drag ----------------------------------------------
  const stall = PLANE.stallSpeed * (p.flaps ? 0.82 : 1);
  const drag = 0.02 + (p.flaps ? 0.02 : 0) + (p.airbrake ? 0.05 : 0) + (p.gearDown ? 0.006 : 0);
  const thrust = p.throttle * 2.6;
  const gravityAlong = Math.sin(p.pitch) * 9.81 * 0.55;
  p.speed += (thrust - drag * p.speed - gravityAlong * 0.12) * dt * 2.2;
  p.speed = clamp(p.speed, 0, PLANE.maxSpeed + 12);

  const stalled = p.speed < stall;
  const liftFactor = stalled ? 0.35 : 1;

  // --- Heading and position ----------------------------------------------
  const turnRate = (PLANE.turnFactor * Math.tan(p.roll)) / Math.max(p.speed, 12);
  p.heading = wrapAngle(p.heading + turnRate * dt * liftFactor);

  const climb = clamp(Math.sin(p.pitch) * p.speed * liftFactor, -16, 11);
  const sink = stalled ? (stall - p.speed) * 0.9 : 0;
  // Power-off sink: with the throttle closed the wing still flies, but the
  // plane glides down — about 2 m/s at idle. It is what makes a dead-stick
  // landing possible, and why a flare (a touch of back-pressure) matters.
  const idleSink = p.onGround ? 0 : (1 - p.throttle) * 2.0;
  p.verticalSpeed = climb - sink - idleSink;
  if (!p.onGround) p.alt += p.verticalSpeed * dt;

  // Wind: steady push plus a gust that wanders.
  const gustX = gust * wind.gx;
  const gustZ = gust * wind.gz;
  p.windX = wind.x + gustX;
  p.windZ = wind.z + gustZ;
  p.x += Math.sin(p.heading) * p.speed * dt + p.windX * dt;
  p.z += Math.cos(p.heading) * p.speed * dt + p.windZ * dt;

  // --- Fuel ---------------------------------------------------------------
  if (p.fuel > 0) {
    p.fuel = Math.max(0, p.fuel - (PLANE.fuelBurnBase + PLANE.fuelBurnFull * p.throttle * p.throttle) * dt);
    if (p.fuel <= 0) p.throttle = 0; // flame-out: you glide now
  }

  // --- Ground -------------------------------------------------------------
  const ground = terrainHeight(p.x, p.z);
  const clearance = p.alt - ground;
  if (clearance <= 0) {
    p.alt = ground;
    p.onGround = true;
    return { touched: true, ground, clearance: 0, stalled };
  }
  p.onGround = false;
  return { touched: false, ground, clearance, stalled };
}

// Landing quality when the wheels touch: soft, slow and on the centreline
// is a good landing; fast, hard or off-centre is damage.
export function landingReport(p, terrain, runway) {
  const vs = -p.verticalSpeed; // positive = descending
  const centre = Math.abs(p.z - runway.z);
  const aligned = Math.abs(wrapAngle(p.heading - runway.heading));
  const soft = vs < 2.2;
  const fast = p.speed > 46;
  const offCentre = centre > runway.width / 2;
  const wrongWay = aligned > 0.5;
  let damage = 0;
  if (!soft) damage += PLANE.damageHardLanding;
  if (fast) damage += 18;
  if (offCentre || wrongWay) damage += 22;
  if (!p.gearDown) damage += 45;
  return {
    vs,
    centre,
    alignedDeg: Math.abs((aligned * 180) / Math.PI),
    soft,
    fast,
    offCentre,
    wrongWay,
    gearDown: p.gearDown,
    damage,
    good: damage === 0,
  };
}
