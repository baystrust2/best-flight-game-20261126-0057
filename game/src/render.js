// Sky Courier — the 3D view: sky, terrain, rings and the aircraft.
// The world is drawn with a small software projector: every world point is
// moved into the camera frame (forward / right / up from heading, pitch
// and roll) and projected with a perspective divide. Terrain is a grid of
// quads sampled ahead of the plane, far rows first; rings and scenery are
// billboards and projected circles.
import { clamp, lerp } from './random.js';
import { WORLD, RING } from './config.js';

const FOV = (68 * Math.PI) / 180;

export function makeProjector(plane, w, h) {
  const focal = h / 2 / Math.tan(FOV / 2);
  const psi = plane.heading;
  const theta = plane.pitch;
  // Camera basis (before roll).
  const fx = Math.sin(psi) * Math.cos(theta);
  const fy = Math.sin(theta);
  const fz = Math.cos(psi) * Math.cos(theta);
  const rx = Math.cos(psi);
  const rz = -Math.sin(psi);
  const ux = -Math.sin(psi) * Math.sin(theta);
  const uy = Math.cos(theta);
  const uz = -Math.cos(psi) * Math.sin(theta);
  // Roll rotates right/up around forward.
  const c = Math.cos(plane.roll);
  const s = Math.sin(plane.roll);
  const rX = rx * c + ux * s;
  const rY = 0 * c + uy * s;
  const rZ = rz * c + uz * s;
  const uX = ux * c - rx * s;
  const uY = uy * c - 0 * s;
  const uZ = uz * c - rz * s;
  const cx = plane.x;
  const cy = plane.alt;
  const cz = plane.z;
  return function project(x, y, z) {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const czd = dx * fx + dy * fy + dz * fz;
    if (czd < 8) return null;
    const cxd = dx * rX + dy * rY + dz * rZ;
    const cyd = dx * uX + dy * uY + dz * uZ;
    return {
      x: w / 2 + (cxd / czd) * focal,
      y: h / 2 - (cyd / czd) * focal,
      depth: czd,
      scale: focal / czd,
    };
  };
}

// --- Sky ------------------------------------------------------------------
export function drawSky(ctx, w, h, plane, time, rain) {
  const horizonY = h / 2 - Math.tan(plane.pitch) * (h / 2 / Math.tan(FOV / 2));
  const roll = plane.roll;
  ctx.save();
  ctx.translate(w / 2, horizonY);
  ctx.rotate(-roll * 0.55);
  ctx.translate(-w / 2, -horizonY);
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  if (rain) {
    sky.addColorStop(0, '#5d6b7d');
    sky.addColorStop(1, '#8b98a8');
  } else {
    sky.addColorStop(0, '#2f6fd0');
    sky.addColorStop(0.55, '#7db4e8');
    sky.addColorStop(1, '#cfe6f7');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(-w, -h, w * 3, horizonY + h + 80);
  // Sun, placed by heading so it stays put as you turn (hidden in rain).
  const sunA = plane.heading - 2.1;
  const sunX = w / 2 + Math.sin(sunA) * w * 0.62;
  const sunY = horizonY - h * 0.2;
  if (!rain && sunY > -40 && sunY < horizonY + 20) {
    const g = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    g.addColorStop(0, 'rgba(255,244,200,0.95)');
    g.addColorStop(0.25, 'rgba(255,226,140,0.55)');
    g.addColorStop(1, 'rgba(255,226,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sunX - 100, sunY - 100, 200, 200);
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return horizonY;
}

// --- Terrain ---------------------------------------------------------------
const ROWS = 26;
const COLS = 18;
const rowDist = [];
for (let i = 0; i <= ROWS; i++) rowDist.push(55 * Math.pow(1.24, i));

function groundColor(kind, x, z, dist, noise) {
  const fog = clamp(dist / 5200, 0, 0.72);
  let r, g, b;
  if (kind === 'water') {
    r = 38; g = 110; b = 168;
    const w = Math.sin(x * 0.02 + z * 0.013) * 8;
    r += w; g += w; b += w * 0.5;
  } else if (kind === 'sand') {
    r = 214; g = 196; b = 148;
  } else if (kind === 'runway') {
    r = 58; g = 60; b = 64;
  } else if (kind === 'apron') {
    r = 148; g = 158; b = 110;
  } else if (kind === 'forest') {
    r = 42; g = 96; b = 48;
  } else if (kind === 'field2') {
    r = 122; g = 158; b = 62;
  } else {
    r = 96; g = 150; b = 66;
  }
  const shade = 0.92 + noise * 0.16;
  r = Math.round(lerp(r * shade, 178, fog));
  g = Math.round(lerp(g * shade, 198, fog));
  b = Math.round(lerp(b * shade, 222, fog));
  return `rgb(${r},${g},${b})`;
}

export function drawTerrain(ctx, terrain, plane, w, h, horizonY, time) {
  const project = makeProjector(plane, w, h);
  const psi = plane.heading;
  const fx = Math.sin(psi);
  const fz = Math.cos(psi);
  const rx = Math.cos(psi);
  const rz = -Math.sin(psi);
  const rw = WORLD.runway;
  // Sample the grid ahead of the plane, far to near.
  const grid = [];
  for (let i = 0; i <= ROWS; i++) {
    const d = rowDist[i];
    const row = [];
    const half = d * 1.05;
    for (let j = 0; j <= COLS; j++) {
      const lat = -half + (2 * half * j) / COLS;
      const wx = plane.x + fx * d + rx * lat;
      const wz = plane.z + fz * d + rz * lat;
      const wy = terrain.terrainHeight(wx, wz);
      const p = project(wx, wy, wz);
      row.push({ p, wx, wz, d, kind: terrain.groundKind(wx, wz) });
    }
    grid.push(row);
  }
  // Paint far rows first.
  for (let i = ROWS - 1; i >= 0; i--) {
    const near = grid[i];
    const far = grid[i + 1];
    for (let j = 0; j < COLS; j++) {
      const a = far[j];
      const b = far[j + 1];
      const c = near[j + 1];
      const d0 = near[j];
      if (!a.p || !b.p || !c.p || !d0.p) continue;
      const n = Math.sin(a.wx * 0.013 + a.wz * 0.017) * 0.5 + Math.sin(a.wx * 0.05 - a.wz * 0.03) * 0.5;
      ctx.fillStyle = groundColor(a.kind, a.wx, a.wz, a.d, n);
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y);
      ctx.lineTo(b.p.x, b.p.y);
      ctx.lineTo(c.p.x, c.p.y);
      ctx.lineTo(d0.p.x, d0.p.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Runway centreline dashes and threshold bars, drawn as small quads so
  // they sit on the asphalt instead of floating above it.
  ctx.fillStyle = '#f2f2e8';
  for (let x = -rw.length / 2 + 60; x < rw.length / 2 - 40; x += 90) {
    const pts = [
      [x, 6.4, -2],
      [x + 42, 6.4, -2],
      [x + 42, 6.4, 2],
      [x, 6.4, 2],
    ].map(([px, py, pz]) => project(rw.x + px, py, rw.z + pz));
    if (pts.some((p) => !p)) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.fill();
  }
  // Runway edge lines.
  ctx.strokeStyle = 'rgba(242,242,232,0.85)';
  ctx.lineWidth = 2;
  for (const edge of [-rw.width / 2 + 3, rw.width / 2 - 3]) {
    const p1 = project(rw.x - rw.length / 2, 6.4, rw.z + edge);
    const p2 = project(rw.x + rw.length / 2, 6.4, rw.z + edge);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}

// --- Clouds, trees, houses -------------------------------------------------
export function drawClouds(ctx, terrain, plane, w, h, time) {
  const project = makeProjector(plane, w, h);
  const list = terrain.clouds
    .map((c) => ({ c, p: project(c.x + c.drift * time, c.y, c.z) }))
    .filter((o) => o.p && o.p.y > -80 && o.p.y < h * 0.75)
    .sort((a, b) => b.p.depth - a.p.depth);
  for (const { c, p } of list) {
    const s = c.s * p.scale * 0.9;
    if (s < 4) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.5, p.y + s * 0.08, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.65, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawScenery(ctx, terrain, plane, w, h) {
  const project = makeProjector(plane, w, h);
  // Trees: small dark-green triangles; houses: warm boxes with roofs.
  for (const t of terrain.trees) {
    const dx = t.x - plane.x;
    const dz = t.z - plane.z;
    if (dx * dx + dz * dz > 2600 * 2600) continue;
    const p = project(t.x, t.h, t.z);
    if (!p) continue;
    const s = t.s * p.scale * 1.6;
    if (s < 1.5) continue;
    ctx.fillStyle = '#2d6b34';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s * 1.6);
    ctx.lineTo(p.x - s * 0.7, p.y);
    ctx.lineTo(p.x + s * 0.7, p.y);
    ctx.closePath();
    ctx.fill();
  }
  for (const hs of terrain.houses) {
    const dx = hs.x - plane.x;
    const dz = hs.z - plane.z;
    if (dx * dx + dz * dz > 2600 * 2600) continue;
    const p = project(hs.x, hs.h, hs.z);
    if (!p) continue;
    const s = hs.w * p.scale;
    if (s < 2) continue;
    ctx.fillStyle = '#e8d9b0';
    ctx.fillRect(p.x - s / 2, p.y - s * 0.7, s, s * 0.7);
    ctx.fillStyle = '#a34d2e';
    ctx.beginPath();
    ctx.moveTo(p.x - s / 2 - 1, p.y - s * 0.7);
    ctx.lineTo(p.x, p.y - s * 1.15);
    ctx.lineTo(p.x + s / 2 + 1, p.y - s * 0.7);
    ctx.closePath();
    ctx.fill();
  }
}

// --- Rings -----------------------------------------------------------------
export function drawRings(ctx, rings, plane, w, h, time) {
  const project = makeProjector(plane, w, h);
  const list = rings.rings
    .map((r, i) => ({ r, i, p: project(r.x, r.alt, r.z) }))
    .filter((o) => o.p)
    .sort((a, b) => b.p.depth - a.p.depth);
  for (const { r, i, p } of list) {
    const passed = r.passed;
    const isNext = i === rings.nextIndex;
    const radiusPx = RING.radius * p.scale;
    if (radiusPx < 2) continue;
    const color = passed ? '#7ddc8a' : isNext ? '#ffc93c' : '#37c8e8';
    // Ring face: the ring stands vertical, facing the course direction.
    const prev = rings.rings[i - 1] ?? { x: plane.x, z: plane.z };
    let nx = r.x - prev.x;
    let nz = r.z - prev.z;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    // Circle points: in-plane axes are world-up and the horizontal
    // perpendicular to the course normal.
    const ax = -nz;
    const az = nx;
    ctx.save();
    ctx.globalAlpha = passed ? 0.35 : 0.95;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, radiusPx * 0.09);
    ctx.shadowColor = color;
    ctx.shadowBlur = isNext ? 18 : 8;
    ctx.beginPath();
    const SEG = 26;
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const px = r.x + ax * Math.cos(a) * RING.radius;
      const py = r.alt + Math.sin(a) * RING.radius;
      const pz = r.z + az * Math.cos(a) * RING.radius;
      const q = project(px, py, pz);
      if (!q) continue;
      if (k === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    // Pulsing chevron above the next ring.
    if (isNext) {
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      ctx.fillStyle = '#ffc93c';
      ctx.font = `bold ${Math.max(13, radiusPx * 0.32)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('NEXT RING', p.x, p.y - radiusPx * 1.25 * pulse);
    }
  }
}

// --- The aircraft (chase view) --------------------------------------------
export function drawAircraft(ctx, plane, w, h, time) {
  const cx = w / 2;
  const cy = h * 0.74 + plane.pitch * 90;
  const s = Math.min(w, h) / 720;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll * 0.85);
  ctx.scale(s, s);
  // Prop blur at the nose (far end, top of the sprite).
  const propA = 0.25 + plane.throttle * 0.35;
  ctx.fillStyle = `rgba(220,225,230,${propA})`;
  ctx.beginPath();
  ctx.ellipse(0, -118, 16, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wings.
  ctx.fillStyle = '#d8433c';
  ctx.beginPath();
  ctx.moveTo(-14, -58);
  ctx.lineTo(-168, -8);
  ctx.lineTo(-168, 12);
  ctx.lineTo(-14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -58);
  ctx.lineTo(168, -8);
  ctx.lineTo(168, 12);
  ctx.lineTo(14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b22e28';
  ctx.fillRect(-168, -8, 154, 5);
  ctx.fillRect(14, -8, 154, 5);
  // Fuselage: nose away from the viewer, tail near.
  const grad = ctx.createLinearGradient(0, -120, 0, 110);
  grad.addColorStop(0, '#f4f6f8');
  grad.addColorStop(0.6, '#dfe6ea');
  grad.addColorStop(1, '#b9c4cb');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-13, -118);
  ctx.quadraticCurveTo(-20, -40, -17, 40);
  ctx.quadraticCurveTo(-16, 96, -11, 108);
  ctx.lineTo(11, 108);
  ctx.quadraticCurveTo(16, 96, 17, 40);
  ctx.quadraticCurveTo(20, -40, 13, -118);
  ctx.quadraticCurveTo(0, -128, -13, -118);
  ctx.fill();
  // Canopy.
  ctx.fillStyle = '#1d4e89';
  ctx.beginPath();
  ctx.ellipse(0, -62, 9, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-3, -72, 3, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail: horizontal stabilizer and fin.
  ctx.fillStyle = '#d8433c';
  ctx.beginPath();
  ctx.moveTo(-12, 84);
  ctx.lineTo(-58, 108);
  ctx.lineTo(-58, 116);
  ctx.lineTo(-12, 104);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12, 84);
  ctx.lineTo(58, 108);
  ctx.lineTo(58, 116);
  ctx.lineTo(12, 104);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, 88);
  ctx.lineTo(0, 52);
  ctx.lineTo(7, 88);
  ctx.closePath();
  ctx.fill();
  // Nav lights: red left, green right, white strobe on the tail.
  const blink = Math.sin(time * 6) > 0;
  ctx.fillStyle = '#ff2d2d';
  ctx.beginPath();
  ctx.arc(-166, 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2dff5e';
  ctx.beginPath();
  ctx.arc(166, 2, 4, 0, Math.PI * 2);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 110, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Rain ------------------------------------------------------------------
export function drawRain(ctx, w, h, time) {
  ctx.save();
  ctx.strokeStyle = 'rgba(200,215,230,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const x = ((i * 137.5 + time * 340) % (w + 40)) - 20;
    const y = ((i * 89.3 + time * 900) % (h + 40)) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y + 22);
  }
  ctx.stroke();
  ctx.restore();
}
