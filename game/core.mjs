// Pure game core: state + step(state, action) -> state. No terminal I/O, no
// disk, no timers — every transition is deterministic given state.rngState, so
// the whole game is verifiable headlessly (see selftest.mjs).

import { seedFrom, rand, randint, pick } from "./rng.mjs";
import { buildWorld, tileAt, tileHabitat, isWater, isWalkable, TILE } from "./world.mjs";
import { RARITY, RODS, BAITS } from "./fish.mjs";
import { solunarScore, seasonBaseTemp } from "./solunar.mjs";

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

const MAX_MESSAGES = 6;
const DEFAULT_DAYLIGHT = 90;

// Environment gating axes (RESEARCH.md §4.6). A trip is rolled one season + one
// weather; the day-phase moves with the daylight clock. Spot Pack species may
// gate themselves to any of these (plus a preferred bait), giving packs huge
// content leverage without engine changes. Pools are the engine defaults; a
// pack can narrow them via hints.seasons / hints.weather.
export const SEASONS = ["spring", "summer", "autumn", "winter"];
export const WEATHERS = ["clear", "cloudy", "rain", "fog", "wind"];

// Day-phase from the daylight clock: golden hours at the ends, plain day mid-trip.
export function phaseOf(time) {
  const f = time && time.maxTurns ? time.turn / time.maxTurns : 0;
  if (f < 0.2) return "dawn";
  if (f >= 0.8) return "dusk";
  return "day";
}

function envOf(s) {
  return { phase: phaseOf(s.time), season: s.season, weather: s.weather };
}

// A gate field is a list of allowed tokens; missing or containing "any" means
// unrestricted. Kept tolerant so a sloppy pack degrades to "always allowed".
function gateList(v) {
  if (v == null) return null;
  const arr = Array.isArray(v) ? v : [v];
  const out = arr.map((x) => String(x).toLowerCase()).filter(Boolean);
  if (!out.length || out.includes("any")) return null;
  return out;
}
function gateOk(list, value) {
  return !list || list.includes(String(value).toLowerCase());
}
export function isSpeciesAllowed(sp, env) {
  return (
    gateOk(gateList(sp.time), env.phase) &&
    gateOk(gateList(sp.season), env.season) &&
    gateOk(gateList(sp.weather), env.weather)
  );
}

function sanitizePool(raw, fallback) {
  if (!Array.isArray(raw)) return fallback;
  const out = raw.map((x) => String(x).toLowerCase()).filter((x) => fallback.includes(x));
  return out.length ? out : fallback;
}
function phaseBite(phase) {
  return phase === "dawn" || phase === "dusk" ? 0.1 : 0; // golden hours
}
function weatherBite(w) {
  return { rain: 0.05, cloudy: 0.03, fog: 0.02, clear: 0, wind: -0.03 }[w] ?? 0;
}
// Solunar feeding nudges the bite a touch either way; null score = no effect.
function solunarBite(score) {
  return isNum(score) ? (score - 0.5) * 0.18 : 0;
}
// How suitable a spot's water temperature is for a species, 0.15..1. A species
// without a stated optimum is unaffected (returns 1).
export function tempSuit(sp, temp) {
  if (!isNum(sp.tempOptimum) || !isNum(temp)) return 1;
  const span = isNum(sp.tempRange) && sp.tempRange > 0 ? sp.tempRange : 6;
  return Math.max(0.15, Math.min(1, 1 - Math.abs(temp - sp.tempOptimum) / span));
}

export function emptyLogbook() {
  return {
    version: 1,
    dex: {},
    totals: { caught: 0, weight: 0, trips: 0, casts: 0, trophies: 0, aberrations: 0 },
    bestScore: 0,
    gear: { rodLevel: 0, baitLevel: 0, coins: 0, crabPot: false, potLevel: 0 },
    rewards: { goldenRod: false },
    lastPlayed: 0, // epoch ms, stamped by index.mjs — drives idle crab-pot accrual
  };
}

export function newGame({ seed = "nethook", pack = null, logbook = null, env = null } = {}) {
  const lb = logbook || emptyLogbook();
  const seedState = { rngState: seedFrom(seed) };
  const world = buildWorld(seedState, pack);
  const speciesById = Object.fromEntries(world.species.map((s) => [s.id, s]));

  // Roll this trip's season + weather from the (continuing) rng stream, narrowed
  // by any pack hints. Deterministic given the seed, like everything else.
  const hints = (pack && pack.hints) || {};
  const season = pick(seedState, sanitizePool(hints.seasons, SEASONS));
  const weather = pick(seedState, sanitizePool(hints.weather, WEATHERS));

  // Grounded environment (RESEARCH.md §5.1). `env` is supplied by the caller
  // (index.mjs reads the real clock and passes env.dateMs) so reducers stay
  // pure. Water temp comes from the season around the spot's annual mean;
  // solunar feeding strength comes from the moon phase on the trip's date.
  const baseTemp = isNum(hints.baseTemp) ? hints.baseTemp : 14;
  const waterTemp = env && isNum(env.waterTemp) ? env.waterTemp : seasonBaseTemp(season, baseTemp);
  const solunar = env && isNum(env.dateMs) ? solunarScore(env.dateMs)
    : env && isNum(env.solunar) ? env.solunar
      : null; // null = unknown → neutral, no effect on the bite

  const bounties = rollBounties(seedState, world, lb); // two feasible per-trip goals

  return {
    seed,
    rngState: seedState.rngState, // continue the same stream
    world,
    speciesById,
    season,
    weather,
    waterTemp: Math.round(waterTemp * 10) / 10,
    solunar,
    bounties,
    player: { ...world.playerStart },
    time: { turn: 0, maxTurns: DEFAULT_DAYLIGHT },
    inventory: {
      rodLevel: lb.gear.rodLevel | 0,
      baitLevel: lb.gear.baitLevel | 0,
      coins: lb.gear.coins | 0,
    },
    caught: [],
    score: 0,
    messages: [`Welcome to ${world.spotName}. Daylight is burning — cast a line!`],
    mode: "explore", // explore | reel | shop | gameover | quit
    reel: null,
    logbook: lb,
    claudeStatus: null, // "working" | "done" | null
  };
}

export function rod(state) {
  return RODS[Math.min(state.inventory.rodLevel, RODS.length - 1)];
}
export function bait(state) {
  return BAITS[Math.min(state.inventory.baitLevel, BAITS.length - 1)];
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function msg(s, text) {
  s.messages = [...s.messages, text].slice(-MAX_MESSAGES);
}

export function step(state, action) {
  const s = structuredClone(state);
  // structuredClone drops nothing we need; speciesById is plain data.
  switch (action.type) {
    case "move": return doMove(s, action.dx, action.dy);
    case "cast": return doCast(s, action.dx, action.dy);
    case "reel": return doReel(s, "reel");
    case "ease": return doReel(s, "ease");
    case "strain": return doReel(s, "strain");
    case "openShop": return openShop(s);
    case "buyRod": return buy(s, "rod");
    case "buyBait": return buy(s, "bait");
    case "buyPot": return buyPot(s);
    case "collectPot": return collectPot(s, action.seconds);
    case "closeShop": s.mode = "explore"; return s;
    case "wait": return advanceTurn(s);
    case "claudeStatus": s.claudeStatus = action.status; return s;
    case "quit": s.mode = "quit"; return s;
    default: return s;
  }
}

function doMove(s, dx, dy) {
  if (s.mode !== "explore") return s;
  const nx = s.player.x + dx, ny = s.player.y + dy;
  const t = tileAt(s.world, nx, ny);
  if (t && isWalkable(t)) {
    s.player.x = nx;
    s.player.y = ny;
    if (t === TILE.SHOP) msg(s, "A weathered shanty. Press $ to trade.");
    driftFish(s);
    return advanceTurn(s);
  }
  if (t && isWater(t)) msg(s, "That's water. Press f then a direction to fish it.");
  return s;
}

function doCast(s, dx, dy) {
  if (s.mode !== "explore") return s;
  const tx = s.player.x + dx, ty = s.player.y + dy;
  const t = tileAt(s.world, tx, ty);
  const hab = t ? tileHabitat(t) : null;
  if (!t || !isWater(t) || !hab) {
    msg(s, "Nothing to fish that way.");
    return s;
  }
  s.logbook.totals.casts++;
  const onTile = s.world.fish.find((f) => f.x === tx && f.y === ty) || null;

  let biteChance =
    0.5 + rod(s).biteBonus + bait(s).biteBonus + phaseBite(phaseOf(s.time)) + weatherBite(s.weather) + solunarBite(s.solunar);
  if (onTile) biteChance += 0.25; // you can see it rising
  biteChance = clamp(biteChance, 0.05, 0.95);

  const bit = rand(s) < biteChance;
  if (!bit) {
    msg(s, "Not even a nibble.");
    return advanceTurn(s);
  }

  const species = onTile ? s.speciesById[onTile.speciesId] : chooseSpecies(s, hab);
  if (!species) {
    msg(s, "Something brushed the line, then nothing.");
    return advanceTurn(s);
  }
  const aberrant = !species.junk && rand(s) < aberrationChance(s);
  s.reel = makeReel(s, species, tx, ty, aberrant);
  s.mode = "reel";
  if (aberrant) msg(s, `Something's WRONG with this one… (${species.name}) — ${REEL_HINTS[s.reel.mode]}`);
  else msg(s, `Something's on! (${species.name}) — ${REEL_HINTS[s.reel.mode]}`);
  return advanceTurn(s);
}

function chooseSpecies(s, hab) {
  const env = envOf(s);
  const b = bait(s);
  const rareBoost = b.rareBonus;
  const candidates = s.world.species
    .filter((sp) => (sp.habitat === "any" || sp.habitat === hab) && isSpeciesAllowed(sp, env))
    .map((sp) => {
      let w = RARITY[sp.rarity].weight;
      if (sp.rarity !== "common" && sp.rarity !== "uncommon") w *= 1 + rareBoost;
      if (sp.junk) w *= 0.5;
      if (Array.isArray(sp.bait) && sp.bait.map(String).includes(b.id)) w *= 2; // preferred bait
      w *= tempSuit(sp, s.waterTemp); // cold/warm-water species favour their range
      return { sp, w };
    });
  const total = candidates.reduce((a, c) => a + c.w, 0);
  if (total <= 0) return null;
  let roll = rand(s) * total;
  for (const c of candidates) {
    roll -= c.w;
    if (roll < 0) return c.sp;
  }
  return candidates[candidates.length - 1].sp;
}

// ── reel minigame variety ─────────────────────────────────────────────────
// Three deterministic minigames share one control scheme (reel / ease, plus the
// live timer's `strain` tick) so the live wiring never changes:
//   steady   — classic rising-tension haul; ease to bleed it (the original)
//   surge    — the fish runs in bursts; reeling mid-run spikes tension, so you
//              must ease while it RUNS and reel only when the line goes slack
//   pendulum — a lure sweeps a track; reel only while it sits in the green zone
// Mode is picked once per hookup from the rng stream, weighted by rarity, so it
// stays reproducible and headlessly testable. A reel built without a `mode`
// field falls back to steady (keeps older saves / hand-built test states valid).
export const REEL_HINTS = {
  steady: "[r]eel steadily, [e]ase to bleed tension",
  surge: "[e]ase when it RUNS, [r]eel when it goes slack",
  pendulum: "[r]eel only when the lure is in the zone",
};

function chooseReelMode(s, sp) {
  if (sp.junk) return "steady";
  const tier = RARITY[sp.rarity].mult;
  const r = rand(s);
  if (tier <= 1) return r < 0.78 ? "steady" : "surge";
  if (tier <= 2) return r < 0.45 ? "steady" : r < 0.8 ? "surge" : "pendulum";
  return r < 0.25 ? "steady" : r < 0.58 ? "surge" : "pendulum"; // rare+ fight dirtier
}

// Aberrations (DREDGE corrupted variants; RESEARCH.md §4.4, §7): eerie mutant
// fish that surface mostly at low light / in murk. Tougher fight, richer reward.
function aberrationChance(s) {
  const phase = phaseOf(s.time);
  let base = phase === "dusk" ? 0.1 : phase === "dawn" ? 0.06 : 0.03;
  if (s.weather === "fog" || s.weather === "storm") base += 0.04;
  return base;
}

function makeReel(s, sp, tx, ty, aberrant = false) {
  const mode = chooseReelMode(s, sp);
  const reel = {
    speciesId: sp.id, targetX: tx, targetY: ty,
    stamina: sp.strength + (aberrant ? 2 : 0), maxStamina: sp.strength + (aberrant ? 2 : 0),
    tension: 0, maxTension: 100, mode, aberrant,
    running: false, pos: 0, vel: 0, zoneLo: 0, zoneHi: 0,
  };
  if (mode === "pendulum") {
    reel.pos = randint(s, 0, 100);
    reel.vel = randint(s, 6, 11) * (rand(s) < 0.5 ? 1 : -1);
    const span = clamp(32 - sp.strength * 2, 14, 30); // harder fish = narrower zone
    reel.zoneLo = randint(s, 0, 100 - span);
    reel.zoneHi = reel.zoneLo + span;
  }
  reel.slack = 0;
  reel.maxSlack = 100;
  return reel;
}

// Two-sided tension band, faithful to Sega Bass Fishing (RESEARCH.md §4.1): the
// line snaps at MAX tension, but it also goes SLACK and the hook slips if you let
// tension sit too LOW while the fish is still green. The strain tick (the fish
// fighting) builds slack when the line is slack and bleeds it when you keep
// pressure on — so "ease and coast" is no longer a free win; you must keep
// tension in the safe mid-band. Brief dips are fine; sustained slack loses the fish.
const LOW_TENSION = 18;
function applySlack(s, sp) {
  if (s.reel.tension < LOW_TENSION) {
    s.reel.slack = (s.reel.slack || 0) + 7 + Math.floor(sp.strength * 0.8);
  } else {
    s.reel.slack = Math.max(0, (s.reel.slack || 0) - 12);
  }
}

function doReel(s, kind) {
  if (s.mode !== "reel" || !s.reel) return s;
  const sp = s.speciesById[s.reel.speciesId];
  const m = s.reel.mode || "steady";
  if (m === "surge") surgeReel(s, sp, kind);
  else if (m === "pendulum") pendulumReel(s, sp, kind);
  else steadyReel(s, sp, kind);
  if (kind === "strain") applySlack(s, sp); // the fish works the slack while it fights
  return resolveReel(s, sp);
}

function steadyReel(s, sp, kind) {
  if (kind === "reel") {
    s.reel.stamina = Math.max(0, s.reel.stamina - 1);
    s.reel.tension += 14 + sp.strength * 2 - rod(s).tensionEase;
  } else if (kind === "ease") {
    s.reel.tension = Math.max(0, s.reel.tension - (18 + rod(s).tensionEase));
  } else if (kind === "strain") {
    // emitted by the live timer to create urgency; not used in headless tests
    s.reel.tension += Math.ceil(sp.strength * 1.2);
  }
}

function surgeReel(s, sp, kind) {
  if (kind === "strain") {
    if (s.reel.running) {
      s.reel.tension += Math.ceil(sp.strength * 1.5);
      if (rand(s) < 0.4) s.reel.running = false; // the run peters out
    } else if (rand(s) < 0.22 + sp.strength * 0.03) {
      s.reel.running = true; // it bolts
    }
  } else if (kind === "reel") {
    s.reel.stamina = Math.max(0, s.reel.stamina - 1); // reeling always works it down
    s.reel.tension += s.reel.running
      ? 20 + sp.strength * 3 - rod(s).tensionEase // horsing a running fish: dangerous
      : Math.max(0, 8 + sp.strength - rod(s).tensionEase); // slack: cheap line
  } else if (kind === "ease") {
    s.reel.tension = Math.max(0, s.reel.tension - (16 + rod(s).tensionEase));
    if (s.reel.running && rand(s) < 0.5) s.reel.running = false; // giving line calms it
  }
}

function pendulumReel(s, sp, kind) {
  if (kind === "strain") {
    let pos = s.reel.pos + s.reel.vel;
    if (pos >= 100) { pos = 100; s.reel.vel = -Math.abs(s.reel.vel); }
    if (pos <= 0) { pos = 0; s.reel.vel = Math.abs(s.reel.vel); }
    s.reel.pos = pos;
    s.reel.tension += Math.ceil(sp.strength * 0.6); // it pulls steadily
  } else if (kind === "reel") {
    const inZone = s.reel.pos >= s.reel.zoneLo && s.reel.pos <= s.reel.zoneHi;
    if (inZone) {
      s.reel.stamina = Math.max(0, s.reel.stamina - 1);
      s.reel.tension += Math.max(0, 6 + sp.strength - rod(s).tensionEase);
    } else {
      s.reel.tension += 16 + sp.strength * 2 - rod(s).tensionEase; // mistimed: spike
    }
  } else if (kind === "ease") {
    s.reel.tension = Math.max(0, s.reel.tension - (16 + rod(s).tensionEase));
  }
}

function resolveReel(s, sp) {
  if (s.reel.tension >= s.reel.maxTension) {
    msg(s, `The line SNAPS! The ${sp.name} got away.`);
    s.mode = "explore";
    s.reel = null;
    return s;
  }
  if ((s.reel.slack || 0) >= (s.reel.maxSlack || 100)) {
    msg(s, `The line goes SLACK — the ${sp.name} shakes the hook!`);
    s.mode = "explore";
    s.reel = null;
    return s;
  }
  if (s.reel.stamina <= 0) return landFish(s, sp);
  return s;
}

// Catch grades, terminal-fish style: a letter rank by how big the specimen is
// for its species (fraction of the species' max weight). F (runt) → SSS (record).
export const GRADE_ORDER = ["F", "D", "C", "B", "A", "S", "SS", "SSS"];
export function gradeFor(frac) {
  if (frac >= 0.97) return "SSS";
  if (frac >= 0.92) return "SS";
  if (frac >= 0.85) return "S";
  if (frac >= 0.72) return "A";
  if (frac >= 0.58) return "B";
  if (frac >= 0.42) return "C";
  if (frac >= 0.25) return "D";
  return "F";
}
function gradeRank(g) {
  return g ? GRADE_ORDER.indexOf(g) : -1;
}

// Per-trip bounties (RESEARCH.md §1.1 "resource management"/goals; replayability):
// two small goals rolled each trip that pay a coin+score bonus on completion, so
// every launch has a fresh objective beyond raw score. Pure: rolled from the rng
// stream, evaluated against each catch. Test predicates live here (functions can't
// ride on cloned state); only {id,desc,reward,done} is stored on the trip.
// Each bounty has a `test` (did this catch complete it?) and a `feasible` check
// (can this spot/logbook satisfy it at all?). rollBounties only ever offers
// feasible goals, so you never get "land a 5kg fish" at a spot whose biggest
// fish is a 1kg perch. trophy/aberration/fivecatch are always possible, so there
// are always at least three candidates to draw two from.
const BOUNTIES = [
  { id: "rare", desc: "Land a rare-or-better fish", reward: 30,
    test: (c) => RARITY[c.rarity].mult >= 5 && !c.junk,
    feasible: (w) => w.species.some((sp) => !sp.junk && RARITY[sp.rarity].mult >= 5) },
  { id: "trophy", desc: "Land a trophy catch", reward: 35,
    test: (c) => !!c.trophy, feasible: () => true },
  { id: "aberration", desc: "Hook an aberration", reward: 45,
    test: (c) => !!c.aberrant, feasible: () => true },
  { id: "lunker", desc: "Land a fish over 5kg", reward: 30,
    test: (c) => c.weight >= 5,
    feasible: (w) => w.species.some((sp) => !sp.junk && sp.weightRange[1] >= 5) },
  { id: "newdex", desc: "Log a new species", reward: 25,
    test: (c, s) => s.logbook.dex[c.speciesId] && s.logbook.dex[c.speciesId].count === 1,
    feasible: (w, lb) => w.species.some((sp) => !sp.junk && !(lb.dex[sp.id] && lb.dex[sp.id].count > 0)) },
  { id: "fivecatch", desc: "Land 5 fish this trip", reward: 25,
    test: (c, s) => s.caught.length >= 5, feasible: () => true },
];
const BOUNTY_TEST = Object.fromEntries(BOUNTIES.map((b) => [b.id, b.test]));

function rollBounties(seedState, world, lb) {
  const pool = BOUNTIES.filter((b) => b.feasible(world, lb));
  const out = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    const [t] = pool.splice(Math.floor(rand(seedState) * pool.length), 1);
    out.push({ id: t.id, desc: t.desc, reward: t.reward, done: false });
  }
  return out;
}

function checkBounties(s, entry) {
  if (!s.bounties) return;
  for (const b of s.bounties) {
    if (b.done) continue;
    const test = BOUNTY_TEST[b.id];
    if (test && test(entry, s)) {
      b.done = true;
      s.inventory.coins += b.reward;
      s.score += b.reward;
      msg(s, `✔ Bounty complete: ${b.desc}! +${b.reward}c`);
    }
  }
}

function landFish(s, sp) {
  const aberrant = !!(s.reel && s.reel.aberrant);
  const [lo, hi] = sp.weightRange;
  const weight = Math.round((lo + rand(s) * (hi - lo)) * 100) / 100;
  const frac = hi > 0 ? weight / hi : 1;
  const grade = gradeFor(frac);
  // Trophy: a top-of-range specimen (top ~15% by size, DREDGE's "Trophy") or a
  // rare gold strike — worth a +25% value bonus and a permanent logbook mark.
  const trophy = !sp.junk && (frac >= 0.85 || rand(s) < 0.02);
  const name = aberrant ? `Aberrant ${sp.name}` : sp.name;
  let points = Math.max(1, Math.round(weight * RARITY[sp.rarity].mult * 10));
  if (trophy) points = Math.round(points * 1.25);
  if (aberrant) points = Math.round(points * 1.6); // corrupted flesh, oddly prized
  const entry = { speciesId: sp.id, name, weight, points, rarity: sp.rarity, grade, trophy, aberrant };
  s.caught.push(entry);
  s.score += points;
  s.inventory.coins += points;
  recordCatch(s.logbook, sp, weight, grade, trophy, aberrant);
  checkBounties(s, entry);
  // remove the visible fish, if any, from the target tile
  s.world.fish = s.world.fish.filter((f) => !(f.x === s.reel.targetX && f.y === s.reel.targetY));
  if (aberrant) {
    msg(s, `🜂 ABERRATION — ${name}, ${weight}kg [${grade}]!  +${points} pts`);
  } else if (trophy) {
    msg(s, `🏆 TROPHY ${sp.name} — ${weight}kg, grade ${grade}! +${points} pts`);
  } else {
    const tag = sp.junk ? "Fished up" : "LANDED";
    msg(s, `${tag} a ${sp.name} — ${weight}kg [${grade}]  +${points} pts`);
  }
  checkDexReward(s);
  s.mode = "explore";
  s.reel = null;
  return s;
}

// AC:NH "complete the Critterpedia → golden rod" loop: catch every non-junk
// species available at the current spot and the Golden Rod is granted once,
// persisted in the logbook so it carries across trips. Pure; no I/O.
function checkDexReward(s) {
  if (s.logbook.rewards && s.logbook.rewards.goldenRod) return;
  const need = s.world.species.filter((sp) => !sp.junk);
  if (!need.length) return;
  const complete = need.every((sp) => s.logbook.dex[sp.id] && s.logbook.dex[sp.id].count > 0);
  if (!complete) return;
  s.logbook.rewards = { ...(s.logbook.rewards || {}), goldenRod: true };
  const gi = RODS.findIndex((r) => r.reward);
  if (gi >= 0 && s.inventory.rodLevel < gi) {
    s.inventory.rodLevel = gi;
    syncGear(s);
  }
  msg(s, `🎣✨ LOGBOOK COMPLETE for ${s.world.spotName}! The Golden Rod is yours.`);
}

export function recordCatch(logbook, sp, weight, grade = null, trophy = false, aberrant = false) {
  const d = logbook.dex[sp.id] || { name: sp.name, count: 0, bestWeight: 0, rarity: sp.rarity, bestGrade: null, trophies: 0, aberrations: 0, junk: !!sp.junk };
  d.count++;
  d.bestWeight = Math.max(d.bestWeight, weight);
  if (grade && gradeRank(grade) > gradeRank(d.bestGrade)) d.bestGrade = grade;
  if (trophy) d.trophies = (d.trophies || 0) + 1;
  if (aberrant) d.aberrations = (d.aberrations || 0) + 1;
  logbook.dex[sp.id] = d;
  logbook.totals.caught++;
  logbook.totals.weight = Math.round((logbook.totals.weight + weight) * 100) / 100;
  if (trophy) logbook.totals.trophies = (logbook.totals.trophies || 0) + 1;
  if (aberrant) logbook.totals.aberrations = (logbook.totals.aberrations || 0) + 1;
}

function openShop(s) {
  if (tileAt(s.world, s.player.x, s.player.y) !== TILE.SHOP) {
    msg(s, "You need to be at the shanty ($) to trade.");
    return s;
  }
  s.mode = "shop";
  msg(s, "Shanty: [1] upgrade rod  [2] upgrade bait  [q/esc] leave");
  return s;
}

function buy(s, kind) {
  if (s.mode !== "shop") return s;
  if (kind === "rod") {
    const next = RODS[s.inventory.rodLevel + 1];
    if (!next || next.reward) return (msg(s, "Best rod for sale already in hand."), s);
    if (s.inventory.coins < next.price) return (msg(s, `Need ${next.price} coins for the ${next.name}.`), s);
    s.inventory.coins -= next.price;
    s.inventory.rodLevel++;
    msg(s, `Upgraded to the ${next.name}!`);
  } else {
    const next = BAITS[s.inventory.baitLevel + 1];
    if (!next) return (msg(s, "Best bait already stocked."), s);
    if (s.inventory.coins < next.price) return (msg(s, `Need ${next.price} coins for ${next.name}.`), s);
    s.inventory.coins -= next.price;
    s.inventory.baitLevel++;
    msg(s, `Stocked up on ${next.name}!`);
  }
  syncGear(s);
  return s;
}

function syncGear(s) {
  s.logbook.gear = {
    rodLevel: s.inventory.rodLevel,
    baitLevel: s.inventory.baitLevel,
    coins: s.inventory.coins,
    crabPot: !!(s.logbook.gear && s.logbook.gear.crabPot),
    potLevel: (s.logbook.gear && s.logbook.gear.potLevel) | 0,
  };
}

// The crab pot is also the late-game COIN SINK: after gear is maxed there's
// always something to pour coins into. First purchase deploys it (80c); each
// upgrade doubles the cost and grows the idle haul — an open-ended spend.
export function potCost(level) {
  return 80 * Math.pow(2, level | 0);
}

function buyPot(s) {
  if (s.mode !== "shop") return s;
  const lvl = (s.logbook.gear && s.logbook.gear.potLevel) | 0;
  const cost = potCost(lvl);
  if (s.inventory.coins < cost) return (msg(s, `Need ${cost} coins to ${lvl ? "upgrade" : "deploy"} the crab pot.`), s);
  s.inventory.coins -= cost;
  s.logbook.gear = { ...s.logbook.gear, crabPot: true, potLevel: lvl + 1 };
  syncGear(s);
  msg(s, lvl ? `Crab pot upgraded to Mk ${lvl + 1} — bigger hauls while you're away.` : "Crab pot deployed — it'll fill with a little catch while you're away.");
  return s;
}

// Idle accrual + freshness decay (RESEARCH.md §7). A deployed crab pot yields
// coins for the real time elapsed since you last played (passed IN as seconds —
// the clock is read in index.mjs, never here). The yield fills toward a cap;
// past it the catch goes Stale then Rotting, so leaving it for a week is worse
// than collecting regularly — which both rewards return visits and caps farming.
const POT_FILL_SECONDS = 6 * 3600; // a pot brims after ~6 hours away
export function collectPot(s, seconds) {
  s.pot = null;
  if (!s.logbook.gear || !s.logbook.gear.crabPot) return s;
  if (!isNum(seconds) || seconds <= 0) return s;
  const fill = Math.min(1, seconds / POT_FILL_SECONDS);
  const lvl = (s.logbook.gear.potLevel | 0) || 1; // Mk-1 yields ×1, each level +60%
  let coins = Math.round(fill * 40 * (0.85 + rand(s) * 0.3) * (1 + 0.6 * (lvl - 1)));
  let freshness = "Fresh";
  if (seconds > POT_FILL_SECONDS * 3) { freshness = "Rotting"; coins = Math.round(coins * 0.4); }
  else if (seconds > POT_FILL_SECONDS) { freshness = "Stale"; coins = Math.round(coins * 0.75); }
  if (coins <= 0) return s;
  s.inventory.coins += coins;
  syncGear(s);
  s.pot = { coins, freshness };
  msg(s, `🦀 The crab pot yielded ${coins}c — ${freshness}.`);
  return s;
}

function driftFish(s) {
  if (rand(s) > 0.5) return;
  for (const f of s.world.fish) {
    if (rand(s) > 0.3) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs[Math.floor(rand(s) * dirs.length)];
    const nt = tileAt(s.world, f.x + dx, f.y + dy);
    if (nt && isWater(nt) && nt !== TILE.ROCK) {
      f.x += dx;
      f.y += dy;
    }
  }
}

function advanceTurn(s) {
  s.time.turn++;
  if (s.time.turn >= s.time.maxTurns) return endTrip(s);
  return s;
}

export function endTrip(s) {
  s.mode = "gameover";
  s.logbook.totals.trips++;
  s.logbook.bestScore = Math.max(s.logbook.bestScore, s.score);
  syncGear(s);
  msg(s, `Dusk falls. Trip score: ${s.score}. (best: ${s.logbook.bestScore})`);
  return s;
}
