export const SUGGEST_LIMIT = 6;
export const MIN_SUGGEST_CHARS = 2;

const fold = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/^(the|a|an)\s+/, "");

export const normalize = (text) => fold(text).replace(/\s+/g, "").replace(/s$/, "");

export function edits(a, b, max, prefixOfB = false) {
  if (!prefixOfB && Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...row) > max) return max + 1;
    prev = row;
  }
  return Math.min(max + 1, prefixOfB ? Math.min(...prev) : prev[b.length]);
}

const indexes = new WeakMap();
const indexOf = (names) => {
  if (!indexes.has(names)) {
    indexes.set(
      names,
      names.map((name) => {
        const words = fold(name).split(/\s+/);
        return { name, words, tails: words.map((_, i) => words.slice(i).join("")) };
      }),
    );
  }
  return indexes.get(names);
};

const wordsInOrder = (queryWords, words) => {
  let i = 0;
  for (const word of words) if (i < queryWords.length && word.startsWith(queryWords[i])) i++;
  return i === queryWords.length;
};

function rankOf({ words, tails }, q, queryWords) {
  if (tails[0].startsWith(q)) return 0;
  if (tails.some((t) => t.startsWith(q)) || (queryWords.length > 1 && wordsInOrder(queryWords, words))) return 1;
  if (tails[0].includes(q)) return 2;
  return -1;
}

const fuzzyBudget = (length) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

export function suggest(names, query, limit = SUGGEST_LIMIT) {
  const queryWords = fold(query).split(/\s+/);
  const q = queryWords.join("");
  if (q.length < MIN_SUGGEST_CHARS) return [];
  const ranked = [];
  const rest = [];
  for (const entry of indexOf(names)) {
    const rank = rankOf(entry, q, queryWords);
    if (rank < 0) rest.push(entry);
    else ranked.push({ name: entry.name, rank });
  }
  const budget = fuzzyBudget(q.length);
  if (!ranked.length && budget) {
    for (const entry of rest) {
      if (entry.tails.some((t) => edits(q, t, budget, true) <= budget)) ranked.push({ name: entry.name, rank: 3 });
    }
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((r) => r.name);
}
