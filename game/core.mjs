// Pure game core: state + step(state, action) -> state. No terminal I/O, no
// disk, no timers — every transition is deterministic given state.rngState, so
// the whole game is verifiable headlessly (see selftest.mjs).

import { seedFrom, rand, randint } from "./rng.mjs";
import { buildWorld, tileAt, tileHabitat, isWater, isWalkable, TILE } from "./world.mjs";
import { RARITY, RODS, BAITS } from "./fish.mjs";

const MAX_MESSAGES = 6;
const DEFAULT_DAYLIGHT = 90;

export function emptyLogbook() {
  return {
    version: 1,
    dex: {},
    totals: { caught: 0, weight: 0, trips: 0, casts: 0, trophies: 0 },
    bestScore: 0,
    gear: { rodLevel: 0, baitLevel: 0, coins: 0 },
  };
}

export function newGame({ seed = "nethook", pack = null, logbook = null } = {}) {
  const lb = logbook || emptyLogbook();
  const seedState = { rngState: seedFrom(seed) };
  const world = buildWorld(seedState, pack);
  const speciesById = Object.fromEntries(world.species.map((s) => [s.id, s]));

  return {
    seed,
    rngState: seedState.rngState, // continue the same stream
    world,
    speciesById,
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

  let biteChance = 0.5 + rod(s).biteBonus + bait(s).biteBonus;
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
  s.reel = makeReel(s, species, tx, ty);
  s.mode = "reel";
  msg(s, `Something's on! (${species.name}) — ${REEL_HINTS[s.reel.mode]}`);
  return advanceTurn(s);
}

function chooseSpecies(s, hab) {
  const rareBoost = bait(s).rareBonus;
  const candidates = s.world.species
    .filter((sp) => sp.habitat === "any" || sp.habitat === hab)
    .map((sp) => {
      let w = RARITY[sp.rarity].weight;
      if (sp.rarity !== "common" && sp.rarity !== "uncommon") w *= 1 + rareBoost;
      if (sp.junk) w *= 0.5;
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

function makeReel(s, sp, tx, ty) {
  const mode = chooseReelMode(s, sp);
  const reel = {
    speciesId: sp.id, targetX: tx, targetY: ty,
    stamina: sp.strength, maxStamina: sp.strength,
    tension: 0, maxTension: 100, mode,
    running: false, pos: 0, vel: 0, zoneLo: 0, zoneHi: 0,
  };
  if (mode === "pendulum") {
    reel.pos = randint(s, 0, 100);
    reel.vel = randint(s, 6, 11) * (rand(s) < 0.5 ? 1 : -1);
    const span = clamp(32 - sp.strength * 2, 14, 30); // harder fish = narrower zone
    reel.zoneLo = randint(s, 0, 100 - span);
    reel.zoneHi = reel.zoneLo + span;
  }
  return reel;
}

function doReel(s, kind) {
  if (s.mode !== "reel" || !s.reel) return s;
  const sp = s.speciesById[s.reel.speciesId];
  const m = s.reel.mode || "steady";
  if (m === "surge") surgeReel(s, sp, kind);
  else if (m === "pendulum") pendulumReel(s, sp, kind);
  else steadyReel(s, sp, kind);
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

function landFish(s, sp) {
  const [lo, hi] = sp.weightRange;
  const weight = Math.round((lo + rand(s) * (hi - lo)) * 100) / 100;
  const frac = hi > 0 ? weight / hi : 1;
  const grade = gradeFor(frac);
  // Trophy: a top-of-range specimen (top ~15% by size, DREDGE's "Trophy") or a
  // rare gold strike — worth a +25% value bonus and a permanent logbook mark.
  const trophy = !sp.junk && (frac >= 0.85 || rand(s) < 0.02);
  let points = Math.max(1, Math.round(weight * RARITY[sp.rarity].mult * 10));
  if (trophy) points = Math.round(points * 1.25);
  s.caught.push({ speciesId: sp.id, name: sp.name, weight, points, rarity: sp.rarity, grade, trophy });
  s.score += points;
  s.inventory.coins += points;
  recordCatch(s.logbook, sp, weight, grade, trophy);
  // remove the visible fish, if any, from the target tile
  s.world.fish = s.world.fish.filter((f) => !(f.x === s.reel.targetX && f.y === s.reel.targetY));
  if (trophy) {
    msg(s, `🏆 TROPHY ${sp.name} — ${weight}kg, grade ${grade}! +${points} pts`);
  } else {
    const tag = sp.junk ? "Fished up" : "LANDED";
    msg(s, `${tag} a ${sp.name} — ${weight}kg [${grade}]  +${points} pts`);
  }
  s.mode = "explore";
  s.reel = null;
  return s;
}

export function recordCatch(logbook, sp, weight, grade = null, trophy = false) {
  const d = logbook.dex[sp.id] || { name: sp.name, count: 0, bestWeight: 0, rarity: sp.rarity, bestGrade: null, trophies: 0 };
  d.count++;
  d.bestWeight = Math.max(d.bestWeight, weight);
  if (grade && gradeRank(grade) > gradeRank(d.bestGrade)) d.bestGrade = grade;
  if (trophy) d.trophies = (d.trophies || 0) + 1;
  logbook.dex[sp.id] = d;
  logbook.totals.caught++;
  logbook.totals.weight = Math.round((logbook.totals.weight + weight) * 100) / 100;
  if (trophy) logbook.totals.trophies = (logbook.totals.trophies || 0) + 1;
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
    if (!next) return (msg(s, "Best rod already in hand."), s);
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
  };
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
