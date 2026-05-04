"""MightyTwin API — FastAPI + PostgreSQL/PostGIS.

Boots a session-bound engine in the lifespan, exposes a typed dependency
for request-scoped DB sessions, and serves the consolidated route catalog
(currently: sites). Auth/users/layers/uploads land in subsequent phases.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from mighty_db import get_engine, get_session_factory
from mighty_models import Site

from .config import Settings, get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    engine = get_engine(settings.database_url, pool_pre_ping=True)
    session_factory = get_session_factory(engine)
    app.state.engine = engine
    app.state.session_factory = session_factory
    try:
        yield
    finally:
        engine.dispose()


def get_db(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.session_factory
    session: Session = session_factory()
    try:
        yield session
    finally:
        session.close()


DbSession = Annotated[Session, Depends(get_db)]


app = FastAPI(
    title="MightyTwin API",
    version="0.1.0",
    description="Enterprise digital twin — Postgres/PostGIS backend.",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": "mighty-twin"}


@app.get("/api/sites")
def list_sites(db: DbSession) -> dict[str, object]:
    """Return all sites the caller can see. Auth gating lands in Phase B —
    today every authenticated proxy hit reaches every site.
    """
    sites = db.execute(select(Site).order_by(Site.name)).scalars().all()
    return {
        "data": [
            {
                "id": str(site.id),
                "slug": site.slug,
                "name": site.name,
                "description": site.description,
                "storage_srid": site.storage_srid,
                **(site.config or {}),
            }
            for site in sites
        ],
    }
