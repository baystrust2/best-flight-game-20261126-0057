// Sky Courier — the HUD, the attitude indicator and the menus.
// Everything is drawn on the same canvas as the world, so the screenshots
// show exactly what the pilot sees: altitude, speed and heading on the
// HUD, fuel and throttle, gear and flap lights, and the mission objective.
import { clamp, deg } from './random.js';
import { MISSIONS } from './config.js';

function text(ctx, s, x, y, size, color, align = 'left', weight = '600') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,18,32,0.55)';
  ctx.strokeStyle = 'rgba(160,210,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function knots(ms) {
  return Math.round(ms * 1.94384);
}
function feet(m) {
  return Math.round(m * 3.28084);
}

export function drawHud(ctx, game, w, h, time) {
  const p = game.plane;
  const mission = game.mission;
  const speedKt = knots(p.speed);
  const altFt = feet(p.alt);
  const hdg = Math.round(((deg(p.heading) % 360) + 360) % 360);

  // --- Top bar: ALT / SPD / HDG ------------------------------------------
  panel(ctx, 14, 12, 300, 64);
  text(ctx, 'ALT', 28, 34, 11, '#9fc4e8');
  text(ctx, `${altFt}`, 28, 62, 26, '#ffffff', 'left', '700');
  text(ctx, 'FT', 118, 62, 12, '#9fc4e8');
  text(ctx, 'SPD', 140, 34, 11, '#9fc4e8');
  text(ctx, `${speedKt}`, 140, 62, 26, '#ffffff', 'left', '700');
  text(ctx, 'KT', 196, 62, 12, '#9fc4e8');
  text(ctx, 'HDG', 224, 34, 11, '#9fc4e8');
  text(ctx, `${String(hdg).padStart(3, '0')}°`, 224, 62, 26, '#ffffff', 'left', '700');

  // Compass tape across the top centre.
  const tapeW = 320;
  const tapeX = w / 2 - tapeW / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tapeX, 12, tapeW, 30);
  ctx.clip();
  ctx.fillStyle = 'rgba(8,18,32,0.55)';
  ctx.fillRect(tapeX, 12, tapeW, 30);
  for (let d = -60; d <= 60; d += 5) {
    const hd = Math.round(hdg + d);
    const x = tapeX + tapeW / 2 + d * (tapeW / 120);
    if (x < tapeX || x > tapeX + tapeW) continue;
    const major = ((hd % 30) + 360) % 30 === 0;
    ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, major ? 26 : 21);
    ctx.stroke();
    if (major) {
      const label = ((hd % 360) + 360) % 360;
      text(ctx, String(label).padStart(3, '0'), x, 40, 10, '#cfe4f7', 'center');
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffc93c';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, 12);
  ctx.lineTo(w / 2 + 6, 12);
  ctx.lineTo(w / 2, 22);
  ctx.closePath();
  ctx.fill();

  // --- Top right: fuel, score, timer, objective --------------------------
  panel(ctx, w - 254, 12, 240, 64);
  const fuelW = 120;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(w - 240, 30, fuelW, 10);
  ctx.fillStyle = p.fuel > 25 ? '#37d67a' : '#ff5a4e';
  ctx.fillRect(w - 240, 30, fuelW * clamp(p.fuel / 100, 0, 1), 10);
  text(ctx, 'FUEL', w - 240, 24, 11, '#9fc4e8');
  text(ctx, `${Math.round(p.fuel)}%`, w - 112, 40, 14, '#ffffff', 'left', '700');
  text(ctx, 'SCORE', w - 240, 58, 11, '#9fc4e8');
  text(ctx, `${game.score}`, w - 178, 62, 20, '#ffffff', 'left', '700');
  text(ctx, game.timeLeft != null ? fmtTime(game.timeLeft) : '', w - 30, 62, 20, '#ffffff', 'right', '700');

  const obj = game.objectiveText();
  text(ctx, obj, w / 2, 62, 14, '#ffe9a8', 'center', '600');

  // --- Attitude indicator, bottom left ------------------------------------
  const ax = 74;
  const ay = h - 74;
  const ar = 52;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-p.roll);
  ctx.translate(0, p.pitch * 90);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-ar - 4, -ar - 60, ar * 2 + 8, ar + 60);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-ar - 4, 0, ar * 2 + 8, ar + 60);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  for (const off of [-30, -15, 15, 30]) {
    ctx.beginPath();
    ctx.moveTo(-18, off);
    ctx.lineTo(18, off);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8f2fa';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  ctx.strokeStyle = '#ffc93c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ax - 26, ay);
  ctx.lineTo(ax - 8, ay);
  ctx.moveTo(ax + 8, ay);
  ctx.lineTo(ax + 26, ay);
  ctx.stroke();
  ctx.fillStyle = '#ffc93c';
  ctx.beginPath();
  ctx.arc(ax, ay, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  text(ctx, 'V/S', ax - 52, ay + ar + 18, 11, '#9fc4e8');
  const vs = Math.round(p.verticalSpeed * 196.85);
  text(ctx, `${vs >= 0 ? '+' : ''}${vs} fpm`, ax - 20, ay + ar + 18, 13, '#ffffff', 'left', '700');

  // --- Throttle slider, bottom right --------------------------------------
  const tx = w - 56;
  const ty = h - 190;
  const th = 130;
  panel(ctx, tx - 14, ty - 30, 52, th + 58);
  text(ctx, 'THR', tx + 12, ty - 12, 11, '#9fc4e8', 'center');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(tx + 8, ty, 8, th);
  const fillH = th * clamp(p.throttle, 0, 1);
  ctx.fillStyle = '#37b6e8';
  ctx.fillRect(tx + 8, ty + th - fillH, 8, fillH);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tx + 2, ty + th - fillH - 3, 20, 6);
  text(ctx, `${Math.round(p.throttle * 100)}%`, tx + 12, ty + th + 20, 12, '#ffffff', 'center', '700');
  // Register the slider for mouse dragging (input module owns the list).
  game.input.sliders.length = 0;
  game.input.sliders.push({
    x: tx,
    y: ty,
    w: 24,
    h: th,
    get: () => p.throttle,
    set: (v) => {
      p.throttle = clamp(v, 0, 1);
    },
  });

  // --- Lights: gear, flaps, stall, low fuel -------------------------------
  const ly = h - 36;
  let lx = 150;
  const light = (label, on, color) => {
    ctx.fillStyle = on ? color : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(lx, ly - 14, 52, 22, 5);
    ctx.fill();
    text(ctx, label, lx + 26, ly + 2, 11, on ? '#08121f' : '#9fb6c8', 'center', '700');
    lx += 60;
  };
  light('GEAR', p.gearDown, '#37d67a');
  light('FLAPS', p.flaps, '#37b6e8');
  const stalled = p.speed < 26 * (p.flaps ? 0.82 : 1);
  light('STALL', stalled && !p.onGround, Math.sin(time * 10) > 0 ? '#ff5a4e' : '#ff8a80');
  light('FUEL', p.fuel < 20, p.fuel < 20 && Math.sin(time * 8) > 0 ? '#ffb02e' : '#ffcf7a');

  // --- Centre: flight-path marker and next-ring distance ------------------
  const ring = game.rings ? game.rings.nextRing() : null;
  if (ring && game.phase === 'flying') {
    const dx = ring.x - p.x;
    const dz = ring.z - p.z;
    const dist = Math.round(Math.hypot(dx, dz, ring.alt - p.alt));
    text(ctx, `◈ NEXT RING ${dist} m`, w / 2, h * 0.66, 15, '#ffe9a8', 'center', '700');
  }

  // --- Announcements -------------------------------------------------------
  if (game.announce && game.announceUntil > time) {
    const a = 1 - (game.announceUntil - time) / 2.4;
    ctx.save();
    ctx.globalAlpha = clamp(1.2 - a, 0, 1);
    text(ctx, game.announce, w / 2, h * 0.3, 34, '#ffffff', 'center', '800');
    ctx.restore();
  }
  if (game.subAnnounce && game.announceUntil > time) {
    text(ctx, game.subAnnounce, w / 2, h * 0.3 + 34, 17, '#ffe9a8', 'center', '600');
  }
}

function fmtTime(s) {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.floor(Math.max(0, s) % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// --- Menus -----------------------------------------------------------------
export function drawTitle(ctx, game, w, h, time) {
  ctx.fillStyle = 'rgba(6,14,26,0.45)';
  ctx.fillRect(0, 0, w, h);
  text(ctx, 'SKY COURIER', w / 2, h * 0.2, 64, '#ffffff', 'center', '800');
  text(ctx, 'Ring Runner over Meridian Bay', w / 2, h * 0.2 + 44, 22, '#ffe9a8', 'center', '600');
  text(
    ctx,
    'Fly the little red courier plane. Thread the rings, mind your fuel, bring her home.',
    w / 2,
    h * 0.2 + 78,
    15,
    '#cfe4f7',
    'center',
  );

  const cardW = 300;
  const cardH = 204;
  const gap = 24;
  const totalW = cardW * 3 + gap * 2;
  let x = (w - totalW) / 2;
  const y = h * 0.38;
  game.titleCards = [];
  MISSIONS.forEach((m, i) => {
    const hover =
      game.input.mouse.x >= x && game.input.mouse.x <= x + cardW &&
      game.input.mouse.y >= y && game.input.mouse.y <= y + cardH;
    ctx.fillStyle = hover ? 'rgba(30,60,100,0.92)' : 'rgba(10,24,44,0.85)';
    ctx.strokeStyle = hover ? '#ffc93c' : 'rgba(160,210,255,0.4)';
    ctx.lineWidth = hover ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();
    text(ctx, `${m.key} · ${m.name}`, x + 18, y + 34, 19, '#ffffff', 'left', '800');
    text(ctx, m.tag, x + 18, y + 60, 14, '#ffe9a8');
    wrapText(ctx, m.detail, x + 18, y + 88, cardW - 36, 14, '#cfe4f7');
    text(ctx, 'Click or press ' + m.key, x + 18, y + cardH - 14, 12, '#9fc4e8');
    game.titleCards.push({ x, y, w: cardW, h: cardH, mission: m });
    x += cardW + gap;
  });

  text(
    ctx,
    '↑ ↓ pitch · ← → bank · W / S throttle · G gear · F flaps · Space airbrake · P pause · M mute',
    w / 2,
    y + cardH + 46,
    14,
    '#cfe4f7',
    'center',
  );
  text(
    ctx,
    'Land soft on the centreline with the gear down. Run out of fuel and you glide — pick your field.',
    w / 2,
    y + cardH + 72,
    14,
    '#cfe4f7',
    'center',
  );
  if (game.bestScore > 0) {
    text(ctx, `Best score so far: ${game.bestScore}`, w / 2, y + cardH + 104, 15, '#ffe9a8', 'center', '700');
  }
}

function wrapText(ctx, s, x, y, maxW, size, color) {
  ctx.fillStyle = color;
  ctx.font = `400 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  const words = s.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += size + 5;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export function drawOverlay(ctx, game, w, h) {
  ctx.fillStyle = 'rgba(6,14,26,0.6)';
  ctx.fillRect(0, 0, w, h);
  if (game.phase === 'paused') {
    text(ctx, 'PAUSED', w / 2, h * 0.4, 48, '#ffffff', 'center', '800');
    text(ctx, 'P to resume · R to restart · Esc for the menu', w / 2, h * 0.4 + 40, 16, '#cfe4f7', 'center');
  } else if (game.phase === 'crashed') {
    text(ctx, 'CRASHED', w / 2, h * 0.36, 48, '#ff6b5e', 'center', '800');
    text(ctx, game.endReason, w / 2, h * 0.36 + 40, 17, '#ffe9a8', 'center', '600');
    drawScoreCard(ctx, game, w, h);
  } else if (game.phase === 'done') {
    text(ctx, game.endTitle, w / 2, h * 0.36, 48, '#ffffff', 'center', '800');
    text(ctx, game.endReason, w / 2, h * 0.36 + 40, 17, '#ffe9a8', 'center', '600');
    drawScoreCard(ctx, game, w, h);
  }
}

function drawScoreCard(ctx, game, w, h) {
  const y0 = h * 0.36 + 84;
  panel(ctx, w / 2 - 190, y0, 380, 130);
  const lines = game.scoreLines;
  lines.forEach((line, i) => {
    text(ctx, line[0], w / 2 - 170, y0 + 30 + i * 26, 15, '#cfe4f7');
    text(ctx, line[1], w / 2 + 170, y0 + 30 + i * 26, 15, '#ffffff', 'right', '700');
  });
  text(ctx, 'R restart · Esc menu', w / 2, y0 + 160, 14, '#9fc4e8', 'center');
}
