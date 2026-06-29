# Nethook 🎣

> A NetHack-style ASCII fishing roguelike to play in a second terminal window
> while Claude Code is busy. When Claude finishes, the game pings you to reel in.

```
  🎣 NETHOOK — Lake Taupō

  ...........~~~~~~..........
  ........~~~~≈≈≈≈~~~~,......
  ......~~≈≈≈≈≈≈≈≈≈≈~~"......
  =@~~≈≈≈≈ F ≈≈≈≈≈≈≈≈~~......
  ......~~≈≈≈≈≈# ≈≈≈≈~~......
  ......$..~~~~≈≈≈~~~~.......

  Not even a nibble.

  ☀ ██████████░░░░░░  🎣Bamboo Rod  🪱Worms  ◎0c  ★0   …Claude is thinking
  move: hjkl/arrows · f+dir: cast · $: shanty · q: quit
```

## Why
The spinner-stare while Claude works is dead time. Nethook fills it with a quick,
glanceable fishing roguelike — and tells you the moment Claude is done.

A plugin **can't** render a live game inside Claude Code's own terminal (Claude
owns that TTY), so Nethook runs as a **standalone game in its own window**. That's
the authentic roguelike model anyway.

## Install (from this repo's marketplace — no approval needed)
```
/plugin marketplace add ClickClickMedia/Nethook
/plugin install nethook@nethook
```

## Play
- **`/gofish`** — opens Nethook in a new terminal window (detects tmux / Windows
  Terminal / WSL / macOS / Linux; prints a copy-paste command if it can't).
  Optionally pass a spot: `/gofish "Lake Taupō"`.
- **`/nethook:spot "<real place>"`** — Claude generates a playable **Spot Pack** for
  a real location (ASCII map, real species, real tackle, real strategy) and installs
  it. Then `/gofish "<place>"`.
- Or run it directly in any terminal: `node game/index.mjs ["Spot Name"]`.

While Claude works, a `Stop` hook flips the game's status bar to **"✅ Claude ready
— reel in!"** (with a terminal bell). A `PreToolUse` hook nudges you to go fish when
Claude kicks off a long command (once per session).

## Gameplay
- **Move** with `hjkl` or arrows; you walk the shore/dock (`@`).
- **Fish**: press `f` then a direction to cast at adjacent water. On a bite, a reel
  fight begins — **`r`** to reel when there's slack, **`e`** to ease when it runs.
  Let the tension hit 100% and the line **snaps**. Fights come in three flavours
  (rarer fish pick the nastier ones): a **steady haul**, a **runner** that bolts in
  bursts (ease while it runs, reel when slack), and a **pendulum** where you reel
  only while the sweeping lure sits in the green zone.
- **Water**: shallow `~`, deep `≈`, reeds `"`, lilypads `,`, rocks `#` (no fish).
  Different species favour different depths.
- **Shanty** (`$`): spend coins on better **rods** and **bait** to unlock deeper
  water and rarer fish. Gear and coins persist between trips.
- **Complete the logbook**: catch every (non-junk) species at a spot and you earn
  the **Golden Rod** — the best rod in the game, granted once and kept for good.
- **Trips**: each launch is one bounded daylight session; at dusk it scores.
- **Grades & trophies**: every catch is graded **F→SSS** by how big it is for its
  species. A top-of-range specimen (or a rare gold strike) lands a **🏆 trophy**
  worth a value bonus — the logbook remembers your best grade and trophy count.
- **Logbook** (persistent): species dex, biggest catches, best grades, trophies,
  totals, best score — saved under `$XDG_DATA_HOME/nethook` (or `~/.local/share/nethook`).

## Spot Packs
A Spot Pack is JSON describing a real location: an optional ASCII map, a species
table with real behaviour, tackle, and strategy. Three ship built-in
(`game/packs/`): **Lake Taupō**, **The Everglades**, **Lofoten Fjord**. Generate
more with `/nethook:spot`. The engine validates every pack (`game/pack.mjs`) so a
bad one can never crash the game; with no pack it builds a procedural lake.

**Environment gating**: each trip rolls a **season** and **weather**, and the
**day-phase** moves with the daylight clock (dawn → day → dusk). Species can gate
themselves by `time`, `season`, `weather`, and preferred `bait`, so a spot plays
differently trip to trip — the skrei cod run shows up in winter, the kraken only
at foggy dusk. Dawn/dusk and rain bite better. Gates are sanitized on load, never
trusted.

## Development
Zero runtime dependencies (pure Node + ANSI). The game core is split so it's
testable without a TTY:
```
npm test        # node game/selftest.mjs — 68 assertions over the pure core
node game/launch.mjs --dry-run      # show the window-spawn plan for your env
node game/packcheck.mjs <pack.json> # validate a Spot Pack
```
`game/core.mjs`, `world.mjs`, `render.mjs`, `pack.mjs`, `logbook.mjs` are pure;
`game/index.mjs` is the only file that touches the terminal.
