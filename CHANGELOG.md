# Changelog

All notable changes to Nethook are documented here.

## 0.2.0

A big gameplay-depth and replayability pass. All additions keep the engine
zero-dependency and the core pure (every transition deterministic from
`state.rngState`); the selftest grew from 32 to 98 assertions.

### Added
- **Reel-minigame variety** — fights now come in three flavours picked per hookup
  by rarity: a classic *steady* haul, a *surge* runner (ease while it runs, reel
  when slack), and a *pendulum* (reel only while the swept lure is in the zone).
- **Catch grades & trophies** — every catch is graded **F→SSS** by size for its
  species; top-of-range specimens (or a rare gold strike) land a **🏆 trophy**
  worth a value bonus. The logbook tracks best grade and trophy counts.
- **Dex-completion reward** — fill a spot's logbook to earn the **Golden Rod**
  (earned, never bought), the best rod in the game, kept for good.
- **Environment gating** — each trip rolls a **season** and **weather**, and the
  **day-phase** tracks the daylight clock. Spot Pack species can gate by `time`,
  `season`, `weather`, and preferred `bait`. Dawn/dusk and rain bite better.
- **Grounded bite model** — optional `tempOptimum`/`tempRange` per species against
  a season-derived water temperature, plus a **solunar** feeding model computed
  in-engine from the moon phase on the trip's real date (no API, no network).
- **Aberrations** — eerie 🜂 corrupted variants surface mostly at dusk / in fog;
  they fight harder and pay ~60% more.
- **Organic lakes** — procedural worlds now use one of three generators (radial,
  cellular-automata, drunkard's-walk) for fresh shorelines every trip.
- **Idle crab pot** — deploy one at the shanty; it accrues a little catch in real
  time while you're away and pays out on launch, decaying Fresh→Stale→Rotting if
  neglected (which also caps idle farming).
- **Per-trip bounties** — two rolled goals each trip (land a trophy, log a new
  species, hook an aberration, …) that pay a coin + score bonus on completion.

### Notes
- The live clock is read only at the `index.mjs` I/O boundary and passed into the
  pure core (drives the solunar date and idle accrual) — reducers stay pure.
- Spot Pack additions (`time`/`season`/`weather`/`bait`/`tempOptimum`/`tempRange`,
  `hints.baseTemp`) are all sanitized in `validatePack()` — sloppy gates degrade to
  "always available" rather than being rejected.

## 0.1.0
- Initial standalone release: pure TTY-free core (core/world/render/pack/logbook/
  rng), terminal front-end (`index.mjs`), new-window launcher, three built-in Spot
  Packs, the `/gofish` and `/nethook:spot` commands, and the Claude status hooks.
