import { useSyncExternalStore } from "react";
import { STORE_KEY, loadStore } from "../game.js";

let store = loadStore(localStorage.getItem(STORE_KEY));
const listeners = new Set();

export const getStore = () => store;

export function save(next) {
  store = next;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useStore = () => useSyncExternalStore(subscribe, getStore);

export async function api(path, init) {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

const dayCache = new Map();
export function loadDay(date) {
  if (!dayCache.has(date)) {
    const day = api(`/days/${date}`);
    day.catch(() => dayCache.delete(date));
    dayCache.set(date, day);
  }
  return dayCache.get(date);
}

let namesLoad = null;
export function loadNames() {
  namesLoad ??= api("/names").then(
    (body) => body.names,
    () => {
      namesLoad = null;
      return [];
    },
  );
  return namesLoad;
}

export const fmtDate = (date) =>
  new Date(`${date}T00:00:00Z`)
    .toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
