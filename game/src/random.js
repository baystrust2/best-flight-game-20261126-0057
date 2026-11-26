// Sky Courier — deterministic randomness.
// One mulberry32 stream per seed, plus a tiny value-noise heightfield so
// the terrain, ring course and weather are the same every run of a seed.
// Screenshots and play-tests use seed 7.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise in [-1, 1], deterministic from integer lattice.
export function makeNoise(seed) {
  const rand = mulberry32(seed * 7919 + 13);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const grad = (h, x, z) => {
    const u = h < 8 ? x : z;
    const v = h < 4 ? z : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise2(x, z) {
    const xi = Math.floor(x) & 255;
    const zi = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(zf);
    const aa = grad(perm[perm[xi] + zi], xf, zf);
    const ba = grad(perm[perm[xi + 1] + zi], xf - 1, zf);
    const ab = grad(perm[perm[xi] + zi + 1], xf, zf - 1);
    const bb = grad(perm[perm[xi + 1] + zi + 1], xf - 1, zf - 1);
    const x1 = aa + (ba - aa) * u;
    const x2 = ab + (bb - ab) * u;
    return (x1 + (x2 - x1) * v) * 0.7;
  }
  return function fbm(x, z) {
    return (
      noise2(x, z) * 0.55 + noise2(x * 2.13, z * 2.13) * 0.3 + noise2(x * 4.7, z * 4.7) * 0.15
    );
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function deg(rad) {
  return (rad * 180) / Math.PI;
}
