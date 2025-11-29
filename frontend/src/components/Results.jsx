// frontend/src/components/Results.jsx
import { useMemo } from "react";
import SingleCPUChart from "./charts/SingleCPUChart";
import CPUComparison from "./charts/CPUComparison";
import DualGantt from "./charts/DualGantt";
import CombinedTable from "./tables/CombinedTable";
import StackedCPUChart from "./charts/StackedCPUChart";

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

function timelineToOccupancy(timeline = [], totalTime = 0) {
  const norm = normalizeTimeline(timeline);
  if (!norm.length) return { series: [], meta: { len: 0, busyPct: 0 } };
  const times = norm.flatMap((s) => [s[1], s[2]]);
  let tt = Number(totalTime) || Math.max(...times) + 1;
  const len = Math.max(1, Math.ceil(tt));
  const busy = new Array(len).fill(false);
  for (const seg of norm) {
    const [pid, s, e] = seg;
    if (isIdlePid(pid)) continue;
    const start = Math.max(0, Math.floor(s));
    const end = Math.min(len, Math.ceil(e));
    for (let t = start; t < end; t++) busy[t] = true;
  }
  return {
    series: busy.map((b, i) => ({ time: i, cpu: b ? 100 : 0 })),
    meta: { len, busyPct: Math.round((busy.filter(Boolean).length / len) * 100) },
  };
}

function traceToOccupancySeries(trace = [], total_time = 0) {
  if (!trace || !trace.length) return [];
  const events = trace
    .map((e) => ({ time: Number(e.time), event: e.event, pid: e.pid }))
    .filter((e) => Number.isFinite(e.time))
    .sort((a, b) => a.time - b.time);
  let tt = total_time || Math.max(...events.map((e) => e.time)) + 1;
  const len = Math.ceil(tt);
  const busy = new Array(len).fill(false);
  let curPid = null;
  let curStart = null;
  for (const ev of events) {
    const isRun = ev.event === "running";
    if (isRun) {
      if (curPid === null) {
        curPid = ev.pid;
        curStart = ev.time;
      } else if (ev.pid !== curPid) {
        const start = Math.floor(curStart);
        const end = Math.ceil(ev.time);
        if (!isIdlePid(curPid)) {
          for (let t = Math.max(0, start); t < Math.min(len, end); t++) busy[t] = true;
        }
        curPid = ev.pid;
        curStart = ev.time;
      }
      continue;
    }
    if (curPid !== null) {
      const start = Math.floor(curStart);
      const end = Math.ceil(ev.time);
      if (!isIdlePid(curPid)) {
        for (let t = Math.max(0, start); t < Math.min(len, end); t++) busy[t] = true;
      }
      curPid = null;
      curStart = null;
    }
  }
  if (curPid !== null) {
    const start = Math.floor(curStart);
    for (let t = Math.max(0, start); t < len; t++) {
      if (!isIdlePid(curPid)) busy[t] = true;
    }
  }
  return busy.map((b, i) => ({ time: i, cpu: b ? 100 : 0 }));
}

function seriesIsDegenerateAll0or100(arr = []) {
  const vals = arr.map((d) => Number(d.cpu)).filter(Number.isFinite);
  return vals.length > 0 && (vals.every((v) => v === 0) || vals.every((v) => v === 100));
}

export default function Results({ baseline = null, memoryAware = null }) {
  const baseSeries = useMemo(() => {
    if (!baseline) return [];
    const cpuS = Array.isArray(baseline.cpu_series) ? [...baseline.cpu_series] : null;
    const tr = Array.isArray(baseline.trace) ? [...baseline.trace] : null;
    const mt = Array.isArray(baseline.memory_timeline) ? [...baseline.memory_timeline] : null;
    const tt = Number(baseline.total_time) || 0;
    if (cpuS && cpuS.length) {
      const norm = cpuS.map((p, i) =>
        Array.isArray(p) ? { time: p[0], cpu: p[1] } : typeof p === "object" ? { time: p.time, cpu: p.cpu } : { time: i, cpu: p || 0 }
      );
      if (seriesIsDegenerateAll0or100(norm) && tr) return traceToOccupancySeries(tr, tt);
      return norm.map((d) => ({ time: Number(d.time), cpu: Math.max(0, Math.min(100, Number(d.cpu))) }));
    }
    if (mt && mt.length) return timelineToOccupancy(mt, tt).series;
    if (tr && tr.length) return traceToOccupancySeries(tr, tt);
    return [];
  }, [baseline]);

  const marrSeries = useMemo(() => {
    if (!memoryAware) return [];
    const cpuS = Array.isArray(memoryAware.cpu_series) ? [...memoryAware.cpu_series] : null;
    const tr = Array.isArray(memoryAware.trace) ? [...memoryAware.trace] : null;
    const mt = Array.isArray(memoryAware.memory_timeline) ? [...memoryAware.memory_timeline] : null;
    const tt = Number(memoryAware.total_time) || 0;
    if (cpuS && cpuS.length) {
      const norm = cpuS.map((p, i) =>
        Array.isArray(p) ? { time: p[0], cpu: p[1] } : typeof p === "object" ? { time: p.time, cpu: p.cpu } : { time: i, cpu: p || 0 }
      );
      if (seriesIsDegenerateAll0or100(norm) && tr) return traceToOccupancySeries(tr, tt);
      return norm.map((d) => ({ time: Number(d.time), cpu: Math.max(0, Math.min(100, Number(d.cpu))) }));
    }
    if (mt && mt.length) return timelineToOccupancy(mt, tt).series;
    if (tr && tr.length) return traceToOccupancySeries(tr, tt);
    return [];
  }, [memoryAware]);

  useMemo(() => {
    if (!baseSeries.length || !marrSeries.length) return;
    const same =
      baseSeries.length === marrSeries.length &&
      baseSeries.every((b, i) => Number(b.time) === Number(marrSeries[i].time) && Number(b.cpu) === Number(marrSeries[i].cpu));
    if (same) {
      console.warn("[Results] Baseline and Memory-Aware CPU series are identical");
    }
  }, [baseSeries, marrSeries]);

  const processes = useMemo(() => {
    const list = baseline?.input?.processes ?? memoryAware?.input?.processes ?? [];
    return Array.isArray(list)
      ? list.map((p) => (typeof p === "object" ? String(p.pid) : String(p))).filter((pid) => pid && !isIdlePid(pid))
      : [];
  }, [baseline, memoryAware]);

  const showBaselineOnly = baseline && !memoryAware;
  const showMemoryOnly = memoryAware && !baseline;
  const showBoth = baseline && memoryAware;

  const baselineTimeline = useMemo(() => {
    if (baseline?.memory_timeline) return normalizeTimeline(baseline.memory_timeline);
    if (!baseline?.trace) return [];
    const trace = baseline.trace;
    const tl = [];
    let curPid = null;
    let curStart = null;
    for (const e of trace) {
      const isRun = e.event === "running";
      const pid = e.pid;
      const t = Number(e.time);
      if (!isRun) {
        if (curPid !== null) {
          tl.push([String(curPid), curStart, t]);
          curPid = null;
          curStart = null;
        }
        continue;
      }
      if (curPid === null) {
        curPid = pid;
        curStart = t;
      } else if (pid !== curPid) {
        tl.push([String(curPid), curStart, t]);
        curPid = pid;
        curStart = t;
      }
    }
    if (curPid !== null) {
      const last = Math.max(...trace.map((r) => Number(r.time)));
      tl.push([String(curPid), curStart, last + 1]);
    }
    return tl;
  }, [baseline]);

  const marrTimeline = useMemo(() => {
    if (memoryAware?.memory_timeline) return normalizeTimeline(memoryAware.memory_timeline);
    if (!memoryAware?.trace) return [];
    const trace = memoryAware.trace;
    const tl = [];
    let curPid = null;
    let curStart = null;
    for (const e of trace) {
      const isRun = e.event === "running";
      const pid = e.pid;
      const t = Number(e.time);
      if (!isRun) {
        if (curPid !== null) {
          tl.push([String(curPid), curStart, t]);
          curPid = null;
          curStart = null;
        }
        continue;
      }
      if (curPid === null) {
        curPid = pid;
        curStart = t;
      } else if (pid !== curPid) {
        tl.push([String(curPid), curStart, t]);
        curPid = pid;
        curStart = t;
      }
    }
    if (curPid !== null) {
      const last = Math.max(...trace.map((r) => Number(r.time)));
      tl.push([String(curPid), curStart, last + 1]);
    }
    return tl;
  }, [memoryAware]);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10">
          <div className="text-sm opacity-80">Baseline CPU Util (%)</div>
          <div className="text-2xl font-semibold">{baseline?.cpu_utilization?.toFixed?.(2) ?? "–"}</div>
        </div>
        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10">
          <div className="text-sm opacity-80">Memory-Aware CPU Util (%)</div>
          <div className="text-2xl font-semibold">{memoryAware?.cpu_utilization?.toFixed?.(2) ?? "–"}</div>
        </div>
        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10">
          <div className="text-sm opacity-80">Baseline Time</div>
          <div className="text-2xl font-semibold">{baseline?.total_time ?? "–"}</div>
        </div>
        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10">
          <div className="text-sm opacity-80">Memory-Aware Time</div>
          <div className="text-2xl font-semibold">{memoryAware?.total_time ?? "–"}</div>
        </div>
      </div>

      <div className="grid gap-6">
        {showBaselineOnly && (
          <>
            <SingleCPUChart series={baseSeries} title="CPU : Busy vs Idle" color="#FFA500" />
            <StackedCPUChart timeline={baselineTimeline} totalTime={baseline?.total_time} processes={processes} title="Baseline per-PID" />
          </>
        )}

        {showMemoryOnly && (
          <>
            <SingleCPUChart series={marrSeries} title="CPU : Busy vs Idle" color="#2ECC71" />
            <StackedCPUChart timeline={marrTimeline} totalTime={memoryAware?.total_time} processes={processes} title="Memory-Aware per-PID" />
          </>
        )}

        {showBoth && (
          <>
            <CPUComparison baseSeries={baseSeries} marrSeries={marrSeries} />

            <div className="grid md:grid-cols-2 gap-4">
              <StackedCPUChart timeline={baselineTimeline} totalTime={baseline?.total_time} processes={processes} title="Baseline per-PID" />
              <StackedCPUChart timeline={marrTimeline} totalTime={memoryAware?.total_time} processes={processes} title="Memory-Aware per-PID" />
            </div>

            <DualGantt baseline={baselineTimeline} marr={marrTimeline} processesOrder={processes} baseline_quanta={baseline?.inferred_quanta || {}} />

            <CombinedTable
              processes={processes}
              mem_est={memoryAware?.memory_estimates || baseline?.memory_estimates || {}}
              inferred_quanta={memoryAware?.inferred_quanta || baseline?.inferred_quanta || {}}
              baselineMetrics={{ waiting_times: baseline?.waiting_times || {}, turnaround_times: baseline?.turnaround_times || {} }}
              memoryMetrics={{ waiting_times: memoryAware?.waiting_times || {}, turnaround_times: memoryAware?.turnaround_times || {} }}
              cpu_base_util={baseline?.cpu_utilization ?? 0}
              cpu_marr_util={memoryAware?.cpu_utilization ?? 0}
              ctx_base={baseline?.context_switches ?? 0}
              ctx_marr={memoryAware?.context_switches ?? 0}
            />
          </>
        )}
      </div>
    </div>
  );
}