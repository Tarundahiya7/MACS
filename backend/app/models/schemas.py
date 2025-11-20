# backend/app/models/schemas.py
from __future__ import annotations
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field, root_validator

# ---------- Process and Input models ----------

class ProcessInput(BaseModel):
    pid: str
    arrival_time: int = Field(ge=0)
    burst_time: int = Field(ge=0)
    priority: Optional[int] = Field(default=0)
    pages_count: Optional[int] = Field(default=1)


class SimulationInput(BaseModel):
    system: Dict[str, Any]
    processes: List[ProcessInput]


# ---------- Canonical SystemConfig used by core.scheduler ----------

class SystemConfig(BaseModel):
    total_frames: int = Field(ge=0)
    page_size: int = Field(ge=1)
    cpu_quantum: int = Field(ge=1)
    memory_threshold: Optional[int] = None
    cpu_idle_gap: Optional[int] = 1
    processes: List[ProcessInput]

    @classmethod
    def model_validate(cls, data: Any) -> "SystemConfig":
        """
        Accept either:
          - a flat SystemConfig-like mapping: { total_frames, page_size, cpu_quantum, processes: [...] }
          - a nested payload: { system: {...}, processes: [...] }
          - a Pydantic model (has model_dump)
        This will coerce nested form into the flat canonical structure before validation.
        """
        # If already an instance, return it
        if isinstance(data, cls):
            return data

        # If it's a pydantic model or object with model_dump(), convert it first
        if hasattr(data, "model_dump"):
            try:
                data = data.model_dump()
            except Exception:
                pass

        # If not a mapping now, try to construct directly
        if not isinstance(data, dict):
            return cls((data or {}))

        # If nested shape provided (contains 'system'), flatten it
        if "system" in data and isinstance(data["system"], dict):
            system = data.get("system") or {}
            # look for processes in top-level or inside system
            procs = data.get("processes") or system.get("processes") or []
            flat = {**system, "processes": procs}
            return cls(**flat)

        # Otherwise assume it's already a flat mapping
        return cls(**data)


# ---------- AcceptsEither wrapper (router convenience) ----------

class AcceptsEither(BaseModel):
    raw: Any

    @root_validator(pre=True)
    def accept_either(cls, values):
        if "raw" in values:
            return values
        return {"raw": values}

    def is_flat(self) -> bool:
        if not isinstance(self.raw, dict):
            return False
        return any(k in self.raw for k in ("cpu_quantum", "total_frames", "page_size"))

    def to_flat(self) -> SystemConfig:
        if self.is_flat():
            return SystemConfig.model_validate(self.raw)
        raw = self.raw or {}
        system = raw.get("system") or raw.get("config") or {}
        procs = raw.get("processes") or raw.get("processes_list") or []
        return SystemConfig.model_validate({**system, "processes": procs})


# ---------- Trace + SimulationResult models ----------

class TraceEntry(BaseModel):
    time: int
    event: str
    pid: Optional[str] = None


class SimulationResult(BaseModel):
    turnaround_times: Dict[str, int] = Field(default_factory=dict)
    waiting_times: Dict[str, int] = Field(default_factory=dict)
    cpu_utilization: float = 0.0
    total_time: int = 0
    context_switches: int = 0
    trace: List[TraceEntry] = Field(default_factory=list)
    inferred_quanta: Dict[str, int] = Field(default_factory=dict)
    memory_estimates: Dict[str, int] = Field(default_factory=dict)
    cpu_series: Optional[List[Dict[str, Any]]] = None
    memory_timeline: Optional[List[Any]] = None
    meta: Optional[Dict[str, Any]] = None


class CompareBundle(BaseModel):
    baseline: SimulationResult
    memory_aware: SimulationResult


# ---------- Runs API models (added to fix ImportError) ----------

class SaveRunRequest(BaseModel):
    """
    Payload the frontend may POST to save a run on the backend.
    Mirrors the localStorage record structure used in the frontend:
      { id, name, input, results, created_at }
    """
    id: Optional[str] = None
    name: Optional[str] = None
    input: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None


class SavedRun(BaseModel):
    """
    Model returned by GET /runs (or by POST after saving).
    """
    id: str
    name: Optional[str] = None
    input: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None

