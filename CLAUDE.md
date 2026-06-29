# CLAUDE.md — Nethook

Guidance for Claude Code (and other agents) working in this repo.

## What this is
Nethook is a **NetHack-style ASCII fishing roguelike** played in a **standalone
terminal window** while Claude Code is busy. It ships as a Claude Code **plugin**
(slash commands + hooks) but the game itself is a plain Node program.

**Foundational constraint — do not "fix" this:** a Claude Code plugin cannot render
an interactive TUI inside Claude's own terminal while Claude is processing (Claude
owns that TTY), and a subagent has no interactive TTY to hand the user either. So
the game MUST run as a separate process/window. The plugin's job is launching it,
generating content, and signalling status — never hosting the game in-session.

## Architecture (the important part)
The game is split so the logic is testable without a terminal:

- `game/core.mjs` — **pure** game state + `step(state, action)` reducers. No I/O,
  no timers, no disk. Every transition is deterministic given `state.rngState`.
- `game/world.mjs` — builds a world (tile grid + species + fish) from a Spot Pack
  map or a procedural lake. Pure given an rng state. Tile semantics + helpers
  (`isWater`, `isWalkable`, `tileHabitat`, `tileAt`).
- `game/rng.mjs` — seeded mulberry32. `rand(state)` advances `state.rngState`.
- `game/fish.mjs` — built-in species table, rods, bait, rarity tiers (fallback
  content when no pack is loaded).
- `game/pack.mjs` — Spot Pack schema + `validatePack()` + loaders. Bad packs are
  rejected, never executed.
- `game/render.mjs` — `render(state, {color})` → string. Pure. `{color:false}`
  gives plain output for snapshot tests.
- `game/logbook.mjs` — persistent dex/records/gear; resolves the shared data dir.
- `game/index.mjs` — **the ONLY file that touches the terminal**: raw stdin, ANSI
  out, alt-screen, timers, status-file polling, disk writes. It wires
  stdin→actions and state→`render()` and delegates all logic to `core`.
- `game/launch.mjs` — env detection + spawn a new terminal window. `buildPlan()`
  is pure (tested via `--dry-run`); only `main()` spawns.
- `game/packcheck.mjs` — CLI to validate a Spot Pack file.
- `game/selftest.mjs` — headless test harness over the pure core.

### Invariants to preserve
- **Keep `core.mjs`, `world.mjs`, `render.mjs`, `pack.mjs` pure** (no `fs`, no
  `process.stdout`, no timers, no `Date.now()` inside reducers). All randomness
  goes through `rng.mjs` against `state.rngState` so runs stay reproducible.
- **All terminal/disk I/O lives in `index.mjs`** (and the small hook/launch
  scripts). If you need new I/O, wire it there and pass data into actions.
- **Never trust a Spot Pack** — route every pack through `validatePack()`.
- **Zero runtime dependencies.** Pure Node + ANSI. Don't add deps to ship the game.

## Commands
```bash
npm test                              # node game/selftest.mjs (92 assertions)
node game/index.mjs ["Spot Name"]     # play locally (needs a real TTY)
node game/launch.mjs --dry-run        # show the window-spawn plan for this env
NETHOOK_FORCE_ENV=macos node game/launch.mjs --dry-run   # force an env
node game/packcheck.mjs <pack.json>   # validate a Spot Pack
```
There is no build step and no lint config; keep code in the existing plain-ESM,
no-semicolon-free style already present (match the surrounding files).

## Common tasks
- **Add a built-in species:** append to `BUILTIN_SPECIES` in `game/fish.mjs`
  (fields: id, name, glyph, rarity, habitat, weightRange, strength, behavior).
- **Add a built-in Spot Pack:** drop a JSON file in `game/packs/` matching the
  schema in `game/pack.mjs`; run `node game/packcheck.mjs` on it; the selftest
  asserts at least two valid built-in packs exist.
- **Tune difficulty:** reel feel lives in `doReel()` + the per-mode reducers
  (`steadyReel`/`surgeReel`/`pendulumReel`) and `chooseReelMode()` in `core.mjs`;
  bite odds in `doCast()`/`chooseSpecies()`; daylight length is `DEFAULT_DAYLIGHT`.
- **Change ranking of nothing** — there's no server; persistence is local JSON.

## Plugin pieces
- `commands/gofish.md` — opens the game in a new window (`launch.mjs`).
- `commands/spot.md` — has Claude generate + validate + install a Spot Pack.
- `hooks/hooks.json` — `UserPromptSubmit`→"working", `Stop`→"done" (writes
  `status.json` the game polls and flashes "Claude ready"), `PreToolUse(Bash)`→
  a one-per-session "go fish" nudge on long commands.
- `hooks/status.mjs`, `hooks/nudge.mjs` — small, dependency-free hook scripts.

## Data / persistence
The game and hooks share a data dir resolved in `logbook.mjs`:
`$NETHOOK_DATA` → `$CLAUDE_PLUGIN_DATA` → `$XDG_DATA_HOME/nethook` →
`~/.local/share/nethook`. It holds `logbook.json`, `status.json`, and `packs/`.

## Testing philosophy
Because the core is pure, prefer adding assertions to `game/selftest.mjs` (drive
`step()` with a fixed seed and scripted actions) over manual play. The live TTY
path in `index.mjs` is intentionally thin so most logic is covered headlessly.
See `docs/RESEARCH.md` for the design canon (roguelike conventions, NetHack, TUI
craft, prior art) behind these choices.
