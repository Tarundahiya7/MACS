# backend/app/routers/compare.py

from __future__ import annotations
from fastapi import APIRouter
from typing import Any

from ..models.schemas import AcceptsEither, SimulationInput, CompareBundle, SystemConfig
from ..core.scheduler import compare_schedulers

router = APIRouter(prefix="/compare", tags=["Comparison"])


@router.post("/", response_model=CompareBundle)
def compare(config: AcceptsEither | SimulationInput):
    """
    Accept either:
      - an AcceptsEither wrapper (our helper) -> use .to_flat()
      - a SimulationInput (pydantic model) -> wrap into AcceptsEither then .to_flat()
    This avoids directly calling SystemConfig.model_validate() which may conflict
    with Pydantic internals in some environments.
    """
    if isinstance(config, AcceptsEither):
        flat: SystemConfig = config.to_flat()
    else:
        # config is SimulationInput (pydantic model). Convert to dict then wrap.
        raw = config.model_dump() if hasattr(config, "model_dump") else dict(config)
        wrapper = AcceptsEither(raw=raw)
        flat = wrapper.to_flat()

    return compare_schedulers(flat)