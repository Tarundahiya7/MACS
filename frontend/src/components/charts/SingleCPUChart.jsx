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
    console.debug("[SingleCPUChart] raw series sample:", Array.isArray(series) ? series.slice(0, 40) : series);
    if (!Array.isArray(series) || series.length === 0) return [];

    const normalizePoint = (p, idx) => {
      if (p == null) return null;
      if (Array.isArray(p)) {
        const time = Number(p[0]);
        const cpu = Number(p[1]);
        if (!Number.isFinite(time)) return null;
        return { time, cpu: Number.isFinite(cpu) ? cpu : null };
      }
      if (typeof p === "number") {
        return { time: idx, cpu: Number.isFinite(p) ? p : null };
      }
      const time = Number(p.time ?? p.t ?? p.x ?? idx);
      const cpu = Number(p.cpu ?? p.value ?? p.y ?? p.v ?? null);
      if (!Number.isFinite(time)) return null;
      return { time, cpu: Number.isFinite(cpu) ? cpu : null };
    };

    const pts = series.map((p, i) => normalizePoint(p, i)).filter(Boolean).sort((a, b) => a.time - b.time);
    if (!pts.length) return [];

    const cpuValues = pts.map((d) => (d.cpu == null ? null : Number(d.cpu))).filter((v) => v != null && Number.isFinite(v));
    const maxCpu = cpuValues.length ? Math.max(...cpuValues) : 0;

    let normalized = pts.map((d) => ({ ...d }));
    // If values look like 0..1 fractional, scale up to 0..100
    if (maxCpu <= 1.01 && maxCpu > 0) {
      console.debug("[SingleCPUChart] scaling values from 0..1 to 0..100");
      normalized = normalized.map((d) => ({ time: d.time, cpu: d.cpu == null ? null : Math.max(0, Math.min(100, Number(d.cpu) * 100)) }));
    } else {
      normalized = normalized.map((d) => ({ time: d.time, cpu: d.cpu == null ? null : Math.max(0, Math.min(100, Number(d.cpu))) }));
    }

    const vals = normalized.map((d) => d.cpu).filter((v) => v != null && Number.isFinite(v));
    if (vals.length && vals.every((v) => v === 100)) {
      console.warn("[SingleCPUChart] all cpu values are 100% — check upstream data. Sample:", normalized.slice(0, 20));
    } else {
      console.debug("[SingleCPUChart] data stats: min=", Math.min(...(vals.length ? vals : [0])), " max=", Math.max(...(vals.length ? vals : [0])));
    }

    return normalized;
  }, [series]);

  if (!data.length) {
    return (
      <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
        <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">{title}</h4>
        <div className="text-sm text-gray-600 dark:text-gray-300">No CPU series data available</div>
      </div>
    );
  }

  // Helper: format Y ticks (0 -> Idle, 100 -> Busy), otherwise show number
  const yTickFormatter = (val) => {
    if (val === 0) return "Idle (0%)";
    if (val === 100) return "Busy (100%)";
    // show as small percentage for intermediate ticks if any
    return `${val}%`;
  };

  // Tooltip formatter: show Busy/Idle label plus percent
  const tooltipFormatter = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const v = Number(value);
    if (v <= 0) return `Idle (${v}%)`;
    return `Busy (${v}%)`;
  };

  return (
    <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
      <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">{title}</h4>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            {/* YAxis limited to 0..100 but labeled with Idle/Busy */}
            <YAxis domain={[0, 100]} ticks={[0, 100]} tickFormatter={yTickFormatter} />
            <Tooltip formatter={(value) => tooltipFormatter(value)} />
            {/* Step line so transitions between idle/busy are crisp */}
            <Line type="stepAfter" dataKey="cpu" stroke={color} dot={false} strokeWidth={4} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


// //components/charts/SingleCPUChart.jsx
// import React, { useMemo } from "react";
// import {
//   ResponsiveContainer,
//   LineChart,
//   Line,
//   CartesianGrid,
//   XAxis,
//   YAxis,
//   Tooltip,
// } from "recharts";

// export default function SingleCPUChart({ series = [], title = "CPU", color = "#2ECC71" }) {
//   const data = useMemo(() => {
//     console.debug("[SingleCPUChart] raw series sample:", Array.isArray(series) ? series.slice(0, 40) : series);
//     if (!Array.isArray(series) || series.length === 0) return [];

//     const normalizePoint = (p, idx) => {
//       if (p == null) return null;
//       if (Array.isArray(p)) {
//         const time = Number(p[0]);
//         const cpu = Number(p[1]);
//         if (!Number.isFinite(time)) return null;
//         return { time, cpu: Number.isFinite(cpu) ? cpu : null };
//       }
//       if (typeof p === "number") {
//         return { time: idx, cpu: Number.isFinite(p) ? p : null };
//       }
//       const time = Number(p.time ?? p.t ?? p.x ?? idx);
//       const cpu = Number(p.cpu ?? p.value ?? p.y ?? p.v ?? null);
//       if (!Number.isFinite(time)) return null;
//       return { time, cpu: Number.isFinite(cpu) ? cpu : null };
//     };

//     const pts = series.map((p, i) => normalizePoint(p, i)).filter(Boolean).sort((a, b) => a.time - b.time);
//     if (!pts.length) return [];

//     const cpuValues = pts.map((d) => (d.cpu == null ? null : Number(d.cpu))).filter((v) => v != null && Number.isFinite(v));
//     const maxCpu = cpuValues.length ? Math.max(...cpuValues) : 0;

//     let normalized = pts.map((d) => ({ ...d }));
//     // If values look like 0..1 fractional, scale up to 0..100
//     if (maxCpu <= 1.01 && maxCpu > 0) {
//       console.debug("[SingleCPUChart] scaling values from 0..1 to 0..100");
//       normalized = normalized.map((d) => ({ time: d.time, cpu: d.cpu == null ? null : Math.max(0, Math.min(100, Number(d.cpu) * 100)) }));
//     } else {
//       normalized = normalized.map((d) => ({ time: d.time, cpu: d.cpu == null ? null : Math.max(0, Math.min(100, Number(d.cpu))) }));
//     }

//     const vals = normalized.map((d) => d.cpu).filter((v) => v != null && Number.isFinite(v));
//     if (vals.length && vals.every((v) => v === 100)) {
//       console.warn("[SingleCPUChart] all cpu values are 100% — check upstream data. Sample:", normalized.slice(0, 20));
//     } else {
//       console.debug("[SingleCPUChart] data stats: min=", Math.min(...(vals.length ? vals : [0])), " max=", Math.max(...(vals.length ? vals : [0])));
//     }

//     return normalized;
//   }, [series]);

//   if (!data.length) {
//     return (
//       <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
//         <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">{title}</h4>
//         <div className="text-sm text-gray-600 dark:text-gray-300">No CPU series data available</div>
//       </div>
//     );
//   }

//   return (
//     <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
//       <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">{title}</h4>
//       <div style={{ width: "100%", height: 220 }}>
//         <ResponsiveContainer width="100%" height="100%">
//           <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
//             <CartesianGrid strokeDasharray="3 3" />
//             <XAxis dataKey="time" tick={{ fontSize: 11 }} />
//             <YAxis domain={[0, 100]} />
//             <Tooltip formatter={(value) => (value == null ? "—" : `${value}%`)} />
//             <Line type="monotone" dataKey="cpu" stroke={color} dot={false} strokeWidth={5} />
//           </LineChart>
//         </ResponsiveContainer>
//       </div>
//     </div>
//   );
// }
