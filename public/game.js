export const ROUNDS = 7;
export const ROUND_MS = 25_000;
export const MAX_SCORE = 700;
export const SURFACE_Y = 64;
export const BEDROCK_Y = -64;
export const MISS = { guess: null, tier: null, points: 0 };
export const MISS_EMOJI = "❌";
export const STORE_KEY = "minellion:v1";

export const LANDMARKS = [
  { y: 63, name: "Sea level" },
  { y: 48, name: "Copper peak" },
  { y: 16, name: "Iron peak" },
  { y: 0, name: "Deepslate & lapis" },
  { y: -16, name: "Gold peak" },
  { y: -51, name: "Ancient cities" },
  { y: -55, name: "Lava lakes" },
  { y: -59, name: "Diamonds" },
  { y: -64, name: "Bedrock" },
];

export const depthY = (score) => SURFACE_Y - Math.round((score * (SURFACE_Y - BEDROCK_Y)) / MAX_SCORE);

export function layerName(y) {
  if (y >= SURFACE_Y) return "Surface";
  if (y >= 60) return "Dirt";
  if (y > 0) return "Stone";
  if (y > BEDROCK_Y) return "Deepslate";
  return "Bedrock";
}

export const totalScore = (dive) => dive.rounds.reduce((sum, r) => sum + r.points, 0);
export const isFinished = (dive) => dive.rounds.length >= ROUNDS;
export const diveOf = (store, date) => store.dives[date] ?? { rounds: [] };

export function shareText({ number, dive, tiers, url }) {
  const score = totalScore(dive);
  const emoji = dive.rounds.map((r) => tiers.find((t) => t.key === r.tier)?.emoji ?? MISS_EMOJI).join("");
  return [`Minellion #${number} ⛏️ Y ${depthY(score)}`, emoji, `${score}/${MAX_SCORE}`, url].join("\n");
}

export function loadStore(raw) {
  try {
    const store = JSON.parse(raw);
    if (store && typeof store.dives === "object" && store.dives) return store;
  } catch {}
  return { dives: {} };
}

const withDive = (store, date, dive) => ({ ...store, dives: { ...store.dives, [date]: dive } });

export function startRound(store, date, nowMs) {
  const dive = diveOf(store, date);
  if (isFinished(dive) || dive.deadline) return store;
  return withDive(store, date, { ...dive, deadline: nowMs + ROUND_MS });
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
  const depths = Object.values(store.dives).filter(isFinished).map((d) => depthY(totalScore(d)));
  if (!depths.length) return { played: 0, bestY: null, averageY: null };
  const averageY = Math.round(depths.reduce((a, b) => a + b, 0) / depths.length);
  return { played: depths.length, bestY: Math.min(...depths), averageY };
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
