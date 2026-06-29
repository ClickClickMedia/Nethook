# Contributing to Nethook

Thanks for fishing around in here! Nethook is a small, dependency-free Node
project and contributions are very welcome — especially **new Spot Packs**, extra
**species**, **reel-minigame** ideas, and procedural-generation tweaks.

## Quick start
```bash
git clone https://github.com/ClickClickMedia/Nethook && cd Nethook
npm test                              # node game/selftest.mjs — should print "OK — N assertions passed."
node game/index.mjs                   # play the procedural lake (needs a real terminal)
node game/index.mjs "Lake Taupō"      # …or a built-in spot
node game/launch.mjs --dry-run        # show the new-window spawn plan for your env
node game/packcheck.mjs <pack.json>   # validate a Spot Pack
```
No build step, no `npm install` (zero runtime dependencies), Node ≥ 18.

## The one rule that matters: keep the core pure
The game logic is split so it's testable without a terminal, and that separation
is the project's backbone. Please preserve it (see [`CLAUDE.md`](CLAUDE.md) for the
full architecture):

- **`game/core.mjs`, `world.mjs`, `render.mjs`, `pack.mjs`, `solunar.mjs` are pure** —
  no `fs`, no `process.stdout`, no timers, no `Date.now()` inside reducers.
- **All randomness goes through `game/rng.mjs` against `state.rngState`** so runs are
  reproducible and the headless tests stay deterministic. Don't call `Math.random()`.
- **All terminal/disk I/O lives in `game/index.mjs`** (and the small hook/launch
  scripts). If you need a new input (a clock, a file), read it there and pass it
  into an action — never reach for it inside the core.
- **Never trust a Spot Pack** — route every pack through `validatePack()` in
  `pack.mjs`; sanitize, don't reject, where reasonable.
- **Zero runtime dependencies.** Please don't add any to ship the game.

## Good first contributions
- **A new Spot Pack** — a JSON file in `game/packs/` for a real lake/river/coast.
  See the schema in [`commands/spot.md`](commands/spot.md) and the three existing
  packs. Run `node game/packcheck.mjs game/packs/your-pack.json` and add a line to
  the selftest's "built-in packs" expectation if you like. Real species, tackle,
  and the optional `time`/`season`/`weather`/`bait`/`tempOptimum` gates earn bonus
  points for authenticity.
- **A built-in species** — append to `BUILTIN_SPECIES` in `game/fish.mjs`.
- **A reel-minigame variant** — add a mode in `core.mjs` (`chooseReelMode` +
  a `*Reel` reducer) and render it in `render.mjs`.

## Tests
Because the core is pure, prefer adding assertions to `game/selftest.mjs` (drive
`step()` with a fixed seed and scripted actions) over manual play. **`npm test`
must stay green**, and new behaviour should come with new assertions.

## Pull requests
1. Fork, branch, and make your change.
2. Run `npm test` (green) and, for plugin changes, `claude plugin validate .`.
3. Match the existing code style (plain ESM, 2-space indent, semicolons — mirror
   the surrounding file).
4. Open a PR describing **what** and **why**; the template will prompt you.

By contributing you agree your work is licensed under the repo's [MIT License](LICENSE).
