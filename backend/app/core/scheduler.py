# backend/app/core/scheduler.py
from __future__ import annotations
from typing import Dict, List, Tuple, Optional, Any
from collections import deque
from dataclasses import dataclass, field
import math
import random
from ..models.schemas import SystemConfig, SimulationResult, TraceEntry, CompareBundle
from collections import deque
from typing import Deque

# =============================================================
# Memory Model Implementation (Core Logic for Dynamic Quantum)
# =============================================================

@dataclass
class MemoryModelConfig:
    page_size_mb: int = 4
    min_memory_mb: int = 8
    max_memory_mb: int = 320
    accesses_per_time_unit: int = 1
    window_access_count: int = 50
    ema_beta: float = 0.85
    base_q: int = 2
    k: float = 1.0
    access_pattern: str = "locality"
    hotspot_frac: float = 0.2
    hotspot_prob: float = 0.8
    rng_seed: Optional[int] = 42
    normalization_eps: float = 1e-9


@dataclass
class SliceObservation:
    run_time: float
    accesses: int
    page_faults: int
    working_set_size: int


@dataclass
class ProcessState:
    pid: str
    arrival: float
    burst: float
    remaining: float
    pages_count: int
    generator: Any
    sliding_window: deque = field(default_factory=deque)
    ema: float = 0.0
    mem_signal: float = 0.0
    last_obs: Optional[SliceObservation] = None
    unique_counts: Dict[int, int] = field(default_factory=dict)


class PageGenerator:
    """Simulates page access patterns."""
    def __init__(
        self,
        pages_count: int,
        rng: random.Random,
        pattern: str = "locality",
        hotspot_frac: float = 0.2,
        hotspot_prob: float = 0.8,
    ):
        self.pages_count = max(1, int(pages_count))
        self.rng = rng or random.Random()
        self.pattern = pattern or "locality"
        self.hotspot_frac = float(hotspot_frac)
        self.hotspot_prob = float(hotspot_prob)

        self.hotspot_size = max(1, int(self.pages_count * self.hotspot_frac))
        max_start = max(0, self.pages_count - self.hotspot_size)
        # ensure a valid start index
        self.hotspot_start = int(self.rng.random() * max(1, max_start)) if max_start > 0 else 0

        self.seq_index = 0

    def next(self) -> int:
        if self.pattern == "random":
            return int(self.rng.random() * self.pages_count)

        if self.pattern == "sequential":
            idx = self.seq_index % self.pages_count
            self.seq_index += 1
            return idx

        # locality / hotspot behavior
        if self.rng.random() < self.hotspot_prob:
            return (self.hotspot_start + int(self.rng.random() * self.hotspot_size)) % self.pages_count

        return int(self.rng.random() * self.pages_count)


class MemoryModel:
    """Manages the memory/page fault simulation."""
    def __init__(self, cfg: MemoryModelConfig):
        self.cfg = cfg
        self.rng = random.Random(cfg.rng_seed)
        self.processes: Dict[str, ProcessState] = {}
        self._normalization_dirty = False

    def create_process(
        self,
        pid: str,
        arrival: float,
        burst: float,
        pages_count: int,
        access_pattern: Optional[str] = None,
    ) -> ProcessState:
        gen = PageGenerator(
            pages_count,
            self.rng,
            access_pattern or self.cfg.access_pattern,
            self.cfg.hotspot_frac,
            self.cfg.hotspot_prob,
        )

        proc = ProcessState(
            pid=pid,
            arrival=arrival,
            burst=burst,
            remaining=burst,
            pages_count=int(pages_count or 1),
            generator=gen,
            sliding_window=deque(maxlen=self.cfg.window_access_count),
        )

        self.processes[pid] = proc
        self._normalization_dirty = True
        return proc

    def observe_run(self, pid: str, run_time: float) -> SliceObservation:
        proc = self.processes[pid]
        accesses = max(1, int(self.cfg.accesses_per_time_unit * run_time))
        access_pages = [proc.generator.next() for _ in range(accesses)]

        window = proc.sliding_window
        counts = proc.unique_counts

        page_faults = 0

        for page in access_pages:
            if counts.get(page, 0) == 0:
                page_faults += 1

            if window.maxlen and len(window) == window.maxlen:
                oldest = window.popleft()
                old_cnt = counts.get(oldest, 0)
                if old_cnt <= 1:
                    counts.pop(oldest, None)
                else:
                    counts[oldest] = old_cnt - 1

            window.append(page)
            counts[page] = counts.get(page, 0) + 1

        obs = SliceObservation(run_time=run_time, accesses=accesses, page_faults=page_faults, working_set_size=len(counts))
        proc.last_obs = obs

        self._normalization_dirty = True
        return obs

    def update_signal(self, pid: str, obs: SliceObservation):
        proc = self.processes[pid]
        observed = obs.page_faults / float(obs.accesses) if obs.accesses > 0 else 0.0

        proc.ema = self.cfg.ema_beta * proc.ema + (1.0 - self.cfg.ema_beta) * observed
        self._normalization_dirty = True

    def recompute_normalization(self):
        if not self._normalization_dirty:
            return

        arr = [p.ema for p in self.processes.values()]
        maxv = max(arr) if arr else 0.0

        for p in self.processes.values():
            p.mem_signal = (p.ema / maxv) if maxv > self.cfg.normalization_eps else 0.0

        self._normalization_dirty = False

    def get_estimated_memory_mb(self, pid: str) -> int:
        m = self.processes[pid].mem_signal
        return int(round(self.cfg.min_memory_mb + m * (self.cfg.max_memory_mb - self.cfg.min_memory_mb)))

    def get_effective_quantum(self, pid: str, base_q: int) -> int:
        m = self.processes[pid].mem_signal
        return max(1, int(round(base_q * (1.0 + self.cfg.k * m))))


# =============================================================
# Scheduling Utility Functions
# =============================================================

from collections import deque
from typing import Deque

def simulate_rr_with_quanta(processes: List[str], bursts: Dict[str, float], quanta: Dict[str, int],
                            arrivals: Dict[str, int]) -> List[Tuple[str, int, int]]:
    """
    Robust integer Round-Robin simulation using a FIFO ready queue.

    - bursts, arrivals, quanta are coerced to ints
    - returns timeline list of (pid, start:int, end:int)
    - ensures no zero-length slices and correct RR behavior (enqueue back if remaining)
    """

    # Coerce to ints
    rem: Dict[str, int] = {p: max(0, int(round(bursts.get(p, 0)))) for p in processes}
    arr: Dict[str, int] = {p: int(round(arrivals.get(p, 0))) for p in processes}
    qmap: Dict[str, int] = {p: max(1, int(round(quanta.get(p, 1)))) for p in processes}

    # Build list of future arrivals sorted by time (pid, time)
    future = sorted([(arr[p], p) for p in processes], key=lambda x: (x[0], x[1]))
    future_idx = 0
    now = 0
    timeline: List[Tuple[str, int, int]] = []
    ready: Deque[str] = deque()

    # helper: enqueue arrivals whose time <= now
    def push_arrivals_up_to(t):
        nonlocal future_idx
        while future_idx < len(future) and future[future_idx][0] <= t:
            _, pid = future[future_idx]
            # only enqueue if has remaining
            if rem.get(pid, 0) > 0 and pid not in ready:
                ready.append(pid)
            future_idx += 1

    # initially push arrivals at time 0
    push_arrivals_up_to(now)

    # if nothing ready but some future arrivals exist, jump to next arrival time
    if not ready and future_idx < len(future):
        now = future[future_idx][0]
        push_arrivals_up_to(now)

    # main loop
    while ready:
        pid = ready.popleft()
        if rem.get(pid, 0) <= 0:
            # skip finished
            # but also attempt to push arrivals up to now
            push_arrivals_up_to(now)
            if not ready and future_idx < len(future):
                now = max(now, future[future_idx][0])
                push_arrivals_up_to(now)
            continue

        q = qmap.get(pid, 1)
        use = min(q, rem[pid])
        use = max(1, int(use))

        start = int(now)
        end = start + int(use)

        # append timeline slice (guaranteed end > start)
        timeline.append((pid, start, end))

        # advance time and consume remaining
        rem[pid] = rem.get(pid, 0) - use
        now = end

        # push any new arrivals that appeared up to current time
        push_arrivals_up_to(now)

        # if this process still has remaining work, enqueue it to tail
        if rem[pid] > 0:
            ready.append(pid)

        # if ready is empty but there are still unfinished processes with future arrivals:
        if not ready:
            # attempt to enqueue any processes that already arrived and have remaining
            for p in processes:
                if rem.get(p, 0) > 0 and arr.get(p, 0) <= now and p not in ready:
                    ready.append(p)
            # if still empty and there are future arrivals -> jump
            if not ready and future_idx < len(future):
                now = max(now, future[future_idx][0])
                push_arrivals_up_to(now)

    return timeline

def count_context_switches(timeline: List[Tuple[str, int, int]]) -> int:
    if not timeline:
        return 0

    switches = 0
    prev = timeline[0][0]

    for pid, _, _ in timeline[1:]:
        if pid != prev:
            switches += 1
        prev = pid

    return switches


def compute_metrics(pids: List[str], initial_bursts: Dict[str, float], timeline: List[Tuple[str, int, int]], arrivals: Dict[str, int]):
    """
    Compute waiting/turnaround/cpu_util/total_time from integer timeline.
    Returns waiting_map, turnaround_map, cpu_util_percent, total_time (int).
    """
    if not pids:
        return ({p: 0 for p in pids}, {p: 0 for p in pids}, 0.0, 0)

    # If timeline empty - return zeros
    if not timeline:
        return ({p: 0 for p in pids}, {p: 0 for p in pids}, 0.0, 0)

    # Determine completion times (last end per pid)
    completion: Dict[str, int] = {}
    min_start = None
    max_end = 0
    for pid, s, e in timeline:
        s_i = int(s)
        e_i = int(e)
        completion[pid] = max(completion.get(pid, 0), e_i)
        if min_start is None or s_i < min_start:
            min_start = s_i
        if e_i > max_end:
            max_end = e_i

    # total_time is the span up to the last recorded end (do NOT add +1)
    total_time = int(max_end)

    waiting: Dict[str, int] = {}
    turnaround: Dict[str, int] = {}
    total_cpu_time = 0.0
    # sum of initial bursts is used for CPU util (float)
    for p in pids:
        total_cpu_time += float(initial_bursts.get(p, 0))

    for p in pids:
        arr_time = int(round(arrivals.get(p, 0))) if isinstance(arrivals.get(p, 0), (int, float)) else int(arrivals.get(p, 0) or 0)
        bt = float(initial_bursts.get(p, 0))
        comp = completion.get(p, None)

        if comp is None:
            waiting[p] = 0
            turnaround[p] = 0
            continue

        tat = float(comp - arr_time)
        wt = tat - bt

        turnaround[p] = max(0, int(round(tat)))
        waiting[p] = max(0, int(round(wt)))

    cpu_util = (total_cpu_time / total_time) * 100.0 if total_time > 0 else 0.0

    return waiting, turnaround, cpu_util, total_time



# =============================================================
# CPU series generator for charts (integer timeline)
# =============================================================
def build_cpu_series(timeline: List[Tuple[str, int, int]], total_time: int) -> List[Dict[str, int]]:
    """
    Produce per-integer time bucket occupancy (0 or 100).
    Timeline segments are interpreted as half-open intervals [start, end).
    `total_time` should be the simulation total time (max end).
    """
    if not timeline or total_time is None or total_time <= 0:
        return []

    T = int(math.ceil(total_time))
    occupied = [False] * T

    for pid, s, e in timeline:
        try:
            start = float(s)
            end = float(e)
        except Exception:
            continue
        # ignore empty/invalid segments
        if not (math.isfinite(start) and math.isfinite(end)) or end <= start:
            continue

        start_clamped = max(0.0, start)
        end_clamped = min(float(T), end)

        first_bucket = int(math.floor(start_clamped))
        last_bucket_exclusive = int(math.ceil(end_clamped))

        for tt in range(first_bucket, min(last_bucket_exclusive, T)):
            if 0 <= tt < T:
                occupied[tt] = True

    series = [{"time": t, "cpu": 100 if occupied[t] else 0} for t in range(0, T)]
    return series

def generate_trace(timeline: List[Tuple[str, int, int]]) -> List[TraceEntry]:
    """
    Produce a trace list compatible with frontend utilities.
    Emit 'running' at start and 'stopped' at end.

    IMPORTANT: When events share the same timestamp we must ensure
    'stopped' events appear *before* 'running' events so the frontend
    can close previous slices before starting new ones.
    """
    trace: List[TraceEntry] = []
    for pid, s, e in timeline:
        if s < e:
            trace.append(TraceEntry(time=int(s), event="running", pid=pid))
            trace.append(TraceEntry(time=int(e), event="stopped", pid=pid))

    # sort so that for the same time 'stopped' comes before 'running'
    # this way we always close any active process before starting another at same timestamp
    def key_fn(x: TraceEntry):
        # stopped -> 0, running -> 1
        order = 0 if x.event == "stopped" else 1
        return (int(x.time), order, str(x.pid))

    trace.sort(key=key_fn)
    return trace


# =============================================================
# Helper: compute small meta fields
# =============================================================
def _compute_avg_from_map(m: Optional[Dict[str, float]]) -> float:
    if not m:
        return 0.0
    vals = [float(v) for v in m.values() if v is not None]
    if not vals:
        return 0.0
    return sum(vals) / len(vals)


# =============================================================
# Main Simulation Functions
# =============================================================

def simulate_baseline(config: SystemConfig) -> SimulationResult:

    processes = [p.pid for p in config.processes]
    initial_bursts = {p.pid: p.burst_time for p in config.processes}
    arrivals = {p.pid: p.arrival_time for p in config.processes}

    fixed_quantum = config.cpu_quantum
    quanta = {p: fixed_quantum for p in processes}

    timeline = simulate_rr_with_quanta(processes, initial_bursts, quanta, arrivals)

    # compute waiting/turnaround/total_time (we will compute cpu_util from series below)
    waiting_times, turnaround_times, _prev_cpu_util, total_time = compute_metrics(
        processes, initial_bursts, timeline, arrivals
    )
    ctx = count_context_switches(timeline)

    avg_wait = _compute_avg_from_map(waiting_times)
    avg_tat = _compute_avg_from_map(turnaround_times)
    meta = {"avg_wait": avg_wait, "avg_turnaround": avg_tat}

    # Build per-bucket CPU series and compute utilization as fraction of busy buckets
    cpu_series = build_cpu_series(timeline, total_time)
    if cpu_series:
        busy_count = sum(1 for p in cpu_series if int(p.get("cpu", 0)) > 0)
        cpu_util_from_series = (busy_count / len(cpu_series)) * 100.0
    else:
        cpu_util_from_series = 0.0
        
    return SimulationResult(
        turnaround_times=turnaround_times,
        waiting_times=waiting_times,
        cpu_utilization=cpu_util_from_series,
        total_time=total_time,
        context_switches=ctx,
        trace=generate_trace(timeline),
        inferred_quanta={p: fixed_quantum for p in processes},
        memory_estimates={},  # baseline has no memory estimates
        cpu_series=cpu_series,
        meta=meta,
    )


def simulate_memory_aware(config: SystemConfig) -> SimulationResult:

    processes = [p.pid for p in config.processes]
    initial_bursts = {p.pid: p.burst_time for p in config.processes}
    arrivals = {p.pid: p.arrival_time for p in config.processes}
    base_q = config.cpu_quantum

    mm = MemoryModel(MemoryModelConfig(base_q=base_q, rng_seed=42))

    for p in config.processes:
        mm.create_process(p.pid, p.arrival_time, p.burst_time, p.pages_count or 1)

    # Run a few adaptation rounds to let mem signals stabilize
    for _ in range(12):
        for pid in processes:
            q = mm.get_effective_quantum(pid, base_q)
            obs = mm.observe_run(pid, run_time=q)
            mm.update_signal(pid, obs)
        mm.recompute_normalization()

    memory_quanta = {p: mm.get_effective_quantum(p, base_q) for p in processes}
    memory_est = {p: mm.get_estimated_memory_mb(p) for p in processes}

    timeline = simulate_rr_with_quanta(processes, initial_bursts, memory_quanta, arrivals)

    # compute waiting/turnaround/total_time (compute cpu_util from series below)
    waiting_times, turnaround_times, _prev_cpu_util, total_time = compute_metrics(
        processes, initial_bursts, timeline, arrivals
    )
    ctx = count_context_switches(timeline)

    avg_wait = _compute_avg_from_map(waiting_times)
    avg_tat = _compute_avg_from_map(turnaround_times)
    meta = {"avg_wait": avg_wait, "avg_turnaround": avg_tat}

    # Build per-bucket CPU series and compute utilization as fraction of busy buckets
    cpu_series = build_cpu_series(timeline, total_time)
    if cpu_series:
        busy_count = sum(1 for p in cpu_series if p and int(p.get("cpu", 0)) > 0)
        cpu_util = (busy_count / len(cpu_series)) * 100.0
    else:
        cpu_util = 0.0

    return SimulationResult(
        turnaround_times=turnaround_times,
        waiting_times=waiting_times,
        cpu_utilization=cpu_util,
        total_time=total_time,
        context_switches=ctx,
        trace=generate_trace(timeline),
        inferred_quanta=memory_quanta,
        memory_estimates=memory_est,
        cpu_series=cpu_series,
        meta=meta,
    )


# =============================================================
# Compare Both
# =============================================================

def compare_schedulers(config: SystemConfig) -> CompareBundle:
    return CompareBundle(
        baseline=simulate_baseline(config),
        memory_aware=simulate_memory_aware(config),
    )
