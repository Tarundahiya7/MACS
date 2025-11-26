# debug_scheduler_test.py
from pprint import pprint

# ---- use relative imports (matches your backend structure) ----
from .core import scheduler
from .models import schemas as models


def build_cfg():
    procs = [
        models.Process(pid="P1", arrival_time=0, burst_time=8, priority=0, pages_count=100),
        models.Process(pid="P2", arrival_time=3, burst_time=5, priority=0, pages_count=100),
        models.Process(pid="P3", arrival_time=5, burst_time=2, priority=0, pages_count=100),
    ]
    cfg = models.SystemConfig(
        total_frames=64,
        page_size=4,
        cpu_quantum=2,
        memory_threshold=2.0,
        cpu_idle_gap=1,
        processes=procs
    )
    return cfg


def debug_memory_model(cfg):
    mm = scheduler.MemoryModel(
        scheduler.MemoryModelConfig(
            base_q=int(cfg.cpu_quantum),
            rng_seed=42
        )
    )

    for p in cfg.processes:
        mm.create_process(
            p.pid, p.arrival_time, p.burst_time, getattr(p, "pages_count", 0)
        )

    print("\n--- Warmup EMA + mem_signal per iteration ---")
    for it in range(12):
        for pid in [p.pid for p in cfg.processes]:
            q_obs = mm.get_effective_quantum(pid, int(cfg.cpu_quantum))
            obs = mm.observe_run(pid, run_time=q_obs)
            mm.update_signal(pid, obs)
        mm.recompute_normalization()

        print(f"Iteration {it+1}")
        for pid, ps in mm.processes.items():
            print(f" {pid}: ema={ps.ema:.6f}, mem_signal={ps.mem_signal:.6f}")

    print("\n--- FINAL MEMORY SIGNALS ---")
    memory_quanta = {
        p.pid: mm.get_effective_quantum(p.pid, int(cfg.cpu_quantum))
        for p in cfg.processes
    }
    memory_estimates = {
        p.pid: mm.get_estimated_memory_mb(p.pid)
        for p in cfg.processes
    }
    pprint({"quanta": memory_quanta, "memory_estimates": memory_estimates})

    # Timeline debugging
    processes = [p.pid for p in cfg.processes]
    bursts = {p.pid: p.burst_time for p in cfg.processes}
    arrivals = {p.pid: p.arrival_time for p in cfg.processes}

    timeline = scheduler.simulate_rr_with_quanta(
        processes,
        bursts,
        memory_quanta,
        arrivals,
    )

    waiting, turnaround, cpu_util, total_time = scheduler.compute_metrics(
        processes, bursts, timeline, arrivals
    )

    print("\n--- Timeline ---")
    pprint(timeline)

    print("\n--- Metrics ---")
    pprint({
        "waiting": waiting,
        "turnaround": turnaround,
        "cpu_util": cpu_util,
        "total_time": total_time
    })


if __name__ == "__main__":
    cfg = build_cfg()
    debug_memory_model(cfg)
