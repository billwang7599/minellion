import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import worker, { TIERS, matchAnswer, deal } from "../src/worker.js";
import { normalize } from "../src/match.js";
import bank from "../data/prompts.json" with { type: "json" };
import aliases from "../data/aliases.json" with { type: "json" };
import frozen from "./frozen-days.json" with { type: "json" };

const addDays = (date, n) => new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
const dayOf = (n) => ({ date: addDays(bank.start, n), prompts: bank.prompts.slice(n * 7, n * 7 + 7) });
const [past, today, future] = [0, 1, 2].map(dayOf);
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
  assert.ok(body.names.includes(firstName(bank.prompts.at(-1).answers.dirt.at(-1))));
  assert.ok(body.names.includes("Creeper"));
  assert.ok(body.names.includes(aliases["Wither Skeleton Skull"][0]));
  const keys = body.names.map(normalize);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(body.names, [...body.names].sort((a, b) => a.localeCompare(b)));
});

const texts = (days) => Object.fromEntries(days.map((d) => [d.date, d.prompts.map((p) => p.text)]));
const ids = (day) => day.prompts.map((p) => p.text).sort().join("\n");

test("the first days deal the bank in file order, as the old hand-dated days did", () => {
  const days = deal(bank, addDays(bank.start, 13));
  assert.equal(days.length, 14);
  days.forEach((day, n) => assert.deepEqual(day, dayOf(n)));
});

test("dealt days match the frozen fixture, so past dives never change", () => {
  const dates = Object.keys(frozen);
  assert.equal(dates[0], bank.start);
  assert.deepEqual(texts(deal(bank, dates.at(-1))), frozen);
});

test("appending prompts with a later added date leaves earlier days alone", () => {
  const extra = (added, i) => ({ added, category: "New", tags: [`n${i}`], text: `New ${i}`, answers: { dirt: ["D"] } });
  const appended = [extra("2027-02-10", 1), extra("2027-02-10", 2), extra("2027-06-01", 3)];
  const grown = { ...bank, prompts: [...bank.prompts, ...appended] };
  const until = "2027-09-01";
  const before = deal(bank, until);
  const after = deal(grown, until);
  const cut = before.findIndex((d) => d.date === "2027-02-10");
  assert.deepEqual(after.slice(0, cut), before.slice(0, cut));
  assert.deepEqual(after[cut].prompts.slice(0, 2).map((p) => p.text), ["New 1", "New 2"]);
  assert.ok(after.find((d) => d.date === "2027-06-01").prompts.some((p) => p.text === "New 3"));
});

test("a day avoids prompts that share a tag when the bank allows it", () => {
  const card = (added, tags, i) => ({ added, category: "T", tags, text: `${added} ${i}`, answers: { dirt: ["Dirt"] } });
  const launch = Array.from({ length: 7 }, (_, i) => card("2027-01-01", ["a"], i));
  const later = ["a", "a", "b", "b", "c", "c", "d", "d", "e", "e", "f", "f", "g", "g"].map((tag, i) =>
    card("2027-01-02", [tag], i),
  );
  const days = deal({ start: "2027-01-01", prompts: [...launch, ...later] }, "2027-01-03");
  assert.deepEqual(days[0].prompts, launch, "the launch bank keeps its file order");
  for (const day of days.slice(1)) {
    const tags = day.prompts.flatMap((p) => p.tags);
    assert.equal(new Set(tags).size, tags.length, `${day.date}: ${tags}`);
  }
});

test("every date from start to today is a dive numbered from start; outside that is 404", async () => {
  const now = "2027-03-15";
  mock.timers.setTime(new Date(`${now}T17:00:00Z`).getTime());
  try {
    const { today: served, days } = await (await call("/api/days")).json();
    assert.equal(served, now);
    assert.equal(days[0].date, bank.start);
    assert.equal(days.at(-1).date, now);
    days.forEach((d, i) => assert.deepEqual(d, { date: addDays(bank.start, i), number: i + 1 }));
    const last = await (await call(`/api/days/${now}`)).json();
    assert.equal(last.number, days.length);
    assert.equal(last.prompts.length, 7);
    assert.equal((await call(`/api/days/${now}/7/answers`)).status, 200);
    for (const date of [addDays(bank.start, -1), addDays(now, 1)]) {
      assert.equal((await call(`/api/days/${date}`)).status, 404);
    }
  } finally {
    mock.timers.setTime(new Date(`${today.date}T17:00:00Z`).getTime());
  }
});

test("no prompt repeats until every prompt is used, and no day repeats a lineup", () => {
  const days = deal(bank, addDays(bank.start, 3 * 365));
  assert.equal(days.length, 3 * 365 + 1);
  let cycle = new Set();
  for (const day of days) {
    assert.equal(new Set(day.prompts).size, 7, day.date);
    for (const prompt of day.prompts) {
      if (cycle.has(prompt)) {
        assert.equal(cycle.size, bank.prompts.length, `${prompt.text} repeats early on ${day.date}`);
        cycle = new Set();
      }
      cycle.add(prompt);
    }
  }
  assert.equal(new Set(days.map(ids)).size, days.length);
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
