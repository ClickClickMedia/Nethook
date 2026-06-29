// Solunar + lunar model — pure math, no I/O, no Date.now(). Everything is a
// function of an epoch-millisecond timestamp PASSED IN (the live clock is read
// once at the index.mjs boundary and handed to newGame), so reducers stay pure
// and runs stay reproducible.
//
// This is a deliberately lightweight approximation of solunar theory (major/
// minor feeding periods tied to the moon): we model moon phase from the synodic
// month and treat feeding as strongest around the new and full moon, weakest at
// the quarters. It is "flavour-grade" realism — enough to make date matter — not
// an ephemeris. See docs/RESEARCH.md §5.1 for the grounding and its limits.

const SYNODIC = 29.530588853; // mean synodic month, days
const MS_PER_DAY = 86400000;
// A reference new moon: 2000-01-06 18:14 UTC (a standard astronomical epoch).
export const REF_NEW_MOON_MS = 947182440000;

// Age of the moon in days since the last new moon (0 .. ~29.53).
export function moonAgeDays(ms) {
  let age = ((ms - REF_NEW_MOON_MS) / MS_PER_DAY) % SYNODIC;
  if (age < 0) age += SYNODIC;
  return age;
}

// Phase as a 0..1 fraction of the synodic month (0 = new, 0.5 = full).
export function moonPhase(ms) {
  return moonAgeDays(ms) / SYNODIC;
}

// Illuminated fraction of the disc, 0 (new) .. 1 (full).
export function moonIllumination(ms) {
  return (1 - Math.cos(2 * Math.PI * moonPhase(ms))) / 2;
}

// Solunar feeding strength, 0..1: strongest at new & full moon (illumination at
// its extremes), weakest at the quarters. A single, honest scalar the engine
// folds into bite odds.
export function solunarScore(ms) {
  return Math.abs(moonIllumination(ms) - 0.5) * 2;
}

// A coarse seasonal water-temperature model (°C) around a spot's annual mean.
// Packs can supply their own mean via hints.baseTemp (e.g. a tropical flat vs a
// glacial fjord); otherwise a temperate ~14 °C is assumed.
export function seasonBaseTemp(season, base = 14) {
  const delta = { winter: -8, spring: -1, summer: 8, autumn: 1 }[season] ?? 0;
  return base + delta;
}
