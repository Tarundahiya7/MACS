from __future__ import annotations
from typing import Dict, List, Tuple, Optional, Any
from collections import deque
from dataclasses import dataclass, field
import math
import random
from ..models.schemas import SystemConfig, SimulationResult, TraceEntry, CompareBundle
from typing import Deque

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
    rng_seed: Optional[int] = None
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
    def __init__(self, pages_count: int, rng: random.Random, pattern: str = "locality", hotspot_frac: float = 0.2, hotspot_prob: float = 0.8):
        self.pages_count = max(1, int(pages_count))
        self.rng = rng or random.Random()
        self.pattern = pattern or "locality"
        self.hotspot_frac = float(hotspot_frac)
        self.hotspot_prob = float(hotspot_prob)
        self.hotspot_size = max(1, int(self.pages_count * self.hotspot_frac))
        max_start = max(0, self.pages_count - self.hotspot_size)
        # choose a start in [0, max_start]
        self.hotspot_start = int(self.rng.random() * (max_start + 1)) if max_start >= 0 else 0
        self.seq_index = 0

    def next(self) -> int:
        if self.pattern == "random":
            return int(self.rng.random() * self.pages_count)
        if self.pattern == "sequential":
            idx = self.seq_index % self.pages_count
            self.seq_index += 1
            return idx
        if self.rng.random() < self.hotspot_prob:
            return (self.hotspot_start + int(self.rng.random() * self.hotspot_size)) % self.pages_count
        return int(self.rng.random() * self.pages_count)

class MemoryModel:
    def __init__(self, cfg: MemoryModelConfig):
        self.cfg = cfg
        # deterministic global RNG when seed provided
        self.global_rng = random.Random(cfg.rng_seed) if cfg.rng_seed is not None else random.Random()
        self.processes: Dict[str, ProcessState] = {}
        self._normalization_dirty = False

    def _proc_seed(self, pid: str, idx: int):
        # produce a per-process seed derived from global RNG for reproducibility
        return self.global_rng.randint(0, 2**31 - 1)

    def create_process(self, pid: str, arrival: float, burst: float, pages_count: int, access_pattern: Optional[str] = None, idx: int = 0) -> ProcessState:
        proc_rng = random.Random(self._proc_seed(pid, idx))
        gen = PageGenerator(pages_count, proc_rng, access_pattern or self.cfg.access_pattern, self.cfg.hotspot_frac, self.cfg.hotspot_prob)
        proc = ProcessState(pid=pid, arrival=arrival, burst=burst, remaining=burst, pages_count=int(pages_count or 1), generator=gen, sliding_window=deque(maxlen=self.cfg.window_access_count))
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


def simulate_rr_with_quanta(processes: List[str], bursts: Dict[str, float], quanta: Dict[str, int], arrivals: Dict[str, int]) -> List[Tuple[str, int, int]]:
    rem: Dict[str, int] = {p: max(0, int(round(bursts.get(p, 0)))) for p in processes}
    arr: Dict[str, int] = {p: int(round(arrivals.get(p, 0))) for p in processes}
    qmap: Dict[str, int] = {p: max(1, int(round(quanta.get(p, 1)))) for p in processes}
    future = sorted([(arr[p], p) for p in processes], key=lambda x: (x[0], x[1]))
    future_idx = 0
    now = 0
    timeline: List[Tuple[str, int, int]] = []
    ready: Deque[str] = deque()
    def push_arrivals_up_to(t):
        nonlocal future_idx
        while future_idx < len(future) and future[future_idx][0] <= t:
            _, pid = future[future_idx]
            if rem.get(pid, 0) > 0 and pid not in ready:
                ready.append(pid)
            future_idx += 1
    push_arrivals_up_to(now)
    if not ready and future_idx < len(future):
        now = future[future_idx][0]
        push_arrivals_up_to(now)
    while ready:
        pid = ready.popleft()
        if rem.get(pid, 0) <= 0:
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
        timeline.append((pid, start, end))
        rem[pid] = rem.get(pid, 0) - use
        now = end
        push_arrivals_up_to(now)
        if rem[pid] > 0:
            ready.append(pid)
        if not ready:
            for p in processes:
                if rem.get(p, 0) > 0 and arr.get(p, 0) <= now and p not in ready:
                    ready.append(p)
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
    if not pids:
        return ({p: 0 for p in pids}, {p: 0 for p in pids}, 0.0, 0)
    if not timeline:
        return ({p: 0 for p in pids}, {p: 0 for p in pids}, 0.0, 0)
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
    total_time = int(max_end)
    waiting: Dict[str, int] = {}
    turnaround: Dict[str, int] = {}
    total_cpu_time = 0.0
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


def build_cpu_series(timeline: List[Tuple[str, int, int]], total_time: int) -> List[Dict[str, int]]:
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
    trace: List[TraceEntry] = []
    for pid, s, e in timeline:
        if s < e:
            trace.append(TraceEntry(time=int(s), event="running", pid=pid))
            trace.append(TraceEntry(time=int(e), event="stopped", pid=pid))
    def key_fn(x: TraceEntry):
        order = 0 if x.event == "stopped" else 1
        return (int(x.time), order, str(x.pid))
    trace.sort(key=key_fn)
    return trace


def _compute_avg_from_map(m: Optional[Dict[str, float]]) -> float:
    if not m:
        return 0.0
    vals = [float(v) for v in m.values() if v is not None]
    if not vals:
        return 0.0
    return sum(vals) / len(vals)


def compute_real_cpu_util_from_series(cpu_series: List[Dict[str, int]]) -> float:
    if not cpu_series:
        return 0.0
    occupied_count = sum(1 for p in cpu_series if int(p.get("cpu", 0)) > 0)
    return (occupied_count / len(cpu_series)) * 100.0


def simulate_baseline(config: SystemConfig) -> SimulationResult:
    processes = [p.pid for p in config.processes]
    initial_bursts = {p.pid: p.burst_time for p in config.processes}
    arrivals = {p.pid: p.arrival_time for p in config.processes}
    fixed_quantum = config.cpu_quantum
    quanta = {p: fixed_quantum for p in processes}
    timeline = simulate_rr_with_quanta(processes, initial_bursts, quanta, arrivals)
    waiting_times, turnaround_times, _prev_cpu_util, total_time = compute_metrics(processes, initial_bursts, timeline, arrivals)
    ctx = count_context_switches(timeline)
    avg_wait = _compute_avg_from_map(waiting_times)
    avg_tat = _compute_avg_from_map(turnaround_times)
    meta = {"avg_wait": avg_wait, "avg_turnaround": avg_tat}
    cpu_series = build_cpu_series(timeline, total_time)
    cpu_util_from_series = compute_real_cpu_util_from_series(cpu_series)
    return SimulationResult(turnaround_times=turnaround_times, waiting_times=waiting_times, cpu_utilization=cpu_util_from_series, total_time=total_time, context_switches=ctx, trace=generate_trace(timeline), inferred_quanta={p: fixed_quantum for p in processes}, memory_estimates={}, cpu_series=cpu_series, meta=meta)


def simulate_memory_aware(config: SystemConfig) -> SimulationResult:
    processes = [p.pid for p in config.processes]
    initial_bursts = {p.pid: p.burst_time for p in config.processes}
    arrivals = {p.pid: p.arrival_time for p in config.processes}
    base_q = config.cpu_quantum

    # Create memory model with non-deterministic global RNG unless user explicitly provided seed
    mm = MemoryModel(MemoryModelConfig(base_q=base_q, rng_seed=(config.rng_seed if hasattr(config, "rng_seed") else None)))

    # patterns: choose randomly per-process (not just rotate), increases chance of divergence
    patterns = ["locality", "random", "sequential"]
    global_choice_rng = random.Random(None if getattr(mm.cfg, "rng_seed", None) is None else mm.cfg.rng_seed)

    # Ensure pages_count is >= 4 when input is too small or unspecified (helps produce variation)
    for idx, p in enumerate(config.processes):
        pages = (p.pages_count or 0)
        if not pages or pages <= 1:
            pages = global_choice_rng.randint(4, 24)
        patt = patterns[global_choice_rng.randint(0, len(patterns) - 1)]
        mm.create_process(p.pid, p.arrival_time, p.burst_time, pages, access_pattern=patt, idx=idx)

    # Run more observation iterations when we expect low signal; 12 is default, bump to 16
    iterations = 16
    for _ in range(iterations):
        for pid in processes:
            q = mm.get_effective_quantum(pid, base_q)
            obs = mm.observe_run(pid, run_time=max(1, q))
            mm.update_signal(pid, obs)
        mm.recompute_normalization()

    memory_quanta = {p: mm.get_effective_quantum(p, base_q) for p in processes}
    memory_est = {p: mm.get_estimated_memory_mb(p) for p in processes}

    timeline = simulate_rr_with_quanta(processes, initial_bursts, memory_quanta, arrivals)
    waiting_times, turnaround_times, _prev_cpu_util, total_time = compute_metrics(processes, initial_bursts, timeline, arrivals)
    ctx = count_context_switches(timeline)
    avg_wait = _compute_avg_from_map(waiting_times)
    avg_tat = _compute_avg_from_map(turnaround_times)
    meta = {"avg_wait": avg_wait, "avg_turnaround": avg_tat}

    cpu_series = build_cpu_series(timeline, total_time)
    cpu_util = compute_real_cpu_util_from_series(cpu_series)

    # Attach debug info to meta so frontend can show it when debugging
    meta["memory_quanta"] = memory_quanta
    meta["memory_estimates"] = memory_est
    # include a tiny sample of per-process mem_signal if desired
    try:
        meta["mem_signals"] = {pid: mm.processes[pid].mem_signal for pid in processes}
    except Exception:
        meta["mem_signals"] = None

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


def compare_schedulers(config: SystemConfig) -> CompareBundle:
    return CompareBundle(baseline=simulate_baseline(config), memory_aware=simulate_memory_aware(config))
