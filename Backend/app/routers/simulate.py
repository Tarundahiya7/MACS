# backend/app/routers/simulate.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from typing import Any, Mapping
from collections.abc import Mapping as MappingABC

from ..models.schemas import AcceptsEither, SimulationInput, SimulationResult, SystemConfig
from ..core.scheduler import simulate_baseline, simulate_memory_aware

router = APIRouter(prefix="/simulate", tags=["Simulation"])


def _to_system_config(obj: Any) -> SystemConfig:
    """
    Normalize incoming payload to a validated SystemConfig instance.

    Accepts:
      - AcceptsEither (already a helper that can be flattened via .to_flat())
      - SimulationInput (nested form that should be validated and converted)
      - SystemConfig (already validated)
      - Raw dict-like payloads (attempt model validation)

    Returns:
      - SystemConfig instance

    Raises:
      - HTTPException(422) when conversion/validation fails
    """
    # If the helper wrapper was used (AcceptsEither), normalize via to_flat()
    if isinstance(obj, AcceptsEither):
        try:
            flat = obj.to_flat()
            if isinstance(flat, SystemConfig):
                return flat
            return SystemConfig.model_validate(flat)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Invalid AcceptsEither payload: {e}")

    # Already a SystemConfig instance
    if isinstance(obj, SystemConfig):
        return obj

    # SimulationInput model instance (nested form)
    if isinstance(obj, SimulationInput):
        try:
            return SystemConfig.model_validate(obj.model_dump())
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Invalid SimulationInput payload: {e}")

    # Fallback: raw dict-like payload
    try:
        if hasattr(obj, "model_dump"):
            # Pydantic model (v2) or similar
            raw = obj.model_dump()
        elif isinstance(obj, MappingABC) or isinstance(obj, Mapping):
            raw = dict(obj)
        else:
            # last resort: try to use as-is (could be flat dict already)
            raw = obj

        return SystemConfig.model_validate(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Unable to convert payload to SystemConfig: {e}")


@router.post("/baseline", response_model=SimulationResult)
def baseline(config: AcceptsEither | SimulationInput | dict):
    """
    Run baseline simulation.

    Accepts:
      - AcceptsEither (flat or nested helper)
      - SimulationInput (nested)
      - raw dict that matches either shape
    """
    cfg = _to_system_config(config)
    return simulate_baseline(cfg)


@router.post("/memory-aware", response_model=SimulationResult)
def memory_aware(config: AcceptsEither | SimulationInput | dict):
    """
    Run memory-aware simulation.

    Same accepted input shapes as /baseline.
    """
    cfg = _to_system_config(config)
    return simulate_memory_aware(cfg)
