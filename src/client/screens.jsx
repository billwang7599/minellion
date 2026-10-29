import { Fragment, useEffect, useRef, useState } from "react";
import {
  ROUNDS, ROUND_MS, MAX_SCORE, SURFACE_Y, BANDS,
  depthY, bandOf, totalScore, isFinished, diveOf, shareText, stats, msUntilNextDive,
} from "../game.js";
import { api, fmtDate, useStore } from "./data.js";
import { Ore } from "./World.jsx";

const HOW_TO = [
  "7 prompts a day. Same for everyone.",
  "25 seconds to name one thing.",
  "Rare answers dig deep. Obvious ones stay in the dirt.",
  "The pick that feels clever? Half the server thought of it too.",
  `${MAX_SCORE} points takes you from Y ${SURFACE_Y} to bedrock.`,
  "One dig per day. No respawns.",
];

export function Intro({ day, meta, onBegin }) {
  const label = day ? `DIG #${day.number} · ${fmtDate(day.date)}${day.date === meta.today ? " · TODAY" : ""}` : "";
  return (
    <section className="intro">
      <div className="title">
        <h1 className="logo big" data-text="MINELLION">
          MINELLION
        </h1>
        <p className="subtitle">THE DAILY DIG</p>
        <p className="tagline">
          {ROUNDS} prompts · {ROUND_MS / 1000} seconds each · rarer answers dig deeper
        </p>
      </div>
      <div className="start">
        <details className="howto">
          <summary>HOW TO PLAY</summary>
          <ul>
            {HOW_TO.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
        {day ? (
          <button className="btn btn-begin" autoFocus onClick={onBegin}>
            ▼ BEGIN DIGGING ▼
          </button>
        ) : (
          <p className="empty">no dig scheduled for today. the archive is still open.</p>
        )}
        <div className="start-foot">
          <span className="label">{label}</span>
          <a className="btn btn-small" href="/archive">
            ARCHIVE ⟲
          </a>
        </div>
      </div>
    </section>
  );
}

export function Reveal({ day, index, meta, onNext }) {
  const store = useStore();
  const nextRef = useRef(null);
  const dive = diveOf(store, day.date);
  const result = dive.rounds[index];
  const score = totalScore(dive);
  const tier = meta.tiers.find((t) => t.key === result.tier);
  const last = index === ROUNDS - 1;
  const blocks = depthY(score - result.points) - depthY(score);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Enter" || document.querySelector(".menu[open]")) return;
      if (event.target.closest?.("a, button:not(.btn-next)")) return;
      event.preventDefault();
      // A held Enter from the guess would otherwise skip straight past the reveal.
      if (!event.repeat) nextRef.current.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <section className={`reveal ${tier ? `t-${tier.key}` : "t-miss"}`}>
        {tier ? (
          <>
            <div className="sprite">
              <Ore tier={tier.key} />
            </div>
            <h1 className="tier-name">{tier.name.toUpperCase()}</h1>
            <p className="answer">“{result.answer}”</p>
            <p className="gain">
              <b>+{result.points} PTS</b> · {blocks} block{blocks === 1 ? "" : "s"} down
            </p>
            <p className="quip">{tier.line}</p>
          </>
        ) : (
          <>
            <h1 className="tier-name">NOTHING MINED</h1>
            <p className="answer">—</p>
            <p className="gain">
              <b>+0 PTS</b>
            </p>
            <p className="quip">the clock beat your pickaxe.</p>
          </>
        )}
      </section>
      <div className="dock dock-next">
        <button ref={nextRef} className="btn btn-next" autoFocus onClick={() => onNext(last)}>
          {last ? "SURFACE ▲" : "DIG ▼"}
        </button>
      </div>
    </>
  );
}

function Countdown() {
  const [ms, setMs] = useState(() => msUntilNextDive(Date.now()));
  useEffect(() => {
    const tick = () => {
      const next = msUntilNextDive(Date.now());
      setMs(next);
      if (next <= 1000) setTimeout(() => location.reload(), 2000);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.ceil(ms / 1000);
  return <b>{[Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":")}</b>;
}

function HaulRow({ day, index, round, meta }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState(null);
  const [failed, setFailed] = useState(false);
  const tier = meta.tiers.find((t) => t.key === round.tier);

  const toggle = async () => {
    setOpen(!open);
    if (open || answers) return;
    setFailed(false);
    try {
      setAnswers((await api(`/days/${day.date}/${index + 1}/answers`)).answers);
    } catch {
      setFailed(true);
    }
  };

  return (
    <li className={`t-${round.tier ?? "miss"}`}>
      <button className="haul-row" aria-expanded={open} onClick={toggle}>
        <span className="n">{index + 1}</span>
        <Ore tier={round.tier} />
        <span className="haul-text">
          <small>{day.prompts[index].text.toUpperCase()}</small>
          <b>{tier ? round.answer : "—"}</b>
        </span>
        <span className="pts">{round.points}</span>
        <span className="plus">{open ? "−" : "+"}</span>
      </button>
      <div className="bank" hidden={!open}>
        {failed ? (
          <p className="label">couldn't load the answers.</p>
        ) : !answers ? (
          <p className="label">digging…</p>
        ) : (
          [...meta.tiers]
            .reverse()
            .filter((t) => answers[t.key].length)
            .map((t) => (
              <div key={t.key} className={`bank-tier t-${t.key}`}>
                <p className="label">
                  <Ore tier={t.key} /> {t.name.toUpperCase()} · {t.points}
                </p>
                <p>
                  {answers[t.key].map((a, i) => (
                    <Fragment key={a}>
                      {i > 0 && " · "}
                      <span className={a === round.answer ? "mine" : undefined}>{a}</span>
                    </Fragment>
                  ))}
                </p>
              </div>
            ))
        )}
      </div>
    </li>
  );
}

export function Results({ day, meta }) {
  const store = useStore();
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(null);
  const fallbackRef = useRef(null);
  const dive = diveOf(store, day.date);
  const score = totalScore(dive);
  const band = bandOf(score);
  const s = stats(store);

  useEffect(() => fallbackRef.current?.select(), [fallback]);

  const share = async () => {
    const text = shareText({ number: day.number, dive, tiers: meta.tiers, url: `${location.origin}/` });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setFallback(text);
    }
  };

  return (
    <section className="sheet">
      <div className="sheet-inner">
        <header className="sheet-head">
          <span className="logo">MINELLION</span>
          <span className="label">
            DIG #{day.number} COMPLETE · {fmtDate(day.date)}
          </span>
        </header>
        <div className="final">
          <b>{score}</b>
          <span>Y {depthY(score)}</span>
        </div>
        <p className="rule">
          <span>DIG LOG</span>
          <small>DEEPER = RARER</small>
        </p>
        <div className="log">
          {dive.rounds.map((r, i) => (
            <div key={i} className={`col t-${r.tier ?? "miss"}`}>
              <i style={{ height: `${r.points}%` }} />
              <span style={{ top: `${r.points}%` }}>
                <Ore tier={r.tier} />
              </span>
              <em>{i + 1}</em>
            </div>
          ))}
        </div>
        <p className="rule">
          <span>THE BEARING</span>
        </p>
        <ul className="bearing">
          {BANDS.map((b, i) => {
            const next = BANDS[i + 1];
            return (
              <li key={b.min} className={b === band ? "mine" : undefined}>
                <span className="range">{next ? `${b.min}–${next.min - 1}` : `${b.min}+`}</span>
                <span>
                  {b.name}. {b.text}
                </span>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-copy" onClick={share}>
          {copied ? "COPIED ✓" : "COPY RESULT"}
        </button>
        <p className="share-fallback">{fallback && <textarea ref={fallbackRef} readOnly rows="5" value={fallback} />}</p>
        <a className="btn btn-small" href="/archive">
          ARCHIVE ⟲
        </a>
        <p className="rule">
          <span>THE HAUL</span>
          <small>TAP A ROUND FOR EVERY ANSWER</small>
        </p>
        <ol className="haul">
          {dive.rounds.map((r, i) => (
            <HaulRow key={i} day={day} index={i} round={r} meta={meta} />
          ))}
        </ol>
        <p className="rule">
          <span>LOGBOOK</span>
        </p>
        <p className="label logbook">
          PLAYED {s.played} · AVG {s.average ?? "–"} · BEST {s.best ?? "–"}
        </p>
        {day.date === meta.today && (
          <p className="label next">
            NEXT DIG IN <Countdown />
          </p>
        )}
        <p className="fine">Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>
      </div>
    </section>
  );
}

export function Archive({ meta }) {
  const store = useStore();
  return (
    <section className="sheet">
      <div className="sheet-inner">
        <header className="sheet-head">
          <a className="logo" href="/">
            MINELLION
          </a>
          <span className="label">THE ARCHIVE</span>
        </header>
        <p className="rule">
          <span>EVERY DIG SO FAR</span>
        </p>
        {meta.days.length ? (
          <ul className="archive">
            {[...meta.days].reverse().map((d) => {
              const dive = diveOf(store, d.date);
              return (
                <li key={d.date}>
                  <a href={`/day/${d.date}`}>
                    <b>#{d.number}</b>
                    <span className="arch-date">
                      {fmtDate(d.date)}
                      {d.date === meta.today ? " · TODAY" : ""}
                    </span>
                    {isFinished(dive) ? (
                      <>
                        <span className="arch-score">{totalScore(dive)}</span>
                        <span className="arch-ores">
                          {dive.rounds.map((r, i) => (
                            <Ore key={i} tier={r.tier} />
                          ))}
                        </span>
                      </>
                    ) : (
                      <span className="arch-play">
                        {dive.rounds.length || dive.deadline ? `CONTINUE ${dive.rounds.length}/${ROUNDS}` : "DIG ▼"}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">no digs yet.</p>
        )}
      </div>
    </section>
  );
}

export function Message({ title, text, home }) {
  return (
    <section className="reveal t-miss">
      <h1 className="tier-name">{title}</h1>
      <p className="quip">{text}</p>
      {home && (
        <p>
          <a className="btn btn-small" href="/">
            BACK TO THE SURFACE ▲
          </a>
        </p>
      )}
    </section>
  );
}
