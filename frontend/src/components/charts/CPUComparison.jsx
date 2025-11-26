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

function normalizeSeries(s) {
  if (!Array.isArray(s)) return [];
  const pts = s
    .map((p, i) => {
      if (p == null) return null;
      if (Array.isArray(p)) {
        const time = Number(p[0]);
        const cpu = Number(p[1]);
        if (!Number.isFinite(time)) return null;
        return { time, cpu: Number.isFinite(cpu) ? cpu : null };
      }
      if (typeof p === "number") {
        return { time: i, cpu: Number.isFinite(p) ? p : null };
      }
      const time = Number(p.time ?? p.t ?? p.x ?? i);
      const cpu = Number(p.cpu ?? p.value ?? p.y ?? p.v ?? null);
      if (!Number.isFinite(time)) return null;
      return { time, cpu: Number.isFinite(cpu) ? cpu : null };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  const cpuVals = pts.map((d) => (d.cpu == null ? null : Number(d.cpu))).filter((v) => v != null && Number.isFinite(v));
  const maxCpu = cpuVals.length ? Math.max(...cpuVals) : 0;

  let normalized = pts.map((d) => ({ ...d }));
  if (maxCpu <= 1.01 && maxCpu > 0) {
    normalized = normalized.map((d) => ({ time: d.time, cpu: d.cpu == null ? null : Math.max(0, Math.min(100, Number(d.cpu) * 100)) }));
  } else {
    normalized = normalized.map((d) => ({ time: d.time, cpu: d.cpu == null ? null : Math.max(0, Math.min(100, Number(d.cpu))) }));
  }

  return normalized;
}

export default function CPUComparison({ baseSeries = [], marrSeries = [] }) {
  const merged = useMemo(() => {
    const a = normalizeSeries(baseSeries);
    const b = normalizeSeries(marrSeries);

    const mapA = new Map(a.map((p) => [Number(p.time), p.cpu]));
    const mapB = new Map(b.map((p) => [Number(p.time), p.cpu]));

    const times = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort((x, y) => x - y);

    return times.map((t) => ({
      time: t,
      base: mapA.has(t) ? mapA.get(t) : null,
      marr: mapB.has(t) ? mapB.get(t) : null,
    }));
  }, [baseSeries, marrSeries]);

  if (!merged.length) {
    return (
      <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">CPU Utilization Comparison</h4>
        <div className="text-sm text-gray-600 dark:text-gray-300">No series data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
      <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">CPU Utilization Comparison</h4>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={merged} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} />
            <Tooltip formatter={(value) => (value == null ? "—" : `${Math.round(value)}%`)} />
            <Legend />
            <Line type="monotone" dataKey="base" stroke="#FFA500" dot={false} strokeWidth={3} />
            <Line type="monotone" dataKey="marr" stroke="#2ECC71" dot={false} strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
