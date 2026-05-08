"""mighty_db — SQLAlchemy engine and session factory for Mighty backends.

Exposes:
- `get_engine(database_url)` — builds an engine, loading the SpatiaLite
  extension when the URL is SQLite-backed.
- `get_session_factory(engine)` — returns a session factory suitable for
  FastAPI dependency injection.
- `spatialite.load_spatialite_ext(engine)` — hook registered on engine
  `connect` events when SQLite is the target dialect.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .spatialite import load_spatialite_ext

__all__ = ["get_engine", "get_session_factory", "load_spatialite_ext"]
__version__ = "0.1.0"


def get_engine(database_url: str, **engine_kwargs: Any) -> Engine:
    """Build a SQLAlchemy engine. When the URL is SQLite-backed, register a
    connect listener that loads `mod_spatialite` so spatial functions are
    available. Extra kwargs pass straight through to ``create_engine``.
    """
    engine = create_engine(database_url, **engine_kwargs)
    if engine.dialect.name == "sqlite":
        load_spatialite_ext(engine)
    return engine


def get_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Build a session factory bound to ``engine``. ``expire_on_commit=False``
    so detached ORM objects stay usable after commit (FastAPI response
    serialisation hits this routinely).
    """
    return sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
