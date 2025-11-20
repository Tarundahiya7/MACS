# backend/app/routers/runs.py
from __future__ import annotations
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.base import get_session
from ..db.models import Run
from ..models.schemas import SaveRunRequest

router = APIRouter(prefix="/runs", tags=["Runs"])


def _normalize_payload_field(value: Any) -> Optional[Dict[str, Any]]:
    """
    Accept either a plain dict (from JSON) or a Pydantic model with model_dump().
    Return a dict or None.
    """
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump()
        except Exception:
            # fallback to raw value if model_dump fails
            pass
    # assume it's already a plain mapping-like object
    if isinstance(value, dict):
        return value
    # last-resort: try to coerce to dict
    try:
        return dict(value)
    except Exception:
        return {"value": value}


@router.get("/")
def list_runs(db: Session = Depends(get_session)):
    rows = db.query(Run).order_by(Run.id.desc()).limit(200).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "created_at": getattr(r.created_at, "isoformat", lambda: str(r.created_at))(),
            "input": r.input,
            "results": r.results,
        }
        for r in rows
    ]


@router.post("/")
def save_run(req: SaveRunRequest, db: Session = Depends(get_session)):
    # Normalize input/results whether they are dicts or pydantic models
    input_data = _normalize_payload_field(req.input)
    results_data = _normalize_payload_field(req.results)

    name = req.name or "Run"
    row = Run(name=name, input=input_data, results=results_data)

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save run: {exc}")

    return {
        "id": row.id,
        "name": row.name,
        "created_at": getattr(row.created_at, "isoformat", lambda: str(row.created_at))(),
        "input": row.input,
        "results": row.results,
    }
