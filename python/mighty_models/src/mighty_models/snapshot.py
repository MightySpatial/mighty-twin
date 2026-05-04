"""User snapshots — port of MightyDT's user_snapshots model.

Lazy-persistence pattern from `project_twin_sheets_integration.md`:
big things stay client-side until the user takes a snapshot, at which
point the session state (camera + layer visibility + ephemeral data)
serialises into payload (Postgres) and a companion S3 blob (per-user
prefix, 25 MB quota — see user_json storage).

`shared_to_gallery` flips a snapshot into the site-level gallery so any
user with site access can see it. Site-level sharing is sufficient per
Rahman 2026-05-04.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .site import Base
from .types import GUID, JSONType


class Snapshot(Base):
    __tablename__ = "user_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("sites.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    #: JSON state — camera + layer visibility + ephemeral data references.
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)

    #: When true, anyone with access to the parent site sees this snapshot.
    shared_to_gallery: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

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
        return f"<Snapshot {self.name!r} user={self.user_id} site={self.site_id}>"


class SketchLayer(Base):
    """Persisted Sketch layer — replaces the in-memory React state in
    apps/web/src/viewer/widgets/design/. Owned by a user; can be tied
    to a site (most are) or be a free-floating sketchbook. Features
    serialise as a JSON list — same shape the in-memory model uses, no
    schema migration needed when fields rotate.
    """

    __tablename__ = "sketch_layers"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("sites.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    #: List of SketchFeature dicts (geometry, style, attributes, …).
    features: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)

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
        return f"<SketchLayer {self.name!r} user={self.user_id}>"
