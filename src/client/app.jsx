import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ROUNDS, MAX_SCORE, depthY, totalScore, isFinished, diveOf, startRound, expireRound } from "../game.js";
import { api, getStore, loadDay, save, useStore } from "./data.js";
import { World, DIG_MS } from "./World.jsx";
import { Round } from "./Round.jsx";
import { Intro, Reveal, Results, Archive, Message } from "./screens.jsx";
import "./style.css";

const ROUND_ANCHOR = 0.34;

let metaLoad = null;
const loadMeta = () => {
  metaLoad ??= api("/days", { cache: "no-cache" }).catch((error) => {
    metaLoad = null;
    throw error;
  });
  return metaLoad;
};

async function dayView(meta, date) {
  if (!meta.days.some((d) => d.date === date)) {
    return { screen: "lost", text: `there's no dig for ${date}. it may not have been dug yet.` };
  }
  const day = await loadDay(date);
  const before = diveOf(getStore(), date).rounds.length;
  save(expireRound(getStore(), date, Date.now()));
  const dive = diveOf(getStore(), date);
  if (dive.rounds.length > before) return { screen: "reveal", day, index: dive.rounds.length - 1 };
  if (isFinished(dive)) return { screen: "results", day };
  if (dive.deadline) return { screen: "round", day, index: dive.rounds.length };
  if (dive.rounds.length) return { screen: "reveal", day, index: dive.rounds.length - 1 };
  return { screen: "intro", day };
}

async function viewOf(path) {
  const dayMatch = path.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch && !metaLoad) loadDay(dayMatch[1]);
  try {
    const meta = await loadMeta();
    if (path === "/") {
      const view = meta.days.some((d) => d.date === meta.today) ? await dayView(meta, meta.today) : { screen: "intro" };
      return { ...view, meta };
    }
    if (path === "/archive") return { screen: "archive", meta };
    if (dayMatch) return { ...(await dayView(meta, dayMatch[1])), meta };
    return { screen: "lost", text: "this tunnel leads nowhere.", meta };
  } catch (error) {
    return { screen: "error", text: `couldn't load minellion (${error.message}). try reloading.` };
  }
}

function cameraOf(view, score) {
  switch (view?.screen) {
    case "round":
    case "reveal":
      return { score, anchor: ROUND_ANCHOR };
    case "results":
      return { score, anchor: 0.5 };
    case "archive":
      return { score: 0, anchor: 0.3 };
    case "lost":
      return { score: MAX_SCORE, anchor: 0.5 };
    default:
      return { score: 0, anchor: 0.56 };
  }
}

function useCountUp(to, ms) {
  const [shown, setShown] = useState(to);
  const prev = useRef(to);
  useEffect(() => {
    const from = prev.current;
    prev.current = to;
    if (!ms || from === to) return setShown(to);
    const start = performance.now();
    let id;
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(from + (to - from) * t * t));
      if (t < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [to, ms]);
  return ms ? shown : to;
}

function Hud({ visible, rounds, current, score, y, digging }) {
  const shownY = useCountUp(y, digging ? DIG_MS : 0);
  return (
    <header className="hud" hidden={!visible}>
      <div className="gauge">
        <span className="label">Y LEVEL</span>
        <b>{shownY}</b>
      </div>
      <div className="progress">
        <div id="hud-steps">
          {Array.from({ length: ROUNDS }, (_, i) => {
            const r = rounds[i];
            return <i key={i} className={r ? `done t-${r.tier ?? "miss"}` : i === current ? "now" : ""} />;
          })}
        </div>
        <span className="label">{current < ROUNDS ? `PROMPT ${current + 1} OF ${ROUNDS}` : "DIG COMPLETE"}</span>
      </div>
      <div className="gauge gauge-score">
        <span className="label">SCORE</span>
        <b>{score}</b>
      </div>
    </header>
  );
}

let digCount = 0;

function App() {
  const store = useStore();
  const [nav, setNav] = useState(0);
  const [view, setView] = useState(null);
  const [dig, setDig] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const go = () => setNav((n) => n + 1);
    const onClick = (event) => {
      const link = event.target.closest("a[href^='/']");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || link.target) return;
      event.preventDefault();
      history.pushState(null, "", link.getAttribute("href"));
      go();
    };
    document.addEventListener("click", onClick);
    addEventListener("popstate", go);
    return () => {
      document.removeEventListener("click", onClick);
      removeEventListener("popstate", go);
    };
  }, []);

  useEffect(() => {
    let stale = false;
    menuRef.current.close();
    viewOf(location.pathname.replace(/\/+$/, "") || "/").then((next) => {
      if (stale) return;
      setDig(null);
      setView((prev) => ({ ...next, meta: next.meta ?? prev?.meta }));
    });
    return () => {
      stale = true;
    };
  }, [nav]);

  useEffect(() => {
    if (!dig || dig.done) return;
    const id = setTimeout(() => {
      setDig({ ...dig, done: true });
      setView((prev) => ({ ...prev, screen: "reveal", day: dig.day, index: dig.index }));
    }, DIG_MS);
    return () => clearTimeout(id);
  }, [dig]);

  const meta = view?.meta;
  const day = view?.day;
  const dive = day ? diveOf(store, day.date) : null;
  const score = dive ? totalScore(dive) : 0;
  const playing = view?.screen === "round" || view?.screen === "reveal";
  const current = view?.screen === "round" ? view.index : view?.index + 1;
  const hudScore = dig && !dig.done ? dig.from : score;

  const begin = () => {
    if (location.pathname !== `/day/${day.date}`) history.pushState(null, "", `/day/${day.date}`);
    flushSync(() => {
      save(startRound(getStore(), day.date, Date.now()));
      setView({ ...view, screen: "round", index: 0 });
    });
  };

  const next = (last) => {
    if (last) {
      setDig(null);
      setView({ ...view, screen: "results" });
      return;
    }
    flushSync(() => {
      save(startRound(getStore(), day.date, Date.now()));
      setDig(null);
      setView({ ...view, screen: "round", index: view.index + 1 });
    });
  };

  let screen = null;
  switch (view?.screen) {
    case "intro":
      screen = <Intro day={day} meta={meta} onBegin={begin} />;
      break;
    case "round":
      screen = (
        <Round
          key={`${day.date}-${view.index}`}
          day={day}
          index={view.index}
          onDig={(from, result) => setDig({ id: ++digCount, day, index: view.index, from, result, done: false })}
          onExpire={() => setView((prev) => ({ ...prev, screen: "reveal" }))}
        />
      );
      break;
    case "reveal":
      screen = <Reveal key={`${day.date}-${view.index}`} day={day} index={view.index} meta={meta} onNext={next} />;
      break;
    case "results":
      screen = <Results key={day.date} day={day} meta={meta} />;
      break;
    case "archive":
      screen = <Archive meta={meta} />;
      break;
    case "lost":
      screen = <Message title="LOST IN THE CAVES" text={view.text} home />;
      break;
    case "error":
      screen = <Message title="CAVE-IN" text={view.text} />;
      break;
  }

  return (
    <>
      <World
        camera={cameraOf(view, score)}
        dig={dig}
        tiers={meta?.tiers ?? []}
        linesOut={view?.screen === "reveal"}
      />
      <Hud
        visible={playing}
        rounds={playing ? dive.rounds.slice(0, current) : []}
        current={current}
        score={hudScore}
        y={depthY(score)}
        digging={Boolean(dig && !dig.done)}
      />
      <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => menuRef.current.showModal()}>
        ≡
      </button>
      <main id="app" aria-live="polite">
        {screen}
      </main>
      <dialog className="menu" ref={menuRef}>
        <p className="label">MINELLION</p>
        <h2 className="logo">MENU</h2>
        <form method="dialog">
          <button className="icon-btn menu-close" aria-label="Close">
            ×
          </button>
        </form>
        <p className="rule">
          <span>DIG IN</span>
        </p>
        <nav className="tiles">
          <a href="/" className="tile">
            ↓<span>DAILY DIG</span>
          </a>
          <a href="/archive" className="tile">
            ⟲<span>ARCHIVE</span>
          </a>
        </nav>
        <p className="fine">
          Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.{" "}
          <a href="https://krillion.io" target="_blank" rel="noopener">
            Inspired by Krillion.
          </a>
        </p>
        <p className="fine">one in a minellion.</p>
      </dialog>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
