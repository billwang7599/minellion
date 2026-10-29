import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MAX_SCORE, SURFACE_Y, BEDROCK_Y, MARKERS } from "../game.js";

const PX_PER_Y = 120;
const TOP_Y = 76;
const BOTTOM_Y = -72;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const DIG_MS = reducedMotion ? 200 : 900;
document.documentElement.style.setProperty("--dig-ms", `${DIG_MS}ms`);

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

const sceneY = (score) => SURFACE_Y - (score * (SURFACE_Y - BEDROCK_Y)) / MAX_SCORE;
const yPx = (y) => (TOP_Y - y) * PX_PER_Y;
const scorePx = (score) => `${yPx(sceneY(score))}px`;

export function Ore({ tier }) {
  if (!ORE[tier]) {
    return (
      <svg className="ore" viewBox="0 0 8 8">
        <rect x=".5" y=".5" width="7" height="7" fill="none" stroke="#3d4654" strokeDasharray="1 1" />
      </svg>
    );
  }
  const [base, speck] = ORE[tier];
  return (
    <svg className={`ore ore-${tier}`} viewBox="0 0 8 8" shapeRendering="crispEdges">
      <rect width="8" height="8" fill={base} />
      {SPECKS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={speck} />
      ))}
    </svg>
  );
}

const Torch = () => (
  <svg viewBox="0 0 4 12" shapeRendering="crispEdges">
    <rect x="1" y="0" width="2" height="1" fill="#ff9f43" />
    <rect x="0" y="1" width="4" height="2" fill="#ffb347" />
    <rect x="1" y="1" width="2" height="2" fill="#fff1b8" />
    <rect x="1" y="3" width="2" height="9" fill="#6b4c35" />
    <rect x="1" y="3" width="1" height="9" fill="#82603f" />
  </svg>
);

const Cloud = ({ style }) => (
  <div className="cloud" style={style}>
    <svg viewBox="0 0 32 8" shapeRendering="crispEdges">
      <rect x="9" y="0" width="8" height="2" fill="#fff" />
      <rect x="5" y="2" width="18" height="2" fill="#fff" />
      <rect x="20" y="2" width="6" height="2" fill="#f4f7f9" />
      <rect x="1" y="4" width="29" height="2" fill="#fff" />
      <rect x="0" y="6" width="32" height="2" fill="#dde6ec" />
    </svg>
  </div>
);

const WORLD_STYLE = {
  height: `${(TOP_Y - BOTTOM_Y) * PX_PER_Y}px`,
  "--grass-px": `${yPx(SURFACE_Y)}px`,
  background: `linear-gradient(${LAYERS.map(([y, c]) => `${c} ${yPx(y)}px`).join(", ")})`,
};

const TICKS = [];
for (let y = SURFACE_Y; y >= BEDROCK_Y; y -= 4) TICKS.push(y);

function Card({ dig }) {
  const ref = useRef(null);
  const [sinking, setSinking] = useState(false);
  useLayoutEffect(() => {
    ref.current.getBoundingClientRect();
    setSinking(true);
  }, []);
  const className = dig.done ? "card gone" : sinking ? "card sinking" : "card";
  return (
    <div ref={ref} className={className} style={{ top: scorePx(sinking ? dig.from + dig.result.points : dig.from) }}>
      “{dig.result.answer.toUpperCase()}” ▼
    </div>
  );
}

export function World({ camera, dig, tiers, linesOut }) {
  const [viewportPx, setViewportPx] = useState(innerHeight);
  const [instant, setInstant] = useState(true);

  useEffect(() => {
    const onResize = () => {
      setInstant(true);
      setViewportPx(innerHeight);
    };
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!instant) return;
    let inner;
    const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setInstant(false))));
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [instant, viewportPx]);

  const px = yPx(sceneY(camera.score));
  return (
    <div className="scene" aria-hidden="true">
      <div
        className={instant ? "world instant" : "world"}
        style={{ ...WORLD_STYLE, transform: `translateY(${Math.round(viewportPx * camera.anchor - px)}px)` }}
      >
        <div className="sun" style={{ top: `${yPx(72)}px` }} />
        <Cloud style={{ top: `${yPx(73)}px`, left: "4%", width: "320px" }} />
        <Cloud style={{ top: `${yPx(71.5)}px`, right: "6%", width: "260px" }} />
        <Cloud style={{ top: `${yPx(68.5)}px`, left: "-60px", width: "200px" }} />
        <Cloud style={{ top: `${yPx(67.5)}px`, right: "-40px", width: "180px" }} />
        <div className="texture" style={{ top: `${yPx(63.85)}px` }} />
        <div className="glow-lava" style={{ top: `${yPx(-53)}px` }} />
        {MARKERS.map((m, i) => (
          <p key={m.y} className={`marker ${i % 2 ? "right" : "left"}`} style={{ top: `${yPx(m.y)}px` }}>
            {m.text}
          </p>
        ))}
        <div className="ruler">
          {TICKS.map((y) => (
            <span key={y} className={y % 16 === 0 ? "tick major" : "tick"} style={{ top: `${yPx(y)}px` }}>
              {y % 16 === 0 ? y : ""}
            </span>
          ))}
          <span className="you" style={{ top: `${px}px` }}>
            ◂ YOU
          </span>
        </div>
        <div id="lines" className={linesOut ? "out" : undefined}>
          {dig &&
            tiers.map((t) => (
              <div
                key={t.key}
                className={`tline t-${t.key}${dig.done && t.key === dig.result.tier ? " lit" : ""}`}
                style={{ top: scorePx(dig.from + t.points) }}
              >
                <span>
                  <Ore tier={t.key} /> {t.name.toUpperCase()} · {t.points}
                </span>
              </div>
            ))}
        </div>
        {dig && <Card key={dig.id} dig={dig} />}
        <div className="torch" style={{ top: `${px}px` }}>
          <Torch />
        </div>
      </div>
    </div>
  );
}
