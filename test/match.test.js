import { test } from "node:test";
import assert from "node:assert/strict";
import { SUGGEST_LIMIT, MIN_SUGGEST_CHARS, edits, suggest } from "../src/match.js";

const NAMES = [
  "Diamond", "Diamond Sword", "Diamond Ore", "Deepslate Diamond Ore", "Block of Diamond", "Diamond Horse Armor",
  "Zombie", "Zombie Villager", "Zombified Piglin", "Drowned", "Iron Golem", "Iron Ingot", "Golden Apple",
  "Enchanted Golden Apple", "Apple", "Jack o'Lantern", "Café Block", "Wither Skeleton", "Skeleton", "Stray",
];

test("full prefix comes first, then a later word, then a substring", () => {
  assert.deepEqual(suggest(NAMES, "skel"), ["Skeleton", "Wither Skeleton"]);
  assert.deepEqual(suggest(NAMES, "apple"), ["Apple", "Golden Apple", "Enchanted Golden Apple"]);
  assert.deepEqual(suggest(NAMES, "own"), ["Drowned"]);
  assert.deepEqual(suggest(NAMES, "zomb pig"), ["Zombified Piglin"]);
  assert.deepEqual(suggest(NAMES, "dia sw"), ["Diamond Sword"]);
});

test("ties go to the shorter name, then alphabetical", () => {
  assert.deepEqual(suggest(NAMES, "diamond"), [
    "Diamond", "Diamond Ore", "Diamond Sword", "Diamond Horse Armor", "Block of Diamond", "Deepslate Diamond Ore",
  ]);
  assert.deepEqual(suggest(NAMES, "zomb"), ["Zombie", "Zombie Villager", "Zombified Piglin"]);
});

test("case, accents, punctuation and spaces don't matter", () => {
  assert.deepEqual(suggest(NAMES, "JACK O LANT"), ["Jack o'Lantern"]);
  assert.deepEqual(suggest(NAMES, "cafe bl"), ["Café Block"]);
  assert.deepEqual(suggest(NAMES, "irongo"), ["Iron Golem"]);
  assert.equal(suggest(NAMES, "the zombie v")[0], "Zombie Villager");
});

test("fuzzy matches allow one edit from 4 characters and two from 8", () => {
  assert.equal(suggest(NAMES, "zomie")[0], "Zombie");
  assert.equal(suggest(NAMES, "zombies")[0], "Zombie");
  assert.equal(suggest(NAMES, "skeleotn")[0], "Skeleton");
  assert.deepEqual(suggest(NAMES, "golem iorn"), []);
  assert.equal(suggest(NAMES, "diamnod swo")[0], "Diamond Sword");
  assert.deepEqual(suggest(NAMES, "strx"), ["Stray"]);
  assert.deepEqual(suggest(NAMES, "stx"), []);
  assert.deepEqual(suggest(NAMES, "skxlxtxn"), []);
});

test("fuzzy matches only show when nothing matches directly", () => {
  assert.deepEqual(suggest(["Chicken", "Thick"], "chick"), ["Chicken"]);
  assert.deepEqual(suggest(["Chicken", "Thick"], "chiken"), ["Chicken"]);
});

test("short or empty queries suggest nothing and the limit holds", () => {
  assert.deepEqual(suggest(NAMES, "d".repeat(MIN_SUGGEST_CHARS - 1)), []);
  assert.deepEqual(suggest(NAMES, "  "), []);
  assert.equal(suggest(NAMES, "di").length <= SUGGEST_LIMIT, true);
  assert.deepEqual(suggest(NAMES, "diamond", 2), ["Diamond", "Diamond Ore"]);
});

test("edits counts insertions, deletions and substitutions, capped past max", () => {
  assert.equal(edits("zombie", "zombie", 1), 0);
  assert.equal(edits("zombe", "zombie", 1), 1);
  assert.equal(edits("zombiee", "zombie", 1), 1);
  assert.equal(edits("zombxe", "zombie", 1), 1);
  assert.equal(edits("zxmbxe", "zombie", 1), 2);
  assert.equal(edits("diam", "diamondsword", 0, true), 0);
  assert.equal(edits("dimo", "diamondsword", 1, true), 1);
});
