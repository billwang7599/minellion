export const SUGGEST_LIMIT = 6;

export const normalize = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, "")
    .replace(/s$/, "");

export function edits(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    if (Math.min(...row) > max) return max + 1;
    before = prev;
    prev = row;
  }
  return Math.min(max + 1, prev[b.length]);
}

const typoBudget = (length) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

const keyCache = new WeakMap();

export function suggest(names, query, limit = SUGGEST_LIMIT) {
  const q = normalize(query);
  const budget = typoBudget(q.length);
  if (!budget) return [];
  if (!keyCache.has(names)) keyCache.set(names, names.map(normalize));
  const keys = keyCache.get(names);
  if (keys.includes(q)) return [];
  const close = [];
  keys.forEach((key, i) => {
    if (key.startsWith(q) || q.startsWith(key)) return;
    const distance = edits(q, key, budget);
    if (distance <= budget) close.push({ name: names[i], distance });
  });
  return close
    .sort((a, b) => a.distance - b.distance || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((c) => c.name);
}
