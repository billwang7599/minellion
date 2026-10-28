import {
  ROUNDS, ROUND_MS, MAX_SCORE, SURFACE_Y, BEDROCK_Y, MARKERS, BANDS, STORE_KEY,
  depthY, bandOf, totalScore, isFinished, diveOf, shareText, loadStore,
  startRound, finishRound, expireRound, stats, msUntilNextDive,
} from "./game.js";

const PX_PER_Y = 120;
const TOP_Y = 76;
const BOTTOM_Y = -72;
const LOW_TIME_MS = 5000;
const ROUND_ANCHOR = 0.34;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DIG_MS = reducedMotion ? 200 : 900;

const LAYERS = [
  [76, "#8fb8d4"], [66, "#c9dbe4"], [64, "#dfe8ea"],
  [64, "#557236"], [63.85, "#4a6530"], [63.85, "#3e3026"], [60, "#2f251d"],
  [60, "#3a3e44"], [30, "#2a2d32"], [2, "#1e2125"],
  [0, "#1b1e24"], [-40, "#0f1217"], [-60, "#0a0c10"],
  [-60, "#070809"], [-72, "#020203"],
];
const ORE = {
  dirt: ["#5a4232", "#8a6446"],
  coal: ["#3b3f45", "#0d0e10"],
  iron: ["#3b3f45", "#d9b08f"],
  gold: ["#3b3f45", "#f5cf3c"],
  diamond: ["#1d2027", "#5ff2e6"],
  netherite: ["#2f2427", "#b892ff"],
};
const SPECKS = [[1, 1], [2, 1], [5, 2], [6, 3], [2, 4], [3, 5], [5, 5], [6, 6], [1, 6]];

const app = document.getElementById("app");
const world = document.getElementById("world");
const hud = document.getElementById("hud");
const menu = document.getElementById("menu");
let store = loadStore(localStorage.getItem(STORE_KEY));
let meta = null;
const dayCache = new Map();
let cleanup = () => {};
let renders = 0;

const save = (next) => {
  store = next;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (date) =>
  new Date(`${date}T00:00:00Z`)
    .toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
const tierOf = (key) => meta.tiers.find((t) => t.key === key);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sceneY = (score) => SURFACE_Y - (score * (SURFACE_Y - BEDROCK_Y)) / MAX_SCORE;
const yPx = (y) => (TOP_Y - y) * PX_PER_Y;

function ore(key) {
  if (!ORE[key]) return `<svg class="ore" viewBox="0 0 8 8"><rect x=".5" y=".5" width="7" height="7" fill="none" stroke="#3d4654" stroke-dasharray="1 1"/></svg>`;
  const [base, speck] = ORE[key];
  return `<svg class="ore ore-${key}" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${base}"/>${SPECKS.map(
    ([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${speck}"/>`,
  ).join("")}</svg>`;
}

const TORCH = `<svg viewBox="0 0 4 12" shape-rendering="crispEdges"><rect x="1" y="0" width="2" height="1" fill="#ff9f43"/><rect x="0" y="1" width="4" height="2" fill="#ffb347"/><rect x="1" y="1" width="2" height="2" fill="#fff1b8"/><rect x="1" y="3" width="2" height="9" fill="#6b4c35"/><rect x="1" y="3" width="1" height="9" fill="#82603f"/></svg>`;
const CLOUD = `<svg viewBox="0 0 32 8" shape-rendering="crispEdges"><rect x="9" y="0" width="8" height="2" fill="#fff"/><rect x="5" y="2" width="18" height="2" fill="#fff"/><rect x="20" y="2" width="6" height="2" fill="#f4f7f9"/><rect x="1" y="4" width="29" height="2" fill="#fff"/><rect x="0" y="6" width="32" height="2" fill="#dde6ec"/></svg>`;

function buildWorld() {
  const total = (TOP_Y - BOTTOM_Y) * PX_PER_Y;
  world.style.height = `${total}px`;
  world.style.setProperty("--grass-px", `${yPx(SURFACE_Y)}px`);
  world.style.background = `linear-gradient(${LAYERS.map(([y, c]) => `${c} ${yPx(y)}px`).join(", ")})`;
  const ruler = [];
  for (let y = SURFACE_Y; y >= BEDROCK_Y; y -= 4) {
    ruler.push(`<span class="tick${y % 16 === 0 ? " major" : ""}" style="top:${yPx(y)}px">${y % 16 === 0 ? y : ""}</span>`);
  }
  world.innerHTML = `
    <div class="sun" style="top:${yPx(72)}px"></div>
    <div class="cloud" style="top:${yPx(73)}px;left:4%;width:320px">${CLOUD}</div>
    <div class="cloud" style="top:${yPx(71.5)}px;right:6%;width:260px">${CLOUD}</div>
    <div class="cloud" style="top:${yPx(68.5)}px;left:-60px;width:200px">${CLOUD}</div>
    <div class="cloud" style="top:${yPx(67.5)}px;right:-40px;width:180px">${CLOUD}</div>
    <div class="texture" style="top:${yPx(63.85)}px"></div>
    <div class="glow-lava" style="top:${yPx(-53)}px"></div>
    ${MARKERS.map(
      (m, i) => `<p class="marker ${i % 2 ? "right" : "left"}" style="top:${yPx(m.y)}px">${esc(m.text)}</p>`,
    ).join("")}
    <div class="ruler">${ruler.join("")}<span class="you" id="you">◂ YOU</span></div>
    <div id="lines"></div>
    <div class="card" id="card"></div>
    <div class="torch" id="torch">${TORCH}</div>`;
}

let cameraScore = 0;
function setDepth(score, { anchor = 0.5, instant = false } = {}) {
  cameraScore = score;
  const px = yPx(sceneY(score));
  world.classList.toggle("instant", instant);
  world.style.transform = `translateY(${Math.round(innerHeight * anchor - px)}px)`;
  world.dataset.anchor = anchor;
  document.getElementById("torch").style.top = `${px}px`;
  document.getElementById("you").style.top = `${px}px`;
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => world.classList.remove("instant")));
}
addEventListener("resize", () => setDepth(cameraScore, { anchor: Number(world.dataset.anchor), instant: true }));

function setHud(day, round, score) {
  if (!day) {
    hud.hidden = true;
    return;
  }
  hud.hidden = false;
  const dive = diveOf(store, day.date);
  document.getElementById("hud-y").textContent = depthY(score);
  document.getElementById("hud-score").textContent = score;
  document.getElementById("hud-round").textContent = round < ROUNDS ? `PROMPT ${round + 1} OF ${ROUNDS}` : "DIG COMPLETE";
  document.getElementById("hud-steps").innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    const r = dive.rounds[i];
    const cls = r ? `done t-${r.tier ?? "miss"}` : i === round ? "now" : "";
    return `<i class="${cls}"></i>`;
  }).join("");
}

function countUp(el, from, to, ms) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(from + (to - from) * t * t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function api(path, init) {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

function loadDay(date) {
  if (!dayCache.has(date)) {
    const day = api(`/days/${date}`);
    day.catch(() => dayCache.delete(date));
    dayCache.set(date, day);
  }
  return dayCache.get(date);
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

const HOW_TO = [
  "7 prompts a day. Same for everyone.",
  "25 seconds to name one thing.",
  "Rare answers dig deep. Obvious ones stay in the dirt.",
  "The pick that feels clever? Half the server thought of it too.",
  `${MAX_SCORE} points takes you from Y ${SURFACE_Y} to bedrock.`,
  "One dig per day. No respawns.",
];

function intro(day) {
  setHud(null);
  setDepth(0, { anchor: 0.56 });
  const label = day ? `DIG #${day.number} · ${fmtDate(day.date)}${day.date === meta.today ? " · TODAY" : ""}` : "";
  app.innerHTML = `
    <section class="intro">
      <div class="title">
        <h1 class="logo big" data-text="MINELLION">MINELLION</h1>
        <p class="subtitle">THE DAILY DIG</p>
        <p class="tagline">${ROUNDS} prompts · ${ROUND_MS / 1000} seconds each · rarer answers dig deeper</p>
      </div>
      <div class="start">
        <details class="howto"><summary>HOW TO PLAY</summary><ul>${HOW_TO.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></details>
        ${
          day
            ? `<button class="btn btn-begin" data-start>▼ BEGIN DIGGING ▼</button>`
            : `<p class="empty">no dig scheduled for today. the archive is still open.</p>`
        }
        <div class="start-foot"><span class="label">${label}</span><a class="btn btn-small" href="/archive">ARCHIVE ⟲</a></div>
      </div>
    </section>`;
  const begin = app.querySelector("[data-start]");
  begin?.focus();
  begin?.addEventListener("click", () => {
    save(startRound(store, day.date, Date.now()));
    if (location.pathname !== `/day/${day.date}`) history.pushState(null, "", `/day/${day.date}`);
    round(day);
  });
}

function round(day) {
  const date = day.date;
  const dive = diveOf(store, date);
  const index = dive.rounds.length;
  const prompt = day.prompts[index];
  const score = totalScore(dive);
  setHud(day, index, score);
  setDepth(score, { anchor: ROUND_ANCHOR });
  const lines = document.getElementById("lines");
  lines.innerHTML = "";
  lines.className = "";
  document.getElementById("card").className = "card";
  app.innerHTML = `
    <section class="round">
      <div class="prompt panel">
        <p class="label accent">PROMPT ${index + 1} OF ${ROUNDS} · ${esc(prompt.category.toUpperCase())}</p>
        <h1>${esc(prompt.text)}</h1>
        <p class="label">▼ rarer answers dig deeper ▼</p>
      </div>
      <div class="dock">
        <p class="feedback" role="status"></p>
        <form class="guess" autocomplete="off">
          <div class="dial"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" /><circle class="sweep" cx="18" cy="18" r="16" pathLength="100" /></svg><b></b></div>
          <div class="field">
            <input name="guess" maxlength="100" placeholder="type one answer…" autocapitalize="off" spellcheck="false" aria-label="Your answer" />
            <div class="bar"><i></i></div>
          </div>
          <button class="btn btn-dig">DIG</button>
        </form>
      </div>
    </section>`;
  const dock = app.querySelector(".dock");
  const form = app.querySelector("form");
  const input = form.elements.guess;
  const feedback = app.querySelector(".feedback");
  const sweep = app.querySelector(".sweep");
  const secs = app.querySelector(".dial b");
  const bar = app.querySelector(".bar i");
  let over = false;
  let busy = false;

  const end = () => {
    over = true;
    clearInterval(timer);
    document.body.classList.remove("low");
  };
  const tick = () => {
    const left = diveOf(store, date).deadline - Date.now();
    if (left <= 0) {
      end();
      save(expireRound(store, date, Date.now()));
      return reveal(day, index);
    }
    const frac = Math.min(1, left / ROUND_MS);
    sweep.style.strokeDashoffset = 100 - frac * 100;
    bar.style.width = `${frac * 100}%`;
    secs.textContent = Math.ceil(left / 1000);
    document.body.classList.toggle("low", left < LOW_TIME_MS);
  };
  const timer = setInterval(tick, 100);
  cleanup = end;
  tick();
  if (!over) input.focus();

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
        dock.hidden = true;
        app.querySelector(".prompt").classList.add("faded");
        const at = renders;
        await dig(day, score, result);
        if (at === renders) reveal(day, index);
        return;
      }
      if (result.suggestion) {
        feedback.className = "feedback suggest";
        feedback.innerHTML = `“${esc(guess)}” → <b>“${esc(result.suggestion)}”</b><small>submit again to confirm · or edit</small>`;
        input.value = result.suggestion;
      } else {
        feedback.className = "feedback";
        feedback.textContent = `“${guess}”: just stone. try again`;
        input.select();
      }
    } catch {
      feedback.className = "feedback";
      feedback.textContent = "couldn't reach the server. try again";
    } finally {
      busy = false;
    }
  });
}

async function dig(day, fromScore, result) {
  const lines = document.getElementById("lines");
  const card = document.getElementById("card");
  lines.innerHTML = meta.tiers
    .map(
      (t) => `<div class="tline t-${t.key}" style="top:${yPx(sceneY(fromScore + t.points))}px">
        <span>${ore(t.key)} ${esc(t.name.toUpperCase())} · ${t.points}</span></div>`,
    )
    .join("");
  card.className = "card";
  card.style.top = `${yPx(sceneY(fromScore))}px`;
  card.innerHTML = `“${esc(result.answer.toUpperCase())}” ▼`;
  card.getBoundingClientRect();
  card.className = "card sinking";
  card.style.top = `${yPx(sceneY(fromScore + result.points))}px`;
  setDepth(fromScore + result.points, { anchor: ROUND_ANCHOR });
  countUp(document.getElementById("hud-y"), depthY(fromScore), depthY(fromScore + result.points), DIG_MS);
  await sleep(DIG_MS);
  lines.querySelector(`.t-${result.tier}`)?.classList.add("lit");
  card.className = "card gone";
}

function reveal(day, index) {
  const dive = diveOf(store, day.date);
  const result = dive.rounds[index];
  const score = totalScore(dive);
  const before = score - result.points;
  const tier = tierOf(result.tier);
  const last = index === ROUNDS - 1;
  setHud(day, index + 1, score);
  setDepth(score, { anchor: ROUND_ANCHOR });
  document.getElementById("lines").className = "out";
  const blocks = depthY(before) - depthY(score);
  app.innerHTML = `
    <section class="reveal ${tier ? `t-${tier.key}` : "t-miss"}">
      ${
        tier
          ? `<div class="sprite">${ore(tier.key)}</div>
             <h1 class="tier-name">${esc(tier.name.toUpperCase())}</h1>
             <p class="answer">“${esc(result.answer)}”</p>
             <p class="gain"><b>+${result.points} PTS</b> · ${blocks} block${blocks === 1 ? "" : "s"} down</p>
             <p class="quip">${esc(tier.line)}</p>`
          : `<h1 class="tier-name">NOTHING MINED</h1>
             <p class="answer">—</p>
             <p class="gain"><b>+0 PTS</b></p>
             <p class="quip">the clock beat your pickaxe.</p>`
      }
    </section>
    <div class="dock dock-next"><button class="btn btn-next" data-next>${last ? "SURFACE ▲" : "DIG ▼"}</button></div>`;
  const next = app.querySelector("[data-next]");
  next.focus();
  const onKey = (event) => {
    if (event.key !== "Enter" || menu.open || event.target.closest?.("a, button:not([data-next])")) return;
    event.preventDefault();
    // A held Enter from the guess would otherwise skip straight past the reveal.
    if (!event.repeat) next.click();
  };
  document.addEventListener("keydown", onKey);
  cleanup = () => document.removeEventListener("keydown", onKey);
  next.addEventListener("click", () => {
    cleanup();
    cleanup = () => {};
    if (last) return results(day);
    save(startRound(store, day.date, Date.now()));
    round(day);
  });
}

function results(day) {
  const dive = diveOf(store, day.date);
  const score = totalScore(dive);
  const band = bandOf(score);
  const s = stats(store);
  setHud(null);
  setDepth(score, { anchor: 0.5 });
  document.getElementById("lines").innerHTML = "";
  const isToday = day.date === meta.today;
  const logCols = dive.rounds
    .map((r, i) => {
      const h = (r.points / 100) * 100;
      return `<div class="col t-${r.tier ?? "miss"}"><i style="height:${h}%"></i><span style="top:${h}%">${ore(r.tier)}</span><em>${i + 1}</em></div>`;
    })
    .join("");
  app.innerHTML = `
    <section class="sheet">
      <div class="sheet-inner">
        <header class="sheet-head"><span class="logo">MINELLION</span><span class="label">DIG #${day.number} COMPLETE · ${fmtDate(day.date)}</span></header>
        <div class="final"><b>${score}</b><span>Y ${depthY(score)}</span></div>
        <p class="rule"><span>DIG LOG</span><small>DEEPER = RARER</small></p>
        <div class="log">${logCols}</div>
        <p class="rule"><span>THE BEARING</span></p>
        <ul class="bearing">${BANDS.map((b, i) => {
          const next = BANDS[i + 1];
          const range = next ? `${b.min}–${next.min - 1}` : `${b.min}+`;
          return `<li class="${b === band ? "mine" : ""}"><span class="range">${range}</span><span>${esc(b.name)}. ${esc(b.text)}</span></li>`;
        }).join("")}</ul>
        <button class="btn btn-copy" data-share>COPY RESULT</button>
        <p class="share-fallback" data-share-note></p>
        <a class="btn btn-small" href="/archive">ARCHIVE ⟲</a>
        <p class="rule"><span>THE HAUL</span><small>TAP A ROUND FOR EVERY ANSWER</small></p>
        <ol class="haul">${dive.rounds
          .map((r, i) => {
            const t = tierOf(r.tier);
            return `<li class="t-${r.tier ?? "miss"}">
              <button class="haul-row" data-round="${i + 1}" aria-expanded="false">
                <span class="n">${i + 1}</span>${ore(r.tier)}
                <span class="haul-text"><small>${esc(day.prompts[i].text.toUpperCase())}</small><b>${t ? esc(r.answer) : "—"}</b></span>
                <span class="pts">${r.points}</span><span class="plus">+</span>
              </button>
              <div class="bank" hidden></div>
            </li>`;
          })
          .join("")}</ol>
        <p class="rule"><span>LOGBOOK</span></p>
        <p class="label logbook">PLAYED ${s.played} · AVG ${s.average ?? "–"} · BEST ${s.best ?? "–"}</p>
        ${isToday ? `<p class="label next">NEXT DIG IN <b data-countdown></b></p>` : ""}
        <p class="fine">Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>
      </div>
    </section>`;

  const share = app.querySelector("[data-share]");
  share.addEventListener("click", async () => {
    const text = shareText({ number: day.number, dive, tiers: meta.tiers, url: `${location.origin}/` });
    try {
      await navigator.clipboard.writeText(text);
      share.textContent = "COPIED ✓";
    } catch {
      const note = app.querySelector("[data-share-note]");
      note.innerHTML = `<textarea readonly rows="5">${esc(text)}</textarea>`;
      note.querySelector("textarea").select();
    }
  });
  app.querySelectorAll(".haul-row").forEach((row) =>
    row.addEventListener("click", () => toggleBank(day, dive, row)),
  );
  const cd = app.querySelector("[data-countdown]");
  if (cd) cleanup = countdown(cd);
}

async function toggleBank(day, dive, row) {
  const bank = row.nextElementSibling;
  const open = row.getAttribute("aria-expanded") !== "true";
  row.setAttribute("aria-expanded", open);
  row.querySelector(".plus").textContent = open ? "−" : "+";
  bank.hidden = !open;
  if (!open || bank.dataset.loaded) return;
  bank.innerHTML = `<p class="label">digging…</p>`;
  const index = Number(row.dataset.round) - 1;
  try {
    const { answers } = await api(`/days/${day.date}/${index + 1}/answers`);
    bank.dataset.loaded = "1";
    const mine = dive.rounds[index].answer;
    bank.innerHTML = [...meta.tiers]
      .reverse()
      .filter((t) => answers[t.key].length)
      .map(
        (t) => `<div class="bank-tier t-${t.key}"><p class="label">${ore(t.key)} ${esc(t.name.toUpperCase())} · ${t.points}</p>
          <p>${answers[t.key].map((a) => `<span${a === mine ? ' class="mine"' : ""}>${esc(a)}</span>`).join(" · ")}</p></div>`,
      )
      .join("");
  } catch {
    bank.innerHTML = `<p class="label">couldn't load the answers.</p>`;
  }
}

function archive() {
  setHud(null);
  setDepth(0, { anchor: 0.3 });
  const rows = [...meta.days].reverse().map((d) => {
    const dive = diveOf(store, d.date);
    const score = totalScore(dive);
    const status = isFinished(dive)
      ? `<span class="arch-score">${score}</span><span class="arch-ores">${dive.rounds.map((r) => ore(r.tier)).join("")}</span>`
      : `<span class="arch-play">${dive.rounds.length || dive.deadline ? `CONTINUE ${dive.rounds.length}/${ROUNDS}` : "DIG ▼"}</span>`;
    return `<li><a href="/day/${d.date}"><b>#${d.number}</b><span class="arch-date">${fmtDate(d.date)}${
      d.date === meta.today ? " · TODAY" : ""
    }</span>${status}</a></li>`;
  });
  app.innerHTML = `
    <section class="sheet">
      <div class="sheet-inner">
        <header class="sheet-head"><a class="logo" href="/">MINELLION</a><span class="label">THE ARCHIVE</span></header>
        <p class="rule"><span>EVERY DIG SO FAR</span></p>
        ${rows.length ? `<ul class="archive">${rows.join("")}</ul>` : `<p class="empty">no digs yet.</p>`}
      </div>
    </section>`;
}

function lost(message) {
  setHud(null);
  setDepth(MAX_SCORE, { anchor: 0.5 });
  app.innerHTML = `<section class="reveal t-miss"><h1 class="tier-name">LOST IN THE CAVES</h1><p class="quip">${message}</p>
    <p><a class="btn btn-small" href="/">BACK TO THE SURFACE ▲</a></p></section>`;
}

async function dayView(date) {
  const entry = meta.days.find((d) => d.date === date);
  if (!entry) return lost(`there's no dig for ${esc(date)}. it may not have been dug yet.`);
  const day = await loadDay(date);
  const before = diveOf(store, date).rounds.length;
  save(expireRound(store, date, Date.now()));
  const dive = diveOf(store, date);
  if (dive.rounds.length > before) return reveal(day, dive.rounds.length - 1);
  if (isFinished(dive)) return results(day);
  if (dive.deadline) return round(day);
  if (dive.rounds.length) return reveal(day, dive.rounds.length - 1);
  intro(day);
}

async function render() {
  renders++;
  cleanup();
  cleanup = () => {};
  menu.close();
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const dayMatch = path.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch && !meta) loadDay(dayMatch[1]);
  try {
    meta ??= await api("/days", { cache: "no-cache" });
    if (path === "/") {
      if (meta.days.some((d) => d.date === meta.today)) await dayView(meta.today);
      else intro(null);
    } else if (path === "/archive") archive();
    else if (dayMatch) await dayView(dayMatch[1]);
    else lost("this tunnel leads nowhere.");
  } catch (error) {
    setHud(null);
    app.innerHTML = `<section class="reveal t-miss"><h1 class="tier-name">CAVE-IN</h1><p class="quip">couldn't load minellion (${esc(error.message)}). try reloading.</p></section>`;
  }
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
document.getElementById("menu-btn").addEventListener("click", () => menu.showModal());
addEventListener("popstate", render);

document.documentElement.style.setProperty("--dig-ms", `${DIG_MS}ms`);
buildWorld();
setDepth(0, { anchor: 0.56, instant: true });
render();
