// Sky Courier — the game itself: phases, missions, scoring and endings.
// Phases: title → flying → paused → crashed | done. The world (terrain,
// rings, wind) is built per mission from the seed; the plane flies with
// the flight model; rings, landings, fuel and damage decide the score.
import { createTerrain } from './terrain.js';
import { createRings } from './rings.js';
import { createPlane, updatePlane, landingReport } from './physics.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { drawSky, drawTerrain, drawClouds, drawScenery, drawRings, drawAircraft, drawRain } from './render.js';
import { drawHud, drawTitle, drawOverlay } from './hud.js';
import { MISSIONS, SCORE, PLANE, WORLD } from './config.js';
import { clamp } from './random.js';

export function createGame(canvas, seed) {
  const ctx = canvas.getContext('2d');
  const input = createInput(canvas);
  const audio = createAudio();
  const terrain = createTerrain(seed);

  const game = {
    canvas,
    ctx,
    input,
    audio,
    terrain,
    seed,
    phase: 'title',
    mission: MISSIONS[0],
    plane: null,
    rings: null,
    score: 0,
    bestScore: 0,
    timeLeft: null,
    elapsed: 0,
    time: 0,
    announce: '',
    subAnnounce: '',
    announceUntil: 0,
    endTitle: '',
    endReason: '',
    scoreLines: [],
    titleCards: [],
    wind: { x: 0, z: 0, gx: 0, gz: 0 },
    gustPhase: 0,
    crashChecked: false,
    alarmAt: 0,
    landed: false,
    shotMode: null,
  };

  game.objectiveText = function () {
    const m = game.mission;
    if (game.rings && !game.rings.done) {
      return `RING ${game.rings.nextIndex + 1} / ${game.rings.rings.length}  ·  ${m.name}`;
    }
    if (game.rings && game.rings.done && m.landing) return 'ALL RINGS — LAND ON RUNWAY 27';
    if (m.landing) return 'LAND ON RUNWAY 27';
    return m.name;
  };

  try {
    game.bestScore = Number(window.localStorage.getItem('sky-courier-best') || 0) || 0;
  } catch {
    game.bestScore = 0;
  }

  function say(main, sub = '', dur = 2.4) {
    game.announce = main;
    game.subAnnounce = sub;
    game.announceUntil = game.time + dur;
  }

  function startMission(mission) {
    game.mission = mission;
    game.plane = createPlane(mission.start, mission.fuel);
    game.rings = mission.rings ? createRings(seed, mission.rings, mission.start) : null;
    game.score = 0;
    game.elapsed = 0;
    game.timeLeft = mission.timeLimit;
    game.landed = false;
    game.crashChecked = false;
    // Steady wind from the west, plus a gust vector for the storm.
    const w = mission.wind;
    game.wind = { x: -w * 0.6, z: w * 0.4, gx: Math.sin(1.3) * w, gz: Math.cos(0.7) * w };
    game.phase = 'flying';
    audio.unlock();
    audio.click();
    if (mission.rings) say(`${mission.name} — GO!`, `Fly through ${game.rings.rings.length} rings in order`, 3);
    else say(`${mission.name} — GO!`, 'Line up on runway 27 and land her soft', 3);
  }

  function endRun(title, reason, lines) {
    game.endTitle = title;
    game.endReason = reason;
    game.scoreLines = lines;
    if (game.score > game.bestScore) {
      game.bestScore = game.score;
      try {
        window.localStorage.setItem('sky-courier-best', String(game.bestScore));
      } catch {
        // Best score is a nicety; the game plays on without it.
      }
    }
    audio.fanfare();
  }

  function crash(reason) {
    if (game.phase !== 'flying') return;
    game.phase = 'crashed';
    game.endReason = reason;
    if (game.score > game.bestScore) {
      game.bestScore = game.score;
      try {
        window.localStorage.setItem('sky-courier-best', String(game.bestScore));
      } catch {
        // Best score is a nicety; the game plays on without it.
      }
    }
    game.scoreLines = [
      ['Score', String(game.score)],
      ['Rings', game.rings ? `${game.rings.nextIndex} / ${game.rings.rings.length}` : '—'],
      ['Best score', String(game.bestScore)],
    ];
    audio.crash();
  }

  function finishLanding(report) {
    game.landed = true;
    game.phase = 'done';
    let bonus = SCORE.landingBase;
    const lines = [['Landing', `+${SCORE.landingBase}`]];
    if (report.soft) {
      bonus += SCORE.landingSoftBonus;
      lines.push(['Soft touchdown', `+${SCORE.landingSoftBonus}`]);
    }
    if (!report.offCentre && !report.wrongWay) {
      bonus += SCORE.landingCentreBonus;
      lines.push(['On the centreline', `+${SCORE.landingCentreBonus}`]);
    }
    const fuelBonus = Math.round(game.plane.fuel * SCORE.fuelBonusPerPct);
    bonus += fuelBonus;
    lines.push(['Fuel left', `+${fuelBonus}`]);
    game.score += bonus;
    lines.push(['Total score', String(game.score)]);
    endRun(
      'LANDED — WELCOME HOME',
      `Touchdown ${report.vs.toFixed(1)} m/s down, ${report.centre.toFixed(0)} m off centreline.`,
      lines,
    );
    audio.thump();
  }

  function update(dt) {
    game.time += dt;
    if (game.phase !== 'flying') return;
    const p = game.plane;
    const mission = game.mission;
    game.elapsed += dt;
    game.timeLeft = mission.timeLimit - game.elapsed;

    // Edge-triggered controls.
    if (input.wasPressed('gear')) {
      p.gearDown = !p.gearDown;
      audio.click();
    }
    if (input.wasPressed('flaps')) {
      p.flaps = !p.flaps;
      audio.click();
    }
    if (input.wasPressed('mute')) audio.toggleMute();
    if (input.wasPressed('pause')) {
      game.phase = 'paused';
      return;
    }
    if (input.wasPressed('restart')) {
      startMission(mission);
      return;
    }

    // Gusts wander in the storm; calm air barely breathes.
    game.gustPhase += dt * (mission.wind > 6 ? 0.9 : 0.25);
    const gust = mission.wind > 6 ? Math.sin(game.gustPhase) * 0.8 + Math.sin(game.gustPhase * 2.7) * 0.4 : 0.1;
    const windNow = { x: game.wind.x, z: game.wind.z, gx: game.wind.gx, gz: game.wind.gz };

    const res = updatePlane(p, input, windNow, gust, dt, terrain.terrainHeight);
    audio.update(p.throttle, p.speed, !p.onGround);

    // Low-fuel alarm every few seconds.
    if (p.fuel < 20 && p.fuel > 0 && game.time - game.alarmAt > 4) {
      game.alarmAt = game.time;
      audio.alarm();
      say('LOW FUEL', 'Throttle back or find the runway', 2);
    }

    // Rings.
    if (game.rings) {
      const passed = game.rings.checkPass(p.x, p.z, p.alt, p.prevX, p.prevZ, p.prevAlt, p.heading);
      if (passed) {
        const timeBonus = Math.max(0, Math.round((mission.timeLimit - game.elapsed) * 0.2));
        game.score += SCORE.ring + timeBonus;
        audio.ring();
        say(
          `RING ${game.rings.nextIndex} / ${game.rings.rings.length}`,
          `+${SCORE.ring} points${timeBonus ? `, +${timeBonus} time bonus` : ''}`,
        );
        if (game.rings.done) {
          if (mission.landing) {
            say('ALL RINGS — NOW LAND', 'Runway 27 is ahead. Gear down, flaps out.', 3.5);
          } else {
            game.phase = 'done';
            const fuelBonus = Math.round(p.fuel * SCORE.fuelBonusPerPct);
            game.score += fuelBonus;
            endRun('COURSE COMPLETE', `All ${game.rings.rings.length} rings threaded with ${Math.round(p.fuel)}% fuel left.`, [
              ['Rings', `${game.rings.rings.length} / ${game.rings.rings.length}`],
              ['Fuel bonus', `+${fuelBonus}`],
              ['Total score', String(game.score)],
            ]);
            return;
          }
        }
      }
    }

    // Ground contact: landing on the runway, or a crash anywhere else.
    if (res.touched) {
      const rw = WORLD.runway;
      const onRunway =
        Math.abs(p.x - rw.x) <= rw.length / 2 + 30 && Math.abs(p.z - rw.z) <= rw.width / 2 + 12;
      if (onRunway && p.alt - terrain.terrainHeight(p.x, p.z) <= 0.5) {
        const report = landingReport(p, terrain, rw);
        if (report.damage >= PLANE.maxDamage || !report.gearDown) {
          p.damage += report.damage;
          crash(
            !report.gearDown
              ? 'Belly landing — the gear was up.'
              : `Touchdown at ${report.vs.toFixed(1)} m/s down. The airframe broke.`,
          );
          return;
        }
        if (report.good || report.damage < 40) {
          p.damage += report.damage;
          if (mission.landing || (game.rings && game.rings.done)) {
            finishLanding(report);
            return;
          }
          // A runway touch-and-go in the ring mission: keep flying.
          p.speed *= 0.55;
          say('TOUCH-AND-GO', 'Back in the air — keep the rings in sight', 2);
          p.alt = terrain.terrainHeight(p.x, p.z) + 1;
          p.onGround = false;
          return;
        }
        p.damage += report.damage;
        crash(`Hard landing — ${report.vs.toFixed(1)} m/s down, ${report.damage} damage.`);
        return;
      }
      // Not the runway: a crash, unless it is a gentle field landing at
      // walking pace with the gear down (a survivable dead-stick landing).
      const gentle = p.speed < 16 && Math.abs(p.verticalSpeed) < 2 && p.gearDown;
      if (gentle) {
        game.phase = 'done';
        endRun('DOWN IN A FIELD', 'Out of runway, out of luck — but the plane is in one piece.', [
          ['Score', String(game.score)],
          ['Rings', game.rings ? `${game.rings.nextIndex} / ${game.rings.rings.length}` : '—'],
          ['Best score', String(game.bestScore)],
        ]);
        audio.thump();
        return;
      }
      p.damage = PLANE.maxDamage;
      crash('Terrain impact — the plane came down away from the runway.');
      return;
    }

    // Out of bounds: the world ends, the sortie ends.
    if (Math.abs(p.x) > 4800 || Math.abs(p.z) > 4800) {
      crash('You flew off the chart — Meridian Bay ends there.');
      return;
    }

    // Time up.
    if (game.timeLeft <= 0) {
      game.phase = 'done';
      endRun('TIME UP', 'The sortie window closed. The mail waits for no one.', [
        ['Score', String(game.score)],
        ['Rings', game.rings ? `${game.rings.nextIndex} / ${game.rings.rings.length}` : '—'],
        ['Best score', String(game.bestScore)],
      ]);
    }
  }

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    const rain = game.mission.rain && game.phase !== 'title';
    if (game.phase === 'title') {
      // A slow orbit over the bay behind the menu.
      const t = game.time * 0.02;
      const demo = {
        x: 2200 * Math.cos(t),
        z: 2200 * Math.sin(t) + 400,
        alt: 300,
        heading: Math.atan2(-Math.cos(t), -Math.sin(t)),
        pitch: -0.04,
        roll: Math.sin(game.time * 0.2) * 0.06,
        throttle: 0.6,
        speed: 55,
        fuel: 100,
        verticalSpeed: 0,
      };
      drawSky(ctx, w, h, demo, game.time, false);
      drawTerrain(ctx, terrain, demo, w, h, 0, game.time);
      drawClouds(ctx, terrain, demo, w, h, game.time);
      drawScenery(ctx, terrain, demo, w, h);
      drawTitle(ctx, game, w, h, game.time);
      return;
    }
    const p = game.plane;
    drawSky(ctx, w, h, p, game.time, rain);
    drawTerrain(ctx, terrain, p, w, h, 0, game.time);
    drawClouds(ctx, terrain, p, w, h, game.time);
    drawScenery(ctx, terrain, p, w, h);
    if (game.rings) drawRings(ctx, game.rings, p, w, h, game.time);
    if (rain) drawRain(ctx, w, h, game.time);
    drawAircraft(ctx, p, w, h, game.time);
    drawHud(ctx, game, w, h, game.time);
    if (game.phase === 'paused' || game.phase === 'crashed' || game.phase === 'done') {
      drawOverlay(ctx, game, w, h);
    }
  }

  function handleTitleInput() {
    if (input.wasPressed('mission1')) startMission(MISSIONS[0]);
    else if (input.wasPressed('mission2')) startMission(MISSIONS[1]);
    else if (input.wasPressed('mission3')) startMission(MISSIONS[2]);
    else if (input.wasPressed('mute')) audio.toggleMute();
    for (const card of game.titleCards) {
      if (input.clickedIn(card)) {
        startMission(card.mission);
        break;
      }
    }
  }

  function handleEndInput() {
    if (input.wasPressed('restart')) startMission(game.mission);
    else if (input.wasPressed('back')) game.phase = 'title';
  }

  return {
    game,
    startMission,
    say,
    update(dt) {
      if (game.phase === 'title') handleTitleInput();
      else if (game.phase === 'paused') {
        if (input.wasPressed('pause')) game.phase = 'flying';
        else if (input.wasPressed('restart')) startMission(game.mission);
        else if (input.wasPressed('back')) game.phase = 'title';
        else if (input.wasPressed('mute')) audio.toggleMute();
      } else if (game.phase === 'crashed' || game.phase === 'done') handleEndInput();
      else update(dt);
      input.endFrame();
    },
    render,
  };
}
