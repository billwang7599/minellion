import data from "../data/days.json" with { type: "json" };

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

const nyDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function normalize(text) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, "")
    .replace(/s$/, "");
}

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function matchAnswer(prompt, guess) {
  const key = normalize(guess);
  if (!key) return null;
  const entries = TIERS.flatMap((tier) =>
    (prompt.answers[tier.key] ?? []).map((answer) => {
      const names = [].concat(answer);
      return { answer: names[0], tier: tier.key, keys: names.map(normalize) };
    }),
  );
  const exact = entries.find((e) => e.keys.includes(key));
  if (exact) return { answer: exact.answer, tier: exact.tier, exact: true };
  const close = entries.filter((e) => e.keys.some((k) => k.length >= MIN_TYPO_CHARS && withinOneEdit(k, key)));
  return close.length === 1 ? { answer: close[0].answer, tier: close[0].tier, exact: false } : null;
}

const json = (body, status = 200, cache = "no-store") =>
  Response.json(body, { status, headers: { "cache-control": cache } });
const notFound = () => json({ error: "not found" }, 404);

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const parts = pathname.split("/").filter(Boolean).slice(1);
    const today = nyDate.format(new Date());
    const playable = data.days.filter((d) => d.date <= today);

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
