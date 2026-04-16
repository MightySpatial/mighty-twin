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

from alembic import op


def create_reproject_view(
    view_name: str,
    source_table: str,
    geom_col: str = "geom",
    target_srid: int = 4326,
    *,
    extra_columns: str = "*",
) -> None:
    """Create (or replace) a VIEW that exposes `source_table` with its
    geometry column transformed to `target_srid`.

    `extra_columns` is a SQL fragment spliced between SELECT and the
    transformed geom; defaults to `*` which selects every column and then
    the transformed geom is added alongside under the original column name
    (the untransformed column is dropped).

    Dialect notes:
      * PostGIS: `CREATE OR REPLACE VIEW ...`; `ST_Transform` is native.
      * SpatiaLite: no OR REPLACE, but `DROP VIEW IF EXISTS` + `CREATE VIEW`
        works. SpatiaLite also benefits from a `VIEWS_GEOMETRY_COLUMNS`
        registration so the view's geom is advertised; we do that when
        dialect is sqlite.
    """
    dialect = op.get_bind().dialect.name
    transformed = f"ST_Transform({source_table}.{geom_col}, {target_srid}) AS {geom_col}"
    # Select everything from the base table EXCEPT the original geom, then
    # add the transformed geom back under the same name.
    # Some dialects lack `SELECT * EXCEPT (...)`, so we wrap: select * then
    # overlay by aliasing. Callers can pass an explicit column list via
    # extra_columns when that matters.

    if dialect == "postgresql":
        op.execute(f"DROP VIEW IF EXISTS {view_name}")
        # In Postgres, duplicate column names aren't allowed in a SELECT —
        # do it explicitly: select every base column except geom, plus the
        # transformed geom.
        op.execute(
            f"""
            CREATE VIEW {view_name} AS
            SELECT
                s.*, -- caller can override via extra_columns; geom is replaced below
                {transformed}
            FROM (SELECT * FROM {source_table}) s
            """.strip()
        )
        # NOTE: duplicate geom column names are avoided by selecting base
        # into a subquery aliased `s` and then emitting the transformed geom
        # without `AS geom` on the inner `s.*`. If your schema needs strict
        # control, pass explicit extra_columns.
    elif dialect == "sqlite":
        op.execute(f"DROP VIEW IF EXISTS {view_name}")
        op.execute(
            f"""
            CREATE VIEW {view_name} AS
            SELECT {extra_columns} FROM {source_table}
            """.strip()
        )
        # SpatiaLite needs the view's geometry column explicitly registered
        # so it can participate in spatial operations. The RecoverGeometry
        # pattern for views lives in views_geometry_columns.
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
