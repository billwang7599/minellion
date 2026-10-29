import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import schema from "../data/prompts.schema.json" with { type: "json" };
import bank from "../data/prompts.json" with { type: "json" };
import aliases from "../data/aliases.json" with { type: "json" };
import names from "../data/names.json" with { type: "json" };
import { TIERS, normalize, answerEntries } from "../src/worker.js";

const RARE_TIERS = TIERS.slice(-2).map((t) => t.key);

test("prompts.json matches the schema", () => {
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.ok(validate(bank), JSON.stringify(validate.errors, null, 2));
});

test("the schema's tiers are the worker's tiers", () => {
  assert.deepEqual(Object.keys(schema.$defs.prompt.properties.answers.properties), TIERS.map((t) => t.key));
});

test("every prompt has 1 to 3 distinct tags from the schema's list", () => {
  const known = schema.$defs.prompt.properties.tags.items.enum;
  bank.prompts.forEach((prompt, i) => {
    assert.ok(prompt.tags.length >= 1 && prompt.tags.length <= 3, `prompt ${i + 1}`);
    assert.equal(new Set(prompt.tags).size, prompt.tags.length, `prompt ${i + 1} repeats a tag`);
    for (const tag of prompt.tags) assert.ok(known.includes(tag), `prompt ${i + 1}: unknown tag "${tag}"`);
  });
});

const isRealDate = (date) => new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

test("start is a real date and added dates are real, on or after start, in file order", () => {
  assert.ok(isRealDate(bank.start), bank.start);
  bank.prompts.forEach((prompt, i) => {
    assert.ok(isRealDate(prompt.added), `prompt ${i + 1}: ${prompt.added}`);
    assert.ok(prompt.added >= bank.start, `prompt ${i + 1} is added before start`);
    if (i > 0) assert.ok(prompt.added >= bank.prompts[i - 1].added, `prompt ${i + 1} is added before the one above it`);
  });
});

test("the start date has at least 7 prompts and texts are unique", () => {
  assert.ok(bank.prompts.filter((p) => p.added === bank.start).length >= 7);
  const texts = bank.prompts.map((p) => normalize(p.text));
  assert.equal(new Set(texts).size, texts.length);
});

test("every prompt has a full bank of distinct answers", () => {
  bank.prompts.forEach((prompt, i) => {
    const where = `prompt ${i + 1}`;
    const answers = Object.values(prompt.answers).flat();
    assert.ok(answers.length >= 10, `${where} has ${answers.length} answers`);
    assert.ok(prompt.answers.dirt?.length >= 1, `${where} has no dirt answer`);
    const seen = new Map();
    for (const name of answers.flat()) {
      const key = normalize(name);
      assert.ok(key, `${where}: "${name}" normalizes to nothing`);
      assert.ok(!seen.has(key), `${where}: "${name}" collides with "${seen.get(key)}"`);
      seen.set(key, name);
    }
  });
});

test("every prompt has a rare answer", () => {
  bank.prompts.forEach((prompt, i) => {
    const rare = RARE_TIERS.flatMap((key) => prompt.answers[key] ?? []);
    assert.ok(rare.length >= 1, `prompt ${i + 1} has no ${RARE_TIERS.join(" or ")} answer`);
  });
});

test("aliases.json maps each canonical name to a list of distinct aliases", () => {
  for (const [canonical, list] of Object.entries(aliases)) {
    assert.ok(normalize(canonical), canonical);
    assert.ok(Array.isArray(list) && list.length >= 1, canonical);
    const keys = list.map(normalize);
    assert.ok(keys.every(Boolean), `${canonical}: an alias normalizes to nothing`);
    assert.equal(new Set(keys).size, keys.length, `${canonical}: duplicate alias`);
    assert.ok(!keys.includes(normalize(canonical)), `${canonical}: alias equals its canonical`);
  }
});

test("every alias points to one canonical that is a real name", () => {
  const canonicals = new Set(Object.keys(aliases).map(normalize));
  const known = new Set(names.map(normalize));
  for (const prompt of bank.prompts)
    for (const answer of Object.values(prompt.answers).flat()) known.add(normalize([].concat(answer)[0]));
  const owner = new Map();
  for (const [canonical, list] of Object.entries(aliases)) {
    assert.ok(known.has(normalize(canonical)), `${canonical} is in neither names.json nor any bank`);
    for (const alias of list) {
      const key = normalize(alias);
      assert.ok(!canonicals.has(key), `"${alias}" is itself a canonical name`);
      assert.ok(!owner.has(key), `"${alias}" points to both ${owner.get(key)} and ${canonical}`);
      owner.set(key, canonical);
    }
  }
});

test("with global aliases merged, no key in a prompt points to two answers", () => {
  bank.prompts.forEach((prompt, i) => {
    const seen = new Map();
    for (const entry of answerEntries(prompt)) {
      for (const key of new Set(entry.keys)) {
        assert.ok(!seen.has(key), `prompt ${i + 1}: "${key}" is ${seen.get(key)} and ${entry.answer}`);
        seen.set(key, entry.answer);
      }
    }
  });
});
