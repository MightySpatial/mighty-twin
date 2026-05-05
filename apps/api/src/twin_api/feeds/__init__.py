"""Feed adapter registry — T+960.

Each adapter implements ``fetch(feed) -> Iterable[NormalisedRow]`` where
a NormalisedRow is::

    {"geometry": <GeoJSON dict | None>, "properties": <dict>, "_source_key": str | None}

The dispatcher resolves a feed.kind to the right adapter at runtime,
applies the geometry hint to fill in missing geometry, and hands rows
off to either the proxy reader or the materialise inserter.
"""

from .base import FeedAdapter, NormalisedRow, AdapterError, get_adapter
from .geojson_url import GeoJSONUrlAdapter
from .csv_url import CsvUrlAdapter

__all__ = [
    "FeedAdapter",
    "NormalisedRow",
    "AdapterError",
    "get_adapter",
    "GeoJSONUrlAdapter",
    "CsvUrlAdapter",
]
