# Submitting Nethook to a Claude Code marketplace

Nethook is already self-installable from this repo (it ships its own
`.claude-plugin/marketplace.json`):

```
/plugin marketplace add ClickClickMedia/Nethook
/plugin install nethook@nethook
```

To list it in the community marketplace as well, here's the prep and the steps.

## Pre-flight checklist
- [x] `.claude-plugin/plugin.json` — name, description, version, author, homepage,
      repository, license, keywords all present.
- [x] `.claude-plugin/marketplace.json` — `name: "nethook"`, single plugin with
      `source: "."` and a marketplace description.
- [x] `LICENSE` — MIT.
- [x] `README.md` — install + gameplay + Spot Packs documented.
- [x] `CHANGELOG.md` — current at the released version.
- [x] Zero runtime dependencies; `npm test` green (98 assertions).
- [x] `claude plugin validate .` passes with no warnings.

Re-verify before submitting:
```bash
npm test
node game/launch.mjs --dry-run
claude plugin validate .
```

## Marketplace entry (ready to paste)
For a marketplace that aggregates plugins by repo reference, the entry is:

```json
{
  "name": "nethook",
  "source": "ClickClickMedia/Nethook",
  "description": "A NetHack-style ASCII fishing roguelike to play in a second terminal window while Claude Code is busy. /gofish opens it; a hook pings you when Claude is done. Generate playable real-world fishing spots with /nethook:spot.",
  "keywords": ["fun", "game", "roguelike", "fishing", "dead-time"]
}
```

## Steps
1. Tag a release matching `plugin.json` (`git tag v0.2.0 && git push --tags`) so the
   marketplace can pin a version.
2. Open a PR against the community marketplace repo adding the entry above to its
   plugin list (follow that repo's `CONTRIBUTING` for the exact file/section).
3. Link this repo and note: zero dependencies, MIT, validated, self-installable.

> Scope note: opening the PR touches a repository outside this project. Do that from
> an environment with access to the marketplace repo; everything in this repo is
> already submission-ready.
