"""mighty_migrations — shared Alembic migration tree.

Both MightyLite (SQLite) and MightyTwin (PostGIS) point their
`alembic.ini` at this package's `env.py`. Each consumer injects its
`DATABASE_URL`; Alembic's dialect branches handle the divergence.

Initial migrations land here during the MightyTwin migration sprint.
"""

__version__ = "0.1.0"
