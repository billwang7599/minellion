import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import schema from "../data/days.schema.json" with { type: "json" };
import data from "../data/days.json" with { type: "json" };
import { TIERS, normalize } from "../src/worker.js";

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
