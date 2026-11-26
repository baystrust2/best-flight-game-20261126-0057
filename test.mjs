// test.mjs — drives Sky Courier in headless Chromium over CDP with Node's
// built-in fetch + WebSocket only (no extra packages).
//   node test.mjs play   — ring-run autopilot play-test with assertions
//   node test.mjs land   — precision-landing autopilot play-test
//   node test.mjs shots  — captures the 4 real screenshots
// Chromium is launched separately with --remote-debugging-port=9223.
// The game is served separately: (cd repo && node serve.ts --port 8321)

import { writeFileSync, mkdirSync } from 'node:fs';

const DEBUG_PORT = 9223;
const BASE = 'http://127.0.0.1:8321';
const REPO = '/home/hatch/workspace/makefun/work/best-flight-game-20261126-0057';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let msgId = 0;
const pending = new Map();
let ws;
let pageErrors = [];

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 500));
      console.log('PAGE EXCEPTION:', pageErrors[pageErrors.length - 1]);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error'].includes(msg.params.type)) {
      console.log(
        'CONSOLE error:',
        msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300),
      );
      pageErrors.push('console.error');
    }
  };
}

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails).slice(0, 400));
  return res.result.value;
}

async function navigate(url) {
  await send('Page.navigate', { url });
  await sleep(1500);
}

async function snapshot() {
  return evalJs('window.__skyCourier ? window.__skyCourier.snapshot() : null');
}

const KEYMAP = {
  w: ['KeyW', 87], a: ['KeyA', 65], s: ['KeyS', 83], d: ['KeyD', 68],
  g: ['KeyG', 71], f: ['KeyF', 70], r: ['KeyR', 82], m: ['KeyM', 77],
  p: ['KeyP', 80], '1': ['Digit1', 49], '2': ['Digit2', 50], '3': ['Digit3', 51],
  Enter: ['Enter', 13], ' ': ['Space', 32],
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40],
  ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
  Escape: ['Escape', 27],
};

async function keyEvent(type, key) {
  const [code, vk] = KEYMAP[key] || [key, 0];
  await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

async function press(key) {
  await keyEvent('keyDown', key);
  await sleep(60);
  await keyEvent('keyUp', key);
  await sleep(120);
}

const held = new Set();
async function hold(key, on) {
  if (on && !held.has(key)) {
    held.add(key);
    await keyEvent('keyDown', key);
  }
  if (!on && held.has(key)) {
    held.delete(key);
    await keyEvent('keyUp', key);
  }
}
async function releaseAll() {
  for (const k of [...held]) await hold(k, false);
}

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!cond) failures++;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Steer toward a 3D target: bank by heading error, pitch by altitude error,
// throttle to hold a target speed. Runs one control tick.
async function steerTo(snap, tx, tz, tAlt, tSpeed) {
  const p = snap.plane;
  const desired = Math.atan2(tx - p.x, tz - p.z);
  const err = wrapAngle(desired - p.heading);
  await hold('ArrowRight', err > 0.04);
  await hold('ArrowLeft', err < -0.04);
  // Ease the bank off as the error closes so we do not overshoot.
  if (Math.abs(err) < 0.04) {
    await hold('ArrowRight', false);
    await hold('ArrowLeft', false);
  }
  const altErr = tAlt - p.alt;
  await hold('ArrowUp', altErr > 8);
  await hold('ArrowDown', altErr < -8);
  if (Math.abs(altErr) < 8) {
    await hold('ArrowUp', false);
    await hold('ArrowDown', false);
  }
  if (p.speed < tSpeed - 3) await hold('w', true);
  else if (p.speed > tSpeed + 3) await hold('s', true);
  else {
    await hold('w', false);
    await hold('s', false);
  }
}

async function playTest() {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('== load title ==');
  await navigate(`${BASE}/index.html?seed=7`);
  let snap = await snapshot();
  check('boots to title', snap && snap.phase === 'title', JSON.stringify(snap?.phase));
  check('no plane before start', snap.plane === null);

  console.log('== start ring mission (key 1) ==');
  await press('1');
  await sleep(500);
  snap = await snapshot();
  check('mission starts', snap.phase === 'flying' && snap.mission === 'rings', JSON.stringify(snap?.phase));
  check('8 rings on the course', snap.rings && snap.rings.total === 8, JSON.stringify(snap.rings));
  check('fuel full', snap.plane.fuel > 99, `fuel=${snap.plane.fuel}`);
  check('timer counts down', snap.timeLeft < 240 && snap.timeLeft > 230, `timeLeft=${snap.timeLeft}`);

  console.log('== autopilot: fly the rings ==');
  const t0 = Date.now();
  let lastRing = 0;
  let lastLog = 0;
  while (Date.now() - t0 < 150000) {
    snap = await snapshot();
    if (!snap || snap.phase !== 'flying') break;
    const ring = snap.rings.nextRing;
    if (!ring) break;
    await steerTo(snap, ring.x, ring.z, ring.alt, 58);
    if (snap.rings.next !== lastRing) {
      lastRing = snap.rings.next;
      console.log(`  ring ${lastRing}/8 passed, score=${snap.score}, fuel=${Math.round(snap.plane.fuel)}%`);
    }
    if (Date.now() - lastLog > 10000) {
      lastLog = Date.now();
      console.log(
        `  ... alt=${Math.round(snap.plane.alt)}m spd=${Math.round(snap.plane.speed * 1.94)}kt fuel=${Math.round(snap.plane.fuel)}% rings=${snap.rings.next}/8`,
      );
    }
    await sleep(60);
  }
  await releaseAll();
  snap = await snapshot();
  console.log(`  end: phase=${snap.phase} rings=${snap.rings.next}/8 score=${snap.score} fuel=${Math.round(snap.plane.fuel)}%`);
  check('at least 3 rings passed', snap.rings.next >= 3, `rings=${snap.rings.next}`);
  check('score grew with rings', snap.score >= snap.rings.next * 100, `score=${snap.score}`);
  check('no page exceptions', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('== pause / resume / restart ==');
  if (snap.phase === 'flying') {
    await press('p');
    await sleep(300);
    snap = await snapshot();
    check('P pauses', snap.phase === 'paused', snap.phase);
    await press('p');
    await sleep(300);
    snap = await snapshot();
    check('P resumes', snap.phase === 'flying', snap.phase);
  }
  await press('r');
  await sleep(400);
  snap = await snapshot();
  check('R restarts the mission', snap.phase === 'flying' && snap.rings.next === 0 && snap.score === 0, JSON.stringify({ phase: snap.phase, rings: snap.rings?.next, score: snap.score }));

  console.log('== gear / flaps toggle ==');
  const gear0 = snap.plane.gearDown;
  await press('g');
  await sleep(200);
  snap = await snapshot();
  check('G toggles gear', snap.plane.gearDown !== gear0, `gear=${snap.plane.gearDown}`);
  await press('g');
  await press('f');
  await sleep(200);
  snap = await snapshot();
  check('F toggles flaps', snap.plane.flaps === true, `flaps=${snap.plane.flaps}`);

  console.log('== back to menu ==');
  await press('Escape');
  await sleep(300);
  snap = await snapshot();
  // Esc only works from paused/end screens; pause first.
  if (snap.phase === 'flying') {
    await press('p');
    await sleep(200);
    await press('Escape');
    await sleep(300);
    snap = await snapshot();
  }
  check('Esc returns to title', snap.phase === 'title', snap.phase);

  console.log(failures === 0 ? 'PLAY-TEST ALL PASS' : `PLAY-TEST ${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
}

async function landTest() {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('== start landing mission (key 2) ==');
  await navigate(`${BASE}/index.html?seed=7`);
  await press('2');
  await sleep(500);
  let snap = await snapshot();
  check('landing mission starts', snap.phase === 'flying' && snap.mission === 'landing', JSON.stringify(snap?.phase));
  await press('f'); // flaps out early
  await sleep(200);

  console.log('== autopilot: fly final to runway 27 ==');
  const t0 = Date.now();
  let geared = false;
  let lastLog = 0;
  while (Date.now() - t0 < 90000) {
    snap = await snapshot();
    if (!snap || snap.phase !== 'flying') break;
    const p = snap.plane;
    // Touchdown point: mid-runway (x=300, z=0). Steer heading at the far
    // end of the runway so the plane stays on the centreline, and fly a
    // gentle glide: a vertical-speed controller pulses the pitch keys.
    const distToTD = Math.hypot(p.x - 300, p.z - 0);
    const ground = 6;
    const glide = distToTD > 200 ? 0.08 : 0.045;
    const targetAlt = ground + Math.max(2, distToTD * glide);
    const tSpeed = distToTD > 400 ? 48 : 34;
    // Steer at a point 300 m ahead on the centreline: it pulls the plane
    // onto the runway line and crabs against the crosswind.
    const desired = Math.atan2(-300, -p.z);
    const err = wrapAngle(desired - p.heading);
    await hold('ArrowRight', err > 0.02);
    await hold('ArrowLeft', err < -0.02);
    if (Math.abs(err) < 0.02) {
      await hold('ArrowRight', false);
      await hold('ArrowLeft', false);
    }
    // Vertical speed: descend steeply onto the glide far out, gently near
    // the ground; flare to -1.2 m/s in the last metres above the asphalt.
    const lowFinal = p.alt - ground < 15;
    let desiredVs = clamp(-(p.alt - targetAlt) * 0.35, lowFinal ? -2.5 : -9, 1.5);
    if (p.alt - ground < 6) desiredVs = -1.2;
    const vs = p.verticalSpeed;
    if (vs < desiredVs - 0.8) {
      await keyEvent('keyDown', 'ArrowUp');
      await sleep(90);
      await keyEvent('keyUp', 'ArrowUp');
    } else if (vs > desiredVs + 0.8) {
      await keyEvent('keyDown', 'ArrowDown');
      await sleep(90);
      await keyEvent('keyUp', 'ArrowDown');
    }
    // Near the ground, keep enough speed to fly (never below 30 m/s with
    // the flaps out) and only cut the throttle at the last moment.
    if (distToTD < 200) {
      await hold('w', p.speed < 30);
      await hold('s', p.speed > 38);
      if (p.alt - ground < 3) {
        await hold('w', false);
        await hold('s', true);
      }
    } else if (p.speed < tSpeed - 3) await hold('w', true);
    else if (p.speed > tSpeed + 3) await hold('s', true);
    else {
      await hold('w', false);
      await hold('s', false);
    }
    if (!geared && distToTD < 1200) {
      geared = true;
      snap = await snapshot();
      if (!snap.plane.gearDown) {
        await press('g');
        console.log('  gear down');
      } else {
        console.log('  gear already down');
      }
    }
    if (Date.now() - lastLog > 8000) {
      lastLog = Date.now();
      console.log(
        `  ... x=${Math.round(p.x)} z=${Math.round(p.z)} alt=${Math.round(p.alt)}m spd=${Math.round(p.speed * 1.94)}kt dist=${Math.round(distToTD)}m tgtAlt=${Math.round(targetAlt)}m`,
      );
    }
    await sleep(60);
  }
  await releaseAll();
  snap = await snapshot();
  console.log(`  end: phase=${snap.phase} title=${snap.endTitle} reason=${snap.endReason} score=${snap.score}`);
  check('landed or finished (not crashed)', snap.phase === 'done', `phase=${snap.phase} reason=${snap.endReason}`);
  check('landing scored', snap.score > 0, `score=${snap.score}`);
  check('no page exceptions', pageErrors.length === 0, pageErrors.join(' | '));

  console.log(failures === 0 ? 'LAND-TEST ALL PASS' : `LAND-TEST ${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
}

async function shots() {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  mkdirSync(`${REPO}/screenshots`, { recursive: true });
  const list = [
    ['cover', '1-cover.jpg'],
    ['title', '2-title.jpg'],
    ['landing', '3-landing.jpg'],
    ['storm', '4-storm.jpg'],
  ];
  for (const [shot, name] of list) {
    await navigate(`${BASE}/index.html?shot=${shot}&seed=7`);
    await sleep(700);
    const snap = await snapshot();
    console.log(`${name}: phase=${snap?.phase} mission=${snap?.mission} score=${snap?.score}`);
    const res = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    const buf = Buffer.from(res.data, 'base64');
    writeFileSync(`${REPO}/screenshots/${name}`, buf);
    console.log(`  wrote screenshots/${name} ${buf.length} bytes`);
    if (buf.length > 262144) console.log(`  WARNING: ${name} over the 256 KiB cap`);
  }
}

const mode = process.argv[2];
if (mode === 'play') await playTest();
else if (mode === 'land') await landTest();
else if (mode === 'shots') await shots();
else {
  console.log('usage: node test.mjs play|land|shots');
  process.exit(2);
}
process.exit(process.exitCode ?? 0);
