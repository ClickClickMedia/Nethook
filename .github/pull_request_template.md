<!-- Thanks for contributing to Nethook! Keep this short. -->

## What & why
<!-- What does this change, and why? Link any issue with "Closes #123". -->


## Type
<!-- Delete what doesn't apply. -->
- [ ] New Spot Pack
- [ ] New species
- [ ] Reel-minigame / gameplay change
- [ ] Procedural generation
- [ ] Bug fix
- [ ] Docs
- [ ] Other

## Checklist
- [ ] `npm test` passes (and I added/updated assertions for new behaviour)
- [ ] For a Spot Pack: `node game/packcheck.mjs <file>` passes
- [ ] For plugin changes: `claude plugin validate .` passes
- [ ] I kept the core pure — no `fs` / `stdout` / timers / `Date.now()` /
      `Math.random()` in `core`/`world`/`render`/`pack`/`solunar`; all randomness
      goes through `rng.mjs` against `state.rngState`
- [ ] No new runtime dependencies
- [ ] Code style matches the surrounding files
