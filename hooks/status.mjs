#!/usr/bin/env node
// Writes Claude's working/done state to the shared status file the game polls.
// Invoked by the UserPromptSubmit ("working") and Stop ("done") hooks.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const state = process.argv[2] === "working" ? "working" : "done";
const dir = process.env.CLAUDE_PLUGIN_DATA;

if (dir) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "status.json"), JSON.stringify({ state, ts: Date.now() }));
  } catch {
    /* best-effort; the game just won't update its indicator */
  }
}
process.exit(0);
