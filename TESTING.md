# Testing Nethook

Thanks for helping test! Here's how to get it running and what's most useful to
report.

## Install & run
**As a Claude Code plugin:**
```
/plugin marketplace add ClickClickMedia/Nethook
/plugin install nethook@nethook
```
Then `/gofish` (opens a new terminal window) — or `/gofish "Lake Taupō"`.

**Or directly (no Claude Code needed):**
```
git clone https://github.com/ClickClickMedia/Nethook && cd Nethook
node game/index.mjs            # procedural lake
node game/index.mjs "Lake Taupō"
```
Needs Node ≥ 18 and a real terminal. Controls: `hjkl`/arrows move, `f`+direction
casts, `r`/`e` during a fight, `$` shop, `q` quit.

## What to look for
- **Launch:** did `/gofish` open a new window on your OS/terminal? If not, did it
  print a copy-paste command you could run? (Tell us your OS + terminal.)
- **Claude handshake:** while Claude works, does the status bar flip to
  **"✅ Claude ready — reel in!"** with a bell when it finishes?
- **Feel:** are the three reel fights (steady / runner / pendulum) readable and
  fun? Too easy / too punishing? Does the line snap feel fair?
- **Variety:** across a few trips, do the weather/season/day-phase, bounties, and
  lake shapes feel like they change things up?
- **Spot Packs:** try `/nethook:spot "<a lake/river/coast you know>"` — is the
  generated pack plausible and playable?
- **Anything broken:** crashes, garbled rendering, a fight you couldn't win, a
  spot that wouldn't load.

## Reporting
Open an issue: https://github.com/ClickClickMedia/Nethook/issues/new/choose
Please include your **OS**, **terminal app**, and **Node version**
(`node --version`). For rendering issues, a screenshot helps a lot.

## A quick sanity check (optional)
```
npm test    # should print "OK — N assertions passed."
```
