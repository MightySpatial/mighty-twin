"""GeoJSON URL adapter — T+960.

Fetches a FeatureCollection (or single Feature, or a bare
Geometry) from a remote URL and yields one NormalisedRow per Feature.
Geometry comes through native — no hint application needed.

Auth envelopes supported:
    {"kind": "none"}                               (default)
    {"kind": "bearer", "token_env": "FOO_TOKEN"}
    {"kind": "basic",  "user_env": "U", "pass_env": "P"}
    {"kind": "header", "name": "X-API-Key", "value_env": "API_KEY"}

Network is via stdlib urllib (no extra deps). Adapter is sync and
buffers the response — fine for typical FeatureCollections (≪ 50 MB).
For larger sources the user should switch to OGC API Features which
is paged.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any, Iterable

from mighty_models import Feed

from .base import AdapterError, FeedAdapter, NormalisedRow, register


@register
class GeoJSONUrlAdapter(FeedAdapter):
    kind = "geojson_url"
    user_agent = "MightyTwin-Feed/1.0"

    def fetch(self, feed: Feed) -> Iterable[NormalisedRow]:
        if not feed.url:
            raise AdapterError("Feed has no URL")
        request = urllib.request.Request(feed.url, headers=self._headers(feed))
        try:
            with urllib.request.urlopen(request, timeout=30) as resp:
                if resp.status >= 400:
                    raise AdapterError(f"HTTP {resp.status} from {feed.url!r}")
                payload = resp.read().decode("utf-8")
        except OSError as e:
            raise AdapterError(f"Fetch failed: {e}") from e
        try:
            data = json.loads(payload)
        except ValueError as e:
            raise AdapterError(f"Response is not valid JSON: {e}") from e
        yield from _iter_features(data)

    def _headers(self, feed: Feed) -> dict[str, str]:
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "application/geo+json,application/json;q=0.9,*/*;q=0.5",
        }
        auth = feed.auth or {}
        kind = auth.get("kind", "none")
        if kind == "bearer":
            token = os.environ.get(auth.get("token_env", ""))
            if token:
                headers["Authorization"] = f"Bearer {token}"
        elif kind == "header":
            name = auth.get("name")
            value = os.environ.get(auth.get("value_env", ""))
            if name and value:
                headers[name] = value
        elif kind == "basic":
            user = os.environ.get(auth.get("user_env", ""))
            pwd = os.environ.get(auth.get("pass_env", ""))
            if user and pwd:
                import base64

                creds = base64.b64encode(f"{user}:{pwd}".encode()).decode()
                headers["Authorization"] = f"Basic {creds}"
        return headers


def _iter_features(data: Any) -> Iterable[NormalisedRow]:
    """Yield NormalisedRow per GeoJSON Feature in ``data``.

    Accepts FeatureCollection, single Feature, or bare Geometry.
    Anything else is rejected with AdapterError.
    """
    if not isinstance(data, dict):
        raise AdapterError("GeoJSON payload must be a JSON object")
    type_ = data.get("type")
    if type_ == "FeatureCollection":
        for feat in data.get("features", []) or []:
            yield from _iter_features(feat)
    elif type_ == "Feature":
        yield {
            "geometry": data.get("geometry"),
            "properties": data.get("properties") or {},
            "source_key": _str_or_none(data.get("id")),
        }
    elif type_ in {
        "Point",
        "MultiPoint",
        "LineString",
        "MultiLineString",
        "Polygon",
        "MultiPolygon",
        "GeometryCollection",
    }:
        yield {
            "geometry": data,
            "properties": {},
            "source_key": None,
        }
    else:
        raise AdapterError(f"Unsupported GeoJSON type {type_!r}")


def _str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
