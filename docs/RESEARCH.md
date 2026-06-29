# Nethook — Research Dossier

Background research that informs Nethook's design: the roguelike canon, NetHack's
conventions, procedural generation, terminal-UI craft in Node, fishing-game
mechanics from the genre's best, and open-source prior art. Each section ends with
**→ Nethook**: how it maps onto this project (what we adopted, and what's deferred).

> Source confidence is labelled throughout: **fetched** (page retrieved and quoted
> directly), **mirror** (RogueBasin/wikis return HTTP 403 to automated fetchers, so
> a verbatim mirror or browser-UA fetch was used), **snippet** (search-result
> summary only). Full URLs are in [Sources](#sources).

---

## 1. The roguelike canon

### 1.1 The Berlin Interpretation
The Berlin Interpretation (International Roguelike Development Conference, 2008) is
the genre's reference definition: a set of **high-value** and **low-value** factors,
explicitly *not* a checklist — "a game may lack some" and still be a roguelike.

**High-value factors:** random environment generation · permadeath · turn-based ·
grid-based · non-modal (movement/combat/etc. share one mode) · complexity (enough
to allow several solutions to a goal) · resource management · hack'n'slash ·
exploration & discovery.

**Low-value factors:** single player character · monsters are similar to players ·
tactical challenge · ASCII display · dungeons · numbers (stats shown explicitly).

(Turn-based = "each command corresponds to a single action; the game is not
sensitive to time." Grid-based = "the world is a uniform grid of tiles; each
actor takes one tile regardless of size." — Game Studies / Cartlidge, *fetched*.)

**→ Nethook:** We deliberately hit the high-value factors a fishing game can: a
**procedurally generated** lake, **turn-based** + **grid-based** movement,
**resource management** (daylight, coins, gear), and **exploration**. We *bend*
two: there's no monster-combat "hack'n'slash" (the reel fight is our analogue),
and instead of hard **permadeath** we use bounded **trips** with a persistent
logbook — a roguelite meta common to modern entries. ASCII display and visible
numbers are "low-value" but we embrace them for flavour.

### 1.2 NetHack conventions
- **Three-region screen layout** (Guidebook, *fetched*): a **top message line** for
  "things impossible to represent visually," the **map** in the middle, and a
  **bottom status** region. Nethook mirrors this exactly (title/message lines, map,
  status bar).
- **Movement keys** (Guidebook, *fetched*): `yuhjklbn` — `h`=W, `l`=E, `k`=N, `j`=S,
  diagonals `y/u/b/n`, with numpad equivalents. Inherited from Rogue.
- **Glyph conventions** (Guidebook + RogueBasin, *fetched/mirror*): `@` = "your
  character or a human"; `.` = floor; `#` = corridor; `$` = gold; `}` = "a pool of
  water or moat"; `{` = fountain; monsters are letters, **lowercase = weaker,
  uppercase = stronger** (the red-`D`/green-`D` dragon precedent).
- **Why `@`** (Wikipedia, *fetched*): chosen in Rogue to mean "where you're **at**."
- **Permadeath & bones** (NetHack Wiki, *snippet*): on death the save is wiped; a
  "bones level" can resurface a dead character's remains in a *later* game (1/3
  load chance, scaling with depth). The cultural core of the genre.
- **Identification** (Damerell spoiler, *fetched*): item appearances are randomly
  shuffled each game; you identify by deduction/testing, not labels.
- **RNG/seeding** (taeb.github.io, *fetched*): classic NetHack seeds its PRNG from
  the wall-clock ("seconds since 1970"); identical seed + identical input ⇒
  identical map and results. A user-facing `rngseed` option is associated with the
  3.7 line but we could **not** confirm it from a primary nethack.org page —
  treat as unverified.
- **"The DevTeam Thinks of Everything"** (NetHack Wiki/Wikipedia, *snippet*): the
  philosophy that obscure "clever" actions already have bespoke responses (the
  cockatrice-corpse-while-falling petrification being the classic). Depth via
  emergent interaction.

**→ Nethook:** We adopt the **three-pane layout**, **hjkl + arrows**, the **`@`
player**, water as `~`/`≈`, the `$` shop, and **lowercase/uppercase fish by
size/strength**. Our RNG is a **seeded mulberry32** carried on game state — the
same "seed ⇒ reproducible run" property NetHack has, which is what makes our
headless tests deterministic. The "DevTeam" ethos shows up as flavour: per-species
catch messages, junk items, and a mythic leviathan.

### 1.3 Color & message-log discipline
- **Use of color** (RogueBasin, *mirror*): console roguelikes assume a 16-color
  (CGA) palette; "bright colors get noticed first," so colour walls/threats/loot
  and leave floor/junk muted. **Accessibility:** don't encode meaning by red-vs-
  green alone (red/green colour-blindness) — pair colour with a glyph/brightness
  difference or a text label.
- **Message pacing** (Guidebook, *fetched*): the top line shows one message; a
  `--More--` prompt gates multiple messages so none is missed; `Ctrl-P` recalls
  history.

**→ Nethook:** Rarity tiers map to colours (common→mythic), but rarity is **also**
encoded by glyph and stated in the catch message, so it never depends on colour
alone. We keep a small rolling message log rather than a `--More--` gate (our
events are one-per-turn, so gating isn't needed) — a deliberate, documented
simplification.

---

## 2. Procedural map generation

Four techniques surveyed (RogueBasin via *mirror*; Red Blob *fetched*):

| Technique | Gist | Best for |
|---|---|---|
| **Cellular automata** | Random fill ~40–45% walls, then repeatedly apply "a cell is wall if ≥5 of its 9-cell neighbourhood are walls" (~4–7 passes). | **Organic lakes/ponds with ragged shorelines.** |
| **Noise (Perlin/Simplex)** | Sum octaves `1·noise(1f)+0.5·noise(2f)+…`, normalise, reshape with `pow(e, exponent)`; threshold elevation into water/beach/land bands. | **Smooth depth gradients** → shallow vs deep zones, depth-based fish spawns. |
| **Drunkard's walk** | From a start cell, step randomly, carving floor until a target fill; guaranteed connected. | **Meandering rivers/streams**, connecting separate water bodies. |
| **BSP** | Recursively split a rectangle (split ratio 0.45–0.55 homogeneous), place non-overlapping rooms, connect leaves. | **Man-made structures** (docks/huts/tackle shop). |

**→ Nethook:** `world.mjs` currently uses a **noise-like radial elevation** field
(distance-from-centre + jitter → deep/shallow bands) plus decorative passes for
reeds/lilypads/rocks, and a carved dock + shop — a pragmatic blend of the *noise*
(depth bands for habitat) and *BSP* (placed features) ideas. **Deferred:** swapping
the radial field for **cellular automata** would give more natural, irregular
shorelines; **drunkard's walk** could add inlets/streams. Both are drop-in upgrades
to `generateLake()`.

---

## 3. Terminal UI craft in Node (zero-dependency)

Verified against the Node docs and the ANSI reference (*fetched*):

- **Raw input:** `process.stdin.setRawMode(true)` gives char-by-char input with no
  echo; **Ctrl-C stops raising SIGINT** and arrives as the byte `\x03` — you must
  handle it yourself. Guard on `process.stdin.isTTY`. `readline.emitKeypressEvents`
  decodes arrow keys (`\x1b[A/B/C/D`) into `key.name` for you.
- **Signals:** registering a `SIGINT`/`SIGTERM` listener *removes* Node's default
  terminal-restoring exit — so your handler must restore the terminal and call
  `process.exit()`. The `'exit'` handler must be **synchronous only**.
- **Screen:** enter the **alternate screen buffer** `\x1b[?1049h` (so quitting
  restores the user's scrollback), **hide the cursor** `\x1b[?25l`, and reverse both
  on exit. Redraw from cursor-home `\x1b[H` **without** a full `\x1b[2J` clear to
  avoid flicker; **build the whole frame as one string and `write()` once**;
  optionally diff against a back-buffer for minimal output.
- **Library landscape:** `blessed`/`neo-blessed` (widget toolkits, now largely
  **unmaintained**), `ink` (React-for-CLI; great for forms/dashboards, awkward for a
  per-cell game grid; powers Claude Code itself), `terminal-kit` (heavy, capable),
  and **`rot.js`** — a purpose-built roguelike toolkit (map gen, FOV, pathfinding,
  RNG, scheduler, and a `Display` with a Node `layout:"term"` backend).
- **Open a new terminal window:** `tmux split-window '<cmd>'` (cleanest, inherits
  env); macOS `osascript -e 'tell app "Terminal" to do script "<cmd>"'`; Linux
  `x-terminal-emulator -e`/`gnome-terminal --`/`konsole -e`/`xterm -e`; Windows
  `wt.exe`/`start`. **Gotchas:** GUI-launched terminals start from the *login*
  environment, not your shell's exported vars — pass state on the command line;
  spawn `{detached:true, stdio:'ignore'}` + `unref()` so the window outlives the CLI;
  PowerShell treats `;` specially and `wt.exe` blocks until close (use
  `Start-Process`).

**→ Nethook:** This is exactly the stack `game/index.mjs` and `game/launch.mjs`
implement — zero-dependency raw ANSI, alt-screen + hidden cursor, single-write
frames, explicit SIGINT/SIGTERM teardown, and an env-detecting window launcher with
a print fallback. The research validated our **"hand-roll the I/O, no framework"**
choice for a fixed-grid game; **rot.js** is the one library we'd consider later, and
only for *logic* (FOV/pathfinding/CA map gen), never the renderer. Our launcher
already inlines env vars into the spawned command per the propagation gotcha.

---

## 4. Fishing-game mechanics (genre survey)

What the best fishing games actually do, and how Nethook borrows from each.

### 4.1 The tension fight — **Sega Bass Fishing** (*fetched: Wikipedia, DC manual*)
A **line-tension gauge**: a safe mid-zone, with **too-high tension → line breaks**
and **too-low → hook slips**. You **stop reeling and steer opposite the fish's run**
to bleed tension, then resume. Bigger fish are rarer, fight harder, favour specific
spots/depths/times. Lures are rated by difficulty and by depth zone (surface/
shallow/mid/deep); surface lures work at dawn/dusk, deep cranks at midday.
**→ Nethook:** our reel minigame is a direct descendant — `tension` rises as you
`reel`, you `ease` to bleed it, the line **snaps at max tension**, and fish
`strength` sets the fight length. Rods/bait map to the difficulty/depth idea.

### 4.2 Keep-it-in-the-zone — **Stardew Valley** (*fetched: SDV Wiki / GameSpot*)
A **cast-distance meter**, then a minigame: keep a fish icon inside a **moving green
bar** to fill a catch meter; **tapping raises the bar, releasing lowers it**; rarer
fish "move more frantically." **→ Nethook:** the tap-vs-release tension dynamic
informs our reel/ease control; rarity-scaled difficulty is reflected via fish
`strength`.

### 4.3 Shadow-size ID, location/time/weather gating — **Animal Crossing: NH** (*fetched: Nookipedia*)
Fish are identified by **shadow size** (Tiny→Huge + "Finned"/"Long & Thin").
A fish **nibbles up to 4× then bites on the 5th**; you react to the float
**submerging** (the "plop"), not the nibbles. Spawns gate by **body of water**
(sea/river/river-mouth/pond/waterfall/pier), **time band**, **season/hemisphere**,
and **weather** (the coelacanth is rain-only). **Fish bait** force-spawns a fish.
Rods tier by **durability** (flimsy→golden); the golden rod recipe is the reward for
a **complete Critterpedia**. **→ Nethook:** habitat gating (shallow/deep/reeds) is
our version of body-of-water gating; **time-of-day** is in the bite formula. The
**dex-completion → reward** loop is a strong deferred feature for us.

### 4.4 Depth/biome rod-gating, minigame variety, trophies — **DREDGE** (*fetched: wiki.gg / Game Developer*)
Fish live in **Disturbed Water**; each spot needs the **right rod** for its
**depth/biome** (Coastal/Oceanic/Abyssal/Volcanic/Ice…) or shows a crossed-out icon.
**Multiple minigame variants** (radial, pendulum, rising-balls) exist specifically
because one minigame felt repetitive; **harder fish = smaller green windows / faster,
branching patterns**; a rare **gold window** lands a **Trophy** (top-15% size, +~25%
value). Catches **decay** Fresh→Stale→Rotting; **aberrations** (corrupted variants)
appear at night / under a green glow and feed a panic system. An **Encyclopedia**
records sizes/locations/variants; equipment unlocks via a **research-parts** tree.
**→ Nethook:** validates rarity-scaled difficulty and the rod-unlocks-deeper-water
loop. **Deferred & enticing:** multiple reel-minigame variants, **trophy** catches,
freshness decay, and "aberration"-style rare variants.

### 4.5 The arcade loop & fishpedia — **Ridiculous Fishing** (*fetched: Wikipedia / Kotaku*)
A three-phase loop (drop-dodge → reel-catch → shoot) where **reel length gates
depth**, **jellyfish cost money** (anti-reward), and a **66-entry "Fish-o-pedia"**
drives collection and level unlocks. **→ Nethook:** reinforces **junk items as
comedy/anti-reward** (our boot/can) and the **collectible dex as the meta-hook**.

### 4.6 Common pattern across all five
Cast → detect/await bite → **skill-based reel** → reward scaled by **rarity** →
**gear upgrades** unlock harder/rarer fish → **collection/dex** provides the long
tail. Gating axes recur: **depth, location, time-of-day, season, weather, bait.**
Nethook implements the spine (cast→bite→reel→rarity→gear→logbook) with depth +
time-of-day gating; the other axes are the obvious content-expansion path,
especially via **Spot Packs**.

---

## 5. Open-source prior art (GitHub)

Real projects worth learning from (URLs in Sources; all verified to resolve):

**Fishing-specific (closest analogs):**

| Repo | Lang | What | Lesson for Nethook |
|---|---|---|---|
| `red-cockroach137/terminal-fish` | Python/Bash | The closest analog: terminal fishing + a "FishDex" Pokédex + a live ASCII aquarium | A ready-made **5-tier rarity model** (common 65% / uncommon 25% / rare 8% / epic 2% / legendary 0.01%) and **F–SSS catch grades** by % of species max size; split catcher/dex/aquarium as modules |
| `BartMassey/fishing` | Python | Minimal console fishing: cast, per-species catch probability, persisted high scores | A dead-simple weighted-probability + disk-persistence MVP skeleton (what we built, validated) |
| `patrickb84/humble-fisherman` | Java | Console fishing inspired by Ocarina of Time's minigame | Porting a real-time reel/timing fight into pure text |
| `daviddwk/freefish` | C/JSON | Hackable terminal fishtank; fish defined as **JSON** | Validates our **JSON Spot Pack** data-driven approach |
| `evskii/UnityFishingMinigame` | C# | Stardew-style minigame, **CSV-driven** fish data | Spreadsheet/JSON-as-fish-DB is the right authoring pattern |
| `cmatsuoka/asciiquarium` · `cognitivegears/asciiquarium_redux` | Perl/Py | Classic ASCII aquarium; the *redux* adds an interactive hook (spacebar → collision → catch) | Sprite animation cadence + how to bolt interactivity onto an ambient loop |

**Roguelike / terminal engine:**

| Repo | Lang | What | Lesson for Nethook |
|---|---|---|---|
| `ondras/rot.js` | TS/JS | Roguelike toolkit (map/FOV/path/RNG/scheduler, term Display) | The reference for roguelike *logic*; our fallback if we outgrow hand-rolled gen |
| `robertrypula/terminal-game-io` | TS | Minimal ASCII-frame + keyboard I/O for Node | Confirms the "frame string + key events" loop we hand-rolled |
| `luetkemj/jsrlt` | JS | "JavaScript Roguelike Tutorial" (rot.js) | Canonical structure for a JS roguelike |
| `ligurio/awesome-ttygames` | list | Curated index of Unix TTY games | Discovery index + TUI conventions survey |
| `nex2null/IdleBattle` · `Carson-DeSotel/idle-terminal` | TS | Idle/incremental games *in the terminal* | Patterns for accruing progress across repeated CLI launches (a "while-you-wait" idle layer) |

**Lesson summary:** data-driven content (freefish JSON / UnityFishingMinigame CSV →
our Spot Packs), a thin frame+input loop (terminal-game-io → our `index.mjs`), a
weighted-probability + persistence MVP (BartMassey, terminal-fish → our core +
logbook), and rot.js for heavy logic later. Note: GitHub is full of unrelated
"fish-shooting arcade/casino" source dumps — a different genre, excluded.

## 5.1 Real-world data sources (for Spot Packs)
To ground `/nethook:spot` content (real species, tackle, strategy) beyond Claude's
own knowledge, these open sources model the real world (all verified live):

| Source | Data | Notes |
|---|---|---|
| **FishBase** (rOpenSci API) | 35k+ species: depth range, temperature, habitat, distribution | tolerances → which species *can* be at a spot |
| **GBIF** / **OBIS** | billions of geolocated occurrence records (lat/lon, date, depth) | encounter probability → which species *actually* appear (OBIS = marine) |
| **iNaturalist** | citizen-science observations + photos | corroboration / regional flavour |
| **NOAA CO-OPS** | tides, currents, **water temp**, wind, **barometric pressure** | real environment inputs |
| **Solunar theory** | major/minor feeding periods from moon position | **computable in-engine** from lat/lon+date — no API needed |

**Modelling the bite (future):** a composite `bite ≈ f(time-of-day/light) ×
g(water-temp vs species optimum) × h(barometric trend) × s(solunar) × spawn-state`.
Lure→species has **no open dataset** — it's a hand-authored rules table (e.g.
crankbait→walleye/bass at mid-depth; jig→bottom feeders; topwater→dawn/dusk
predators). **Licensing:** prefer CC0/CC-BY GBIF/OBIS records and public-domain NOAA
data; FishBase/iNaturalist/Fishbrain need clearance for commercial use.

**→ Nethook:** today Spot Packs are authored by Claude from knowledge, which is
plenty for a novelty game. If we ever want *grounded* realism, GBIF/OBIS + FishBase
could seed a pack's species list and a solunar/temperature model could drive the
bite formula — a clean, well-scoped enhancement to the `/nethook:spot` generator.

---

## 6. Design decisions, traced to research

| Decision in Nethook | Grounded in |
|---|---|
| Three-pane layout, `@`, `~`/`≈` water, `$` shop, hjkl+arrows | NetHack Guidebook; RogueBasin glyphs |
| Lowercase/uppercase fish by size; colour = rarity (+glyph+text, not colour-alone) | NetHack monster convention; RogueBasin "Use of color" + accessibility |
| Seeded mulberry32 RNG on game state (reproducible runs ⇒ headless tests) | NetHack seeding behaviour |
| Reel = rising tension, `ease` to bleed, **snap at max**, fight length ∝ strength | Sega Bass tension gauge; Stardew tap/release |
| Rarity-scaled difficulty & value; rods/bait unlock deeper/rarer | Sega Bass / DREDGE / AC:NH gear tiers |
| Habitat (shallow/deep/reeds) + time-of-day gating | AC:NH & DREDGE spawn gating |
| Junk items (boot/can) as comedy anti-reward | Ridiculous Fishing jellyfish |
| Persistent logbook/dex as the meta-hook; bounded "trips" not hard permadeath | AC:NH Critterpedia; roguelite trip structure |
| Zero-dep raw ANSI, alt-screen, single-write frames, explicit teardown | Node tty/readline/process docs; ANSI reference |
| Spot Packs as validated JSON content | freefish (JSON fish); Berlin "random/varied environments" |

## 7. Deferred ideas worth stealing later
- **Cellular-automata / drunkard's-walk lakes** for more organic shorelines & streams.
- **Multiple reel-minigame variants** (radial / pendulum / rising-balls) — DREDGE's
  fix for repetition.
- **Trophy catches** (rare gold window, top-N% size, value bonus) and **aberration**
  rare variants.
- **More gating axes:** season, weather, bait that force-spawns — huge content
  leverage, especially expressed through Spot Packs.
- **Dex-completion rewards** (e.g. a legendary rod for filling the logbook).
- **Catch freshness/decay** and a small spatial inventory (DREDGE) if we ever add
  selling/economy depth.
- Optional **rot.js** for FOV/pathfinding if the world gains AI actors.
- **Catch grades** (terminal-fish's F–SSS by % of a species' max size) layered on
  top of our weight/points, for extra "personal best" texture.
- A light **idle-accrual layer** between launches (IdleBattle/idle-terminal style) —
  e.g. a set crab pot that yields a little while you're away.
- **Grounded Spot Packs:** seed species from GBIF/OBIS + FishBase and drive bites
  with a solunar/water-temperature model (see §5.1).

---

## Sources

**Roguelike canon**
- Berlin Interpretation — RogueBasin: https://www.roguebasin.com/index.php/Berlin_Interpretation (403 to fetchers; valid in browser)
- Berlin factors (academic, fetched) — Game Studies / Cartlidge: https://gamestudies.org/2403/articles/cartlidge
- ASCII / glyphs / user-interface features (RogueBasin, via mirror) — https://www.roguebasin.com/index.php/ASCII · https://www.roguebasin.com/index.php?title=User_interface_features · mirror: https://github.com/Chizaruu/roguebasin
- Use of color (RogueBasin, mirror) — https://www.roguebasin.com/index.php/Use_of_color
- "@ = where you're at" / monsters as letters — https://en.wikipedia.org/wiki/Rogue_(video_game) · https://en.wikipedia.org/wiki/Roguelike

**NetHack**
- Guidebook (fetched) — https://www.nethack.org/v366/Guidebook.html · https://www.nethack.org/v343/Guidebook.html
- Predicting/controlling RNG (fetched) — https://taeb.github.io/2009/03/02/predicting-and-controlling-nethacks-randomness.html
- Object identification spoiler (fetched) — http://www.chiark.greenend.org.uk/~damerell/games/nhid.html
- Bones / permadeath (snippet) — https://nethackwiki.com/wiki/Bones · https://en.wikipedia.org/wiki/NetHack
- TDTTOE (snippet) — https://nethackwiki.com/wiki/The_DevTeam_Thinks_of_Everything · https://tvtropes.org/pmwiki/pmwiki.php/DevelopersForesight/NetHack

**Procedural generation**
- Cellular automata caves (RogueBasin, mirror) — https://www.roguebasin.com/index.php/Cellular_Automata_Method_for_Generating_Random_Cave-Like_Levels
- Basic BSP dungeon (RogueBasin, mirror) — https://www.roguebasin.com/index.php/Basic_BSP_Dungeon_generation
- Random walk caves (RogueBasin, mirror) — https://www.roguebasin.com/index.php?title=Random_Walk_Cave_Generation
- Terrain from noise (fetched) — https://www.redblobgames.com/maps/terrain-from-noise/

**Terminal UI craft (Node)**
- Node tty — https://nodejs.org/api/tty.html · readline — https://nodejs.org/api/readline.html · process — https://nodejs.org/api/process.html
- ANSI escape codes — https://en.wikipedia.org/wiki/ANSI_escape_code
- rot.js — https://github.com/ondras/rot.js · https://ondras.github.io/rot.js/manual/ · npm `rot-js`
- blessed — https://github.com/chjj/blessed · neo-blessed — https://github.com/embarklabs/neo-blessed · ink — https://github.com/vadimdemedes/ink · terminal-kit — https://github.com/cronvel/terminal-kit
- Windows Terminal CLI — https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments · tmux(1) — https://www.man7.org/linux/man-pages/man1/tmux.1.html · macOS osascript — https://scriptingosx.com/2020/03/macos-shell-command-to-create-a-new-terminal-window/

**Fishing-game mechanics**
- Sega Bass Fishing — https://en.wikipedia.org/wiki/Sega_Bass_Fishing · DC manual (archive.org) — https://archive.org/stream/SEGADreamcastManuals_201812/Sega%20Bass%20Fishing%20(USA)_djvu.txt
- Stardew Valley fishing — https://stardewvalleywiki.com/Fishing
- Animal Crossing: NH — https://nookipedia.com/wiki/Fishing · https://nookipedia.com/wiki/Critterpedia
- DREDGE — https://dredge.wiki.gg/wiki/Minigames · https://dredge.wiki.gg/wiki/Fish · https://www.gamedeveloper.com/design/deep-dive-the-surprising-depth-of-spatial-inventories-in-dredge
- Ridiculous Fishing — https://en.wikipedia.org/wiki/Ridiculous_Fishing · https://kotaku.com/ridiculous-fishing-is-as-fun-as-shooting-fish-in-a-barr-5990652

**Open-source prior art**
- Fishing: https://github.com/red-cockroach137/terminal-fish · https://github.com/BartMassey/fishing · https://github.com/patrickb84/humble-fisherman · https://github.com/daviddwk/freefish · https://github.com/evskii/UnityFishingMinigame · https://github.com/cmatsuoka/asciiquarium · https://github.com/cognitivegears/asciiquarium_redux
- Roguelike/terminal: https://github.com/ondras/rot.js · https://github.com/robertrypula/terminal-game-io · https://github.com/luetkemj/jsrlt · https://github.com/ligurio/awesome-ttygames · https://github.com/nex2null/IdleBattle · https://github.com/Carson-DeSotel/idle-terminal

**Real-world data (for grounded Spot Packs)**
- FishBase API — https://github.com/ropensci/fishbaseapi · GBIF — https://techdocs.gbif.org/en/openapi/ · OBIS — https://obis.org/ · iNaturalist — https://api.inaturalist.org/v1/docs/ · NOAA CO-OPS — https://api.tidesandcurrents.noaa.gov/api/prod/ · Solunar theory — https://en.wikipedia.org/wiki/Solunar_theory

> Research conducted June 2026 via fanned-out web search + source fetching, with
> claims labelled by confidence. RogueBasin and several game wikis block automated
> fetchers (HTTP 403); where noted, verbatim mirrors or browser-UA fetches were used
> and corroborated against primary docs.
