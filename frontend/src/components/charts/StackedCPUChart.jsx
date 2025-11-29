import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

const DEFAULT_COLORS = [
  "#E74C3C",
  "#3498DB",
  "#2ECC71",
  "#F1C40F",
  "#9B59B6",
  "#34495E",
  "#E67E22",
  "#1ABC9C",
  "#7F8C8D",
  "#8E44AD",
];

function isIdlePid(pid) {
  if (pid == null) return true;
  const s = String(pid).trim().toLowerCase();
  return s === "idle" || s === "0" || s === "-1" || s === "";
}

function normalizeTimeline(tl = []) {
  if (!tl || !Array.isArray(tl) || tl.length === 0) return [];
  const first = tl[0];
  if (Array.isArray(first) && first.length >= 3) {
    return tl
      .map((arr) => {
        if (!Array.isArray(arr)) return null;
        const pid = arr[0] == null ? "" : String(arr[0]);
        const s = Number(arr[1]);
        let e = Number(arr[2]);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
        if (e <= s) e = s + e;
        return [pid, s, e];
      })
      .filter(Boolean);
  }
  if (first && typeof first === "object") {
    return tl
      .map((obj) => {
        if (!obj) return null;
        const pid = obj.pid != null ? String(obj.pid) : "";
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

function buildPerPidSeries(timeline = [], totalTime = 0, processes = []) {
  const norm = normalizeTimeline(timeline);
  const pidsFromTimeline = Array.from(new Set(norm.map((s) => String(s[0])))).filter(
    (x) => !isIdlePid(x)
  );
  const pids = processes && processes.length ? processes : pidsFromTimeline;
  const effectivePids = pids.length ? pids : pidsFromTimeline;
  if (!effectivePids.length) return { series: [], pids: [] };
  const times = norm.flatMap((s) => [s[1], s[2]]);
  let tt = Number(totalTime) || (times.length ? Math.max(...times) + 1 : 0);
  if (!tt || !Number.isFinite(tt)) tt = times.length ? Math.max(...times) + 1 : 0;
  const len = Math.max(0, Math.ceil(tt));
  const data = [];
  for (let t = 0; t < len; t++) {
    const row = { time: t };
    for (const pid of effectivePids) row[pid] = 0;
    data.push(row);
  }
  for (const seg of norm) {
    const [pidRaw, s, e] = seg;
    const pid = String(pidRaw);
    if (isIdlePid(pid)) continue;
    if (!effectivePids.includes(pid)) {
      effectivePids.push(pid);
      for (let t = 0; t < len; t++) data[t][pid] = 0;
    }
    const start = Math.max(0, Math.floor(Number(s)));
    const end = Math.min(len, Math.ceil(Number(e)));
    for (let t = start; t < end; t++) {
      data[t][pid] = 100;
    }
  }
  return { series: data, pids: effectivePids };
}

export default function StackedCPUChart({
  timeline = [],
  totalTime = 0,
  processes = [],
  title = "Per-PID CPU",
}) {
  const { series, pids } = useMemo(() => buildPerPidSeries(timeline, totalTime, processes), [timeline, totalTime, processes]);

  if (!series || !series.length || !pids || !pids.length) {
    return (
      <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">{title}</h4>
        <div className="text-sm text-gray-600 dark:text-gray-300">No per-PID series available</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
      <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">{title}</h4>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 20, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(val, name) => [`${val}%`, name]} />
            <Legend verticalAlign="bottom" height={36} />
            {pids.map((pid, idx) => {
              const color = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
              return (
                <Line
                  key={pid}
                  type="stepAfter"
                  dataKey={pid}
                  stroke={color}
                  dot={false}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
