#!/usr/bin/env node
// Cross-platform "open the game in a NEW terminal window" launcher, invoked by
// the /gofish command. Detects the user's environment and spawns a detached
// terminal running index.mjs. Falls back to printing the command when it can't
// open a window (e.g. headless, or an unknown terminal).
//
//   node game/launch.mjs ["Spot Name"]         # open a window
//   node game/launch.mjs --dry-run             # print the chosen plan, don't spawn
//   node game/launch.mjs --env=macos --dry-run # force an env (for tests)

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "index.mjs");

function qSingle(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
function qDouble(s) {
  return `"${String(s).replace(/([\\"$`])/g, "\\$1")}"`;
}

export function detectEnv(env = process.env, platform = process.platform) {
  if (env.NETHOOK_FORCE_ENV) return env.NETHOOK_FORCE_ENV;
  if (env.TMUX) return "tmux";
  if (platform === "win32") return "windows";
  if (env.WSL_DISTRO_NAME) return "wsl";
  if (platform === "darwin") return "macos";
  if (platform === "linux" && env.DISPLAY) return "linux";
  return "fallback";
}

// Builds the spawn plan for an environment. Pure — no side effects — so tests can
// assert the chosen command without opening windows.
export function buildPlan({ packArg = null, env = process.env, platform = process.platform } = {}) {
  const target = detectEnv(env, platform);
  const node = process.execPath || "node";

  // POSIX one-liner with env vars inlined so they cross into the new shell.
  const posixEnv = ["NETHOOK_STATUS", "NETHOOK_DATA", "CLAUDE_PLUGIN_DATA"]
    .filter((k) => env[k])
    .map((k) => `${k}=${qSingle(env[k])}`)
    .join(" ");
  const posixInner =
    `${posixEnv ? posixEnv + " " : ""}${qSingle(node)} ${qSingle(INDEX)}` +
    (packArg ? " " + qSingle(packArg) : "");

  const manual = `${posixEnv ? posixEnv + " " : ""}node ${JSON.stringify(INDEX)}${packArg ? " " + JSON.stringify(packArg) : ""}`;

  switch (target) {
    case "tmux":
      return { env: target, spawn: { cmd: "tmux", args: ["split-window", "-h", posixInner] }, manual };
    case "macos": {
      const script = `tell application "Terminal" to do script ${qDouble(posixInner)}`;
      return { env: target, spawn: { cmd: "osascript", args: ["-e", script] }, manual };
    }
    case "linux":
      // x-terminal-emulator is the Debian "whatever is installed" alias.
      return {
        env: target,
        spawn: { cmd: env.NETHOOK_TERMINAL || "x-terminal-emulator", args: ["-e", `bash -lc ${qSingle(posixInner)}`] },
        manual,
      };
    case "wsl":
      return { env: target, spawn: { cmd: "wt.exe", args: ["wsl.exe", "-e", "bash", "-lc", posixInner] }, manual };
    case "windows": {
      const winInner = `${qDouble(node)} ${qDouble(INDEX)}${packArg ? " " + qDouble(packArg) : ""}`;
      return { env: target, spawn: { cmd: "cmd.exe", args: ["/c", "start", "Nethook", "cmd", "/k", winInner] }, manual };
    }
    default:
      return { env: "fallback", spawn: null, manual };
  }
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const packArg = argv.find((a) => !a.startsWith("--")) || null;
  const plan = buildPlan({ packArg });

  if (dryRun) {
    console.log(`env: ${plan.env}`);
    if (plan.spawn) console.log(`spawn: ${plan.spawn.cmd} ${plan.spawn.args.map((a) => JSON.stringify(a)).join(" ")}`);
    console.log(`manual: ${plan.manual}`);
    return;
  }

  if (!plan.spawn) {
    console.log("🎣 Nethook couldn't auto-open a terminal here. Run this in a new pane/window:\n");
    console.log("  " + plan.manual + "\n");
    return;
  }

  try {
    const child = spawn(plan.spawn.cmd, plan.spawn.args, { detached: true, stdio: "ignore" });
    child.on("error", () => {
      console.log("🎣 Couldn't open a window automatically. Run this in a new pane/window:\n\n  " + plan.manual + "\n");
    });
    child.unref();
    console.log(`🎣 Opening Nethook in a new ${plan.env} window. Tight lines!`);
  } catch {
    console.log("🎣 Couldn't open a window automatically. Run this in a new pane/window:\n\n  " + plan.manual + "\n");
  }
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
