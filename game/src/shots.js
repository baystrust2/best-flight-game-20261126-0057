// Sky Courier — deterministic screenshot poses.
// ?shot=cover|title|landing|storm&seed=7 freezes the game in a composed
// moment and renders one frame, so the screenshots are real renders of the
// game's own code, taken the same way every time.
import { MISSIONS } from './config.js';

export function applyShot(game, name, seed) {
  const g = game.game;
  if (name === 'title') {
    g.phase = 'title';
    g.time = 42; // orbit puts the runway island in frame behind the menu
    return true;
  }
  if (name === 'cover') {
    // Mid ring-run: three rings threaded, the next ring dead ahead over
    // the bay, runway island and town in the distance, HUD lit.
    game.startMission(MISSIONS[0]);
    const p = g.plane;
    p.x = -350;
    p.z = 1450;
    p.alt = 205;
    p.heading = 4.5;
    p.pitch = -0.03;
    p.roll = -0.18;
    p.speed = 64;
    p.throttle = 0.72;
    p.fuel = 78;
    g.score = 300;
    g.elapsed = 41;
    g.timeLeft = MISSIONS[0].timeLimit - 41;
    for (let i = 0; i < 3; i++) g.rings.rings[i].passed = true;
    g.rings.setNext(3);
    g.time = 12.4;
    game.say('RING 3 / 8', '+100 points, +24 time bonus');
    return true;
  }
  if (name === 'landing') {
    // Short final for runway 27: gear down, flaps out, threshold ahead.
    game.startMission(MISSIONS[1]);
    const p = g.plane;
    p.x = 620;
    p.z = 28;
    p.alt = 42;
    p.heading = -Math.PI / 2;
    p.pitch = -0.06;
    p.roll = 0.02;
    p.speed = 38;
    p.throttle = 0.3;
    p.fuel = 91;
    p.flaps = true;
    p.gearDown = true;
    g.score = 0;
    g.elapsed = 88;
    g.timeLeft = MISSIONS[1].timeLimit - 88;
    g.time = 30.2;
    game.say('', '');
    return true;
  }
  if (name === 'storm') {
    // Storm courier in the rain: low fuel light on, ring ahead in the murk.
    game.startMission(MISSIONS[2]);
    const p = g.plane;
    p.x = 250;
    p.z = 1350;
    p.alt = 185;
    p.heading = 4.9;
    p.pitch = 0.02;
    p.roll = 0.28;
    p.speed = 58;
    p.throttle = 0.66;
    p.fuel = 18;
    g.score = 210;
    g.elapsed = 132;
    g.timeLeft = MISSIONS[2].timeLimit - 132;
    for (let i = 0; i < 2; i++) g.rings.rings[i].passed = true;
    g.rings.setNext(2);
    g.time = 24.7;
    game.say('LOW FUEL', 'Throttle back or find the runway');
    return true;
  }
  return false;
}
