// Builds a playable world: a tile grid + species table + fish entities, from a
// Spot Pack (real place) or a procedural fictional lake. Pure given an rng state.

import { rand, randint, weightedPick } from "./rng.mjs";
import { BUILTIN_SPECIES, RARITY } from "./fish.mjs";

export const TILE = {
  LAND: ".", SHALLOW: "~", DEEP: "≈", REEDS: '"', LILY: ",",
  ROCK: "#", DOCK: "=", SHOP: "$",
};

const WATER = new Set([TILE.SHALLOW, TILE.DEEP, TILE.REEDS, TILE.LILY]);
const WALKABLE = new Set([TILE.LAND, TILE.DOCK, TILE.SHOP]);

export const isWater = (ch) => WATER.has(ch);
export const isWalkable = (ch) => WALKABLE.has(ch);

export function tileHabitat(ch) {
  if (ch === TILE.DEEP) return "deep";
  if (ch === TILE.REEDS) return "reeds";
  if (ch === TILE.SHALLOW || ch === TILE.LILY) return "shallow";
  return null; // rock / non-fishable
}

// Default character -> tile mapping for Spot Pack ASCII maps.
const PACK_CHAR = {
  ".": TILE.LAND, " ": TILE.LAND, "~": TILE.SHALLOW, "≈": TILE.DEEP, "=": TILE.DOCK,
  "#": TILE.ROCK, "$": TILE.SHOP, '"': TILE.REEDS, ",": TILE.LILY,
};

function speciesForPack(pack) {
  if (pack && pack.species && pack.species.length) return pack.species;
  return BUILTIN_SPECIES;
}

export function buildWorld(seedState, pack = null) {
  const species = speciesForPack(pack);
  let grid;
  if (pack && pack.map && Array.isArray(pack.map.grid)) {
    grid = parsePackMap(pack.map);
  } else {
    grid = generateLake(seedState);
  }
  const world = {
    width: grid[0].length,
    height: grid.length,
    tiles: grid, // array of arrays of chars
    spotName: pack ? pack.name : "Still Water Lake",
    location: pack ? pack.location : "(procedurally generated)",
    species,
    strategy: pack ? pack.strategy : [],
    tackle: pack ? pack.tackle : [],
    fish: [],
    playerStart: null,
    shop: null,
  };
  locateFeatures(world);
  spawnFish(world, seedState);
  return world;
}

function parsePackMap(map) {
  const h = map.grid.length;
  const w = Math.max(...map.grid.map((r) => r.length));
  const legend = map.legend || {};
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    const src = map.grid[y].padEnd(w, ".");
    for (let x = 0; x < w; x++) {
      const ch = src[x];
      // legend value (e.g. "deep") can name a TILE key, else fall back to char map.
      const legended = legend[ch];
      let tile = PACK_CHAR[ch];
      if (legended) {
        const byName = { land: TILE.LAND, shallow: TILE.SHALLOW, deep: TILE.DEEP, reeds: TILE.REEDS,
          lily: TILE.LILY, rock: TILE.ROCK, dock: TILE.DOCK, shop: TILE.SHOP }[String(legended).toLowerCase()];
        if (byName) tile = byName;
      }
      row.push(tile || TILE.LAND);
    }
    grid.push(row);
  }
  return grid;
}

// Procedural lakes. Each trip's world is built from one of three pure,
// rng-driven water-mask generators (RESEARCH.md §2, §7), then depth + decoration
// are applied uniformly. Variety keeps repeated trips visually fresh:
//   radial    — the original smooth blob (round pond)
//   cellular  — cellular-automata: ragged organic shoreline (cave-style smoothing)
//   drunkard  — a random walk: meandering inlets / a stream-like body
function generateLake(state) {
  const W = 46, H = 18;
  const kind = rand(state);
  let water = kind < 0.34 ? radialMask(state, W, H)
    : kind < 0.67 ? cellularMask(state, W, H)
      : drunkardMask(state, W, H);
  // Guard: never ship an empty lake — fall back to the dependable radial blob.
  let count = 0;
  for (const row of water) for (const c of row) if (c) count++;
  if (count < W * H * 0.1) water = radialMask(state, W, H);
  return maskToTiles(state, water, W, H);
}

// A round-ish blob: distance-from-centre with a little jitter.
function radialMask(state, W, H) {
  const g = blank(W, H, false);
  const cx = W / 2, cy = H / 2;
  const rx = W * (0.34 + rand(state) * 0.05);
  const ry = H * (0.34 + rand(state) * 0.05);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const noise = (rand(state) - 0.5) * 0.22;
      if (Math.hypot((x - cx) / rx, (y - cy) / ry) + noise < 1) g[y][x] = true;
    }
  return g;
}

// Cellular automata: random fill, then smooth — a cell is water unless it has
// 5+ land neighbours (border counts as land). Ragged, organic shorelines.
function cellularMask(state, W, H) {
  let g = blank(W, H, false);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) g[y][x] = rand(state) < 0.46;
  for (let pass = 0; pass < 5; pass++) {
    const n = blank(W, H, false);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let land = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || !g[ny][nx]) land++;
          }
        n[y][x] = x > 0 && y > 0 && x < W - 1 && y < H - 1 && land < 5;
      }
    g = n;
  }
  return g;
}

// Drunkard's walk from the centre, carving water until a target fill, then
// widened a touch so channels read as water rather than a 1px scratch.
function drunkardMask(state, W, H) {
  const g = blank(W, H, false);
  const target = Math.floor(W * H * 0.3);
  let x = Math.floor(W / 2), y = Math.floor(H / 2), filled = 0, guard = 0;
  while (filled < target && guard < W * H * 40) {
    guard++;
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && !g[y][x]) { g[y][x] = true; filled++; }
    const dir = Math.floor(rand(state) * 4);
    if (dir === 0 && x < W - 2) x++;
    else if (dir === 1 && x > 1) x--;
    else if (dir === 2 && y < H - 2) y++;
    else if (dir === 3 && y > 1) y--;
  }
  const w = g.map((r) => r.slice());
  for (let yy = 1; yy < H - 1; yy++)
    for (let xx = 1; xx < W - 1; xx++)
      if (g[yy][xx]) {
        if (rand(state) < 0.6) w[yy][xx + 1] = true;
        if (rand(state) < 0.4) w[yy + 1][xx] = true;
      }
  return w;
}

// Turn a boolean water mask into a tile grid: interior (4-neighbours all water)
// becomes deep, the fringe shallow; then scatter reeds / lilypads / rocks.
function maskToTiles(state, water, W, H) {
  const isW = (x, y) => x >= 0 && y >= 0 && x < W && y < H && water[y][x];
  const grid = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (water[y][x] ? TILE.SHALLOW : TILE.LAND)),
  );
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (water[y][x] && isW(x + 1, y) && isW(x - 1, y) && isW(x, y + 1) && isW(x, y - 1)) {
        grid[y][x] = TILE.DEEP;
      }
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== TILE.SHALLOW) continue;
      const r = rand(state);
      if (touchesLand(grid, x, y) && r < 0.4) grid[y][x] = TILE.REEDS;
      else if (r > 0.92) grid[y][x] = TILE.LILY;
    }
  for (let i = 0; i < 8; i++) {
    const x = randint(state, 1, W - 2), y = randint(state, 1, H - 2);
    if (grid[y][x] === TILE.DEEP || grid[y][x] === TILE.SHALLOW) grid[y][x] = TILE.ROCK;
  }
  return grid;
}

function blank(W, H, fill) {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => fill));
}

function touchesLand(grid, x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ny = y + dy, nx = x + dx;
    if (grid[ny] && grid[ny][nx] === TILE.LAND) return true;
  }
  return false;
}

// Ensures the world has a dock the player starts on and a shop nearby.
function locateFeatures(world) {
  const { tiles, width, height } = world;
  // If the pack map already placed a dock, start there.
  let dock = findTile(tiles, TILE.DOCK);
  if (!dock) {
    // Carve a dock: a land cell adjacent to water becomes the dock.
    outer: for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (tiles[y][x] === TILE.LAND && adjacentWater(world, x, y)) {
          tiles[y][x] = TILE.DOCK;
          dock = { x, y };
          break outer;
        }
      }
    }
  }
  if (!dock) {
    // Degenerate map with no water-adjacent land: drop a dock in the middle.
    dock = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    tiles[dock.y][dock.x] = TILE.DOCK;
  }
  world.playerStart = dock;

  let shop = findTile(tiles, TILE.SHOP);
  if (!shop) {
    shop = findNearbyLand(world, dock);
    if (shop) tiles[shop.y][shop.x] = TILE.SHOP;
  }
  world.shop = shop;
}

function findTile(tiles, ch) {
  for (let y = 0; y < tiles.length; y++)
    for (let x = 0; x < tiles[y].length; x++) if (tiles[y][x] === ch) return { x, y };
  return null;
}

export function adjacentWater(world, x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = tileAt(world, x + dx, y + dy);
    if (t && isWater(t)) return { x: x + dx, y: y + dy };
  }
  return null;
}

function findNearbyLand(world, from) {
  for (let r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = from.x + dx, y = from.y + dy;
        if (tileAt(world, x, y) === TILE.LAND) return { x, y };
      }
    }
  }
  return null;
}

export function tileAt(world, x, y) {
  if (y < 0 || y >= world.height || x < 0 || x >= world.width) return null;
  return world.tiles[y][x];
}

function spawnFish(world, state) {
  const waterCells = [];
  for (let y = 0; y < world.height; y++)
    for (let x = 0; x < world.width; x++)
      if (isWater(world.tiles[y][x]) && world.tiles[y][x] !== TILE.ROCK) waterCells.push({ x, y });
  const count = Math.min(waterCells.length, 7 + Math.floor(rand(state) * 4));
  for (let i = 0; i < count; i++) {
    const cell = waterCells[randint(state, 0, waterCells.length - 1)];
    const hab = tileHabitat(world.tiles[cell.y][cell.x]);
    const candidates = world.species
      .filter((s) => !s.junk && (s.habitat === "any" || s.habitat === hab))
      .map((s) => ({ ...s, weight: RARITY[s.rarity].weight }));
    const sp = weightedPick(state, candidates) || world.species[0];
    world.fish.push({ x: cell.x, y: cell.y, speciesId: sp.id });
  }
}
