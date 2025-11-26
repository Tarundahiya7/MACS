import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function SingleCPUChart({ series = [], title = "CPU", color = "#2ECC71" }) {

  const data = useMemo(() => {
    if (!Array.isArray(series) || series.length === 0) return [];

    const normalizePoint = (p, idx) => {
      if (!p) return null;

      if (Array.isArray(p)) {
        const t = Number(p[0]);
        const v = Number(p[1]);
        return Number.isFinite(t) ? { time: t, cpu: Number.isFinite(v) ? v : null } : null;
      }

      if (typeof p === "number") {
        return { time: idx, cpu: Number.isFinite(p) ? p : null };
      }

      const t = Number(p.time ?? p.t ?? p.x ?? idx);
      const v = Number(p.cpu ?? p.value ?? p.y ?? p.v ?? null);
      return Number.isFinite(t) ? { time: t, cpu: Number.isFinite(v) ? v : null } : null;
    };

    let pts = series
      .map((p, i) => normalizePoint(p, i))
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    if (!pts.length) return [];

    const cpuVals = pts
      .map((d) => (d.cpu == null ? null : Number(d.cpu)))
      .filter((v) => v != null && Number.isFinite(v));

    const maxCpu = cpuVals.length ? Math.max(...cpuVals) : 0;

    let normalized = pts.map((d) => ({ ...d }));

    if (maxCpu > 0 && maxCpu <= 1.01) {
      normalized = normalized.map((d) => ({
        time: d.time,
        cpu: d.cpu == null ? null : Math.max(0, Math.min(100, d.cpu * 100)),
      }));
    } else {
      normalized = normalized.map((d) => ({
        time: d.time,
        cpu:
          d.cpu == null
            ? null
            : Math.max(0, Math.min(100, Number(d.cpu))),
      }));
    }

    return normalized;
  }, [series]);

  if (!data.length) {
    return (
      <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">
          {title}
        </h4>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          No CPU series data available
        </div>
      </div>
    );
  }

  const yTickFormatter = (val) => {
    if (val === 0) return "Idle (0%)";
    if (val === 100) return "Busy (100%)";
    return `${val}%`;
  };

  const tooltipFormatter = (value, name) => {
    if (value == null || Number.isNaN(Number(value))) return ["—", name ?? title];
    const v = Number(value);
    const label = v <= 0 ? "Idle" : "Busy";
    return [`${label} (${v}%)`, name ?? title];
  };

  return (
    <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
      <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">
        {title}
      </h4>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} ticks={[0, 100]} tickFormatter={yTickFormatter} />
            <Tooltip formatter={tooltipFormatter} />
            <Line
              type="stepAfter"
              dataKey="cpu"
              stroke={color}
              dot={false}
              strokeWidth={4}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
