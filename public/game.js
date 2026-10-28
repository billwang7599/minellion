export const ROUNDS = 7;
export const ROUND_MS = 25_000;
export const PREVIEW_MS = 3_000;
export const MAX_SCORE = 700;
export const SURFACE_Y = 64;
export const BEDROCK_Y = -64;
export const MISS = { guess: null, tier: null, points: 0 };
export const MISS_EMOJI = "⬛";
export const STORE_KEY = "minellion:v1";

export const MARKERS = [
  { y: 59, text: "THE STONE LAYER ──" },
  { y: 48, text: "── copper is most common here" },
  { y: 32, text: "the cave air turns cold and damp ──" },
  { y: 16, text: "── iron peaks at y 16" },
  { y: 0, text: "THE DEEPSLATE LAYER ──" },
  { y: -2, text: "── lapis peaks here. pickaxes slow down" },
  { y: -16, text: "gold is most common at y -16 ──" },
  { y: -32, text: "── sculk spreads in the dark" },
  { y: -40, text: "THE DEEP DARK ──" },
  { y: -51, text: "── an ancient city sleeps here. walk softly" },
  { y: -55, text: "below y -55 the caves flood with lava ──" },
  { y: -59, text: "── diamonds peak just above bedrock" },
  { y: -63, text: "BEDROCK. a perfect dig ends here ──" },
];

export const BANDS = [
  { min: 0, name: "Upper caves", text: "Plenty of world left below." },
  { min: 151, name: "Stone", text: "Mining with the crowd." },
  { min: 251, name: "Iron country", text: "Past the easy ores. Nice." },
  { min: 351, name: "Deepslate", text: "Seriously deep. Walk softly." },
  { min: 450, name: "The deep", text: "One in a Minellion. Absurd." },
];

export const bandOf = (score) => BANDS.findLast((band) => score >= band.min);

export const depthY = (score) => SURFACE_Y - Math.round((score * (SURFACE_Y - BEDROCK_Y)) / MAX_SCORE);

export const totalScore = (dive) => dive.rounds.reduce((sum, r) => sum + r.points, 0);
export const isFinished = (dive) => dive.rounds.length >= ROUNDS;
export const diveOf = (store, date) => store.dives[date] ?? { rounds: [] };

export function shareText({ number, dive, tiers, url }) {
  const score = totalScore(dive);
  const emoji = dive.rounds.map((r) => tiers.find((t) => t.key === r.tier)?.emoji ?? MISS_EMOJI).join("");
  return [`Minellion #${number} ⛏️`, `${score} · Y ${depthY(score)}`, "", emoji, url].join("\n");
}

export function loadStore(raw) {
  try {
    const store = JSON.parse(raw);
    if (store?.dives && typeof store.dives === "object" && !Array.isArray(store.dives)) return store;
  } catch {}
  return { dives: {} };
}

const withDive = (store, date, dive) => ({ ...store, dives: { ...store.dives, [date]: dive } });

export function startRound(store, date, nowMs) {
  const dive = diveOf(store, date);
  if (isFinished(dive) || dive.deadline) return store;
  return withDive(store, date, { ...dive, deadline: nowMs + PREVIEW_MS + ROUND_MS });
}

export function finishRound(store, date, result) {
  const { deadline, ...dive } = diveOf(store, date);
  if (isFinished(dive)) return store;
  return withDive(store, date, { ...dive, rounds: [...dive.rounds, result] });
}

export function expireRound(store, date, nowMs) {
  const { deadline } = diveOf(store, date);
  return deadline && nowMs >= deadline ? finishRound(store, date, MISS) : store;
}

export function stats(store) {
  const scores = Object.values(store.dives).filter(isFinished).map(totalScore);
  if (!scores.length) return { played: 0, best: null, average: null };
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { played: scores.length, best: Math.max(...scores), average };
}

const nyParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function nyWallClockMs(ms) {
  const p = Object.fromEntries(nyParts.formatToParts(ms).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

export function msUntilNextDive(nowMs) {
  const wall = new Date(nyWallClockMs(nowMs));
  const midnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
  let midnight = midnightWall - (nyWallClockMs(nowMs) - nowMs);
  midnight = midnightWall - (nyWallClockMs(midnight) - midnight);
  return midnight - nowMs;
}
