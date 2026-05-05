"""Mighty Twin site packages — .mtsite zip format.

A site package is a self-contained, portable archive of a Twin site:
metadata, layers, features (in WGS84 NDJSON), data sources (with
optional embedded asset files), story maps, and library entries.

Use cases:
  * Move a site between Twin instances (dev → prod, prod → on-prem)
  * Snapshot a site at a point in time for archival or audit
  * Federation: one Twin reads another Twin's catalog as packages
  * Sheets → Twin import: the Sheets translator emits .mtsite
  * Feed materialisation: a feed snapshot is just a single-layer .mtsite

The format is designed so the same importer handles every source.
"""

from .manifest import PackageManifest, PACKAGE_SCHEMA_VERSION
from .exporter import export_site_package

__all__ = ["PackageManifest", "PACKAGE_SCHEMA_VERSION", "export_site_package"]
