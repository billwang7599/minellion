import bank from "../data/prompts.json" with { type: "json" };
import genericNames from "../data/names.json" with { type: "json" };
import aliasTable from "../data/aliases.json" with { type: "json" };
import { normalize, edits } from "./match.js";

export { normalize };

export const TIERS = [
  { key: "dirt", name: "Dirt", points: 10, emoji: "🟫", line: "The answer everyone digs up first." },
  { key: "coal", name: "Coal", points: 15, emoji: "⚫", line: "Felt clever. Half the server thought of it too." },
  { key: "iron", name: "Iron", points: 30, emoji: "⚪", line: "Solid. Mining with the crowd." },
  { key: "gold", name: "Gold", points: 60, emoji: "🟨", line: "Genuinely uncommon. Nice find." },
  { key: "diamond", name: "Diamond", points: 85, emoji: "💎", line: "A deep cut. Most never dig this far." },
  { key: "netherite", name: "One in a Minellion", points: 100, emoji: "🟪", line: "Ancient debris. Absurd." },
];
const ROUNDS = 7;
const MAX_GUESS_CHARS = 100;
const MIN_TYPO_CHARS = 5;

const DAY_MS = 86_400_000;
const addDays = (date, n) => new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);

function seededRandom(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// A tag repeats in a day only if the pool holds 2+ per day of it, so leftovers don't pile up at a cycle's end.
function spread(pool, lineup) {
  const count = (tag) => lineup.filter((p) => p.tags.includes(tag)).length;
  const perDay = (tag) => (pool.filter((p) => p.tags.includes(tag)).length * ROUNDS) / pool.length;
  const cap = (tag) => Math.max(1, Math.floor(perDay(tag)));
  const clash = (card) => card.tags.reduce((n, tag) => n + count(tag), 0);
  const fit = pool.find((card) => card.tags.every((tag) => count(tag) < cap(tag)));
  return fit ?? pool.reduce((best, card) => (clash(card) < clash(best) ? card : best));
}

export function deal({ start, prompts }, until) {
  const days = [];
  const lastDealt = new Map();
  let deck = [];
  for (let date = start; date <= until; date = addDays(date, 1)) {
    const lineup = [];
    while (lineup.length < ROUNDS) {
      const fresh = prompts.filter((p) => p.added <= date && !lastDealt.has(p) && !lineup.includes(p));
      if (fresh.length) {
        // The launch bank was hand-dated before tags; its file order is those days' lineups.
        lineup.push(fresh[0].added === start ? fresh[0] : spread(fresh, lineup));
        continue;
      }
      const open = deck.filter((p) => !lineup.includes(p));
      if (!open.length) {
        const byAge = prompts.filter((p) => lastDealt.has(p)).sort((a, b) => lastDealt.get(a) - lastDealt.get(b));
        const half = Math.ceil(byAge.length / 2);
        const random = seededRandom(date);
        // Least recently dealt half first, so the end of one cycle doesn't come straight back.
        deck = [...shuffle(byAge.slice(0, half), random), ...shuffle(byAge.slice(half), random)];
        continue;
      }
      const card = spread(open, lineup);
      deck.splice(deck.indexOf(card), 1);
      lineup.push(card);
    }
    for (const p of lineup) lastDealt.set(p, days.length);
    days.push({ date, prompts: lineup });
  }
  return days;
}

let dealt = { until: "", days: [] };
function playableDays(today) {
  if (dealt.until !== today) dealt = { until: today, days: deal(bank, today) };
  return dealt.days;
}

const nyDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const globalAliases = new Map(
  Object.entries(aliasTable).map(([name, aliases]) => [normalize(name), aliases.map(normalize)]),
);

export function answerEntries(prompt) {
  const entries = TIERS.flatMap((tier) =>
    (prompt.answers[tier.key] ?? []).map((answer) => {
      const names = [].concat(answer);
      return { answer: names[0], tier: tier.key, keys: names.map(normalize) };
    }),
  );
  const own = new Set(entries.flatMap((e) => e.keys));
  for (const entry of entries) {
    const aliases = entry.keys.flatMap((key) => globalAliases.get(key) ?? []);
    entry.keys.push(...aliases.filter((alias) => !own.has(alias)));
  }
  return entries;
}

export function matchAnswer(prompt, guess) {
  const key = normalize(guess);
  if (!key) return null;
  const entries = answerEntries(prompt);
  const exact = entries.find((e) => e.keys.includes(key));
  if (exact) return { answer: exact.answer, tier: exact.tier, exact: true };
  const close = entries.filter((e) => e.keys.some((k) => k.length >= MIN_TYPO_CHARS && edits(k, key, 1) <= 1));
  return close.length === 1 ? { answer: close[0].answer, tier: close[0].tier, exact: false } : null;
}

const answerNames = bank.prompts.flatMap((p) => Object.values(p.answers).flat().map((a) => [].concat(a)[0]));
// Aliases go first so a real name keeps its spelling when both normalize alike.
const allNames = [...Object.values(aliasTable).flat(), ...genericNames, ...answerNames];
const names = [...new Map(allNames.map((n) => [normalize(n), n])).values()].sort((a, b) => a.localeCompare(b));

const json = (body, status = 200, cache = "no-store") =>
  Response.json(body, { status, headers: { "cache-control": cache } });
const notFound = () => json({ error: "not found" }, 404);

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const parts = pathname.split("/").filter(Boolean).slice(1);
    const today = nyDate.format(new Date());
    const playable = playableDays(today);

    if (parts[0] === "names" && parts.length === 1) {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      return json({ names }, 200, "public, max-age=3600");
    }
    if (parts[0] !== "days" || parts.length > 4) return notFound();
    if (parts.length === 1) {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      const days = playable.map((d, i) => ({ date: d.date, number: i + 1 }));
      return json({ today, tiers: TIERS, days }, 200, "public, max-age=60");
    }

    const index = playable.findIndex((d) => d.date === parts[1]);
    if (index < 0) return notFound();
    const day = playable[index];
    const cache = day.date === today ? "public, max-age=60" : "public, max-age=3600";

    if (parts.length === 2) {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      const prompts = day.prompts.map(({ category, text }) => ({ category, text }));
      return json({ date: day.date, number: index + 1, prompts }, 200, cache);
    }

    const round = Number(parts[2]);
    if (!Number.isInteger(round) || round < 1 || round > ROUNDS) return notFound();
    const prompt = day.prompts[round - 1];

    if (parts[3] === "answers") {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      const answers = Object.fromEntries(
        TIERS.map(({ key }) => [key, (prompt.answers[key] ?? []).map((a) => [].concat(a)[0])]),
      );
      return json({ answers }, 200, cache);
    }

    if (parts[3] === "guess") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      const body = await request.json().catch(() => null);
      const guess = body?.guess;
      if (typeof guess !== "string" || guess.length > MAX_GUESS_CHARS) return json({ error: "bad guess" }, 400);
      const match = matchAnswer(prompt, guess);
      if (!match) return json({ accepted: false });
      if (!match.exact) return json({ accepted: false, suggestion: match.answer });
      const points = TIERS.find((t) => t.key === match.tier).points;
      return json({ accepted: true, answer: match.answer, tier: match.tier, points });
    }

    return notFound();
  },
};
