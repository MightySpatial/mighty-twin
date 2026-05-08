"""Dialect-dispatched spatial index creation.

Alembic migrations call `create_spatial_index(table, column)` inside
`upgrade()`; the helper picks the right SQL at migration time.
"""

from __future__ import annotations

from alembic import op


def create_spatial_index(table: str, column: str) -> None:
    """Create a spatial index. Dispatches on the current bind's dialect."""
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_{column}_gist "
            f"ON {table} USING GIST ({column})"
        )
    elif dialect == "sqlite":
        # SpatiaLite's CreateSpatialIndex registers an R*Tree shadow table.
        op.execute(f"SELECT CreateSpatialIndex('{table}', '{column}')")
    else:
        raise RuntimeError(f"Unsupported dialect for spatial indexes: {dialect}")
