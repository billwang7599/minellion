import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import schema from "../data/days.schema.json" with { type: "json" };
import data from "../data/days.json" with { type: "json" };
import aliases from "../data/aliases.json" with { type: "json" };
import names from "../data/names.json" with { type: "json" };
import { TIERS, normalize, answerEntries } from "../src/worker.js";

const RARE_TIERS = TIERS.slice(-2).map((t) => t.key);

const DAY_MS = 86_400_000;

test("days.json matches the schema", () => {
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.ok(validate(data), JSON.stringify(validate.errors, null, 2));
});

test("the schema's tiers are the worker's tiers", () => {
  assert.deepEqual(Object.keys(schema.$defs.prompt.properties.answers.properties), TIERS.map((t) => t.key));
});

test("dates are consecutive and unique", () => {
  data.days.forEach((day, i) => {
    assert.equal(new Date(`${day.date}T00:00:00Z`).toISOString().slice(0, 10), day.date, "real date");
    if (i > 0) assert.equal(Date.parse(day.date) - Date.parse(data.days[i - 1].date), DAY_MS, day.date);
  });
});

test("every prompt has a full bank of distinct answers", () => {
  for (const day of data.days) {
    assert.equal(day.prompts.length, 7, day.date);
    day.prompts.forEach((prompt, i) => {
      const where = `${day.date} prompt ${i + 1}`;
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
  }
});

test("every prompt has a rare answer", () => {
  for (const day of data.days) {
    day.prompts.forEach((prompt, i) => {
      const rare = RARE_TIERS.flatMap((key) => prompt.answers[key] ?? []);
      assert.ok(rare.length >= 1, `${day.date} prompt ${i + 1} has no ${RARE_TIERS.join(" or ")} answer`);
    });
  }
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
  for (const day of data.days)
    for (const prompt of day.prompts)
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
  for (const day of data.days) {
    day.prompts.forEach((prompt, i) => {
      const seen = new Map();
      for (const entry of answerEntries(prompt)) {
        for (const key of new Set(entry.keys)) {
          assert.ok(!seen.has(key), `${day.date} prompt ${i + 1}: "${key}" is ${seen.get(key)} and ${entry.answer}`);
          seen.set(key, entry.answer);
        }
      }
    });
  }
});
