import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROUNDS, ROUND_MS, MAX_SCORE, SURFACE_Y, BEDROCK_Y, MISS,
  depthY, layerName, totalScore, shareText, loadStore, startRound, finishRound, expireRound, stats, msUntilNextDive,
} from "../public/game.js";
import { TIERS } from "../src/worker.js";

const DATE = "2026-10-28";
const tier = (key) => TIERS.find((t) => t.key === key);
const hit = (key, answer = "X") => ({ guess: answer.toLowerCase(), answer, tier: key, points: tier(key).points });

test("depth runs from the surface to bedrock at max score", () => {
  assert.equal(depthY(0), SURFACE_Y);
  assert.equal(depthY(MAX_SCORE), BEDROCK_Y);
  assert.equal(depthY(MAX_SCORE / 2), 0);
  assert.equal(depthY(412), SURFACE_Y - Math.round((412 * (SURFACE_Y - BEDROCK_Y)) / MAX_SCORE));
});

test("layer names", () => {
  assert.equal(layerName(64), "Surface");
  assert.equal(layerName(61), "Dirt");
  assert.equal(layerName(30), "Stone");
  assert.equal(layerName(0), "Deepslate");
  assert.equal(layerName(-63), "Deepslate");
  assert.equal(layerName(-64), "Bedrock");
});

test("share text has the number, depth, emoji row, score and url but no answers", () => {
  const rounds = [hit("dirt", "Zombie"), hit("coal"), MISS, hit("iron"), hit("gold"), hit("diamond"), hit("netherite")];
  const score = totalScore({ rounds });
  const text = shareText({ number: 12, dive: { rounds }, tiers: TIERS, url: "https://minellion.test" });
  assert.equal(
    text,
    [
      `Minellion #12 ⛏️ Y ${depthY(score)}`,
      ["dirt", "coal", null, "iron", "gold", "diamond", "netherite"].map((k) => (k ? tier(k).emoji : "❌")).join(""),
      `${score}/${MAX_SCORE}`,
      "https://minellion.test",
    ].join("\n"),
  );
  assert.ok(!text.includes("Zombie"));
});

test("loadStore tolerates missing or corrupt data", () => {
  assert.deepEqual(loadStore(null), { dives: {} });
  assert.deepEqual(loadStore("{oops"), { dives: {} });
  assert.deepEqual(loadStore('{"dives":{"x":{"rounds":[]}}}'), { dives: { x: { rounds: [] } } });
});

test("startRound sets a deadline once, so a refresh can't reset the clock", () => {
  const started = startRound(loadStore(null), DATE, 1000);
  assert.deepEqual(started.dives[DATE], { rounds: [], deadline: 1000 + ROUND_MS });
  assert.equal(startRound(started, DATE, 5000), started);
});

test("finishRound records the result and clears the deadline", () => {
  const store = finishRound(startRound(loadStore(null), DATE, 0), DATE, hit("gold", "Ghast"));
  assert.deepEqual(store.dives[DATE], { rounds: [hit("gold", "Ghast")] });
});

test("expireRound records a miss only once the deadline has passed", () => {
  const started = startRound(loadStore(null), DATE, 0);
  assert.equal(expireRound(started, DATE, ROUND_MS - 1), started);
  assert.deepEqual(expireRound(started, DATE, ROUND_MS).dives[DATE], { rounds: [MISS] });
  const idle = loadStore(null);
  assert.equal(expireRound(idle, DATE, 10 ** 15), idle);
});

test("a finished dive takes no more rounds", () => {
  let store = loadStore(null);
  for (let i = 0; i < ROUNDS; i++) store = finishRound(startRound(store, DATE, 0), DATE, MISS);
  assert.equal(store.dives[DATE].rounds.length, ROUNDS);
  assert.equal(startRound(store, DATE, 0), store);
  assert.equal(finishRound(store, DATE, MISS), store);
});

test("stats count finished dives with best and average depth", () => {
  assert.deepEqual(stats(loadStore(null)), { played: 0, bestY: null, averageY: null });
  const full = (points) => ({ rounds: Array.from({ length: ROUNDS }, () => ({ ...MISS, points })) });
  const store = { dives: { a: full(10), b: full(100), c: { rounds: [hit("netherite")] } } };
  assert.deepEqual(stats(store), {
    played: 2,
    bestY: depthY(700),
    averageY: Math.round((depthY(70) + depthY(700)) / 2),
  });
});

test("next dive is at New York midnight, across DST changes", () => {
  assert.equal(msUntilNextDive(Date.parse("2026-10-28T23:00:00-04:00")), 3_600_000);
  assert.equal(msUntilNextDive(Date.parse("2026-11-01T00:00:00-04:00")), 25 * 3_600_000);
  assert.equal(msUntilNextDive(Date.parse("2026-12-31T23:59:59-05:00")), 1000);
});
