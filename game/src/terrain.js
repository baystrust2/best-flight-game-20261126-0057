// Sky Courier — the world: a coastal bay with a runway island.
// terrainHeight(x, z) is the ground in metres; the runway strip is flat
// asphalt, the bay is water, fields roll inland and hills rise north.
// Scenery (trees, houses, the windsock, clouds) is placed deterministically
// from the seed so every run of a seed looks the same.
import { makeNoise, clamp } from './random.js';
import { WORLD } from './config.js';

export function createTerrain(seed) {
  const fbm = makeNoise(seed);
  const rw = WORLD.runway;

  function inRunway(x, z) {
    const dx = x - rw.x;
    const dz = z - rw.z;
    return Math.abs(dx) <= rw.length / 2 && Math.abs(dz) <= rw.width / 2;
  }

  function terrainHeight(x, z) {
    if (inRunway(x, z)) return 6; // runway plateau
    // The bay: water south of the shoreline, sloping beach at the edge.
    if (z > WORLD.shorelineZ) {
      const d = z - WORLD.shorelineZ;
      return -4 - Math.min(18, d * 0.02);
    }
    // Flat apron around the runway island.
    const dRunway = Math.hypot(x - rw.x, z - rw.z);
    if (dRunway < 1100) {
      const t = clamp((dRunway - 800) / 300, 0, 1);
      return 6 + t * 8;
    }
    // Fields inland, hills to the north.
    const hill = z < WORLD.hillStartZ ? (-WORLD.hillStartZ - z) / 1400 : 0;
    const n = fbm(x * 0.0009 + 31, z * 0.0009 + 17);
    const base = 8 + n * 26;
    return base + hill * hill * 260 + hill * 40;
  }

  function groundKind(x, z) {
    if (inRunway(x, z)) return 'runway';
    if (z > WORLD.shorelineZ + 40) return 'water';
    if (z > WORLD.shorelineZ - 30) return 'sand';
    const dRunway = Math.hypot(x - rw.x, z - rw.z);
    if (dRunway < 1050) return 'apron';
    const n = fbm(x * 0.0021 + 7, z * 0.0021 + 3);
    if (n > 0.28) return 'forest';
    if (n > 0.12) return 'field2';
    return 'field';
  }

  // Deterministic scenery: trees on the fields, houses near the runway,
  // clouds drifting above the bay.
  const trees = [];
  const houses = [];
  const clouds = [];
  const rand = (() => {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  for (let i = 0; i < 260; i++) {
    const x = (rand() * 2 - 1) * 4200;
    const z = (rand() * 2 - 1) * 4200;
    if (inRunway(x, z) || z > WORLD.shorelineZ) continue;
    const h = terrainHeight(x, z);
    if (h < 4 || h > 120) continue;
    if (groundKind(x, z) === 'forest' || rand() < 0.3) {
      trees.push({ x, z, h, s: 7 + rand() * 9 });
    }
  }
  for (let i = 0; i < 46; i++) {
    const x = 500 + rand() * 1300;
    const z = -500 - rand() * 700;
    if (inRunway(x, z)) continue;
    houses.push({ x, z, h: terrainHeight(x, z), w: 14 + rand() * 10, rot: rand() * Math.PI });
  }
  for (let i = 0; i < 22; i++) {
    clouds.push({
      x: (rand() * 2 - 1) * 4200,
      z: (rand() * 2 - 1) * 4200,
      y: 420 + rand() * 260,
      s: 120 + rand() * 220,
      drift: 2 + rand() * 4,
    });
  }

  return { terrainHeight, groundKind, inRunway, trees, houses, clouds };
}
