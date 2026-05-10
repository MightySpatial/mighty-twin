"""3D model library — backs the Design widget's "Import Objects" panel.

Users upload GLB / glTF / STL / IFC files; the API stores the source
file in the per-user S3 prefix and (for IFC) runs ifcopenshell+trimesh
to extract a renderable GLB plus the file's georeferencing block. The
list is browsed in the Design widget's Download tab and dropped onto
the globe via the place-along-line / place-at-point flows.

Spec §3 (design_models table), §4 (POST /api/design/models endpoints).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .site import Base
from .types import GUID, JSONType


class DesignModel(Base):
    __tablename__ = "design_models"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)

    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    #: Optional site affinity. NULL = visible across the org library.
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("sites.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    #: Free-form category — matches the Design widget's IFC class filter
    #: ('IfcWall', 'IfcDoor', …) or a user category for non-IFC uploads.
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="custom")

    tags: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)

    #: Source upload format. IFC uploads carry both `format='ifc'` AND a
    #: storage_key pointing at the converted GLB; the original IFC sits
    #: under storage_key + '.source.ifc'.
    format: Mapped[str] = mapped_column(String(16), nullable=False)

    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    thumbnail_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    #: Georeference if extracted from the source (IFCSite / glTF Asset
    #: extras). Empty dict means un-georeferenced — the user must place
    #: manually via the manual-georeferencing panel.
    georeference: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)

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
        return f"<DesignModel {self.name!r} format={self.format}>"
