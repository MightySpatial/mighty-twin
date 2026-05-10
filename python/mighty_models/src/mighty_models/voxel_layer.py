"""Voxel layers — Design widget v2 voxel storage.

Each row owns one .esv document (versioned voxel layer JSON) stored as a
blob alongside the row in object/file storage. The Postgres row holds
the metadata the listing UI needs (name, scope, datum, block_count) so
the API can answer ``GET /voxel-layers`` without unmarshalling the full
.esv on every request.

Two scopes:
  * ``site``   — published, shared with everyone on the site.
  * ``sketch`` — per-user draft. ``owner_email`` filters listings.

The ``id`` is also the storage key stem — the .esv JSON lives at
``voxel-layer-{id}.json`` (or ``.json.gz`` when block_count > 1000).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .site import Base
from .types import GUID


class VoxelLayer(Base):
    __tablename__ = "voxel_layers"
    __table_args__ = (
        CheckConstraint(
            "scope IN ('site', 'sketch')", name="voxel_layers_scope_check"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    site_slug: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(String(16), nullable=False)

    #: Set for scope='sketch' rows. Null for scope='site'.
    owner_email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)

    datum_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    datum_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    datum_alt: Mapped[float | None] = mapped_column(Float, nullable=True)

    block_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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
        return f"<VoxelLayer {self.name!r} site={self.site_slug} scope={self.scope}>"
