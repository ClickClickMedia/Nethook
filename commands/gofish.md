---
description: Open Nethook — an ASCII fishing roguelike — in a new terminal window to play while Claude works. Optionally pass a Spot Pack name (e.g. "Lake Taupō").
---

The user wants to go fishing in Nethook while you work. Open it in a **new
terminal window** so it runs independently of this session.

Run exactly this (it detects the user's terminal — tmux / Windows Terminal / WSL /
macOS / Linux — and opens a window, or prints a copy-paste command if it can't):

```bash
NETHOOK_DATA="${CLAUDE_PLUGIN_DATA}" NETHOOK_STATUS="${CLAUDE_PLUGIN_DATA}/status.json" \
  node "${CLAUDE_PLUGIN_ROOT}/game/launch.mjs" $ARGUMENTS
```

Then:
- If it opened a window, tell the user to switch to it and that you'll ping the
  game when you're done (the status bar will flash **"✅ Claude ready — reel in!"**).
- If it printed a manual command instead (headless / unknown terminal), relay that
  command and tell them to paste it into a separate pane or tab.

Notes:
- `$ARGUMENTS` may be a Spot Pack name like `"Lake Taupō"`. If empty, the game picks
  a procedural lake. List/generate real spots with `/nethook:spot`.
- Do not block on the game; it runs in its own window. Carry on with the task.
