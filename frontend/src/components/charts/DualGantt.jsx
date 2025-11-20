// frontend/src/components/charts/DualGantt.jsx
import React, { useRef, useState, useMemo } from "react";
import PropTypes from "prop-types";
import { useTheme } from "../../theme/useTheme";
import iconFullscreen from "../../assets/fullscreen.svg";
import iconExit from "../../assets/exitfullscreen.svg";

/* ========================================================
   Helpers
======================================================== */

/* A consistent idle detector — same logic used in Results.jsx */
function isIdlePid(pid) {
  if (pid == null) return true;
  const s = String(pid).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  return lower === "idle" || lower === "0" || lower === "-1";
}

/* Convert trace list → timeline segments */
function traceToTimeline(trace = []) {
  if (!Array.isArray(trace)) return [];

  // group events by integer time (preserve order within same-time group from the array)
  const groups = new Map();
  for (const ev of trace) {
    if (!ev) continue;
    const t = Number(ev.time ?? 0);
    if (!Number.isFinite(t)) continue;
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(ev);
  }

  const times = Array.from(groups.keys()).sort((a,b)=>a-b);
  const timeline = [];
  let curPid = null;
  let curStart = null;

  // process groups in time order. For each time, first handle stopped events, then running.
  for (const t of times) {
    const events = groups.get(t) || [];

    // FIRST: process stopped events to close current slice if matching
    for (const e of events.filter(x => x.event === 'stopped')) {
      const pid = e.pid != null ? String(e.pid) : null;
      if (curPid !== null && pid === curPid) {
        timeline.push([String(curPid), Number(curStart), Number(t)]);
        curPid = null;
        curStart = null;
      }
      // otherwise ignore stopped for other pid
    }

    // THEN: process running events — if multiple running events at same time, use first
    for (const e of events.filter(x => x.event === 'running')) {
      const pid = e.pid != null ? String(e.pid) : null;
      if (curPid === null) {
        curPid = pid;
        curStart = Number(t);
      } else if (curPid !== pid) {
        // close previous and start a new one at same time
        timeline.push([String(curPid), Number(curStart), Number(t)]);
        curPid = pid;
        curStart = Number(t);
      }
    }
  }

  // if there's an open slice, close at last time + 1
  if (curPid !== null) {
    const last = times.length ? Math.max(...times) : 0;
    timeline.push([String(curPid), Number(curStart), Number(last + 1)]);
  }
  return timeline;
}



/* Normalize many shapes → array-of-arrays */
function normalizeTimeline(tl = []) {
  if (!Array.isArray(tl) || tl.length === 0) return [];
  const first = tl[0];

  // array of arrays
  if (Array.isArray(first)) {
    return tl
      .map((arr) => {
        if (!Array.isArray(arr) || arr.length < 3) return null;
        const pid = String(arr[0] ?? "");
        if (isIdlePid(pid)) return null;
        const s = Number(arr[1]);
        const e = Number(arr[2]);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
        return [pid, s, e];
      })
      .filter(Boolean);
  }

  // array of objects
  if (typeof first === "object") {
    const looksTrace = tl.every((o) => o && "time" in o && "pid" in o && "event" in o);
    if (looksTrace) return traceToTimeline(tl);

    return tl
      .map((obj) => {
        if (!obj) return null;
        const pid = String(obj.pid ?? "");
        if (isIdlePid(pid)) return null;

        if ("start" in obj && "end" in obj) {
          const s = Number(obj.start);
          const e = Number(obj.end);
          if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
          return [pid, s, e];
        }
        if ("s" in obj && "e" in obj) {
          const s = Number(obj.s);
          const e = Number(obj.e);
          if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
          return [pid, s, e];
        }
        if ("start" in obj && "duration" in obj) {
          const s = Number(obj.start);
          const d = Number(obj.duration);
          if (!Number.isFinite(s) || !Number.isFinite(d)) return null;
          return [pid, s, s + d];
        }
        return null;
      })
      .filter(Boolean);
  }
  return [];
}

/* Convert normalized → renderable objects */
function normalizeForRender(tl = []) {
  return tl.map(([pid, s, e]) => ({
    pid,
    start: Number(s),
    end: Number(e),
    len: Math.max(0, Number(e) - Number(s)),
  }));
}

/* Utility to color pids */
function hashTo360(s = "") {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function twoHuesForPid(pid, hueOffset = 0, isDark = false) {
  const h = (hashTo360(String(pid)) + hueOffset) % 360;
  if (isDark)
    return { light: `hsl(${h} 68% 58%)`, dark: `hsl(${(h + 8) % 360} 68% 36%)` };
  return { light: `hsl(${h} 72% 62%)`, dark: `hsl(${(h + 8) % 360} 64% 44%)` };
}

/* ========================================================
   Main Component
======================================================== */

export default function DualGantt({
  baseline = [],
  marr = [],
  processesOrder = [],
  baseline_quanta: propBaselineQuanta = undefined,
}) {
  const { mode } = useTheme?.() ?? { mode: "light" };
  const isDark = mode === "dark";

  /* Normalize incoming timelines */
  const baseArr = useMemo(() => normalizeTimeline(baseline), [baseline]);
  const memArr = useMemo(() => normalizeTimeline(marr), [marr]);

  const base = useMemo(() => normalizeForRender(baseArr), [baseArr]);
  const mem = useMemo(() => normalizeForRender(memArr), [memArr]);

  /* Determine lane order */
  const inferredProcesses = useMemo(() => {
    if (Array.isArray(processesOrder) && processesOrder.length)
      return processesOrder.map(String).filter((p) => !isIdlePid(p));

    const seen = new Set();
    const order = [];

    [...base, ...mem].forEach((seg) => {
      const p = String(seg.pid);
      if (!isIdlePid(p) && !seen.has(p)) {
        seen.add(p);
        order.push(p);
      }
    });

    return order;
  }, [processesOrder, base, mem]);

  /* Infer baseline quanta if not provided */
  const baselineQuantaMap = useMemo(() => {
    if (propBaselineQuanta && typeof propBaselineQuanta === "object") {
      const out = {};
      Object.keys(propBaselineQuanta).forEach(
        (k) => (out[String(k)] = Number(propBaselineQuanta[k] || 1))
      );
      return out;
    }

    const acc = {};
    base.forEach((seg) => {
      const p = seg.pid;
      if (!acc[p]) acc[p] = [];
      acc[p].push(Math.max(1, Math.round(seg.len)));
    });

    const map = {};
    for (const pid of inferredProcesses) {
      const arr = acc[pid] ?? [1];
      map[pid] = arr.reduce((a, b) => gcd(a, b), arr[0]) || 1;
    }
    return map;
  }, [base, inferredProcesses, propBaselineQuanta]);

  /* Layout */
  const pxPerTime = 28;
  const tailExtraTime = 2.5;
  const laneH = 50;
  const padding = { left: 140, right: 36, top: 12, between: 36, bottom: 28 };

  const maxTime = Math.max(
    ...base.map((d) => d.end),
    ...mem.map((d) => d.end),
    1
  );

  const lanes = inferredProcesses.length;
  const width = Math.max(
    1200,
    (maxTime + tailExtraTime) * pxPerTime + padding.left + padding.right
  );
  const innerW = width - padding.left - padding.right;
  const svgHeight = padding.top + lanes * laneH + padding.bottom;

  /* Tooltip state */
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: "",
  });
  const [hovered, setHovered] = useState(null);

  const showTip = (e, seg) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: e.clientX - (rect?.left || 0) + 12,
      y: e.clientY - (rect?.top || 0) + 12,
      content: `${seg.pid} — ${seg.start} → ${seg.end} (len=${seg.len})`,
    });
  };
  const hideTip = () =>
    setTooltip({ visible: false, x: 0, y: 0, content: "" });

  const quantemapStr = inferredProcesses
    .map((pid) => `${pid}:${baselineQuantaMap[pid] ?? 1}`)
    .join("  •  ");

  /* Theme colors */
  const containerBg = isDark ? "rgba(6,8,15,0.6)" : "#ffffff";
  const panelBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const labelColor = isDark ? "#E6EEF8" : "#111827";
  const subLabel = isDark ? "#9AA8C3" : "#6B7280";
  const laneFill = isDark ? "rgba(255,255,255,0.02)" : "#fbfbfb";
  const gridLine = isDark ? "rgba(255,255,255,0.03)" : "#f3f3f3";
  const timeText = isDark ? "#9AA8C3" : "#666";

  /* Gradients */
  const gradientDefs = (
    <defs>
      {inferredProcesses.map((pid) => {
        const { light: bLight, dark: bDark } = twoHuesForPid(pid, 6, isDark);
        const { light: mLight, dark: mDark } = twoHuesForPid(
          pid,
          150,
          isDark
        );
        return (
          <React.Fragment key={pid}>
            <linearGradient id={`b-${pid}`} x1="0" x2="1">
              <stop offset="0%" stopColor={bLight} stopOpacity="0.98" />
              <stop offset="100%" stopColor={bDark} stopOpacity="0.96" />
            </linearGradient>
            <linearGradient id={`m-${pid}`} x1="0" x2="1">
              <stop offset="0%" stopColor={mLight} stopOpacity="0.98" />
              <stop offset="100%" stopColor={mDark} stopOpacity="0.96" />
            </linearGradient>
          </React.Fragment>
        );
      })}
      <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.08" />
      </filter>
    </defs>
  );

  /* Single timeline renderer */
  const renderSingleTimeline = (data, chartFamily = "b") => (
    <svg
      width={width}
      height={svgHeight}
      viewBox={`0 0 ${width} ${svgHeight}`}
      style={{ display: "block" }}
    >
      {gradientDefs}

      {/* Time ticks */}
      <g transform={`translate(${padding.left}, ${padding.top + 14})`}>
        {Array.from({ length: Math.floor(maxTime) + 2 }).map((_, i) => {
          const t = i;
          const x = (t / (maxTime + tailExtraTime)) * innerW;
          return (
            <g key={i} transform={`translate(${x},0)`}>
              <line x1={0} y1={0} x2={0} y2={lanes * laneH + 12} stroke={gridLine} />
              <text x={0} y={-10} fontSize={11} fill={timeText} textAnchor="middle">
                {t}
              </text>
            </g>
          );
        })}
      </g>

      {/* Lanes */}
      {inferredProcesses.map((pid, idx) => {
        const y = padding.top + 14 + idx * laneH;
        return (
          <g key={pid}>
            <rect
              x={padding.left}
              y={y - 6}
              width={innerW}
              height={laneH}
              rx={10}
              fill={laneFill}
            />
            <text
              x={padding.left - 18}
              y={y + laneH / 2}
              fontSize={13}
              textAnchor="end"
              dominantBaseline="middle"
              fill={labelColor}
            >
              {pid}
            </text>
          </g>
        );
      })}

      {/* Segments */}
      <g transform={`translate(${padding.left}, ${padding.top + 14})`}>
        {data.map((seg, i) => {
          if (!seg) return null;
          if (isIdlePid(seg.pid)) return null;

          const x = (seg.start / (maxTime + tailExtraTime)) * innerW;
          const w = Math.max(8, (seg.len / (maxTime + tailExtraTime)) * innerW);
          const pidIdx = inferredProcesses.indexOf(seg.pid);
          if (pidIdx < 0) return null;

          const y = pidIdx * laneH + 6;
          const gradId = `${chartFamily}-${seg.pid}`;
          const hoveredKey = `seg-${chartFamily}-${i}`;
          const isHovered = hovered === hoveredKey;

          return (
            <g key={`${chartFamily}-${i}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={laneH - 12}
                rx={12}
                fill={`url(#${chartFamily}-${seg.pid})`}
                stroke={isDark ? "rgba(255,255,255,0.02)" : "#111"}
                strokeOpacity={0.06}
                filter={isHovered ? "url(#softShadow)" : undefined}
                onMouseEnter={(e) => {
                  setHovered(hoveredKey);
                  showTip(e, seg);
                }}
                onMouseMove={(e) => showTip(e, seg)}
                onMouseLeave={() => {
                  setHovered(null);
                  hideTip();
                }}
                style={{
                  cursor: "pointer",
                  transformOrigin: "left center",
                  transform: isHovered ? "translateY(-4px) scale(1.02)" : "none",
                  transition: "transform .14s cubic-bezier(.2,.9,.2,1), filter .14s, opacity .14s",
                }}
              />
              <text
                x={x + Math.min(w / 2, 72)}
                y={y + (laneH - 12) / 2 + 6}
                fontSize={12}
                fill="#fff"
                fontWeight={800}
                textAnchor="middle"
                pointerEvents="none"
              >
                {seg.pid}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );

  /* Fullscreen toggle */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await el.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (e) {
      console.error("Fullscreen error:", e);
    }
  };

  /* ========================================================
     Render Component
  ======================================================== */

  return (
    <div
      ref={containerRef}
      className="rounded-xl shadow-md border relative w-full container"
      style={{
        background: containerBg,
        borderColor: panelBorder,
        padding: 20,
        marginTop: 12,
        maxHeight: "80vh",
        overflow: "auto",
      }}
    >
      {/* Fullscreen button */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 90 }}>
        <img
          src={isFullscreen ? iconExit : iconFullscreen}
          alt="fullscreen toggle"
          onClick={toggleFullscreen}
          style={{
            width: 26,
            height: 26,
            cursor: "pointer",
            opacity: 0.6,
            filter: "brightness(0) invert(1)",
          }}
        />
      </div>

      {/* Header */}
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: labelColor }}>
        Baseline vs Memory-Aware RR
      </h3>
      <div style={{ marginTop: 6, fontSize: 13, color: subLabel }}>
        Compare baseline scheduling vs memory-aware scheduling
      </div>

      {/* Baseline */}
      <div style={{ marginTop: 18 }}>
        <div style={{ paddingLeft: padding.left, marginBottom: 8 }}>
          <strong style={{ fontSize: 18, color: labelColor }}>Baseline</strong>
          <div style={{ fontSize: 12, color: subLabel, marginTop: 4 }}>
            Quanta — {quantemapStr}
          </div>
        </div>
        <div style={{ overflowX: "auto", paddingBottom: 12 }}>
          <div style={{ width }}>{renderSingleTimeline(base, "b")}</div>
        </div>
      </div>

      {/* Memory-Aware */}
      <div style={{ marginTop: 50 }}>
        <div style={{ paddingLeft: padding.left, marginBottom: 8 }}>
          <strong style={{ fontSize: 18, color: labelColor }}>Memory-Aware</strong>
          <div style={{ fontSize: 12, color: subLabel, marginTop: 4 }}>
            Quanta — {quantemapStr}
          </div>
        </div>
        <div style={{ overflowX: "auto", paddingBottom: 12 }}>
          <div style={{ width }}>{renderSingleTimeline(mem, "m")}</div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            background: isDark ? "rgba(6,8,15,0.95)" : "rgba(0,0,0,0.9)",
            color: "#fff",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 13,
            pointerEvents: "none",
            transform: "translate(8px,8px)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
            zIndex: 60,
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

DualGantt.propTypes = {
  baseline: PropTypes.array,
  marr: PropTypes.array,
  processesOrder: PropTypes.arrayOf(PropTypes.string),
  baseline_quanta: PropTypes.object,
};

/* GCD helper */
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  if (a === 0) return b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}
