// Sky Courier — shared constants and the three sorties.
// All distances in metres, speeds in m/s, angles in radians, altitude in
// metres above sea level. The world is a coastal bay: a flat island strip
// holds runway 27, hills rise to the north, open water to the south.
export const WORLD = {
  size: 9000, // world spans -4500..4500 on x and z
  seaLevel: 0,
  runway: {
    // Runway 27: heading 270 deg, centred at x=0, z=0, pointing west (-x).
    // Heading is measured from +z: west is -PI/2.
    x: 0,
    z: 0,
    heading: -Math.PI / 2, // west, i.e. -x in world space
    length: 1400,
    width: 46,
    headingDeg: 270,
  },
  // The bay: water where z > shoreline(x); beach and fields inland.
  shorelineZ: 900,
  // Hills rise north of z < -600.
  hillStartZ: -600,
};

export const PLANE = {
  stallSpeed: 26, // m/s: below this the wing stops flying
  maxSpeed: 95, // m/s at full throttle, level
  cruiseSpeed: 62,
  climbRateMax: 9, // m/s at full throttle, best climb
  rollRate: 1.5, // rad/s at full stick
  pitchRate: 0.85, // rad/s at full stick
  turnFactor: 9.81, // turn rate = g * tan(roll) / speed
  fuelCapacity: 100, // percent
  fuelBurnBase: 0.055, // %/s at idle
  fuelBurnFull: 0.34, // %/s extra at full throttle
  damageHardLanding: 34, // damage on a hard touchdown
  maxDamage: 100,
};

// Ring geometry: a ring is a glowing circle you fly through.
export const RING = { radius: 40, passTol: 1.2 };

export const MISSIONS = [
  {
    id: 'rings',
    key: '1',
    name: 'RING RUN',
    tag: 'Thread all 8 rings over the bay',
    detail:
      'Eight glowing rings hang over Meridian Bay. Fly through them in order before your fuel runs dry. Full power burns fuel fast, and a stalled wing will not turn.',
    fuel: 100,
    wind: 0,
    rain: false,
    start: { x: 1600, z: 2400, alt: 260, heading: 3.52, speed: 58 },
    rings: 'bay',
    landing: false,
    timeLimit: 240,
  },
  {
    id: 'landing',
    key: '2',
    name: 'PRECISION LANDING',
    tag: 'Bring her home onto runway 27',
    detail:
      'You are on final approach, 1,900 m out and 200 m up. Set the flaps, drop the gear, hold 55–65 kt over the threshold and touch down soft on the centreline.',
    fuel: 100,
    wind: 4,
    rain: false,
    start: { x: 1900, z: 60, alt: 200, heading: -Math.PI / 2, speed: 62 },
    rings: null,
    landing: true,
    timeLimit: 300,
  },
  {
    id: 'storm',
    key: '3',
    name: 'STORM COURIER',
    tag: 'Deliver the mail through the squall',
    detail:
      'A squall line is crossing the bay and the mail still has to fly. Six rings in gusting crosswind and rain, and only 55% fuel in the tanks.',
    fuel: 55,
    wind: 11,
    rain: true,
    start: { x: 1600, z: 2400, alt: 300, heading: 3.52, speed: 58 },
    rings: 'storm',
    landing: true,
    timeLimit: 300,
  },
];

export const SCORE = {
  ring: 100,
  ringTimeBonusPerSec: 4,
  landingBase: 300,
  landingSoftBonus: 200,
  landingCentreBonus: 100,
  fuelBonusPerPct: 2,
};
