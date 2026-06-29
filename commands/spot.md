---
description: Generate a Nethook "Spot Pack" for a real-world fishing location — ASCII map, real species, real tackle, real strategy — and install it so it's playable.
---

The user wants a playable Nethook **Spot Pack** for a real fishing location:
**$ARGUMENTS** (if empty, ask them which lake / river / coast).

Research the location (use what you know; web search if available) and produce a
JSON Spot Pack that is both *fun to play* and *factually grounded*. This doubles as
a real fishing primer, so keep species, tackle, and strategy authentic.

## Schema
```json
{
  "name": "Lake Taupō",
  "location": "North Island, New Zealand",
  "notes": "1-3 sentence flavour intro.",
  "map": {
    "grid": ["......", ".~~~~.", ".~≈≈~.", ".~~~~.", "......"],
    "legend": { ".": "land", "~": "shallow", "≈": "deep", "\"": "reeds", ",": "lily", "#": "rock", "=": "dock", "$": "shop" }
  },
  "species": [
    { "name": "Rainbow Trout", "glyph": "F", "rarity": "uncommon", "habitat": "deep",
      "weightRange": [0.8, 3.5], "strength": 4,
      "time": ["dawn", "dusk"], "season": ["spring", "summer"], "weather": ["clear", "cloudy"], "bait": ["lure"],
      "behavior": "short in-world flavour", "realInfo": "a true fact about catching it" }
  ],
  "tackle": [ { "name": "Smelt Fly", "type": "bait", "effect": "+trout" } ],
  "strategy": [ "real, actionable tip", "another tip" ],
  "hints": { "seasons": ["spring", "summer", "autumn", "winter"], "weather": ["clear", "cloudy", "rain", "fog", "wind"] }
}
```

Rules:
- `rarity` ∈ common | uncommon | rare | legendary | mythic. Make the iconic catch
  rare/legendary; include 1 junk item (`"junk": true`) for comedy; 4-7 species total.
- `habitat` ∈ shallow | deep | reeds | any. `weightRange` is `[min, max]` kg, min ≤ max.
- `glyph` is a single character (f/F small/big fish, e eel-like, S/C big, ♦ rare, } junk).
- **Optional environment gates** (this is where realism pays off — use them to make
  each trip play differently): `time` ⊂ dawn|day|dusk|night, `season` ⊂
  spring|summer|autumn|winter, `weather` ⊂ clear|cloudy|rain|fog|wind|storm|snow,
  `bait` = list of bait ids the fish prefers (doubles its odds when that bait is on).
  Each is a list; omit (or use `["any"]`) to leave a species ungated. Gate the
  signature seasonal/low-light/weather-dependent fish — e.g. a winter spawning run,
  a dawn-only riser, a rain-only oddity. Unknown tokens are dropped safely.
- **Water temperature** (optional, grounds the bite): give cold/warm-water species
  a `tempOptimum` (°C) and `tempRange` (± tolerance). The engine derives each trip's
  water temp from the season around `hints.baseTemp` (the spot's annual mean °C), so
  a species fades when the water is wrong for it. E.g. trout `tempOptimum: 11`, a
  tropical species `tempOptimum: 28`.
- `hints.seasons` / `hints.weather` narrow the pools this spot rolls from each trip
  (e.g. a tropical flat is never "snow"). `hints.baseTemp` sets the annual-mean water
  temperature. Omit to allow all engine defaults (~14 °C temperate).
- The bite also follows a **solunar** model computed from the moon phase on the real
  date (engine-side, no input needed) — you don't author this, just know dawn/dusk,
  good weather, the right temperature, and new/full moons all stack up to more bites.
- `map` is optional — omit it to use a procedural lake. If you include one, make it
  ~10-16 rows, water in the middle, a `=` dock on a shore.

## Steps
1. Write the JSON to `${CLAUDE_PLUGIN_DATA}/packs/<slug>.json` (slug = lowercased name,
   non-alphanumerics → `-`). Create the `packs` directory if needed.
2. Validate it:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/game/packcheck.mjs" "${CLAUDE_PLUGIN_DATA}/packs/<slug>.json"
   ```
   If it prints `INVALID`, fix the reported issues and re-validate.
3. Tell the user it's ready and that they can play it with:
   `/gofish "<name>"`
