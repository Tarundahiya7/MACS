# backend/app/routers/config.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from typing import Any, Dict

from ..models.schemas import SystemConfig, SimulationInput, AcceptsEither
import json
from pathlib import Path

router = APIRouter(prefix="/config", tags=["Configuration"])


def _to_flat_system_config(payload: AcceptsEither | SimulationInput) -> SystemConfig:
    """
    Normalize either an AcceptsEither or a SimulationInput into a flat SystemConfig.
    Uses the same wrapping approach as compare.router to avoid Pydantic internals surprises.
    """
    if isinstance(payload, AcceptsEither):
        return payload.to_flat()

    # payload is SimulationInput (pydantic model) — convert to dict then wrap
    raw = payload.model_dump() if hasattr(payload, "model_dump") else dict(payload)
    wrapper = AcceptsEither(raw=raw)
    return wrapper.to_flat()


@router.post("/submit")
def receive_config(payload: AcceptsEither | SimulationInput):
    """
    Accept either:
      - SimulationInput (nested { system, processes })
      - or AcceptsEither (flattened fields or nested) — AcceptsEither.to_flat() will normalize.
    Returns the normalized SystemConfig dict back to the caller.
    """
    flat: SystemConfig = _to_flat_system_config(payload)
    return {"message": "Configuration received successfully!", "data": flat.model_dump()}


# Backwards-compat POST /config (fallback) so client fallback works
@router.post("/")
def receive_config_root(payload: AcceptsEither | SimulationInput):
    flat: SystemConfig = _to_flat_system_config(payload)
    return {"message": "Configuration received successfully!", "data": flat.model_dump()}


@router.get("/sample")
def sample_config():
    p = Path(__file__).resolve().parents[1] / "sample_config.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"sample_config.json not found at {p}")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"sample_config.json is invalid JSON: {exc}")
    return data
