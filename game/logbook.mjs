// Persistent logbook + shared data dir resolution. The standalone game window
// usually has no CLAUDE_PLUGIN_DATA, so we fall back through standard locations.
// /gofish and the hooks compute the same path so all three agree.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { emptyLogbook } from "./core.mjs";

export function resolveDataDir() {
  if (process.env.NETHOOK_DATA) return process.env.NETHOOK_DATA;
  if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
  if (process.env.XDG_DATA_HOME) return join(process.env.XDG_DATA_HOME, "nethook");
  return join(homedir(), ".local", "share", "nethook");
}

export function packsDir(dataDir = resolveDataDir()) {
  return join(dataDir, "packs");
}

function logbookPath(dataDir) {
  return join(dataDir, "logbook.json");
}

export function loadLogbook(dataDir = resolveDataDir()) {
  try {
    const raw = JSON.parse(readFileSync(logbookPath(dataDir), "utf8"));
    // shallow-merge onto a fresh logbook so older saves stay forward-compatible
    const base = emptyLogbook();
    return {
      ...base,
      ...raw,
      totals: { ...base.totals, ...(raw.totals || {}) },
      gear: { ...base.gear, ...(raw.gear || {}) },
      dex: raw.dex || {},
    };
  } catch {
    return emptyLogbook();
  }
}

export function saveLogbook(logbook, dataDir = resolveDataDir()) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(logbookPath(dataDir), JSON.stringify(logbook, null, 2));
  return logbookPath(dataDir);
}

export function ensureDataDirs(dataDir = resolveDataDir()) {
  mkdirSync(packsDir(dataDir), { recursive: true });
  return dataDir;
}

export { existsSync };
