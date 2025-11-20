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

export default function CPUComparison({ baseSeries = [], marrSeries = [] }) {
  // Normalize inputs to arrays of {time, cpu}
  const normalize = (s) =>
    Array.isArray(s)
      ? s
          .map((p) => {
            if (p == null) return null;
            const time = Number(p.time ?? p.t ?? p.x ?? NaN);
            const cpu = Number(p.cpu ?? p.value ?? p.y ?? NaN);
            return Number.isFinite(time) ? { time, cpu: Number.isFinite(cpu) ? cpu : null } : null;
          })
          .filter(Boolean)
      : [];

  const merged = useMemo(() => {
    const a = normalize(baseSeries);
    const b = normalize(marrSeries);

    // build maps time -> value
    const mapA = new Map(a.map((p) => [Number(p.time), p.cpu]));
    const mapB = new Map(b.map((p) => [Number(p.time), p.cpu]));

    const timesSet = new Set([...mapA.keys(), ...mapB.keys()]);
    const times = Array.from(timesSet).sort((x, y) => x - y);

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

  // Y-axis tick formatter and tooltip formatter (consistent with SingleCPUChart)
  const yTickFormatter = (val) => {
    if (val === 0) return "Idle (0%)";
    if (val === 100) return "Busy (100%)";
    return `${val}%`;
  };

  const tooltipFormatter = (value, name, props) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const v = Number(value);
    const label = v <= 0 ? "Idle" : "Busy";
    // include series name (base/marr) and value
    return `${label} (${v}%)`;
  };

  return (
    <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
      <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">CPU Utilization Comparison</h4>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={merged} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} ticks={[0, 100]} tickFormatter={yTickFormatter} />
            {/* Tooltip will call formatter per series value */}
            <Tooltip formatter={tooltipFormatter} />
            <Legend />
            {/* step lines for crisp busy/idle boundaries */}
            <Line type="stepAfter" dataKey="base" stroke="#FFA500" dot={false} strokeWidth={4} />
            <Line type="stepAfter" dataKey="marr" stroke="#2ECC71" dot={false} strokeWidth={4} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


// //components/charts/CPUComparison.jsx
// import React, { useMemo } from "react";
// import {
//   ResponsiveContainer,
//   LineChart,
//   Line,
//   CartesianGrid,
//   XAxis,
//   YAxis,
//   Tooltip,
//   Legend,
// } from "recharts";

// export default function CPUComparison({ baseSeries = [], marrSeries = [] }) {
//   // Normalize inputs to arrays of {time, cpu}
//   const normalize = (s) =>
//     Array.isArray(s)
//       ? s
//           .map((p) => {
//             if (p == null) return null;
//             const time = Number(p.time ?? p.t ?? p.x ?? NaN);
//             const cpu = Number(p.cpu ?? p.value ?? p.y ?? NaN);
//             return Number.isFinite(time) ? { time, cpu: Number.isFinite(cpu) ? cpu : null } : null;
//           })
//           .filter(Boolean)
//       : [];

//   const merged = useMemo(() => {
//     const a = normalize(baseSeries);
//     const b = normalize(marrSeries);

//     // build maps time -> value
//     const mapA = new Map(a.map((p) => [Number(p.time), p.cpu]));
//     const mapB = new Map(b.map((p) => [Number(p.time), p.cpu]));

//     const timesSet = new Set([...mapA.keys(), ...mapB.keys()]);
//     const times = Array.from(timesSet).sort((x, y) => x - y);

//     return times.map((t) => ({
//       time: t,
//       base: mapA.has(t) ? mapA.get(t) : null,
//       marr: mapB.has(t) ? mapB.get(t) : null,
//     }));
//   }, [baseSeries, marrSeries]);

//   if (!merged.length) {
//     return (
//       <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
//         <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">CPU Utilization Comparison</h4>
//         <div className="text-sm text-gray-600 dark:text-gray-300">No series data available</div>
//       </div>
//     );
//   }

//   return (
//     <div className="rounded-lg shadow-sm border p-3 bg-white dark:bg-white/5">
//       <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">CPU Utilization Comparison</h4>
//       <div style={{ width: "100%", height: 260 }}>
//         <ResponsiveContainer>
//           <LineChart data={merged} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
//             <CartesianGrid strokeDasharray="3 3" />
//             <XAxis dataKey="time" tick={{ fontSize: 11 }} />
//             <YAxis domain={[0, 100]} />
//             <Tooltip />
//             <Legend />
//             <Line type="monotone" dataKey="base" stroke="#FFA500" dot={false} strokeWidth={5} />
//             <Line type="monotone" dataKey="marr" stroke="#2ECC71" dot={false} strokeWidth={5} />
//           </LineChart>
//         </ResponsiveContainer>
//       </div>
//     </div>
//   );
// }
