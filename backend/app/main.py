# app/main.py
from __future__ import annotations
import os
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.base import Base, engine
from .routers import config, simulate, compare, runs

app = FastAPI(title="Memory-Aware Scheduler Backend", version="2.0.0")


@app.on_event("startup")
async def on_startup() -> None:
    # Ensure DB tables exist (SQLAlchemy)
    Base.metadata.create_all(bind=engine)


def _parse_cors_origins(env_val: str | None) -> List[str]:
    if not env_val:
        return ["*"]
    items = [o.strip() for o in env_val.split(",")]
    # filter out empty strings
    items = [o for o in items if o]
    return items or ["*"]


origins = _parse_cors_origins(os.getenv("CORS_ORIGINS", None))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config.router)
app.include_router(simulate.router)
app.include_router(compare.router)
app.include_router(runs.router)


@app.get("/")
def root():
    return {"message": "Memory-Aware CPU Scheduler Backend is running!"}


# Optional: allow running via `python -m app.main` for local dev
if __name__ == "__main__":
    try:
        import uvicorn

        uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
    except Exception:
        # uvicorn not installed or failed — ignore when running as a package
        pass
