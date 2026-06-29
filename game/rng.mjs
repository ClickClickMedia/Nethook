// Deterministic mulberry32 RNG. State is a single uint32 carried on the game
// state, so reducers stay pure and runs are perfectly reproducible from a seed.

export function seedFrom(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

// Advances `state.rngState` and returns a float in [0, 1). Mutates the passed
// object's rngState field (used inside already-cloned reducer state).
export function rand(state) {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randint(state, minInclusive, maxInclusive) {
  return minInclusive + Math.floor(rand(state) * (maxInclusive - minInclusive + 1));
}

export function pick(state, arr) {
  return arr[Math.floor(rand(state) * arr.length)];
}

// Weighted pick: items is [{weight, ...}]. Returns the chosen item (or null).
export function weightedPick(state, items) {
  const total = items.reduce((sum, it) => sum + (it.weight || 0), 0);
  if (total <= 0) return null;
  let roll = rand(state) * total;
  for (const it of items) {
    roll -= it.weight || 0;
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}
