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

function generateLake(state) {
  const W = 46, H = 18;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => TILE.LAND));
  const cx = W / 2, cy = H / 2;
  const rx = W * (0.34 + rand(state) * 0.05);
  const ry = H * (0.34 + rand(state) * 0.05);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const noise = (rand(state) - 0.5) * 0.22;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + noise;
      if (d < 0.55) grid[y][x] = TILE.DEEP;
      else if (d < 1) grid[y][x] = TILE.SHALLOW;
    }
  }
  // Decorate: reeds along the shallow fringe, lilypads + rocks scattered.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== TILE.SHALLOW) continue;
      const r = rand(state);
      if (touchesLand(grid, x, y) && r < 0.4) grid[y][x] = TILE.REEDS;
      else if (r > 0.92) grid[y][x] = TILE.LILY;
    }
  }
  for (let i = 0; i < 8; i++) {
    const x = randint(state, 1, W - 2), y = randint(state, 1, H - 2);
    if (grid[y][x] === TILE.DEEP || grid[y][x] === TILE.SHALLOW) grid[y][x] = TILE.ROCK;
  }
  return grid;
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
