#!/usr/bin/env node
// PreToolUse(Bash) hook: when Claude is about to run a likely-long command,
// nudge the user (once per session) to go fishing while they wait. Non-blocking:
// emits a `systemMessage` and exits 0. Guarded by a per-session marker.

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 2000);
  });
}

const LONG = /\b(npm|pnpm|yarn)\s+(install|ci)\b|\b(npm|pnpm|yarn)\s+run\s+(build|test)\b|\b(build|test|pytest|jest|vitest)\b|wrangler\s+deploy|docker\s+(build|run)|\bmake\b|gradle|mvn\s/i;

const raw = await readStdin();
let event = {};
try {
  event = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const command = event?.tool_input?.command ?? "";
if (!LONG.test(command)) process.exit(0);

const session = String(event?.session_id ?? "nosession").replace(/[^\w.-]/g, "_");
const dir = process.env.CLAUDE_PLUGIN_DATA || join(process.env.TMPDIR || "/tmp", "nethook");
try {
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, `nudged-${session}`);
  if (existsSync(marker)) process.exit(0); // already nudged this session
  writeFileSync(marker, new Date().toISOString());
} catch {
  process.exit(0);
}

const root = process.env.CLAUDE_PLUGIN_ROOT || ".";
const launch = `node ${JSON.stringify(join(root, "game", "launch.mjs"))}`;
const message = `🎣 This might take a minute — go fish while you wait. Run /gofish (or: ${launch}).`;

process.stdout.write(JSON.stringify({ systemMessage: message }));
process.exit(0);
