// Frame renderer: state -> string. Pure (no I/O). Pass {color:false} for plain
// output (snapshot tests / non-ANSI terminals).

import { TILE } from "./world.mjs";
import { rod, bait, phaseOf, potCost } from "./core.mjs";
import { RARITY, RODS, BAITS } from "./fish.mjs";

const WEATHER_ICON = { clear: "☀", cloudy: "☁", rain: "🌧", fog: "🌫", wind: "🌬" };
const PHASE_ICON = { dawn: "🌅", day: "🌞", dusk: "🌆" };

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

  // Title (with this trip's rolled environment)
  const phase = phaseOf(state.time);
  let env = "";
  if (state.season) {
    const temp = typeof state.waterTemp === "number" ? ` · ${state.waterTemp}°C` : "";
    const feed = typeof state.solunar === "number"
      ? ` · ${state.solunar >= 0.66 ? "🌕" : state.solunar >= 0.33 ? "🌓" : "🌑"}feeding`
      : "";
    env = paint(
      `   ${WEATHER_ICON[state.weather] ?? ""}${state.weather ?? ""} · ${state.season} · ${PHASE_ICON[phase] ?? ""}${phase}${temp}${feed}`,
      "90",
      color,
    );
  }
  lines.push(paint(`  🎣 NETHOOK — ${state.world.spotName}`, "1;36", color) + env);
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
    const mode = state.reel.mode || "steady";
    const aber = state.reel.aberrant ? paint("🜂 ABERRATION ", "1;95", color) : "";
    lines.push(`  ON THE LINE: ${aber}${sp.name}  ${paint(`(${MODE_LABEL[mode]})`, "1;35", color)}`);
    lines.push(`  TENSION  ${bar(state.reel.tension, state.reel.maxTension, 24, color, 31)} ${Math.round(state.reel.tension)}%`);
    lines.push(`  FIGHT    ${bar(state.reel.stamina, state.reel.maxStamina, 24, color, 33)}`);
    if (state.reel.slack > 0) {
      lines.push(`  SLACK    ${bar(state.reel.slack, state.reel.maxSlack || 100, 24, color, 95)} — keep tension up or the hook slips!`);
    }
    if (mode === "surge") {
      lines.push(state.reel.running
        ? paint("  ⚡ IT'S RUNNING — [e] ease off!", "1;91", color)
        : paint("  ~ line's slack — [r] reel in", "1;92", color));
    } else if (mode === "pendulum") {
      lines.push(`  LURE     ${pendulumTrack(state.reel, 24, color)}`);
      lines.push("  [r] reel only while ● is over the green zone");
    } else {
      lines.push("  [r] reel in   [e] ease off   — land it before the line snaps!");
    }
  } else if (state.mode === "shop") {
    lines.push("  🛖 SHANTY");
    lines.push(`  [1] ${nextLabel(state, "rod")}`);
    lines.push(`  [2] ${nextLabel(state, "bait")}`);
    const potLvl = state.logbook.gear.potLevel | 0;
    lines.push(`  [3] ${potLvl ? `Upgrade crab pot → Mk ${potLvl + 1} (${potCost(potLvl)}c)` : "Buy crab pot (80c) — yields while away"}`);
    lines.push("  [q] leave");
  } else if (state.mode === "gameover") {
    lines.push(paint(`  ☀️  DUSK — trip over. Score ${state.score}  (best ${state.logbook.bestScore})`, "1;33", color));
    const tripTrophies = state.caught.filter((c) => c.trophy).length;
    const tripAber = state.caught.filter((c) => c.aberrant).length;
    const flags = `${tripTrophies ? ` 🏆${tripTrophies}` : ""}${tripAber ? ` 🜂${tripAber}` : ""}`;
    const dexVals = Object.values(state.logbook.dex);
    const realDex = dexVals.filter((d) => !d.junk).length;
    const oddities = dexVals.length - realDex;
    lines.push(
      `  Caught this trip: ${state.caught.length}${flags}  |  ` +
        `Dex: ${realDex} species${oddities ? ` (+${oddities} oddities)` : ""}  |  ` +
        `Trophies: ${state.logbook.totals.trophies || 0}  |  Aberrations: ${state.logbook.totals.aberrations || 0}`,
    );
    const bounties = state.bounties || [];
    if (bounties.length) {
      const done = bounties.filter((b) => b.done).length;
      lines.push(`  Bounties: ${done}/${bounties.length}  ${bounties.map((b) => `${b.done ? "✔" : "✗"} ${b.desc}`).join("  ·  ")}`);
    }
    lines.push("  [n] new trip   [q] quit");
  } else {
    // bounties (this trip's goals) then the message log
    if (state.bounties && state.bounties.length) {
      const bs = state.bounties
        .map((b) => paint(`${b.done ? "✔" : "○"} ${b.desc} (+${b.reward}c)`, b.done ? "32" : "90", color))
        .join("   ");
      lines.push(`  ${bs}`);
    }
    for (const m of state.messages.slice(-2)) lines.push(`  ${m}`);
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

const MODE_LABEL = { steady: "steady haul", surge: "it's a runner!", pendulum: "find the zone" };

// A pendulum track: the sweeping lure (●) over a green sweet-spot zone (▓).
function pendulumTrack(reel, width, color) {
  const marker = Math.round((reel.pos / 100) * (width - 1));
  let s = "";
  for (let i = 0; i < width; i++) {
    if (i === marker) { s += color ? "\x1b[1;93m●\x1b[0m" : "|"; continue; }
    const p = (i / (width - 1)) * 100;
    const inZone = p >= reel.zoneLo && p <= reel.zoneHi;
    const ch = inZone ? "▓" : "░";
    s += inZone && color ? `\x1b[32m${ch}\x1b[0m` : ch;
  }
  return s;
}

function nextLabel(state, kind) {
  if (kind === "rod") {
    const next = RODS[state.inventory.rodLevel + 1] || null;
    if (!next) return "Rod maxed";
    if (next.reward) return "Rod maxed (Golden Rod is earned, not bought)";
    return `Upgrade rod → ${next.name} (${next.price}c)`;
  }
  const next = BAITS[state.inventory.baitLevel + 1] || null;
  return next ? `Upgrade bait → ${next.name} (${next.price}c)` : "Bait maxed";
}
