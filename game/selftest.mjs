// Headless verification of the pure core. Drives reducers with a fixed seed and
// scripted actions and asserts outcomes. Run: `node game/selftest.mjs`.
// Exits non-zero on the first failed assertion.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { newGame, step, endTrip, emptyLogbook, recordCatch, gradeFor, phaseOf, isSpeciesAllowed, SEASONS, WEATHERS } from "./core.mjs";
import { buildWorld, isWalkable, isWater, tileAt, TILE } from "./world.mjs";
import { saveLogbook, loadLogbook } from "./logbook.mjs";
import { validatePack, listPacks } from "./pack.mjs";
import { render } from "./render.mjs";
import { seedFrom } from "./rng.mjs";
import { RODS } from "./fish.mjs";

let passed = 0;
function ok(cond, label) {
  if (!cond) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  passed++;
}

// 1. Movement
{
  let s = newGame({ seed: "move-test" });
  const start = { ...s.player };
  // find a walkable neighbour
  let moved = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (isWalkable(tileAt(s.world, start.x + dx, start.y + dy))) {
      s = step(s, { type: "move", dx, dy });
      moved = s.player.x === start.x + dx && s.player.y === start.y + dy;
      break;
    }
  }
  ok(moved, "player moves onto a walkable tile");
  ok(s.time.turn >= 1, "moving advances the turn");
}

// 2. Casting toward water is processed; toward land is rejected
{
  let s = newGame({ seed: "cast-test" });
  // toward land/invalid
  const beforeCasts = s.logbook.totals.casts;
  s = step(s, { type: "cast", dx: 0, dy: 0 }); // self tile, not water
  ok(s.logbook.totals.casts === beforeCasts, "casting at a non-water tile does not count");

  // find a water direction and cast
  let waterDir = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (isWater(tileAt(s.world, s.player.x + dx, s.player.y + dy))) waterDir = { dx, dy };
  }
  ok(waterDir, "player starts adjacent to water");
  s = step(s, { type: "cast", dx: waterDir.dx, dy: waterDir.dy });
  ok(s.logbook.totals.casts === beforeCasts + 1, "casting at water counts a cast");
  ok(["reel", "explore"].includes(s.mode), "a cast either hooks a fish or returns to explore");
}

// 3. Reel -> land a (weak) fish, deterministically
{
  let s = newGame({ seed: "reel-test" });
  // perch has strength 2 in the built-in table
  ok(s.speciesById.perch, "built-in species table has perch");
  s.mode = "reel";
  s.reel = { speciesId: "perch", targetX: -1, targetY: -1, stamina: 2, maxStamina: 2, tension: 0, maxTension: 100 };
  s = step(s, { type: "reel" }); // stamina 1
  ok(s.mode === "reel" && s.reel.stamina === 1, "first reel reduces fight, no snap");
  s = step(s, { type: "reel" }); // stamina 0 -> land
  ok(s.mode === "explore", "landing returns to explore");
  ok(s.caught.length === 1 && s.caught[0].speciesId === "perch", "the perch is in the catch list");
  ok(s.inventory.coins > 0 && s.score > 0, "landing awards coins and score");
  ok(s.logbook.dex.perch && s.logbook.dex.perch.count === 1, "logbook dex records the perch");
}

// 4. Snap on excessive tension
{
  let s = newGame({ seed: "snap-test" });
  s.mode = "reel";
  s.reel = { speciesId: "pike", targetX: -1, targetY: -1, stamina: 5, maxStamina: 5, tension: 95, maxTension: 100 };
  s = step(s, { type: "reel" }); // pike strong -> tension over max
  ok(s.mode === "explore" && s.caught.length === 0, "over-tension snaps the line, no catch");
}

// 5. Shop purchase
{
  let s = newGame({ seed: "shop-test" });
  s.inventory.coins = 1000;
  s.player = { ...s.world.shop }; // stand at the shanty (white-box)
  s = step(s, { type: "openShop" });
  ok(s.mode === "shop", "openShop at the shanty enters shop mode");
  const beforeRod = s.inventory.rodLevel;
  s = step(s, { type: "buyRod" });
  ok(s.inventory.rodLevel === beforeRod + 1, "buying upgrades the rod");
  ok(s.inventory.coins < 1000, "buying spends coins");
  ok(s.logbook.gear.rodLevel === s.inventory.rodLevel, "gear syncs into the logbook");
}

// 6. Dusk ends the trip and updates records
{
  let s = newGame({ seed: "dusk-test" });
  s.score = 123;
  s.time.turn = s.time.maxTurns - 1;
  s = step(s, { type: "wait" });
  ok(s.mode === "gameover", "reaching dusk ends the trip");
  ok(s.logbook.totals.trips === 1, "trip is counted");
  ok(s.logbook.bestScore === 123, "best score is recorded");
}

// 7. Logbook persistence round-trips
{
  const dir = mkdtempSync(join(tmpdir(), "nethook-"));
  const lb = emptyLogbook();
  lb.totals.caught = 9;
  lb.bestScore = 555;
  lb.dex.bass = { name: "Largemouth Bass", count: 3, bestWeight: 4.2, rarity: "uncommon" };
  lb.gear = { rodLevel: 2, baitLevel: 1, coins: 77 };
  saveLogbook(lb, dir);
  const back = loadLogbook(dir);
  ok(back.totals.caught === 9 && back.bestScore === 555, "totals/bestScore persist");
  ok(back.dex.bass.bestWeight === 4.2, "dex entry persists");
  ok(back.gear.coins === 77 && back.gear.rodLevel === 2, "gear persists");
}

// 8. Spot Pack validation + world build
{
  const good = {
    name: "Test Pond",
    location: "Nowhere",
    species: [
      { name: "Sunfish", glyph: "f", rarity: "common", habitat: "shallow", weightRange: [0.1, 0.5], behavior: "tiny" },
    ],
    map: { grid: ["......", ".~~~~.", ".~≈≈~.", ".~~~~.", "......"] },
    strategy: ["cast at dawn"],
  };
  const v = validatePack(good);
  ok(v.ok, "a well-formed pack validates");
  const bad = validatePack({ name: "", species: [{ name: "X", rarity: "nope", weightRange: [2, 1] }] });
  ok(!bad.ok && bad.errors.length >= 2, "a malformed pack is rejected with errors");

  const seedState = { rngState: seedFrom("pack-world") };
  const world = buildWorld(seedState, v.pack);
  ok(world.spotName === "Test Pond", "world adopts the pack name");
  ok(world.playerStart && tileAt(world, world.playerStart.x, world.playerStart.y) === TILE.DOCK, "world has a dock start");
  ok(world.species[0].name === "Sunfish", "world uses pack species");
}

// 9. Built-in packs are present and valid
{
  const packs = listPacks();
  ok(packs.length >= 2, "at least two built-in Spot Packs ship");
}

// 10. Render snapshot (plain)
{
  const s = newGame({ seed: "render-test" });
  const frame = render(s, { color: false });
  ok(frame.includes("@"), "render shows the player @");
  ok(frame.includes(s.world.spotName), "render shows the spot name");
  ok(frame.includes("move: hjkl"), "render shows the controls hint");
}

// 11. Reel minigame variety (steady / surge / pendulum)
{
  // pendulum: reeling inside the zone advances the fight; outside it spikes tension
  const base = newGame({ seed: "pendulum-test" });
  const mkPend = (pos) => ({
    ...base, mode: "reel",
    reel: { speciesId: "perch", targetX: -1, targetY: -1, stamina: 3, maxStamina: 3,
      tension: 0, maxTension: 100, mode: "pendulum", pos, vel: 8, zoneLo: 40, zoneHi: 60 },
  });
  const inZone = step(mkPend(50), { type: "reel" });
  ok(inZone.reel.stamina === 2, "pendulum: reeling inside the zone advances the fight");
  const outZone = step(mkPend(5), { type: "reel" });
  ok(outZone.reel.stamina === 3 && outZone.reel.tension > 0, "pendulum: reeling outside the zone spikes tension, no progress");
  const swept = step(mkPend(50), { type: "strain" });
  ok(swept.reel.pos !== 50, "pendulum: the strain tick sweeps the lure");

  // surge: reeling while running is far riskier than reeling slack
  const r = newGame({ seed: "surge-test" });
  r.mode = "reel";
  const mkSurge = (running) => ({
    ...r, mode: "reel",
    reel: { speciesId: "pike", targetX: -1, targetY: -1, stamina: 5, maxStamina: 5,
      tension: 0, maxTension: 100, mode: "surge", running },
  });
  const running = step(mkSurge(true), { type: "reel" });
  const slack = step(mkSurge(false), { type: "reel" });
  ok(running.reel.tension > slack.reel.tension, "surge: horsing a running fish builds far more tension than reeling slack");
  ok(running.reel.stamina === 4 && slack.reel.stamina === 4, "surge: reeling always works the fish down");

  // default (no mode field) behaves as the classic steady haul
  let d = newGame({ seed: "steady-default" });
  d.mode = "reel";
  d.reel = { speciesId: "perch", targetX: -1, targetY: -1, stamina: 1, maxStamina: 1, tension: 0, maxTension: 100 };
  d = step(d, { type: "reel" });
  ok(d.mode === "explore" && d.caught.length === 1, "a reel with no mode field defaults to steady and lands the fish");

  // makeReel is reachable through a real cast: mode is always one of the three
  let c = newGame({ seed: "cast-mode" });
  let castReel = null;
  for (let i = 0; i < 40 && !castReel; i++) {
    let t = newGame({ seed: `cast-mode-${i}` });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isWater(tileAt(t.world, t.player.x + dx, t.player.y + dy))) {
        const after = step(t, { type: "cast", dx, dy });
        if (after.mode === "reel") { castReel = after.reel; break; }
      }
    }
  }
  ok(castReel && ["steady", "surge", "pendulum"].includes(castReel.mode), "a hooked fish from a real cast gets a valid reel mode");
}

// 12. Catch grades + trophy records
{
  ok(gradeFor(1) === "SSS" && gradeFor(0.86) === "S" && gradeFor(0.5) === "C" && gradeFor(0.1) === "F",
    "gradeFor maps size fraction onto the F..SSS scale");

  const lb = emptyLogbook();
  const sp = { id: "x", name: "X", rarity: "common" };
  recordCatch(lb, sp, 5.0, "SSS", true);
  ok(lb.dex.x.bestGrade === "SSS", "dex records the best grade");
  ok(lb.dex.x.trophies === 1 && lb.totals.trophies === 1, "trophy is counted in dex and totals");
  recordCatch(lb, sp, 2.0, "C", false);
  ok(lb.dex.x.bestGrade === "SSS", "best grade only ratchets upward");
  ok(lb.totals.trophies === 1, "a non-trophy catch does not bump the trophy count");

  // a landed fish carries a grade, and a top-of-range fish is flagged a trophy
  let s = newGame({ seed: "grade-land" });
  s.mode = "reel";
  s.reel = { speciesId: "perch", targetX: -1, targetY: -1, stamina: 1, maxStamina: 1, tension: 0, maxTension: 100 };
  s = step(s, { type: "reel" });
  ok(typeof s.caught[0].grade === "string" && "trophy" in s.caught[0], "a landed catch carries a grade and trophy flag");
}

// 13. Dex-completion reward (Golden Rod)
{
  let s = newGame({ seed: "dex-reward" });
  const need = s.world.species.filter((sp) => !sp.junk);
  ok(need.length >= 2, "the spot has multiple non-junk species to complete");
  // pre-fill the dex for every non-junk species except the last
  for (const sp of need.slice(0, -1)) {
    s.logbook.dex[sp.id] = { name: sp.name, count: 1, bestWeight: 1, rarity: sp.rarity, bestGrade: "C", trophies: 0 };
  }
  ok(!s.logbook.rewards.goldenRod, "Golden Rod is not granted before the dex is complete");

  // land the final missing species (hand-built weak reel so it lands in one pull)
  const last = need[need.length - 1];
  s.mode = "reel";
  s.reel = { speciesId: last.id, targetX: -1, targetY: -1, stamina: 1, maxStamina: 1, tension: 0, maxTension: 100 };
  s = step(s, { type: "reel" });
  ok(s.logbook.rewards.goldenRod === true, "completing the spot's dex grants the Golden Rod");
  const gi = RODS.findIndex((r) => r.reward);
  ok(s.inventory.rodLevel === gi, "the Golden Rod is auto-equipped on completion");

  // the reward rod can never be bought from the shop
  let b = newGame({ seed: "no-buy-golden" });
  b.inventory.coins = 1e6;
  b.inventory.rodLevel = RODS.length - 2; // standing on the best purchasable rod
  b.player = { ...b.world.shop };
  b = step(b, { type: "openShop" });
  b = step(b, { type: "buyRod" });
  ok(b.inventory.rodLevel === RODS.length - 2, "the Golden Rod is never purchasable from the shanty");
}

// 14. Environment gating (time / season / weather / bait)
{
  ok(phaseOf({ turn: 0, maxTurns: 90 }) === "dawn", "the day opens at dawn");
  ok(phaseOf({ turn: 45, maxTurns: 90 }) === "day", "midday is the plain 'day' phase");
  ok(phaseOf({ turn: 89, maxTurns: 90 }) === "dusk", "the day closes at dusk");

  const env = { phase: "dusk", season: "summer", weather: "rain" };
  ok(isSpeciesAllowed({}, env), "an ungated species is always allowed");
  ok(isSpeciesAllowed({ time: ["dusk"] }, env), "a matching time gate passes");
  ok(!isSpeciesAllowed({ time: ["dawn"] }, env), "a non-matching time gate blocks");
  ok(isSpeciesAllowed({ season: ["summer"], weather: ["rain"] }, env), "matching season+weather pass together");
  ok(!isSpeciesAllowed({ weather: ["clear"] }, env), "a non-matching weather gate blocks");
  ok(isSpeciesAllowed({ time: ["any"] }, env), "'any' clears a gate");

  // every trip rolls a valid season + weather, deterministically
  const g = newGame({ seed: "env-roll" });
  ok(SEASONS.includes(g.season) && WEATHERS.includes(g.weather), "a trip rolls a season and weather from the pools");
  const g2 = newGame({ seed: "env-roll" });
  ok(g2.season === g.season && g2.weather === g.weather, "the same seed rolls the same environment");

  // pack gates are normalized (fall→autumn) and survive validation
  const v = validatePack({
    name: "Gated Cove",
    species: [{ name: "Coelacanth", rarity: "legendary", weightRange: [20, 90],
      weather: ["rain"], time: ["night"], season: ["fall"], bait: ["lure"] }],
  });
  ok(v.ok, "a pack with gated species validates");
  const sp = v.pack.species[0];
  ok(sp.weather.includes("rain") && sp.time.includes("night") && sp.season.includes("autumn"),
    "pack gates are normalized (fall→autumn) and kept");
  ok(Array.isArray(sp.bait) && sp.bait.includes("lure"), "a bait preference is kept");

  // a bad gate token is dropped, leaving the species unrestricted, not rejected
  const v2 = validatePack({ name: "Sloppy", species: [{ name: "Whatever", rarity: "common", weightRange: [1, 2], weather: ["purple"] }] });
  ok(v2.ok && v2.pack.species[0].weather === undefined, "an unknown gate token degrades to unrestricted, not a rejection");
}

// 15. Every procedural generator yields a playable lake
{
  let waterOk = true, dockOk = true, sawDeep = false;
  for (let i = 0; i < 24; i++) {
    const s = newGame({ seed: `gen-${i}` });
    let water = 0;
    for (const row of s.world.tiles) for (const c of row) { if (isWater(c)) water++; if (c === TILE.DEEP) sawDeep = true; }
    if (water < 20) waterOk = false;
    const ps = s.world.playerStart;
    if (!(ps && tileAt(s.world, ps.x, ps.y) === TILE.DOCK)) dockOk = false;
  }
  ok(waterOk, "every procedural seed yields a lake with real water");
  ok(dockOk, "every procedural seed yields a dock start");
  ok(sawDeep, "procedural lakes carve deep water for deep-habitat fish");
}

console.log(`OK — ${passed} assertions passed.`);
