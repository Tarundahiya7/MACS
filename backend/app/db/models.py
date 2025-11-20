# backend/app/db/models.py
from __future__ import annotations
import datetime
from typing import Optional

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import JSON, Integer, String, DateTime, func
from .base import Base

class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # created_at is a DateTime in the DB, so annotate with datetime.datetime
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    # allow input/results to be nullable to match optional SaveRunRequest fields;
    # the application layer can store None or a dict as appropriate
    input: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
