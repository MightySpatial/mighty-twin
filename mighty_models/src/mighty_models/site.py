"""Site model.

Every Mighty instance hosts one or more sites. A site is the container for
layers, widgets, and feature data. Critically, each site declares its
**storage CRS** — the EPSG SRID that feature tables under this site use
for storage. The viewer always reads from the _wgs84 reprojection views,
so clients stay CRS-agnostic (see
``docs/architecture/crs-storage-and-views.md``).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .types import GUID, JSONType


class Base(DeclarativeBase):
    """Shared declarative base for mighty_models. Consumer apps can extend
    with their own tables by inheriting from this base so every model lives
    under one metadata instance (enables a single Alembic migration tree)."""


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String)

    #: EPSG SRID used for storing feature geometries under this site. The
    #: companion _wgs84 view always reprojects to 4326 for the viewer API.
    #: Default 4326 (no transform needed) is appropriate for continental /
    #: basemap data. Engineering sites typically override to a local
    #: projected CRS — e.g. 28350 for MGA2020 Zone 50 in Western Australia.
    storage_srid: Mapped[int] = mapped_column(Integer, nullable=False, default=4326)

    #: Branding + config blob. Schema-less on purpose; Pydantic schemas in
    #: the API layer validate the shape for each consumer.
    config: Mapped[dict] = mapped_column(JSONType, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Site {self.slug} srid={self.storage_srid}>"
