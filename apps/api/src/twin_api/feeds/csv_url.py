"""CSV URL adapter — T+960.

Fetches a CSV from a remote URL and yields one NormalisedRow per data
row. Geometry is *not* native here — the resolver needs a geometry
hint declaration on the feed (columns/wkt/attribute_only) to decide
how to populate the geometry field.

Auth envelopes match GeoJSONUrlAdapter (bearer/basic/header).

This is the same parser path the upload pipeline uses (csv module +
DictReader); kept inline so we don't drag a Pandas dependency for
something stdlib handles cleanly.
"""

from __future__ import annotations

import csv
import io
import os
import urllib.request
from typing import Iterable

from mighty_models import Feed

from .base import AdapterError, FeedAdapter, NormalisedRow, register


@register
class CsvUrlAdapter(FeedAdapter):
    kind = "csv_url"
    user_agent = "MightyTwin-Feed/1.0"

    def fetch(self, feed: Feed) -> Iterable[NormalisedRow]:
        if not feed.url:
            raise AdapterError("Feed has no URL")
        request = urllib.request.Request(feed.url, headers=self._headers(feed))
        try:
            with urllib.request.urlopen(request, timeout=30) as resp:
                if resp.status >= 400:
                    raise AdapterError(f"HTTP {resp.status} from {feed.url!r}")
                raw = resp.read()
        except OSError as e:
            raise AdapterError(f"Fetch failed: {e}") from e

        encoding = (feed.config or {}).get("encoding", "utf-8")
        try:
            text = raw.decode(encoding)
        except (UnicodeDecodeError, LookupError) as e:
            raise AdapterError(f"CSV decode failed ({encoding}): {e}") from e

        delimiter = (feed.config or {}).get("delimiter", ",")
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        if reader.fieldnames is None:
            return
        key_col = (feed.config or {}).get("source_key_column")
        for row in reader:
            properties = {k: _coerce_value(v) for k, v in row.items() if k}
            yield {
                "geometry": None,
                "properties": properties,
                "source_key": str(properties.get(key_col)) if key_col else None,
            }

    def _headers(self, feed: Feed) -> dict[str, str]:
        # Same auth envelope as GeoJSON adapter — keep both in sync if
        # we extend either side. Inlined to avoid a circular import.
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/csv,application/csv,*/*;q=0.5",
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


def _coerce_value(raw: str | None) -> str | int | float | bool | None:
    """Heuristic CSV value typing — rows come back as strings from
    DictReader; we promote obvious numerics + booleans + nulls so the
    JSONB properties column doesn't store every field as a string.

    Errs on the side of leaving values as strings when ambiguous.
    """
    if raw is None:
        return None
    s = raw.strip()
    if s == "":
        return None
    lower = s.lower()
    if lower in {"true", "yes"}:
        return True
    if lower in {"false", "no"}:
        return False
    if lower in {"null", "none", "n/a", "na"}:
        return None
    # Don't promote leading-zero strings to int (e.g. "007" stays a string)
    if s.startswith("0") and len(s) > 1 and not s.startswith("0."):
        return s
    try:
        if "." in s or "e" in lower:
            return float(s)
        return int(s)
    except ValueError:
        return s
