# backend/app/db/base.py
from __future__ import annotations
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_URL = os.getenv("DB_URL", "sqlite:///./app.db")

# Create engine (with safe defaults for SQLite + production DBs)
engine = create_engine(
    DB_URL,
    connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)

# SQLAlchemy 2.x recommended sessionmaker configuration
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,   # prevents detached objects after commit
    bind=engine,
)

# Base class for models
class Base(DeclarativeBase):
    pass

# DB dependency injection
def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
