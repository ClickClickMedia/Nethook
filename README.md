# Nethook 🎣

> A NetHack-style ASCII fishing roguelike to play in a second terminal window
> while Claude Code is busy. When Claude finishes, the game pings you to reel in.

```
  🎣 NETHOOK — Lake Taupō   🌧rain · autumn · 🌆dusk · 12°C · 🌕feeding

  ...........~~~~~~..........
  ........~~~~≈≈≈≈~~~~,......
  ......~~≈≈≈≈≈≈≈≈≈≈~~"......
  =@~~≈≈≈≈ F ≈≈≈≈≈≈≈≈~~......
  ......~~≈≈≈≈≈# ≈≈≈≈~~......
  ......$..~~~~≈≈≈~~~~.......

  ○ Land a trophy catch (+35c)   ✔ Log a new species (+25c)
  🏆 TROPHY Rainbow Trout — 3.1kg, grade S!  +186 pts

  ☀ ██████████░░░░░░  🎣Heirloom Rod  🪱Spinner Lure  ◎240c  ★186   ✅ Claude ready — reel in!
  move: hjkl/arrows · f+dir: cast · $: shanty · q: quit
```

## Why
The spinner-stare while Claude works is dead time. Nethook fills it with a quick,
glanceable fishing roguelike — and tells you the moment Claude is done.

A plugin **can't** render a live game inside Claude Code's own terminal (Claude
owns that TTY), so Nethook runs as a **standalone game in its own window**. That's
the authentic roguelike model anyway.

## Requirements
- **[Claude Code](https://claude.com/claude-code)** (the CLI) — to install it as a plugin.
- **Node.js ≥ 18** — the game is plain Node, zero dependencies.
- A real terminal you can open a second window/tab/pane in (the game runs in its
  own window — see [Why](#why)). Works on macOS, Linux, WSL, and Windows Terminal.

## Install & play (as a Claude Code plugin)
Run these two slash commands inside Claude Code — no build, no `npm install`, no
marketplace approval needed:

```
/plugin marketplace add ClickClickMedia/Nethook   # 1. register this repo's marketplace
/plugin install nethook@nethook                    # 2. install the plugin (name@marketplace)
```

That's it. Now, any time Claude is busy and you want something to do:

```
/gofish                  # opens Nethook in a NEW terminal window
/gofish "Lake Taupō"     # …or jump straight into a specific spot
```

- If `/gofish` can't auto-open a window (headless or an unrecognised terminal) it
  prints a **copy-paste command** instead — paste it into any separate tab/pane.
- **`/nethook:spot "<real place>"`** has Claude generate a playable **Spot Pack**
  for a real location (ASCII map, real species, real tackle, real strategy) and
  installs it; then `/gofish "<place>"`.

While Claude works, a `Stop` hook flips the game's status bar to **"✅ Claude ready
— reel in!"** (with a terminal bell), and a `PreToolUse` hook nudges you to go fish
when Claude kicks off a long command (once per session).

To update later: `/plugin marketplace update nethook` then re-run `/plugin install
nethook@nethook`. To remove it: `/plugin uninstall nethook@nethook`.

## Run it directly (without the plugin)
You don't need Claude Code to play — clone and run:
```
git clone https://github.com/ClickClickMedia/Nethook && cd Nethook
node game/index.mjs                 # play the procedural lake
node game/index.mjs "Lake Taupō"    # …or a named built-in spot
```
(The plugin's only extra is the `/gofish` window-launcher and the Claude-ready
status handshake; the game itself is the same.)

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
  water and rarer fish, or deploy a **🦀 crab pot**. Gear and coins persist.
- **Crab pot** (idle): once deployed, it accrues a little catch in real time while
  you're away and pays out the next time you launch — but the haul decays
  **Fresh → Stale → Rotting** if you leave it too long, so check in regularly.
- **Complete the logbook**: catch every (non-junk) species at a spot and you earn
  the **Golden Rod** — the best rod in the game, granted once and kept for good.
- **Trips**: each launch is one bounded daylight session; at dusk it scores.
- **Bounties**: every trip rolls **two goals** (land a trophy, log a new species,
  hook an aberration…) that pay a coin + score bonus — a fresh objective each launch.
- **Grades & trophies**: every catch is graded **F→SSS** by how big it is for its
  species. A top-of-range specimen (or a rare gold strike) lands a **🏆 trophy**
  worth a value bonus — the logbook remembers your best grade and trophy count.
- **Aberrations**: now and then — mostly at **dusk** or in **fog** — something
  *wrong* takes the hook. **🜂 Aberrant** variants fight harder and pay far more.
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

**Grounded bite model** (optional realism): a species can declare a water-temp
preference (`tempOptimum` / `tempRange` °C); the engine derives the trip's water
temperature from the season around the spot's annual mean (`hints.baseTemp`), so
cold-water fish fade in a summer heatwave. The bite also follows **solunar**
feeding — computed in-engine from the moon phase on the trip's real date (no API,
no network) — strongest around the new and full moon. The header shows the
trip's `°C` and a 🌑🌓🌕 feeding indicator.

## Development
Zero runtime dependencies (pure Node + ANSI). The game core is split so it's
testable without a TTY:
```
npm test        # node game/selftest.mjs — 98 assertions over the pure core
node game/launch.mjs --dry-run      # show the window-spawn plan for your env
node game/packcheck.mjs <pack.json> # validate a Spot Pack
```
`game/core.mjs`, `world.mjs`, `render.mjs`, `pack.mjs`, `logbook.mjs` are pure;
`game/index.mjs` is the only file that touches the terminal.

## Testing & contributing
Trying it out? See [TESTING.md](TESTING.md) for what to look for and how to report.
Want to add a Spot Pack, a species, or a fix? [CONTRIBUTING.md](CONTRIBUTING.md)
has the dev setup and the one rule that matters (keep the core pure). PRs welcome —
new real-world Spot Packs especially. MIT licensed.
