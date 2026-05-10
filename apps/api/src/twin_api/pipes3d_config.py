"""Canonical pipe schema — shared by frontend (TS mirror) + backend.

Source of truth for the Design widget's pipe tool and the redline
column-resolution path. Every field carries:
  • ``key``           — canonical name, what the v1 widget writes.
  • ``role``          — semantic tag (diameter / material / depthRef …)
                        used by the frontend's renderer + the backend's
                        fuzzy field matcher.
  • ``aliases``       — alternative names accepted on import / promotion
                        match (case-insensitive).
  • ``uom``           — optional unit of measure for numeric fields.
  • ``default_value`` — pre-fill applied by the AttributesEditor.

A frontend port of this module lives at
``apps/web/src/viewer/widgets/design/pipes3DConfig.ts``; the two MUST
match. Mirrors V1_SPEC.md §8 + the v1 ``src/utils/pipes3DConfig.js``.
"""

from __future__ import annotations

from typing import Any


PIPE_FIELDS: list[dict[str, Any]] = [
    {
        "key": "Size",
        "role": "diameter",
        "uom": "mm",
        "aliases": ["NominalDiameter", "Diameter", "DN", "Dia"],
        "default_value": 100,
    },
    {
        "key": "Configuration",
        "role": "bankConfig",
        "aliases": ["Config", "BankConfig", "PipeBank"],
        "default_value": "",
    },
    {
        "key": "Material",
        "role": "material",
        "aliases": ["Mat", "PipeMaterial"],
        "default_value": "",
    },
    {
        "key": "AssetType",
        "role": "assetType",
        "aliases": ["Type", "Subtype", "Class"],
        "default_value": "",
    },
    {
        "key": "DepthReference",
        "role": "depthRef",
        "aliases": ["DepthRef", "PlacementRef", "Reference"],
        "default_value": "outsideTop",
    },
    {
        "key": "WallThickness",
        "role": "wallThickness",
        "uom": "mm",
        "aliases": ["WT", "WallThk"],
        "default_value": 0,
    },
    {
        "key": "Name",
        "role": "label",
        "aliases": ["Label", "PipeName"],
        "default_value": "",
    },
    {
        "key": "Status",
        "role": "status",
        "aliases": ["State", "Condition"],
        "default_value": "",
    },
    {
        "key": "Owner",
        "role": "owner",
        "aliases": ["Operator", "Custodian"],
        "default_value": "",
    },
    {
        "key": "InstallDate",
        "role": "installDate",
        "aliases": ["Installed", "CommissionDate"],
        "default_value": "",
    },
]

UOM_OPTIONS: list[str] = ["mm", "cm", "m", "in", "ft", "km"]

DEPTH_REFERENCES: list[str] = [
    "outsideTop",
    "obvert",
    "centerline",
    "invert",
    "outsideBottom",
]


def resolve_canonical_to_target(
    canonical_key: str,
    target_columns: list[str],
) -> str | None:
    """Find a target PostGIS column matching a canonical pipe field.

    Tries (in order): exact case-insensitive match on the canonical key,
    then on each alias. Returns the actual target column name (preserving
    its case) or None when no match exists. Mirrors the same logic in
    the v1 frontend so both ends of the redline pipeline pick the same
    column for a given canonical field. Spec §9.12.
    """
    if not target_columns:
        return None
    field = next((f for f in PIPE_FIELDS if f["key"] == canonical_key), None)
    if not field:
        return None
    candidates = [canonical_key, *field.get("aliases", [])]
    target_lower = {c.lower(): c for c in target_columns}
    for name in candidates:
        hit = target_lower.get(name.lower())
        if hit is not None:
            return hit
    return None


def field_by_key(canonical_key: str) -> dict[str, Any] | None:
    return next((f for f in PIPE_FIELDS if f["key"] == canonical_key), None)
