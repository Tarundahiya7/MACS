# test_scheduler.py
from pprint import pprint
from app.core.scheduler import simulate_baseline, simulate_memory_aware
from app.models.schemas import SystemConfig, Process

# Build SystemConfig-like object quickly (if your pydantic model uses different names adjust accordingly)
procs = [
    Process(pid="P1", arrival_time=0, burst_time=8, priority=0, pages_count=100),
    Process(pid="P2", arrival_time=3, burst_time=5, priority=0, pages_count=100),
    Process(pid="P3", arrival_time=5, burst_time=2, priority=0, pages_count=100),
]
cfg = SystemConfig(total_frames=64, page_size=4, cpu_quantum=2, memory_threshold=2.0, cpu_idle_gap=1, processes=procs)

print("=== Baseline ===")
b = simulate_baseline(cfg)
pprint({
    "total_time": b.total_time,
    "cpu_util": b.cpu_utilization,
    "ctx": b.context_switches,
    "inferred_quanta": getattr(b, "inferred_quanta", None),
    "memory_estimates": getattr(b, "memory_estimates", None),
})
print("timeline:", b.memory_timeline)
print("trace sample:", b.trace[:20])

print("\n=== Memory-aware ===")
m = simulate_memory_aware(cfg)
pprint({
    "total_time": m.total_time,
    "cpu_util": m.cpu_utilization,
    "ctx": m.context_switches,
    "inferred_quanta": getattr(m, "inferred_quanta", None),
    "memory_estimates": getattr(m, "memory_estimates", None),
})
print("timeline:", m.memory_timeline)
print("trace sample:", m.trace[:40])
