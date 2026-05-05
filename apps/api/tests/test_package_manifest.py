"""Package manifest schema tests — T+1450.

Pydantic schema validation for the .mtsite manifest envelope. Catches
the "we accidentally removed a required field" class of regression
before it ships.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from twin_api.packages.manifest import (
    PACKAGE_SCHEMA_VERSION,
    DataSourceManifest,
    FeedManifest,
    LayerManifest,
    PackageCounts,
    PackageManifest,
    PackageSource,
    SiteManifest,
)


def _minimal_manifest(**overrides) -> PackageManifest:
    base = dict(
        exported_at=datetime.now(timezone.utc),
        source=PackageSource(site_slug="test"),
        site=SiteManifest(slug="test", name="Test"),
    )
    base.update(overrides)
    return PackageManifest(**base)


def test_minimal_manifest_validates():
    m = _minimal_manifest()
    assert m.schema_version == PACKAGE_SCHEMA_VERSION
    assert m.package_kind == "mtsite"
    assert m.site.slug == "test"
    assert m.layers == []
    assert m.feeds == []


def test_layer_with_feed_id_round_trips():
    m = _minimal_manifest(
        layers=[
            LayerManifest(
                id="aaaa",
                name="Live pins",
                type="vector",
                feed_id="bbbb",
                materialisation="materialised",
            ),
        ],
        feeds=[
            FeedManifest(
                id="bbbb",
                name="External pins",
                kind="geojson_url",
                url="https://example.com/pins.geojson",
            ),
        ],
    )
    serialised = m.model_dump_json()
    restored = PackageManifest.model_validate_json(serialised)
    assert restored.layers[0].feed_id == "bbbb"
    assert restored.feeds[0].kind == "geojson_url"


def test_data_source_asset_path_optional():
    m = _minimal_manifest(
        data_sources=[
            DataSourceManifest(
                id="ds-1",
                name="Local file",
                type="geojson",
                size_bytes=1024,
                asset_path="assets/ds-1.geojson",
            ),
            DataSourceManifest(
                id="ds-2",
                name="External URL",
                type="geojson",
                url="https://example.com/data.geojson",
                # asset_path omitted
            ),
        ],
    )
    assert m.data_sources[0].asset_path == "assets/ds-1.geojson"
    assert m.data_sources[1].asset_path is None


def test_counts_default_to_zero():
    m = _minimal_manifest()
    assert m.counts.layers == 0
    assert m.counts.features == 0
    assert m.counts.feeds == 0


def test_explicit_counts_round_trip():
    m = _minimal_manifest(
        counts=PackageCounts(layers=3, features=1234, feeds=2),
    )
    restored = PackageManifest.model_validate_json(m.model_dump_json())
    assert restored.counts.layers == 3
    assert restored.counts.features == 1234
    assert restored.counts.feeds == 2


def test_source_kind_is_constrained():
    # Valid values are "twin" | "sheets" | "feed_snapshot"
    PackageSource(site_slug="t", source_kind="twin")
    PackageSource(site_slug="t", source_kind="sheets")
    PackageSource(site_slug="t", source_kind="feed_snapshot")
    with pytest.raises(Exception):
        PackageSource(site_slug="t", source_kind="not-a-kind")
