"""Layer + DataSource models — ports MightyDT's spatial layer model.

A Site has many Layers; each Layer references a DataSource (the file/URL
backing it). DataSources can be reused across sites. Both Layer and
DataSource carry JSON config blobs for style and attribute schema —
those rotate too quickly to warrant column-per-knob.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .site import Base, Site
from .types import GUID, JSONType


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    #: 'geojson' | 'csv' | 'shp' | '3d-tiles' | 'splat' | 'wms' | 'wmts' |
    #: 'ifc' | 'las' | 'table' (non-spatial). Free-form to keep evolution
    #: cheap; API-layer Pydantic enum-validates.
    type: Mapped[str] = mapped_column(String(64), nullable=False)

    #: Bucket key or external URL. NULL when the data is held inline in
    #: ``attributes`` (small CSV imports, quick prototypes).
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    #: Bytes when stored — for quota / display. None when external URL.
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    #: Free-form attribute schema + per-source config (CRS, encoding, …).
    attributes: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)

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

    layers: Mapped[list["Layer"]] = relationship(back_populates="data_source")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DataSource {self.name} type={self.type}>"


class Layer(Base):
    __tablename__ = "layers"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("data_sources.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)

    #: 0–1 inclusive. 0.5 default so a freshly added layer doesn't clobber
    #: visibility of others.
    opacity: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    #: Visible by default; admins/users can toggle off.
    visible: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)

    #: Z-ordering within a site, lower renders below.
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    #: Style + per-layer config (e.g. pipe radius, extrusion, label fields).
    style: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    layer_metadata: Mapped[dict] = mapped_column(
        JSONType, nullable=False, default=dict
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

    site: Mapped[Site] = relationship()
    data_source: Mapped[DataSource | None] = relationship(back_populates="layers")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Layer {self.name} site={self.site_id}>"
