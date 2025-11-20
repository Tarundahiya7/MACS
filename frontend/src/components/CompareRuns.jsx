// frontend/src/components/CompareRuns.jsx
import { useEffect, useMemo, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from 'recharts';

const loadRunsLocal = () => JSON.parse(localStorage.getItem('scheduler_runs') || '[]');

export default function CompareRuns() {
  const [runs, setRuns] = useState(loadRunsLocal());
  const [a, setA] = useState(runs[0]?.id || '');
  const [b, setB] = useState(runs[1]?.id || '');

  useEffect(() => setRuns(loadRunsLocal()), []);

  const pick = (id) => runs.find((r) => r.id === id);
  const A = pick(a);
  const B = pick(b);

  const kpis = useMemo(() => {
    if (!A || !B) return [];
    const ba = A.results.baseline; const ma = A.results.memoryAware;
    const bb = B.results.baseline; const mb = B.results.memoryAware;
    return [
      { label: 'CPU Utilization (Baseline)', A: ba?.cpu_utilization ?? 0, B: bb?.cpu_utilization ?? 0 },
      { label: 'CPU Utilization (Memory-Aware)', A: ma?.cpu_utilization ?? 0, B: mb?.cpu_utilization ?? 0 },
      { label: 'Total Time (Baseline)', A: ba?.total_time ?? 0, B: bb?.total_time ?? 0 },
      { label: 'Total Time (Memory-Aware)', A: ma?.total_time ?? 0, B: mb?.total_time ?? 0 },
    ];
  }, [A, B]);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <GitCompare size={18} />
        <span className="font-semibold">Whole Input Comparison</span>

        <select className="px-3 py-2 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Select Run A</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>{r.name} — {new Date(r.created_at).toLocaleString()}</option>
          ))}
        </select>

        <span className="opacity-70">vs</span>

        <select className="px-3 py-2 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10" value={b} onChange={(e) => setB(e.target.value)}>
          <option value="">Select Run B</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>{r.name} — {new Date(r.created_at).toLocaleString()}</option>
          ))}
        </select>
      </div>

      {A && B ? (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kpis}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="A" name={`A: ${A.name}`} />
              <Bar dataKey="B" name={`B: ${B.name}`} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-sm opacity-70">Pick two saved runs to compare.</div>
      )}
    </div>
  );
}
