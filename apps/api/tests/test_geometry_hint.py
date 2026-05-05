"""Geometry-hint resolver tests — T+1450.

The resolver is the bridge between tabular feeds (CSV / Sheets / etc)
and spatial layers. It promotes lng/lat columns or a WKT column on
each row into a GeoJSON geometry. Lots of edge cases — bad inputs,
mixed types, missing columns — so it deserves coverage.
"""

from __future__ import annotations

import pytest

from twin_api.feeds.base import apply_geometry_hint, _wkt_to_geojson


def test_native_passthrough():
    row = {"geometry": {"type": "Point", "coordinates": [1, 2]}, "properties": {}}
    out = apply_geometry_hint(row, {"kind": "native"})
    assert out["geometry"] == {"type": "Point", "coordinates": [1, 2]}


def test_columns_promotes_lng_lat_to_point():
    row = {
        "geometry": None,
        "properties": {"longitude": 115.86, "latitude": -31.95, "name": "Perth"},
    }
    out = apply_geometry_hint(
        row, {"kind": "columns", "lng": "longitude", "lat": "latitude"}
    )
    assert out["geometry"] == {"type": "Point", "coordinates": [115.86, -31.95]}
    # Properties unchanged
    assert out["properties"]["name"] == "Perth"


def test_columns_with_custom_column_names():
    row = {"geometry": None, "properties": {"x": 0.0, "y": 0.0}}
    out = apply_geometry_hint(row, {"kind": "columns", "lng": "x", "lat": "y"})
    assert out["geometry"]["coordinates"] == [0.0, 0.0]


def test_columns_handles_string_values():
    row = {
        "geometry": None,
        "properties": {"longitude": "115.86", "latitude": "-31.95"},
    }
    out = apply_geometry_hint(
        row, {"kind": "columns", "lng": "longitude", "lat": "latitude"}
    )
    assert out["geometry"]["coordinates"] == [115.86, -31.95]


def test_columns_returns_none_when_columns_missing():
    row = {"geometry": None, "properties": {"foo": "bar"}}
    out = apply_geometry_hint(row, {"kind": "columns"})
    assert out["geometry"] is None


def test_columns_returns_none_for_non_numeric():
    row = {"geometry": None, "properties": {"longitude": "abc", "latitude": "def"}}
    out = apply_geometry_hint(
        row, {"kind": "columns", "lng": "longitude", "lat": "latitude"}
    )
    assert out["geometry"] is None


def test_wkt_point_parses():
    row = {"geometry": None, "properties": {"geom": "POINT(1.5 -2.5)"}}
    out = apply_geometry_hint(row, {"kind": "wkt", "column": "geom"})
    assert out["geometry"] == {"type": "Point", "coordinates": [1.5, -2.5]}


def test_wkt_handles_negative_and_decimal():
    assert _wkt_to_geojson("POINT(-180 90)") == {
        "type": "Point",
        "coordinates": [-180.0, 90.0],
    }
    assert _wkt_to_geojson("point(0.000001 -0.5)") == {
        "type": "Point",
        "coordinates": [0.000001, -0.5],
    }


def test_wkt_returns_none_for_unsupported_types():
    assert _wkt_to_geojson("LINESTRING(0 0, 1 1)") is None
    assert _wkt_to_geojson("garbage") is None
    assert _wkt_to_geojson("") is None


def test_attribute_only_strips_geometry():
    row = {
        "geometry": {"type": "Point", "coordinates": [0, 0]},
        "properties": {"asset_id": 42},
    }
    out = apply_geometry_hint(row, {"kind": "attribute_only"})
    assert out["geometry"] is None
    assert out["properties"]["asset_id"] == 42


def test_unknown_hint_kind_raises():
    from twin_api.feeds.base import AdapterError

    with pytest.raises(AdapterError):
        apply_geometry_hint({"geometry": None, "properties": {}}, {"kind": "telepathy"})
