// frontend/src/App.jsx
import { useEffect, useState, useRef } from 'react';
import { Download, Play, GitCompare, Save, MoreHorizontal, MoreVertical } from 'lucide-react';
import ConfigForm from './components/ConfigForm';
import ExcelUpload from './components/ExcelUpload';
import Results from './components/Results';
import CompareRuns from './components/CompareRuns';
import ThemeToggle from './theme/ThemeToggle';
import { api } from './api/apiClient';
import { resolveBaseURL } from './utils/env';

const blankSystem = { total_frames: '', page_size: '', cpu_quantum: '', memory_threshold: '', cpu_idle_gap: '1' };
const blankProcess = (i = 1) => ({ pid: `P${i}`, arrival_time: '', burst_time: '', priority: '', pages_count: '' });

export default function App() {
  const [system, setSystem] = useState({ ...blankSystem });
  const [processes, setProcesses] = useState([blankProcess(1)]);
  const [loading, setLoading] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [memoryAware, setMemoryAware] = useState(null);
  const [apiUrl, setApiUrl] = useState(resolveBaseURL());

  // dropdown state for the three-dots menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    api.getSample()
      .then((res) => {
        const s = res?.data?.system;
        const pro = res?.data?.processes;
        if (s) setSystem((prev) => ({ ...prev, ...s }));
        if (Array.isArray(pro) && pro.length) {
          setProcesses(pro.map((p, i) => ({ ...blankProcess(i + 1), ...p })));
        }
      })
      .catch(() => { });
  }, []);

  // close menu when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toPayload = (systemObj, processesArr) => ({
    system: {
      total_frames: Number(systemObj.total_frames),
      page_size: Number(systemObj.page_size),
      cpu_quantum: Number(systemObj.cpu_quantum),
      memory_threshold: Number(systemObj.memory_threshold),
      cpu_idle_gap: Number(systemObj.cpu_idle_gap || 0),
    },
    processes: (Array.isArray(processesArr) ? processesArr : []).map((p) => ({
      pid: String(p.pid),
      arrival_time: Number(p.arrival_time),
      burst_time: Number(p.burst_time),
      priority: Number(p.priority),
      pages_count: Number(p.pages_count),
    })),
  });

  const validPayload = (payload) => {
    if (!payload || !payload.system || !Array.isArray(payload.processes)) return false;
    const s = payload.system;
    const sysOk = [s.total_frames, s.page_size, s.cpu_quantum, s.memory_threshold].every(
      (x) => Number.isFinite(x) && x >= 0
    );
    const proOk =
      payload.processes.length > 0 &&
      payload.processes.every((p) => {
        const allNums = [p.arrival_time, p.burst_time, p.priority, p.pages_count].every(
          (x) => Number.isFinite(x) && x >= 0
        );
        return allNums && !!p.pid;
      });
    return sysOk && proOk;
  };

  const saveRunLocal = (name, input, results) => {
    try {
      const key = 'scheduler_runs';
      const now = new Date().toISOString();
      const record = { id: crypto?.randomUUID?.() ?? String(Date.now()), name, input, results, created_at: now };
      const raw = localStorage.getItem(key);
      const arr = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
      arr.unshift(record);
      localStorage.setItem(key, JSON.stringify(arr));
      return record;
    } catch (err) {
      return null;
    }
  };

  const run = async (mode) => {
    const payload = toPayload(system, processes);
    if (!validPayload(payload)) {
      alert('Please fill all numeric fields with non-negative numbers.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'baseline') {
        setMemoryAware(null);

        const resp = await api.simulateBaseline(payload);
        const data = resp?.data ?? null;
        window.__lastBaselineForDebug = data; // stash for console debugging

        if (!data) throw new Error('Invalid response from baseline API');
        setBaseline({ ...data, input: payload });
        saveRunLocal(`Run ${new Date().toLocaleString()} (Baseline)`, payload, { baseline: data });
      } else if (mode === 'memory') {
        setBaseline(null);

        const resp = await api.simulateMemoryAware(payload);
        const data = resp?.data ?? null;
        window.__lastMemoryAwareForDebug = data; // stash for debugging

        if (!data) throw new Error('Invalid response from memory-aware API');
        setMemoryAware({ ...data, input: payload });
        saveRunLocal(`Run ${new Date().toLocaleString()} (Memory)`, payload, { memoryAware: data });
      } else if (mode === 'compare') {
        const resp = await api.compareSchedulers(payload);
        const data = resp?.data ?? null;
        window.__lastCompareForDebug = data; // stash both

        if (!data || !data.baseline || !data.memory_aware) throw new Error('Invalid response from compare API');
        setBaseline({ ...data.baseline, input: payload });
        setMemoryAware({ ...data.memory_aware, input: payload });
        saveRunLocal(
          `Compare ${new Date().toLocaleString()}`,
          payload,
          { baseline: data.baseline, memoryAware: data.memory_aware }
        );
      } else {
        // unknown mode - no-op
      }
    } catch (e) {
      alert('API error — check console / backend server.');
    } finally {
      setLoading(false);
    }
  };

  const submitConfig = async () => {
    const payload = toPayload(system, processes);
    if (!validPayload(payload)) {
      alert('Please complete required fields.');
      return;
    }
    try {
      await api.sendConfig(payload);
      alert('Configuration saved to backend.');
    } catch (e) {
      alert('Failed to save config.');
    }
  };

  const importFromExcel = ({ system: s, processes: procs }) => {
    if (s) setSystem((prev) => ({ ...prev, ...s }));
    if (Array.isArray(procs) && procs.length) setProcesses(procs);
  };

  const exportJSON = () => {
    try {
      const payload = toPayload(system, processes);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scheduler_input_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // silent
    }
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="app-container py-4  ">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between heading ">
          <div className="flex items-center gap-0">
            <img
              src="/vite.jpg"
              className="w-20 h-20 sm:w-24 sm:h-24 logo object-contain"
              alt="logo"
            />

            <div className="leading-tight">
              <h1
                className="font-semibold"
                style={{ fontSize: 'var(--step-2)' }}
              >
                Memory-Aware CPU Scheduler
              </h1>

              <p className="opacity-60 text-xs sm:text-sm text-slate-300">
                Standard Priority vs Memory-Aware under constrained memory
              </p>
            </div>
          </div>


          <div className="flex flex-wrap items-center gap-2 relative">
            {/* three-dots dropdown */}
            <div ref={menuRef} className="relative">
              <button
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="p-2 rounded-lg hover:bg-white/5 "
                title="More actions"
              >
                <MoreVertical size={24} className="text-white" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-900 rounded-xl shadow-lg z-50 ring-1 ring-white/5">
                  <div className="py-1">
                    <div className=" py-1">
                      {/* Use the existing ExcelUpload component but render it in a compact mode by passing a prop. If ExcelUpload doesn't accept props, you can wrap it here or create a small input. */}
                      <ExcelUpload onData={importFromExcel} compact />
                    </div>

                    <button
                      onClick={() => { exportJSON(); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 rounded-md flex items-center gap-2"
                    >
                      <Download size={16} />
                      <span className="text-slate-200">Export JSON</span>
                    </button>

                    {/* <button
                      onClick={() => { navigator.clipboard?.writeText(apiUrl || ''); setMenuOpen(false); alert('API URL copied to clipboard'); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 rounded-md flex items-center gap-2"
                    >
                      <Save size={16} />
                      <span>Copy API URL</span>
                    </button> */}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="app-container pb-16 grid gap-6 sm:gap-8">
        <div className="card p-4 sm:p-6 bg-gray-900/80 border border-white/6 rounded-2xl">
          <ConfigForm system={system} setSystem={setSystem} processes={processes} setProcesses={setProcesses} />
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center sm:justify-start buttons ">
          <button
            disabled={loading}
            onClick={() => run('baseline')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl disabled:opacity-60 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white"
          >
            <Play size={16} /> Run Baseline
          </button>

          <button
            disabled={loading}
            onClick={() => run('memory')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl disabled:opacity-60 bg-gradient-to-r from-emerald-600 to-teal-500 text-white"
          >
            <Play size={16} /> Run Memory-Aware
          </button>

          <button
            disabled={loading}
            onClick={() => run('compare')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl disabled:opacity-60 bg-gradient-to-r from-amber-600 to-amber-500 text-white"
          >
            <GitCompare size={16} /> Run Both & Compare
          </button>

          <button
            onClick={submitConfig}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200"
          >
            <Save size={16} /> Save Input to Backend
          </button>
        </div>

        {(baseline || memoryAware) ? (
          <div className="card p-4 sm:p-6 bg-gray-900/80 border border-white/6 rounded-2xl">
            <Results baseline={baseline} memoryAware={memoryAware} />
          </div>
        ) : (
          <div className="card p-6 text-sm opacity-80 zindex bg-gray-900/70 border border-white/4 rounded-2xl text-slate-300">
            Run a simulation to see KPIs, tables, and graphs here.
          </div>
        )}

        {/* <div className="card p-4 sm:p-6">
          <CompareRuns />
        </div> */}
      </main>

      {/* <footer className="app-container pb-8 text-xs opacity-70 zindex">
        Tip: Set <code>VITE_API_URL</code> in your <code>.env</code> — or use Diagnostics to override at runtime.
        Current: <code>{apiUrl}</code>
      </footer> */}
    </div>
  );
}
