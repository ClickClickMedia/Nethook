// Frame renderer: state -> string. Pure (no I/O). Pass {color:false} for plain
// output (snapshot tests / non-ANSI terminals).

import { TILE } from "./world.mjs";
import { rod, bait } from "./core.mjs";
import { RARITY, RODS, BAITS } from "./fish.mjs";

const TILE_COLOR = {
  [TILE.LAND]: 32,    // green
  [TILE.SHALLOW]: 36, // cyan
  [TILE.DEEP]: 34,    // blue
  [TILE.REEDS]: 32,
  [TILE.LILY]: 92,
  [TILE.ROCK]: 90,
  [TILE.DOCK]: 33,    // yellow
  [TILE.SHOP]: 93,
};

function paint(ch, code, color) {
  return color ? `\x1b[${code}m${ch}\x1b[0m` : ch;
}

function bar(value, max, width, color, code = 32) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  const s = "█".repeat(filled) + "░".repeat(width - filled);
  return color ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export function render(state, { color = true } = {}) {
  const lines = [];
  const w = state.world.width;

  // Title
  lines.push(paint(`  🎣 NETHOOK — ${state.world.spotName}`, "1;36", color));
  lines.push("");

  // Map with player + fish overlaid
  const fishAt = new Map(state.world.fish.map((f) => [`${f.x},${f.y}`, f]));
  for (let y = 0; y < state.world.height; y++) {
    let row = "  ";
    for (let x = 0; x < w; x++) {
      if (x === state.player.x && y === state.player.y) {
        row += paint("@", "1;97", color);
        continue;
      }
      const f = fishAt.get(`${x},${y}`);
      if (f) {
        const sp = state.speciesById[f.speciesId];
        row += paint(sp ? sp.glyph : "f", RARITY[sp?.rarity]?.color ?? 37, color);
        continue;
      }
      const ch = state.world.tiles[y][x];
      row += paint(ch, TILE_COLOR[ch] ?? 37, color);
    }
    lines.push(row);
  }
  lines.push("");

  // Mode-specific panel
  if (state.mode === "reel" && state.reel) {
    const sp = state.speciesById[state.reel.speciesId];
    lines.push(`  ON THE LINE: ${sp.name}`);
    lines.push(`  TENSION  ${bar(state.reel.tension, state.reel.maxTension, 24, color, 31)} ${Math.round(state.reel.tension)}%`);
    lines.push(`  FIGHT    ${bar(state.reel.stamina, state.reel.maxStamina, 24, color, 33)}`);
    lines.push(`  [r] reel in   [e] ease off   — land it before the line snaps!`);
  } else if (state.mode === "shop") {
    lines.push("  🛖 SHANTY");
    lines.push(`  [1] ${nextLabel(state, "rod")}`);
    lines.push(`  [2] ${nextLabel(state, "bait")}`);
    lines.push("  [q] leave");
  } else if (state.mode === "gameover") {
    lines.push(paint(`  ☀️  DUSK — trip over. Score ${state.score}  (best ${state.logbook.bestScore})`, "1;33", color));
    lines.push(`  Caught this trip: ${state.caught.length}  |  Dex: ${Object.keys(state.logbook.dex).length} species`);
    lines.push("  [n] new trip   [q] quit");
  } else {
    // message log
    for (const m of state.messages.slice(-3)) lines.push(`  ${m}`);
  }

  lines.push("");
  // Status bar
  const daylight = bar(state.time.maxTurns - state.time.turn, state.time.maxTurns, 16, color, 33);
  const claude =
    state.claudeStatus === "done"
      ? paint("✅ Claude ready — reel in!", "1;92", color)
      : state.claudeStatus === "working"
        ? paint("…Claude is thinking", "90", color)
        : "";
  lines.push(
    `  ☀ ${daylight}  🎣${rod(state).name}  🪱${bait(state).name}  ◎${state.inventory.coins}c  ★${state.score}   ${claude}`,
  );
  lines.push(paint("  move: hjkl/arrows · f+dir: cast · $: shanty · q: quit", "90", color));

  return lines.join("\n");
}

function nextLabel(state, kind) {
  if (kind === "rod") {
    const next = RODS[state.inventory.rodLevel + 1] || null;
    return next ? `Upgrade rod → ${next.name} (${next.price}c)` : "Rod maxed";
  }
  const next = BAITS[state.inventory.baitLevel + 1] || null;
  return next ? `Upgrade bait → ${next.name} (${next.price}c)` : "Bait maxed";
}
