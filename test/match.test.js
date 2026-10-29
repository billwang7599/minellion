import { test } from "node:test";
import assert from "node:assert/strict";
import { SUGGEST_LIMIT, edits, suggest } from "../src/match.js";

const NAMES = [
  "Diamond", "Diamond Sword", "Diamond Ore", "Diamond Hoe", "Zombie", "Zombie Villager", "Zombified Piglin",
  "Chicken", "Raw Chicken", "Raw Beef", "Raw Cod", "Jack o'Lantern", "Café Block", "Wither Skeleton", "Skeleton", "Stray",
];

test("partial words get no suggestions, so typing a fragment doesn't list answers", () => {
  for (const partial of ["raw", "raw ", "skel", "chick", "chicke", "raw chick", "zomb pig", "diamond sw", "wither"]) {
    assert.deepEqual(suggest(NAMES, partial), [], partial);
  }
});

test("a correctly spelled name gets no suggestions", () => {
  for (const exact of ["Zombie", "zombies", "the zombie", "DIAMOND ORE", "cafe block"]) {
    assert.deepEqual(suggest(NAMES, exact), [], exact);
  }
});

test("misspellings get corrected: one typo from 4 letters, two from 8", () => {
  assert.deepEqual(suggest(NAMES, "zomie"), ["Zombie"]);
  assert.deepEqual(suggest(NAMES, "skeletn"), ["Skeleton"]);
  assert.deepEqual(suggest(NAMES, "raw chikin"), ["Raw Chicken"]);
  assert.deepEqual(suggest(NAMES, "jack o lanturn"), ["Jack o'Lantern"]);
  assert.deepEqual(suggest(NAMES, "cafe blok"), ["Café Block"]);
  assert.deepEqual(suggest(NAMES, "stx"), []);
  assert.deepEqual(suggest(NAMES, "skxlxtxn"), []);
});

test("swapped letters count as one typo", () => {
  assert.deepEqual(suggest(NAMES, "chikcen"), ["Chicken"]);
  assert.deepEqual(suggest(NAMES, "wither skeelton"), ["Wither Skeleton"]);
});

test("closest spelling comes first and the limit holds", () => {
  assert.deepEqual(suggest(NAMES, "diamond oer"), ["Diamond Ore", "Diamond Hoe"]);
  assert.deepEqual(suggest(NAMES, "diamond oer", 1), ["Diamond Ore"]);
  assert.equal(SUGGEST_LIMIT > 0, true);
});

test("edits counts insertions, deletions, substitutions and swaps, capped past max", () => {
  assert.equal(edits("zombie", "zombie", 1), 0);
  assert.equal(edits("zombe", "zombie", 1), 1);
  assert.equal(edits("zombiee", "zombie", 1), 1);
  assert.equal(edits("zombxe", "zombie", 1), 1);
  assert.equal(edits("zobmie", "zombie", 1), 1);
  assert.equal(edits("zxmbxe", "zombie", 1), 2);
});
