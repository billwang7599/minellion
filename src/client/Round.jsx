import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ROUNDS, ROUND_MS, diveOf, totalScore, finishRound, expireRound } from "../game.js";
import { suggest } from "../match.js";
import { api, getStore, loadNames, save } from "./data.js";

const LOW_TIME_MS = 5000;

const timeLeft = (date) => diveOf(getStore(), date).deadline - Date.now();

export function Round({ day, index, onDig, onExpire }) {
  const date = day.date;
  const prompt = day.prompts[index];
  const inputRef = useRef(null);
  const over = useRef(false);
  const busy = useRef(false);
  const timer = useRef(null);
  const [left, setLeft] = useState(() => timeLeft(date));
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [digging, setDigging] = useState(false);
  const [names, setNames] = useState([]);
  const [options, setOptions] = useState([]);
  const [active, setActive] = useState(-1);

  const showOptions = (next, highlight = -1) => {
    setOptions(over.current ? [] : next);
    setActive(highlight);
  };
  const closeOptions = () => showOptions([]);

  const end = () => {
    over.current = true;
    closeOptions();
    clearInterval(timer.current);
    document.body.classList.remove("low");
  };

  useLayoutEffect(() => {
    over.current = false;
    const tick = () => {
      const ms = timeLeft(date);
      if (ms <= 0) {
        end();
        save(expireRound(getStore(), date, Date.now()));
        onExpire();
        return;
      }
      setLeft(ms);
      document.body.classList.toggle("low", ms < LOW_TIME_MS);
    };
    timer.current = setInterval(tick, 100);
    tick();
    // Focus here, inside the DIG/BEGIN click's flushSync, so mobile browsers open the keyboard.
    if (!over.current) inputRef.current.focus();
    return () => {
      over.current = true;
      clearInterval(timer.current);
      document.body.classList.remove("low");
    };
  }, []);

  useEffect(() => {
    loadNames().then((loaded) => {
      setNames(loaded);
      if (document.activeElement === inputRef.current) showOptions(suggest(loaded, inputRef.current.value));
    });
  }, []);

  async function submit(raw) {
    closeOptions();
    const guess = raw.trim();
    if (!guess || busy.current || over.current) return;
    busy.current = true;
    try {
      const result = await api(`/days/${date}/${index + 1}/guess`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guess }),
      });
      if (over.current) return;
      if (result.accepted) {
        const from = totalScore(diveOf(getStore(), date));
        end();
        save(finishRound(getStore(), date, { guess, answer: result.answer, tier: result.tier, points: result.points }));
        setDigging(true);
        onDig(from, result);
      } else if (result.suggestion) {
        setFeedback({ guess, suggestion: result.suggestion });
        setValue(result.suggestion);
      } else {
        setFeedback({ guess });
        inputRef.current.select();
      }
    } catch {
      setFeedback({ error: true });
    } finally {
      busy.current = false;
    }
  }

  const onKeyDown = (event) => {
    if (!options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const n = options.length;
      showOptions(options, event.key === "ArrowDown" ? (active + 1) % n : (active <= 0 ? n : active) - 1);
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      setValue(options[Math.max(active, 0)]);
      closeOptions();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeOptions();
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      setValue(options[active]);
      submit(options[active]);
    }
  };

  const frac = Math.min(1, Math.max(0, left) / ROUND_MS);
  return (
    <section className="round">
      <div className={digging ? "prompt panel faded" : "prompt panel"}>
        <p className="label accent">
          PROMPT {index + 1} OF {ROUNDS} · {prompt.category.toUpperCase()}
        </p>
        <h1>{prompt.text}</h1>
        <p className="label">▼ rarer answers dig deeper ▼</p>
      </div>
      <div className="dock" hidden={digging}>
        {feedback?.suggestion ? (
          <p className="feedback suggest" role="status">
            “{feedback.guess}” → <b>“{feedback.suggestion}”</b>
            <small>submit again to confirm · or edit</small>
          </p>
        ) : (
          <p className="feedback" role="status">
            {feedback?.error
              ? "couldn't reach the server. try again"
              : feedback && `“${feedback.guess}”: just stone. try again`}
          </p>
        )}
        <form
          className="guess"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit(value);
          }}
        >
          <div className="dial">
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" />
              <circle className="sweep" cx="18" cy="18" r="16" pathLength="100" style={{ strokeDashoffset: 100 - frac * 100 }} />
            </svg>
            <b>{Math.ceil(left / 1000)}</b>
          </div>
          <div className="field">
            <ul
              className="suggest"
              id="suggest"
              role="listbox"
              aria-label="Suggestions"
              hidden={!options.length}
              onPointerDown={(event) => event.preventDefault()}
            >
              {options.map((name, i) => (
                <li
                  key={name}
                  role="option"
                  id={`suggest-${i}`}
                  aria-selected={i === active}
                  onClick={() => {
                    setValue(name);
                    submit(name);
                  }}
                >
                  {name}
                </li>
              ))}
            </ul>
            <input
              ref={inputRef}
              name="guess"
              maxLength={100}
              placeholder="type one answer…"
              autoCapitalize="off"
              spellCheck="false"
              aria-label="Your answer"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="suggest"
              aria-expanded={options.length > 0}
              aria-activedescendant={active >= 0 ? `suggest-${active}` : undefined}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                showOptions(suggest(names, event.target.value));
              }}
              onBlur={closeOptions}
              onKeyDown={onKeyDown}
            />
            <div className="bar">
              <i style={{ width: `${frac * 100}%` }} />
            </div>
          </div>
          <button className="btn btn-dig">DIG</button>
        </form>
      </div>
    </section>
  );
}
