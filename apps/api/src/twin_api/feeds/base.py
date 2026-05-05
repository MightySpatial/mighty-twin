"""Adapter base class + registry + geometry-hint resolver.

Adapters are responsible for fetching raw rows from the source. The
geometry-hint resolver lifts properties into geometry where the source
is tabular. This separation lets us share resolver logic across CSV,
XLSX, Sheets, and any future tabular adapter.
"""

from __future__ import annotations

import abc
import json
import re
from typing import Any, Iterable, TypedDict

from mighty_models import Feed


class AdapterError(Exception):
    """Raised when an adapter fails to fetch or parse."""


class NormalisedRow(TypedDict, total=False):
    geometry: dict[str, Any] | None
    properties: dict[str, Any]
    #: Stable identity for drift detection — used as the upsert key on
    #: re-materialisation. Adapters set this when the source has a
    #: natural primary key (e.g. CSV row's ``id`` column).
    source_key: str | None


class FeedAdapter(abc.ABC):
    """Adapter contract. Sub-classes register themselves via ``kind``."""

    kind: str = ""

    @abc.abstractmethod
    def fetch(self, feed: Feed) -> Iterable[NormalisedRow]:
        """Yield normalised rows for the given feed.

        Implementations should return a generator/iterable so the
        materialise inserter can stream into the DB without loading
        the full payload into memory.
        """
        raise NotImplementedError


_REGISTRY: dict[str, type[FeedAdapter]] = {}


def register(cls: type[FeedAdapter]) -> type[FeedAdapter]:
    if not cls.kind:
        raise ValueError(f"{cls.__name__} must declare a non-empty .kind")
    _REGISTRY[cls.kind] = cls
    return cls


def get_adapter(kind: str) -> FeedAdapter:
    cls = _REGISTRY.get(kind)
    if cls is None:
        raise AdapterError(f"No adapter registered for kind={kind!r}")
    return cls()


# ── Geometry-hint resolver ──────────────────────────────────────────────


_WKT_POINT_RE = re.compile(
    r"^\s*POINT\s*\(\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s*\)\s*$",
    re.IGNORECASE,
)


def apply_geometry_hint(
    row: NormalisedRow, hint: dict[str, Any]
) -> NormalisedRow:
    """Apply a feed's geometry_hint to a row in place. Returns the row.

    For ``native`` hints we trust the adapter — they already produced a
    GeoJSON geometry. For ``columns`` we lift lng/lat columns into a
    Point. For ``wkt`` we parse the configured column. For
    ``attribute_only`` we leave geometry as None — the row stays a
    pure attribute record (joined to spatial features at query time).
    """
    kind = (hint or {}).get("kind", "native")
    if kind == "native":
        return row
    properties = row.get("properties") or {}
    if kind == "columns":
        lng_col = hint.get("lng") or hint.get("longitude") or "longitude"
        lat_col = hint.get("lat") or hint.get("latitude") or "latitude"
        try:
            lng = float(properties.get(lng_col))
            lat = float(properties.get(lat_col))
        except (TypeError, ValueError):
            row["geometry"] = None
            return row
        row["geometry"] = {
            "type": "Point",
            "coordinates": [lng, lat],
        }
        return row
    if kind == "wkt":
        col = hint.get("column", "geom")
        wkt = properties.get(col)
        row["geometry"] = _wkt_to_geojson(wkt) if isinstance(wkt, str) else None
        return row
    if kind == "attribute_only":
        row["geometry"] = None
        return row
    raise AdapterError(f"Unknown geometry_hint.kind={kind!r}")


def _wkt_to_geojson(wkt: str) -> dict[str, Any] | None:
    """Tiny WKT parser — covers POINT for now. Returns None for
    unsupported types so the inserter can skip the row gracefully.

    For broader WKT support we'd shell out to shapely; keeping this
    stdlib-only avoids the dependency unless someone actually feeds
    LineStrings/Polygons from a WKT column. The day that happens we
    swap this for ``shapely.wkt.loads(...).__geo_interface__``.
    """
    if not wkt:
        return None
    m = _WKT_POINT_RE.match(wkt)
    if m:
        try:
            return {
                "type": "Point",
                "coordinates": [float(m.group(1)), float(m.group(2))],
            }
        except (TypeError, ValueError):
            return None
    return None


def parse_json_safe(raw: str | bytes) -> Any:
    """JSON parse that returns None on failure rather than raising."""
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
