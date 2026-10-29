import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import worker, { TIERS, matchAnswer } from "../src/worker.js";
import { normalize } from "../src/match.js";
import data from "../data/days.json" with { type: "json" };
import aliases from "../data/aliases.json" with { type: "json" };

const [past, today, future] = data.days;
const firstName = (answer) => [].concat(answer)[0];
const firstDirt = firstName(today.prompts[0].answers.dirt[0]);

before(() => mock.timers.enable({ apis: ["Date"], now: new Date(`${today.date}T17:00:00Z`) }));
after(() => mock.timers.reset());

const call = (path, init) => worker.fetch(new Request(`https://minellion.test${path}`, init));
const guess = (path, body) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("GET /api/days lists days up to today in New York with the tiers", async () => {
  const res = await call("/api/days");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.today, today.date);
  assert.deepEqual(body.tiers, TIERS);
  assert.deepEqual(body.days, [
    { date: past.date, number: 1 },
    { date: today.date, number: 2 },
  ]);
});

test("today follows New York, not UTC", async () => {
  mock.timers.setTime(new Date(`${future.date}T03:00:00Z`).getTime());
  try {
    assert.equal((await (await call("/api/days")).json()).today, today.date);
  } finally {
    mock.timers.setTime(new Date(`${today.date}T17:00:00Z`).getTime());
  }
});

test("GET /api/days/:date returns prompts without answers", async () => {
  const res = await call(`/api/days/${past.date}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    date: past.date,
    number: 1,
    prompts: past.prompts.map(({ category, text }) => ({ category, text })),
  });
  assert.match(res.headers.get("cache-control"), /max-age=3600/);
  const todayRes = await call(`/api/days/${today.date}`);
  assert.match(todayRes.headers.get("cache-control"), /max-age=60\b/);
});

test("future and unknown dates are 404 everywhere", async () => {
  for (const date of [future.date, "1999-01-01", "nonsense"]) {
    assert.equal((await call(`/api/days/${date}`)).status, 404);
    assert.equal((await call(`/api/days/${date}/1/answers`)).status, 404);
    assert.equal((await guess(`/api/days/${date}/1/guess`, { guess: "x" })).status, 404);
  }
  assert.equal((await call(`/api/days/${future.date}`)).headers.get("cache-control"), "no-store");
});

test("rounds outside 1..7 are 404", async () => {
  assert.equal((await call(`/api/days/${today.date}/0/answers`)).status, 404);
  assert.equal((await call(`/api/days/${today.date}/8/answers`)).status, 404);
  assert.equal((await guess(`/api/days/${today.date}/8/guess`, { guess: firstDirt })).status, 404);
});

test("POST guess accepts a bank answer with its tier and points", async () => {
  const res = await guess(`/api/days/${today.date}/1/guess`, { guess: `  the ${firstDirt.toUpperCase()}!! ` });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { accepted: true, answer: firstDirt, tier: "dirt", points: TIERS[0].points });
});

test("POST guess suggests the bank answer for a typo instead of accepting it", async () => {
  const long = Object.values(today.prompts[0].answers).flat().map(firstName).find((name) => /^[a-z]{6,}$/i.test(name));
  const res = await guess(`/api/days/${today.date}/1/guess`, { guess: `${long.slice(0, -1)}q` });
  assert.deepEqual(await res.json(), { accepted: false, suggestion: long });
});

test("POST guess rejects answers not in the bank", async () => {
  const res = await guess(`/api/days/${today.date}/1/guess`, { guess: "zzzz qqqq xxxx" });
  assert.deepEqual(await res.json(), { accepted: false });
});

test("POST guess needs a string guess", async () => {
  assert.equal((await guess(`/api/days/${today.date}/1/guess`, {})).status, 400);
  assert.equal((await guess(`/api/days/${today.date}/1/guess`, { guess: "x".repeat(200) })).status, 400);
  const res = await call(`/api/days/${today.date}/1/guess`, { method: "POST", body: "not json" });
  assert.equal(res.status, 400);
});

test("GET answers groups canonical names by tier", async () => {
  const res = await call(`/api/days/${past.date}/2/answers`);
  assert.equal(res.status, 200);
  const expected = Object.fromEntries(
    TIERS.map(({ key }) => [key, (past.prompts[1].answers[key] ?? []).map(firstName)]),
  );
  assert.deepEqual(await res.json(), { answers: expected });
});

test("GET /api/names lists generic names plus every answer, deduped, with nothing else", async () => {
  const res = await call("/api/names");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ["names"]);
  assert.ok(body.names.every((name) => typeof name === "string"));
  assert.ok(body.names.includes(firstDirt));
  assert.ok(body.names.includes(firstName(future.prompts.at(-1).answers.dirt.at(-1))));
  assert.ok(body.names.includes("Creeper"));
  assert.ok(body.names.includes(aliases["Wither Skeleton Skull"][0]));
  const keys = body.names.map(normalize);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(body.names, [...body.names].sort((a, b) => a.localeCompare(b)));
});

test("wrong methods and unknown api paths", async () => {
  assert.equal((await call("/api/days", { method: "POST" })).status, 405);
  assert.equal((await call("/api/names", { method: "POST" })).status, 405);
  assert.equal((await call(`/api/days/${today.date}/1/guess`)).status, 405);
  assert.equal((await call("/api/nope")).status, 404);
});

const prompt = {
  answers: {
    dirt: ["Zombie", ["Zombified Piglin", "Zombie Pigman"]],
    coal: ["Café Block", "Bee"],
    iron: ["Enderman", "Endermen"],
    diamond: ["Stray", "Jack o'Lantern"],
  },
};

test("matching ignores case, diacritics, punctuation, spacing, articles and a plural s", () => {
  for (const [input, answer] of [
    ["zombie", "Zombie"],
    ["  ZOMBIES ", "Zombie"],
    ["The Zombie", "Zombie"],
    ["a bee", "Bee"],
    ["an  bees", "Bee"],
    ["cafe block", "Café Block"],
    ["CaféBlocks", "Café Block"],
    ["jack-o-lantern", "Jack o'Lantern"],
    ["Jack O Lanterns", "Jack o'Lantern"],
    ["zombie pigman", "Zombified Piglin"],
  ]) {
    assert.equal(matchAnswer(prompt, input)?.answer, answer, input);
  }
  assert.deepEqual(matchAnswer(prompt, "Stray"), { answer: "Stray", tier: "diamond", exact: true });
});

test("one typo is forgiven only for long answers with a single close match", () => {
  assert.equal(matchAnswer(prompt, "zombe")?.answer, "Zombie");
  assert.equal(matchAnswer(prompt, "zombiee")?.answer, "Zombie");
  assert.equal(matchAnswer(prompt, "zombified piglen")?.answer, "Zombified Piglin");
  assert.equal(matchAnswer(prompt, "strax")?.answer, "Stray");
  assert.equal(matchAnswer(prompt, "strax").exact, false);
  assert.equal(matchAnswer(prompt, "endermon"), null);
  assert.equal(matchAnswer(prompt, "be"), null);
  assert.equal(matchAnswer(prompt, "zomb"), null);
  assert.equal(matchAnswer(prompt, "the"), null);
});

test("a global alias scores as the canonical answer of the prompt that has it", () => {
  assert.ok(aliases["Wither Skeleton Skull"].includes("Wither Head"));
  const heads = { answers: { dirt: ["Creeper Head"], gold: ["Wither Skeleton Skull"] } };
  assert.deepEqual(matchAnswer(heads, "wither head"), { answer: "Wither Skeleton Skull", tier: "gold", exact: true });
  assert.equal(matchAnswer(heads, "withr head")?.answer, "Wither Skeleton Skull");
  const mobs = { answers: { iron: [["Wither Skeleton", "Wither Skeleton Skull"]] } };
  assert.deepEqual(matchAnswer(mobs, "wither head"), { answer: "Wither Skeleton", tier: "iron", exact: true });
  assert.equal(matchAnswer({ answers: { dirt: ["Creeper"] } }, "wither head"), null);
});

test("a prompt's own answers and aliases beat a global alias", () => {
  const own = { answers: { dirt: ["Wither Skeleton Skull"], diamond: ["Wither Skull"] } };
  assert.deepEqual(matchAnswer(own, "wither skull"), { answer: "Wither Skull", tier: "diamond", exact: true });
  assert.equal(matchAnswer(own, "wither head")?.answer, "Wither Skeleton Skull");
  const ownAlias = { answers: { dirt: ["Wither Skeleton Skull"], coal: [["Ghast", "Wither Head"]] } };
  assert.deepEqual(matchAnswer(ownAlias, "wither head"), { answer: "Ghast", tier: "coal", exact: true });
});
