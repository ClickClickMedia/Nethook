// Built-in species table — the fallback content used when no Spot Pack is loaded.
// Spot Packs supply their own species[] in the same shape (see pack.mjs).
//
// rarity drives spawn weight + score multiplier. habitat is matched against the
// targeted water tile's depth ("shallow" | "deep" | "reeds" | "any").
// strength = reel stamina (more = longer fight). glyph is the on-map character.

export const RARITY = {
  common: { weight: 60, mult: 1, color: 37 },
  uncommon: { weight: 28, mult: 2, color: 36 },
  rare: { weight: 9, mult: 5, color: 33 },
  legendary: { weight: 2.5, mult: 12, color: 35 },
  mythic: { weight: 0.5, mult: 40, color: 31 },
};

export const BUILTIN_SPECIES = [
  { id: "minnow", name: "Minnow", glyph: "f", rarity: "common", habitat: "shallow",
    weightRange: [0.05, 0.3], strength: 1, behavior: "Skittish baitfish that schools near the surface." },
  { id: "perch", name: "Perch", glyph: "f", rarity: "common", habitat: "shallow",
    weightRange: [0.2, 1.2], strength: 2, behavior: "Hunts in packs around weed beds." },
  { id: "bass", name: "Largemouth Bass", glyph: "F", rarity: "uncommon", habitat: "reeds",
    weightRange: [0.5, 4.5], strength: 3, behavior: "Ambush predator lurking in cover; hits hard." },
  { id: "trout", name: "Rainbow Trout", glyph: "F", rarity: "uncommon", habitat: "deep",
    weightRange: [0.4, 3.5], strength: 3, behavior: "Holds in cool, oxygen-rich deep water." },
  { id: "eel", name: "Eel", glyph: "e", rarity: "uncommon", habitat: "deep",
    weightRange: [0.3, 2.0], strength: 4, behavior: "Nocturnal bottom-dweller; thrashes on the line." },
  { id: "pike", name: "Northern Pike", glyph: "F", rarity: "rare", habitat: "reeds",
    weightRange: [2.0, 12.0], strength: 5, behavior: "Toothy ambusher; a brutal, lunging fight." },
  { id: "catfish", name: "Catfish", glyph: "C", rarity: "rare", habitat: "deep",
    weightRange: [1.5, 18.0], strength: 6, behavior: "Heavy bottom-feeder that bulldogs for the depths." },
  { id: "sturgeon", name: "Sturgeon", glyph: "S", rarity: "legendary", habitat: "deep",
    weightRange: [10.0, 80.0], strength: 8, behavior: "Ancient armored giant; an endurance war." },
  { id: "leviathan", name: "The Leviathan", glyph: "W", rarity: "mythic", habitat: "deep",
    weightRange: [120.0, 400.0], strength: 12, behavior: "It should not exist in a lake. And yet." },
  // Junk — always catchable, worth little, but pads the dex with comedy.
  { id: "boot", name: "Old Boot", glyph: "}", rarity: "common", habitat: "any",
    weightRange: [0.4, 1.0], strength: 1, behavior: "Someone lost this. Now it's yours.", junk: true },
  { id: "can", name: "Rusty Can", glyph: "}", rarity: "common", habitat: "any",
    weightRange: [0.1, 0.3], strength: 1, behavior: "Catch of the day, technically.", junk: true },
];

export const RODS = [
  { id: "bamboo", name: "Bamboo Rod", biteBonus: 0, tensionEase: 0, price: 0 },
  { id: "carbon", name: "Carbon Rod", biteBonus: 0.08, tensionEase: 4, price: 60 },
  { id: "legendary", name: "Heirloom Rod", biteBonus: 0.18, tensionEase: 9, price: 240 },
  // Earned, not bought: granted for completing a spot's logbook (see core.mjs).
  { id: "golden", name: "Golden Rod", biteBonus: 0.28, tensionEase: 13, price: null, reward: true },
];

export const BAITS = [
  { id: "worm", name: "Worms", biteBonus: 0, rareBonus: 0, price: 0 },
  { id: "lure", name: "Spinner Lure", biteBonus: 0.06, rareBonus: 0.5, price: 40 },
  { id: "shiny", name: "Shiny Spoon", biteBonus: 0.1, rareBonus: 1.5, price: 150 },
];
