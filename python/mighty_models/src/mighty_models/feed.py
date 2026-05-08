"""External data feed — T+960.

A Feed is a recurring connection to an external source (URL, OGC API,
ArcGIS REST, Sheets workbook, etc.). The adapter behind a feed knows
how to fetch + parse + normalise rows. Layers can reference a feed via
``Layer.feed_id``; the layer's ``materialisation`` enum decides whether
the viewer reads through to the feed live (proxy) or whether the
adapter writes rows into the spatial features table (materialised).

Feeds are workspace-level resources — multiple sites and layers can
share the same feed. Layer-level overrides (visible columns, geometry
hint overrides) live on Layer.layer_metadata.

The geometry hint declares how to extract or attach geometry to each
row, and is the bridge between tabular feeds and spatial layers:

  {"kind": "native"}                     — adapter returns GeoJSON
  {"kind": "columns", "lng": "x", "lat": "y", "srid": 4326}
                                          — promote lng/lat columns
  {"kind": "wkt", "column": "geom", "srid": 28350}
                                          — parse WKT in source SRID
  {"kind": "attribute_only", "join_key": "asset_id"}
                                          — no geometry; join to layer
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .site import Base
from .types import GUID, JSONType


class Feed(Base):
    __tablename__ = "feeds"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    #: Adapter kind. Validated at the API layer against the registered
    #: adapter set so unknown kinds fail loudly rather than silently
    #: producing zero rows.
    #:
    #: Known kinds at T+960:
    #:   geojson_url, csv_url, xlsx_url, wmts, wms, xyz,
    #:   ogc_api_features, arcgis_rest, sheets_workbook, postgis_direct
    kind: Mapped[str] = mapped_column(String(64), nullable=False)

    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    #: Optional auth credential reference. Stored as a JSON envelope so
    #: future credential kinds (api_key / basic / bearer / oauth) all
    #: fit; secret values are not stored here directly — they reference
    #: a vault key or env-var name (ref-by-name pattern).
    auth: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)

    #: 'on_demand' | 'scheduled' | 'webhook'.
    refresh: Mapped[str] = mapped_column(
        String(32), nullable=False, default="on_demand"
    )
    schedule_cron: Mapped[str | None] = mapped_column(String(64), nullable=True)

    #: SRID the source publishes in. Defaults to 4326 (WGS84). Only
    #: meaningful for spatial feeds; attribute-only feeds set it to 0.
    source_srid: Mapped[int] = mapped_column(Integer, nullable=False, default=4326)

    #: Geometry-hint envelope — see module docstring for shapes.
    geometry_hint: Mapped[dict[str, Any]] = mapped_column(
        JSONType, nullable=False, default=lambda: {"kind": "native"}
    )

    #: Adapter-specific config (table name, layer index, column
    #: filters, paging hints). Free-form JSON.
    config: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)

    #: Timestamp + opaque revision tag from the most recent successful
    #: fetch. Drift detection compares this against current source.
    last_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_revision: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String, nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

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
        return f"<Feed {self.name!r} kind={self.kind}>"
