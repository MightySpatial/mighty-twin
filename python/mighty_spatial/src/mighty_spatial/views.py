"""Helpers for reprojection views.

Core principle: we store spatial data in the **native projected CRS** the
surveyor or engineer works in (e.g. MGA2020 Zone 50 / EPSG:28350 for
Western Australia), and expose a companion SQL VIEW that reprojects to
EPSG:4326 for the Cesium globe.

Both PostGIS and SpatiaLite support `ST_Transform(geom, 4326)` and
`CREATE VIEW`. This module wraps the small dialect differences so Alembic
migrations can call a single helper.

Usage inside a migration:

    from mighty_spatial.views import create_reproject_view

    # After creating the feature table in storage CRS…
    op.create_table("project_features",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("layer_id", GUID(), nullable=False),
        sa.Column("geom", Geometry("GEOMETRY", srid=28350)),
        sa.Column("properties", JSONType()),
    )
    create_spatial_index("project_features", "geom")
    # …expose a view that reprojects to 4326 for the viewer API.
    create_reproject_view(
        view_name="project_features_wgs84",
        source_table="project_features",
        geom_col="geom",
        target_srid=4326,
    )
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


def create_reproject_view(
    view_name: str,
    source_table: str,
    geom_col: str = "geom",
    target_srid: int = 4326,
) -> None:
    """Create a VIEW that exposes ``source_table`` with its geometry column
    transformed to ``target_srid``. The view's columns mirror the source
    table exactly — same names, same order — except the geometry column,
    which becomes the transformed one.

    Works for both PostGIS and SpatiaLite via column introspection (we
    enumerate the source table's columns at migration time so we can emit
    a clean SELECT that excludes the original geom and adds back the
    transformed one under the same name).
    """
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)
    column_names = [c["name"] for c in inspector.get_columns(source_table)]
    if geom_col not in column_names:
        raise RuntimeError(
            f"create_reproject_view: column {geom_col!r} not found on "
            f"table {source_table!r}"
        )
    non_geom = [c for c in column_names if c != geom_col]
    select_list = ", ".join(non_geom + [
        f"ST_Transform({geom_col}, {target_srid}) AS {geom_col}"
    ])

    if dialect == "postgresql":
        op.execute(f"DROP VIEW IF EXISTS {view_name}")
        op.execute(f"CREATE VIEW {view_name} AS SELECT {select_list} FROM {source_table}")
    elif dialect == "sqlite":
        op.execute(f"DROP VIEW IF EXISTS {view_name}")
        op.execute(f"CREATE VIEW {view_name} AS SELECT {select_list} FROM {source_table}")
        # SpatiaLite needs the view's geometry column explicitly registered
        # so it can participate in spatial operations.
        op.execute(
            f"""
            INSERT OR REPLACE INTO views_geometry_columns
            (view_name, view_geometry, view_rowid, f_table_name, f_geometry_column, read_only)
            VALUES (
                '{view_name.lower()}',
                '{geom_col}',
                'rowid',
                '{source_table.lower()}',
                '{geom_col}',
                1
            )
            """.strip()
        )
    else:
        raise RuntimeError(f"create_reproject_view does not support dialect {dialect!r}")


def drop_reproject_view(view_name: str) -> None:
    """Mirror of `create_reproject_view` for the `downgrade()` half of a
    migration. Safe to call even if the view doesn't exist."""
    dialect = op.get_bind().dialect.name
    op.execute(f"DROP VIEW IF EXISTS {view_name}")
    if dialect == "sqlite":
        op.execute(
            f"DELETE FROM views_geometry_columns WHERE view_name = '{view_name.lower()}'"
        )
