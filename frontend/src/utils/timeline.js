// src/utils/timeline.js

/* -----------------------
   Helpers
----------------------- */

export function isIdlePid(pid) {
  if (pid == null) return true;
  const s = String(pid).trim().toLowerCase();
  return s === "" || s === "idle" || s === "0" || s === "-1" || s === "null";
}

/* --------------------------------------------------------
   normalizeTimeline(tl)
   Accepts:
     - [[pid,start,end], ...]
     - [{pid,start,end}, ...]
     - trace: [{time,event,pid}, ...]
   Returns: [[pid,start,end], ...] but WITHOUT IDLE segments
--------------------------------------------------------- */

export function normalizeTimeline(tl = []) {
  if (!Array.isArray(tl) || tl.length === 0) return [];

  const first = tl[0];

  /* ----------- Case 1: array-of-arrays ----------- */
  if (Array.isArray(first)) {
    return tl
      .map((arr) => {
        if (!Array.isArray(arr) || arr.length < 3) return null;
        const pid = String(arr[0]);
        if (isIdlePid(pid)) return null;
        const s = Number(arr[1]);
        const e = Number(arr[2]);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
        return [pid, s, e];
      })
      .filter(Boolean);
  }

  /* ----------- Case 2: trace-like array ----------- */
  const looksTrace = tl.every((e) => e && "time" in e && "event" in e && "pid" in e);

  if (looksTrace) {
    const timeline = [];
    let curPid = null;
    let curStart = null;

    const times = tl.map((x) => Number(x.time ?? NaN)).filter(Number.isFinite);
    const inferredLast = times.length ? Math.max(...times) : 0;

    for (const entry of tl) {
      if (!entry) continue;

      const ev = entry.event;
      const pid = entry.pid;
      const t = Number(entry.time);

      const isRun = ev === "running";

      if (!isRun) {
        if (curPid !== null) {
          const end = Number.isFinite(t) ? t : inferredLast;
          if (!isIdlePid(curPid)) timeline.push([String(curPid), curStart, end]);
          curPid = null;
          curStart = null;
        }
        continue;
      }

      if (!Number.isFinite(t)) continue;

      if (curPid === null) {
        curPid = pid;
        curStart = t;
      } else if (pid !== curPid) {
        timeline.push([String(curPid), curStart, t]);
        curPid = pid;
        curStart = t;
      }
    }

    if (curPid !== null) {
      const last = times.length ? Math.max(...times) : curStart;
      if (!isIdlePid(curPid)) timeline.push([String(curPid), curStart, last + 1]);
    }

    return timeline;
  }

  /* ----------- Case 3: array-of-objects ----------- */
  return tl
    .map((obj) => {
      if (!obj || obj.pid == null) return null;
      const pid = String(obj.pid);
      if (isIdlePid(pid)) return null;

      let s = null,
        e = null;

      if ("start" in obj && "end" in obj) {
        s = Number(obj.start);
        e = Number(obj.end);
      } else if ("s" in obj && "e" in obj) {
        s = Number(obj.s);
        e = Number(obj.e);
      } else if ("start" in obj && "duration" in obj) {
        s = Number(obj.start);
        e = Number(obj.start) + Number(obj.duration);
      }

      if (!Number.isFinite(s) || !Number.isFinite(e)) return null;

      return [pid, s, e];
    })
    .filter(Boolean);
}

/* --------------------------------------------------------
   convert timeline → CPU series (0% or 100% busy per time unit)
--------------------------------------------------------- */

export function timelineToSeries(tl = [], total_time = 0) {
  const timeline = normalizeTimeline(tl);
  if (timeline.length === 0)
    return { series: [], meta: { len: 0, busyCount: 0, busyPct: 0 } };

  const ends = timeline.map((x) => x[2]);
  let tt = total_time || Math.max(...ends) + 1;

  const len = Math.ceil(tt);
  const busy = new Array(len).fill(false);

  for (const [pid, s, e] of timeline) {
    if (isIdlePid(pid)) continue;

    const start = Math.floor(Math.max(0, s));
    const end = Math.ceil(Math.min(len, e));

    for (let t = start; t < end; t++) busy[t] = true;
  }

  const busyCount = busy.filter((x) => x).length;
  const busyPct = len ? Math.round((busyCount / len) * 100) : 0;

  const series = busy.map((isBusy, t) => ({
    time: t,
    cpu: isBusy ? 100 : 0,
  }));

  return { series, meta: { len, busyCount, busyPct } };
}



// // src/utils/timeline.js
// export function toArrayTimeline(tl) {
//   if (!tl) return [];
//   // already array-of-arrays? return as-is
//   if (Array.isArray(tl) && tl.length && Array.isArray(tl[0])) return tl;
//   // assume array of objects like { pid, start, end }
//   return tl.map((seg) => [seg.pid, Number(seg.start), Number(seg.end)]);
// }

// // src/utils/timeline.js (append)
// export function traceToTimeline(trace) {
//   if (!trace || !trace.length) return [];
//   const timeline = [];
//   let curPid = null;
//   let curStart = null;
//   for (const entry of trace) {
//     if (entry.event !== 'running') {
//       if (curPid !== null) {
//         timeline.push([curPid, curStart, entry.time]);
//         curPid = null;
//         curStart = null;
//       }
//       continue;
//     }
//     if (curPid === null) {
//       curPid = entry.pid;
//       curStart = entry.time;
//     } else if (entry.pid !== curPid) {
//       timeline.push([curPid, curStart, entry.time]);
//       curPid = entry.pid;
//       curStart = entry.time;
//     }
//   }
//   if (curPid !== null) {
//     const lastTime = trace[trace.length - 1].time ?? 0;
//     timeline.push([curPid, curStart, lastTime + 1]);
//   }
//   return timeline;
// }
