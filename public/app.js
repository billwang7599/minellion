import {
  ROUNDS, ROUND_MS, MAX_SCORE, SURFACE_Y, BEDROCK_Y, LANDMARKS, STORE_KEY, MISS_EMOJI,
  depthY, layerName, totalScore, isFinished, diveOf, shareText, loadStore,
  startRound, finishRound, expireRound, stats, msUntilNextDive,
} from "./game.js";

const app = document.getElementById("app");
const shaft = document.getElementById("shaft");
let store = loadStore(localStorage.getItem(STORE_KEY));
let meta = null;
const dayCache = new Map();
let cleanup = () => {};

const save = (next) => {
  store = next;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtY = (y) => `Y ${y}`;
const fmtDate = (date, opts = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
const tierOf = (key) => meta.tiers.find((t) => t.key === key);
const emojiRow = (dive) => dive.rounds.map((r) => tierOf(r.tier)?.emoji ?? MISS_EMOJI).join("");

async function api(path, init) {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function loadDay(date) {
  if (!dayCache.has(date)) dayCache.set(date, await api(`/days/${date}`));
  return dayCache.get(date);
}

function buildShaft() {
  const pct = (y) => ((SURFACE_Y - y) / (SURFACE_Y - BEDROCK_Y)) * 100;
  shaft.innerHTML = `
    <div class="shaft-bar">
      ${LANDMARKS.map(
        (l) => `<div class="landmark lm-${l.name.split(/\W/)[0].toLowerCase()}" style="top:${pct(l.y)}%" title="${esc(l.name)}">
          <span class="lm-label">${fmtY(l.y)} <b>${esc(l.name)}</b></span></div>`,
      ).join("")}
      <div class="player" id="player"><span class="player-y"></span></div>
    </div>`;
}

function setDepth(score) {
  const player = document.getElementById("player");
  const y = depthY(score);
  player.style.top = `${((SURFACE_Y - y) / (SURFACE_Y - BEDROCK_Y)) * 100}%`;
  player.querySelector(".player-y").textContent = fmtY(y);
}

function countdown(el) {
  const tick = () => {
    const ms = msUntilNextDive(Date.now());
    const s = Math.ceil(ms / 1000);
    el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
    if (ms <= 1000) setTimeout(() => location.reload(), 2000);
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

function shareBlock(dive) {
  return `
    <div class="share">
      <div class="emoji-row">${emojiRow(dive)}</div>
      <button class="btn btn-green" data-share>Share</button>
      <p class="share-note" data-share-note></p>
    </div>`;
}

function wireShare(day, dive) {
  const button = app.querySelector("[data-share]");
  if (!button) return;
  button.addEventListener("click", async () => {
    const text = shareText({ number: day.number, dive, tiers: meta.tiers, url: `${location.origin}/` });
    const note = app.querySelector("[data-share-note]");
    try {
      await navigator.clipboard.writeText(text);
      note.textContent = "Copied to clipboard!";
    } catch {
      note.innerHTML = `<textarea readonly rows="4">${esc(text)}</textarea>`;
      note.querySelector("textarea").select();
    }
  });
}

function home() {
  const todayDay = meta.days.find((d) => d.date === meta.today);
  const s = stats(store);
  const legend = `
    <h2>Scoring</h2>
    <ul class="legend">
      ${meta.tiers.map((t) => `<li><span class="chip chip-${t.key}"></span>${esc(t.name)}<b>${t.points}</b></li>`).join("")}
    </ul>
    <p class="hint">Reach ${MAX_SCORE} points to hit bedrock at ${fmtY(BEDROCK_Y)}.</p>`;
  const statsHtml = `
    <div class="stats">
      <div><b>${s.played}</b><span>Dives</span></div>
      <div><b>${s.bestY === null ? "–" : fmtY(s.bestY)}</b><span>Best depth</span></div>
      <div><b>${s.averageY === null ? "–" : fmtY(s.averageY)}</b><span>Average</span></div>
    </div>`;

  if (!todayDay) {
    setDepth(0);
    app.innerHTML = `
      <section class="panel">
        <h1>No dive today</h1>
        <p>There's no dive scheduled for ${esc(fmtDate(meta.today))}. Dig through the <a href="/archive">archive</a> instead.</p>
      </section>
      <section class="panel">${legend}${statsHtml}</section>`;
    return;
  }

  const dive = diveOf(store, todayDay.date);
  setDepth(totalScore(dive));
  let action;
  if (isFinished(dive)) {
    const score = totalScore(dive);
    action = `
      <div class="final">
        <div class="final-y">${fmtY(depthY(score))}</div>
        <div class="final-layer">${layerName(depthY(score))} · ${score}/${MAX_SCORE}</div>
      </div>
      ${shareBlock(dive)}
      <p class="next">Next dive in <span data-countdown></span></p>
      <p><a href="/day/${todayDay.date}">See your rounds</a></p>`;
  } else {
    const label = dive.rounds.length || dive.deadline ? `Continue · round ${dive.rounds.length + 1}/${ROUNDS}` : "Start digging";
    action = `<button class="btn btn-green btn-big" data-start>${label}</button>`;
  }
  app.innerHTML = `
    <section class="panel hero">
      <p class="eyebrow">${esc(fmtDate(todayDay.date))}</p>
      <h1>Dive #${todayDay.number}</h1>
      <p>${ROUNDS} prompts, ${ROUND_MS / 1000} seconds each. Name an answer that fits. The rarer it is, the deeper you dig.</p>
      ${action}
    </section>
    <section class="panel">${legend}${statsHtml}<p><a href="/archive">Play past dives in the archive →</a></p></section>`;

  app.querySelector("[data-start]")?.addEventListener("click", () => {
    save(startRound(store, todayDay.date, Date.now()));
    navigate(`/day/${todayDay.date}`);
  });
  wireShare(todayDay, dive);
  const cd = app.querySelector("[data-countdown]");
  if (cd) cleanup = countdown(cd);
}

function archive() {
  setDepth(0);
  const rows = [...meta.days].reverse().map((d) => {
    const dive = diveOf(store, d.date);
    const score = totalScore(dive);
    const status = isFinished(dive)
      ? `<span class="arch-result"><span class="arch-y">${fmtY(depthY(score))}</span> ${emojiRow(dive)}</span>`
      : dive.rounds.length || dive.deadline
        ? `<span class="arch-play">Continue ${dive.rounds.length}/${ROUNDS}</span>`
        : `<span class="arch-play">Play</span>`;
    return `<li><a href="/day/${d.date}"><b>#${d.number}</b><span class="arch-date">${esc(
      fmtDate(d.date, { weekday: "short", month: "short", day: "numeric" }),
    )}${d.date === meta.today ? " · Today" : ""}</span>${status}</a></li>`;
  });
  app.innerHTML = `
    <section class="panel">
      <h1>Archive</h1>
      ${rows.length ? `<ul class="archive">${rows.join("")}</ul>` : "<p>No dives yet.</p>"}
    </section>`;
}

async function dayView(date) {
  const entry = meta.days.find((d) => d.date === date);
  if (!entry) return notFound(`There's no dive for ${esc(date)}. It may not have been dug yet.`);
  const day = await loadDay(date);
  const before = diveOf(store, date).rounds.length;
  save(expireRound(store, date, Date.now()));
  const dive = diveOf(store, date);
  setDepth(totalScore(dive));
  if (dive.rounds.length > before) return reveal(day, dive.rounds.length - 1);
  if (isFinished(dive)) return results(day);
  if (dive.deadline) return round(day);
  intro(day);
}

function intro(day) {
  const dive = diveOf(store, day.date);
  const isToday = day.date === meta.today;
  app.innerHTML = `
    <section class="panel hero">
      <p class="eyebrow">${esc(fmtDate(day.date))}${isToday ? " · Today" : ""}</p>
      <h1>Dive #${day.number}</h1>
      <p>${ROUNDS} prompts, ${ROUND_MS / 1000} seconds each. The rarer your answer, the deeper you dig.</p>
      <button class="btn btn-green btn-big" data-start>${
        dive.rounds.length ? `Continue · round ${dive.rounds.length + 1}/${ROUNDS}` : "Start digging"
      }</button>
    </section>`;
  app.querySelector("[data-start]").addEventListener("click", () => {
    save(startRound(store, day.date, Date.now()));
    round(day);
  });
}

function round(day) {
  const date = day.date;
  const index = diveOf(store, date).rounds.length;
  const prompt = day.prompts[index];
  const score = totalScore(diveOf(store, date));
  app.innerHTML = `
    <section class="panel round">
      <div class="round-head">
        <span>Round ${index + 1}/${ROUNDS}</span>
        <span class="category">${esc(prompt.category)}</span>
        <span>${score} pts</span>
      </div>
      <h1 class="prompt">${esc(prompt.text)}</h1>
      <div class="timer"><div class="timer-fill"></div><span class="timer-secs"></span></div>
      <form class="guess" autocomplete="off">
        <input name="guess" maxlength="100" placeholder="Type an answer" autocapitalize="off" spellcheck="false" aria-label="Your answer" />
        <button class="btn btn-green">Mine</button>
      </form>
      <p class="feedback" role="status"></p>
    </section>`;
  const form = app.querySelector("form");
  const input = form.elements.guess;
  const feedback = app.querySelector(".feedback");
  const fill = app.querySelector(".timer-fill");
  const secs = app.querySelector(".timer-secs");
  let over = false;
  let busy = false;
  input.focus();

  const end = () => {
    over = true;
    clearInterval(timer);
  };
  const tick = () => {
    const left = diveOf(store, date).deadline - Date.now();
    if (left <= 0) {
      end();
      save(expireRound(store, date, Date.now()));
      return reveal(day, index);
    }
    fill.style.width = `${(left / ROUND_MS) * 100}%`;
    fill.classList.toggle("low", left < 5000);
    secs.textContent = Math.ceil(left / 1000);
  };
  const timer = setInterval(tick, 100);
  cleanup = end;
  tick();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const guess = input.value.trim();
    if (!guess || busy || over) return;
    busy = true;
    try {
      const result = await api(`/days/${date}/${index + 1}/guess`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guess }),
      });
      if (over) return;
      if (result.accepted) {
        end();
        save(finishRound(store, date, { guess, answer: result.answer, tier: result.tier, points: result.points }));
        return reveal(day, index);
      }
      feedback.textContent = `“${guess}” is not in the bank. Keep digging!`;
      form.classList.remove("shake");
      void form.offsetWidth;
      form.classList.add("shake");
      input.select();
    } catch {
      feedback.textContent = "Couldn't reach the server. Try again.";
    } finally {
      busy = false;
    }
  });
}

async function reveal(day, index) {
  const dive = diveOf(store, day.date);
  const result = dive.rounds[index];
  const prompt = day.prompts[index];
  setDepth(totalScore(dive));
  const tier = tierOf(result.tier);
  const last = index === ROUNDS - 1;
  app.innerHTML = `
    <section class="panel reveal">
      <div class="round-head"><span>Round ${index + 1}/${ROUNDS}</span><span class="category">${esc(prompt.category)}</span></div>
      <h1 class="prompt">${esc(prompt.text)}</h1>
      ${
        tier
          ? `<p class="verdict"><span class="chip chip-${tier.key}"></span>${esc(result.answer)} · ${esc(tier.name)} <b>+${result.points}</b></p>`
          : `<p class="verdict miss">⏱ Time's up! <b>+0</b></p>`
      }
      <div class="bank"><p class="hint">Loading the bank…</p></div>
      <button class="btn btn-green btn-big" data-next>${last ? "See results" : "Next round"}</button>
    </section>`;
  const next = app.querySelector("[data-next]");
  next.focus();
  next.addEventListener("click", () => {
    if (last) return results(day);
    save(startRound(store, day.date, Date.now()));
    round(day);
  });
  try {
    const { answers } = await api(`/days/${day.date}/${index + 1}/answers`);
    app.querySelector(".bank").innerHTML = meta.tiers
      .filter((t) => answers[t.key].length)
      .map(
        (t) => `
        <div class="bank-tier">
          <h3><span class="chip chip-${t.key}"></span>${esc(t.name)} <b>${t.points}</b></h3>
          <ul>${answers[t.key].map((a) => `<li${a === result.answer ? ' class="mine"' : ""}>${esc(a)}</li>`).join("")}</ul>
        </div>`,
      )
      .join("");
  } catch {
    app.querySelector(".bank").innerHTML = `<p class="hint">Couldn't load the answers.</p>`;
  }
}

function results(day) {
  const dive = diveOf(store, day.date);
  const score = totalScore(dive);
  const y = depthY(score);
  setDepth(score);
  const isToday = day.date === meta.today;
  app.innerHTML = `
    <section class="panel hero">
      <p class="eyebrow">${esc(fmtDate(day.date))}</p>
      <h1>Dive #${day.number} complete</h1>
      <div class="final">
        <div class="final-y">${fmtY(y)}</div>
        <div class="final-layer">${layerName(y)} · ${score}/${MAX_SCORE}</div>
      </div>
      ${shareBlock(dive)}
      ${isToday ? `<p class="next">Next dive in <span data-countdown></span></p>` : ""}
      <p><a href="/archive">More dives in the archive →</a></p>
    </section>
    <section class="panel">
      <table class="rounds">
        <thead><tr><th>#</th><th>Prompt</th><th>Your answer</th><th>Pts</th></tr></thead>
        <tbody>
          ${dive.rounds
            .map((r, i) => {
              const t = tierOf(r.tier);
              return `<tr><td>${i + 1}</td><td>${esc(day.prompts[i].text)}</td>
                <td><span class="answer">${t ? `<span class="chip chip-${t.key}"></span>${esc(r.answer)}` : `${MISS_EMOJI} Time's up`}</span></td>
                <td>${r.points}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </section>`;
  wireShare(day, dive);
  const cd = app.querySelector("[data-countdown]");
  if (cd) cleanup = countdown(cd);
}

function notFound(message = "This tunnel leads nowhere.") {
  setDepth(0);
  app.innerHTML = `<section class="panel"><h1>Lost in the caves</h1><p>${message}</p><p><a href="/">Back to the surface</a></p></section>`;
}

async function render() {
  cleanup();
  cleanup = () => {};
  const path = location.pathname.replace(/\/+$/, "") || "/";
  try {
    meta ??= await api("/days", { cache: "no-cache" });
    const dayMatch = path.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
    if (path === "/") home();
    else if (path === "/archive") archive();
    else if (dayMatch) await dayView(dayMatch[1]);
    else notFound();
  } catch (error) {
    app.innerHTML = `<section class="panel"><h1>Cave-in!</h1><p>Couldn't load Minellion (${esc(error.message)}). Try reloading.</p></section>`;
  }
  window.scrollTo(0, 0);
}

function navigate(path) {
  history.pushState(null, "", path);
  render();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='/']");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || link.target) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});
addEventListener("popstate", render);

buildShaft();
render();
