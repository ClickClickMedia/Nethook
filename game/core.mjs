// Pure game core: state + step(state, action) -> state. No terminal I/O, no
// disk, no timers — every transition is deterministic given state.rngState, so
// the whole game is verifiable headlessly (see selftest.mjs).

import { seedFrom, rand } from "./rng.mjs";
import { buildWorld, tileAt, tileHabitat, isWater, isWalkable, TILE } from "./world.mjs";
import { RARITY, RODS, BAITS } from "./fish.mjs";

const MAX_MESSAGES = 6;
const DEFAULT_DAYLIGHT = 90;

export function emptyLogbook() {
  return {
    version: 1,
    dex: {},
    totals: { caught: 0, weight: 0, trips: 0, casts: 0 },
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
  s.reel = {
    speciesId: species.id,
    targetX: tx,
    targetY: ty,
    stamina: species.strength,
    maxStamina: species.strength,
    tension: 0,
    maxTension: 100,
  };
  s.mode = "reel";
  msg(s, `Something's on! (${species.name}) — [r]eel when slack, [e]ase when it runs.`);
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

function doReel(s, kind) {
  if (s.mode !== "reel" || !s.reel) return s;
  const sp = s.speciesById[s.reel.speciesId];
  if (kind === "reel") {
    s.reel.stamina = Math.max(0, s.reel.stamina - 1);
    s.reel.tension += 14 + sp.strength * 2 - rod(s).tensionEase;
  } else if (kind === "ease") {
    s.reel.tension = Math.max(0, s.reel.tension - (18 + rod(s).tensionEase));
  } else if (kind === "strain") {
    // emitted by the live timer to create urgency; not used in headless tests
    s.reel.tension += Math.ceil(sp.strength * 1.2);
  }

  if (s.reel.tension >= s.reel.maxTension) {
    msg(s, `The line SNAPS! The ${sp.name} got away.`);
    s.mode = "explore";
    s.reel = null;
    return s;
  }
  if (s.reel.stamina <= 0) {
    return landFish(s, sp);
  }
  return s;
}

function landFish(s, sp) {
  const [lo, hi] = sp.weightRange;
  const weight = Math.round((lo + rand(s) * (hi - lo)) * 100) / 100;
  const points = Math.max(1, Math.round(weight * RARITY[sp.rarity].mult * 10));
  s.caught.push({ speciesId: sp.id, name: sp.name, weight, points, rarity: sp.rarity });
  s.score += points;
  s.inventory.coins += points;
  recordCatch(s.logbook, sp, weight);
  // remove the visible fish, if any, from the target tile
  s.world.fish = s.world.fish.filter((f) => !(f.x === s.reel.targetX && f.y === s.reel.targetY));
  const tag = sp.junk ? "Fished up" : "LANDED";
  msg(s, `${tag} a ${sp.name} — ${weight}kg! +${points} pts`);
  s.mode = "explore";
  s.reel = null;
  return s;
}

export function recordCatch(logbook, sp, weight) {
  const d = logbook.dex[sp.id] || { name: sp.name, count: 0, bestWeight: 0, rarity: sp.rarity };
  d.count++;
  d.bestWeight = Math.max(d.bestWeight, weight);
  logbook.dex[sp.id] = d;
  logbook.totals.caught++;
  logbook.totals.weight = Math.round((logbook.totals.weight + weight) * 100) / 100;
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
