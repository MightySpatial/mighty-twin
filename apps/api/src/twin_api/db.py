"""Database dependency-injection helpers shared across routers.

The engine + session factory are built once in main.py's lifespan and
stored on app.state. This module exposes the FastAPI Depends-friendly
``get_db`` and the ``DbSession`` annotated alias so individual routers
don't need to import from main.py (which would create a circular import
once main.py imports the routers).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session


def get_db(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.session_factory
    session: Session = session_factory()
    try:
        yield session
    finally:
        session.close()


DbSession = Annotated[Session, Depends(get_db)]
