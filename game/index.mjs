#!/usr/bin/env node
// Live terminal wiring for Nethook. Owns ALL I/O (raw stdin, ANSI out, timers,
// disk) and delegates every state transition to the pure core. Run standalone in
// a terminal window:  node game/index.mjs ["Spot Name"]
//
// Env:
//   NETHOOK_STATUS  path to a JSON status file written by the plugin's hooks
//                   ({state:"working"|"done"}) — polled to show "Claude ready".
//   NETHOOK_DATA / CLAUDE_PLUGIN_DATA  override the data dir (logbook + packs).

import { readFileSync } from "node:fs";
import { newGame, step } from "./core.mjs";
import { render } from "./render.mjs";
import { resolvePack } from "./pack.mjs";
import { loadLogbook, saveLogbook, ensureDataDirs, packsDir, resolveDataDir } from "./logbook.mjs";

const out = process.stdout;
const dataDir = resolveDataDir();
ensureDataDirs(dataDir);

const packArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
const pack = packArg ? resolvePack(packArg, packsDir(dataDir)) : null;

let logbook = loadLogbook(dataDir);
let state = startTrip();

let awaitingCast = false;
let strainTimer = null;
let statusTimer = null;
let lastClaude = null;

function startTrip() {
  const seed = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return newGame({ seed, pack, logbook });
}

// ── terminal setup / teardown ─────────────────────────────────────────────
function enter() {
  out.write("\x1b[?1049h\x1b[?25l"); // alt screen, hide cursor
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
}
function leave() {
  clearInterval(strainTimer);
  clearInterval(statusTimer);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  out.write("\x1b[?25h\x1b[?1049l"); // show cursor, leave alt screen
}
function quit(code = 0) {
  try {
    saveLogbook(state.logbook, dataDir);
  } catch {
    /* best-effort */
  }
  leave();
  process.exit(code);
}

function draw() {
  out.write("\x1b[H\x1b[2J" + render(state) + "\n");
}

function apply(action) {
  const prevMode = state.mode;
  state = step(state, action);
  if (state.mode === "reel" && prevMode !== "reel") startStrain();
  if (state.mode !== "reel" && prevMode === "reel") stopStrain();
  if (state.mode === "quit") return quit(0);
  draw();
}

// ── reel urgency timer: the fish fights on its own ────────────────────────
function startStrain() {
  stopStrain();
  strainTimer = setInterval(() => apply({ type: "strain" }), 700);
}
function stopStrain() {
  clearInterval(strainTimer);
  strainTimer = null;
}

// ── poll the Claude status file (set up by the plugin's hooks) ────────────
function startStatusPoll() {
  const path = process.env.NETHOOK_STATUS;
  if (!path) return;
  statusTimer = setInterval(() => {
    let status = null;
    try {
      status = JSON.parse(readFileSync(path, "utf8")).state ?? null;
    } catch {
      return;
    }
    if (status !== lastClaude) {
      if (status === "done") out.write("\x07"); // bell when Claude finishes
      lastClaude = status;
      apply({ type: "claudeStatus", status });
    }
  }, 1000);
}

// ── input ─────────────────────────────────────────────────────────────────
const DIRS = {
  h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
  "\x1b[D": [-1, 0], "\x1b[B": [0, 1], "\x1b[A": [0, -1], "\x1b[C": [1, 0],
};

function onKey(key) {
  // global quit
  if (key === "\x03") return quit(0); // Ctrl-C

  if (state.mode === "gameover") {
    if (key === "n") {
      logbook = state.logbook;
      state = startTrip();
      draw();
    } else if (key === "q") quit(0);
    return;
  }

  if (state.mode === "reel") {
    if (key === "r" || key === " ") apply({ type: "reel" });
    else if (key === "e") apply({ type: "ease" });
    else if (key === "q") quit(0);
    return;
  }

  if (state.mode === "shop") {
    if (key === "1") apply({ type: "buyRod" });
    else if (key === "2") apply({ type: "buyBait" });
    else if (key === "q" || key === "\x1b") apply({ type: "closeShop" });
    return;
  }

  // explore
  if (awaitingCast) {
    awaitingCast = false;
    const d = DIRS[key];
    if (d) return apply({ type: "cast", dx: d[0], dy: d[1] });
    return draw();
  }
  if (key === "f") {
    awaitingCast = true;
    state.messages = [...state.messages, "Cast which way? (h/j/k/l or arrows)"].slice(-6);
    return draw();
  }
  if (key === "$") return apply({ type: "openShop" });
  if (key === "q") return quit(0);
  const d = DIRS[key];
  if (d) return apply({ type: "move", dx: d[0], dy: d[1] });
}

function onData(chunk) {
  // a paste / fast arrows can deliver multiple keys; split escape sequences
  let i = 0;
  const s = String(chunk);
  while (i < s.length) {
    if (s[i] === "\x1b" && s.slice(i, i + 3).match(/\x1b\[[A-D]/)) {
      onKey(s.slice(i, i + 3));
      i += 3;
    } else {
      onKey(s[i]);
      i += 1;
    }
  }
}

process.on("SIGINT", () => quit(0));
process.on("SIGTERM", () => quit(0));

enter();
startStatusPoll();
draw();
process.stdin.on("data", onData);
