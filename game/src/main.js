// Sky Courier — bootstrap and the main loop.
// The canvas is fixed at 1280x720 (the screenshots' size) and scaled by
// CSS to fit the window. A ?shot= pose freezes the game for screenshots.
import { createGame } from './game.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 7) || 7;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 1280;
  canvas.height = 720;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  return dpr;
}
resize();
window.addEventListener('resize', resize);

const app = createGame(canvas, seed);
const game = app.game;

// Screenshot mode: pose the game, render one frozen frame, stop the loop.
const shot = params.get('shot');
if (shot) {
  applyShot(app, shot, seed);
  app.render();
  document.title = `Sky Courier — shot ${shot}`;
} else {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    app.update(dt);
    app.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Expose a little state for play-testing and debugging.
window.__skyCourier = {
  app,
  game,
  snapshot() {
    const g = game;
    const p = g.plane;
    return {
      phase: g.phase,
      mission: g.mission ? g.mission.id : null,
      score: g.score,
      timeLeft: g.timeLeft,
      endTitle: g.endTitle,
      endReason: g.endReason,
      plane: p
        ? {
            x: p.x,
            z: p.z,
            alt: p.alt,
            heading: p.heading,
            pitch: p.pitch,
            roll: p.roll,
            speed: p.speed,
            throttle: p.throttle,
            fuel: p.fuel,
            gearDown: p.gearDown,
            flaps: p.flaps,
            onGround: p.onGround,
            damage: p.damage,
            verticalSpeed: p.verticalSpeed,
          }
        : null,
      rings: g.rings
        ? { next: g.rings.nextIndex, total: g.rings.rings.length, nextRing: g.rings.nextRing() }
        : null,
    };
  },
};
