// frontend/src/components/Diagnostics.jsx
import { useState } from 'react';
import { resolveBaseURL } from '../utils/env';

export default function Diagnostics({ onApplyURL, currentURL }) {
  const [value, setValue] = useState('');
  const [tests, setTests] = useState([]);

  const runTests = () => {
    const results = [];
    let t1 = false;
    try {
      void (typeof import.meta !== 'undefined' && import.meta && import.meta.env);
      t1 = true;
    } catch {
      t1 = false;
    }
    results.push({ name: 'Safe access to import.meta.env', pass: t1 });

    const t2 = typeof resolveBaseURL() === 'string';
    results.push({ name: 'resolveBaseURL() returns string', pass: t2 });

    setTests(results);
  };

  const rows = tests.map((t, i) => ({ id: i + 1, ...t }));

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-semibold">Diagnostics</span>
      </div>

      <div className="text-sm mb-2 opacity-80">
        Resolved API URL: <span className="font-mono">{currentURL}</span>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 w-full"
          placeholder="Override API URL (e.g., http://localhost:8000)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
          onClick={() => {
            if (!value) return;
            localStorage.setItem('API_URL', value);
            onApplyURL(value);
          }}
        >
          Apply
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20" onClick={runTests}>
          Run Env Tests
        </button>
        <button
          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
          onClick={() => {
            localStorage.removeItem('API_URL');
            onApplyURL(resolveBaseURL());
          }}
        >
          Reset Override
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 text-sm">
          <div className="font-semibold mb-1">Test Results</div>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li
                key={r.id}
                className={
                  'flex items-center justify-between rounded-lg px-3 py-2 ' +
                  (r.pass ? 'bg-emerald-500/10' : 'bg-rose-500/10')
                }
              >
                <span>{r.name}</span>
                <span className={'font-mono ' + (r.pass ? 'text-emerald-300' : 'text-rose-300')}>
                  {r.pass ? 'PASS' : 'FAIL'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
