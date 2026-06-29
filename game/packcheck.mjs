#!/usr/bin/env node
// Tiny CLI: validate a Spot Pack file. Used by /nethook:spot to self-check
// generated packs. Prints "OK <name>" or "INVALID: <errors>" (exit 1).
import { loadPackFromFile } from "./pack.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: packcheck.mjs <pack.json>");
  process.exit(2);
}
try {
  const res = loadPackFromFile(file);
  if (res.ok) {
    console.log(`OK ${res.pack.name} — ${res.pack.species.length} species`);
  } else {
    console.error("INVALID: " + res.errors.join("; "));
    process.exit(1);
  }
} catch (e) {
  console.error("INVALID: " + (e?.message || e));
  process.exit(1);
}
