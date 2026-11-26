// Sky Courier — the ring courses.
// Rings hang over the bay in a slalom that sweeps past the runway island
// and back; the storm course is lower, tighter and flown in crosswind.
// A ring is passed when the plane crosses its plane within its radius.
import { mulberry32 } from './random.js';
import { RING } from './config.js';

function buildCourse(seed, kind) {
  const rand = mulberry32(seed * 31 + (kind === 'storm' ? 7 : 3));
  const rings = [];
  if (kind === 'storm') {
    // Six low rings weaving across the bay, ending on final for runway 27.
    const pts = [
      [900, 1900, 200],
      [300, 1300, 170],
      [-500, 1500, 190],
      [-1100, 900, 150],
      [-700, 300, 120],
      [400, 200, 90],
    ];
    for (const [x, z, alt] of pts) rings.push({ x, z, alt, passed: false });
    return rings;
  }
  // Bay slalom: eight rings, altitudes 120–320 m, sweeping east to west.
  const pts = [
    [1400, 1900, 240],
    [700, 1500, 200],
    [100, 1900, 260],
    [-600, 1400, 180],
    [-1300, 1700, 240],
    [-1600, 900, 160],
    [-900, 500, 220],
    [200, 600, 150],
  ];
  for (const [x, z, alt] of pts) {
    const jx = (rand() - 0.5) * 60;
    const jz = (rand() - 0.5) * 60;
    rings.push({ x: x + jx, z: z + jz, alt, passed: false });
  }
  return rings;
}

export function createRings(seed, kind, startPos) {
  const rings = buildCourse(seed, kind);
  let next = 0;

  return {
    rings,
    get nextIndex() {
      return next;
    },
    setNext(i) {
      next = Math.max(0, Math.min(i, rings.length));
      for (let k = 0; k < rings.length; k++) rings[k].passed = k < next;
    },
    get done() {
      return next >= rings.length;
    },
    get remaining() {
      return rings.length - next;
    },
    nextRing() {
      return rings[next] ?? null;
    },
    // Returns the ring just passed, or null. The plane passes a ring when
    // it crosses the ring's plane (its z in ring-local space changes sign
    // while within the radius) — approximated by a 3D distance gate plus a
    // forward-crossing test against the ring's facing.
    checkPass(px, pz, alt, prevX, prevZ, prevAlt, heading) {
      const ring = rings[next];
      if (!ring) return null;
      // The ring faces the plane's approach: its normal points along the
      // course direction (from previous ring, or the sortie start, to this one).
      const prev = rings[next - 1] ?? startPos ?? { x: px + Math.sin(heading) * 500, z: pz + Math.cos(heading) * 500 };
      const nx = ring.x - prev.x;
      const nz = ring.z - prev.z;
      const len = Math.hypot(nx, nz) || 1;
      const before = (prevX - ring.x) * (nx / len) + (prevZ - ring.z) * (nz / len);
      const after = (px - ring.x) * (nx / len) + (pz - ring.z) * (nz / len);
      if (before <= 0 && after > 0) {
        // Crossed the ring's plane: count it if the crossing point is
        // inside the ring (plus a small margin for a frame's travel).
        const dx = px - ring.x;
        const dz = pz - ring.z;
        const da = alt - ring.alt;
        const dist = Math.hypot(dx, dz, da);
        if (dist <= RING.radius * RING.passTol) {
          ring.passed = true;
          next++;
          return ring;
        }
      }
      return null;
    },
    reset() {
      for (const r of rings) r.passed = false;
      next = 0;
    },
  };
}
