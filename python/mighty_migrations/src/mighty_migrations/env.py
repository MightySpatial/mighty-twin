"""Shared Alembic environment for all Mighty backends.

Consumer apps (dev-api, lite-api, twin-api) point their `alembic.ini` at
this file by setting `script_location = ...%PKG_PATH%/mighty_migrations`
and passing the database URL via the environment.

The env here is dialect-agnostic — individual migrations use
`op.get_bind().dialect.name` to branch where SQLite/SpatiaLite and PostGIS
diverge (spatial index syntax, view-geometry registration, raster support).
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, event, pool

# ``mighty_models.Base`` holds the shared metadata. Consumer apps that
# register their own tables on the same metadata get autogenerate support
# through a single target.
from mighty_models import Base  # noqa: F401 — imported for metadata side-effects

# Alembic config object. Reads from the consumer's alembic.ini.
config = context.config

# Let consumers override DATABASE_URL purely via env.
if os.environ.get("DATABASE_URL"):
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _load_spatialite(engine) -> None:  # type: ignore[no-untyped-def]
    """When running against SQLite, load mod_spatialite so ST_Transform and
    friends are available inside migrations."""
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _connect(dbapi_connection, _):  # type: ignore[no-untyped-def]
        dbapi_connection.enable_load_extension(True)
        try:
            dbapi_connection.load_extension("mod_spatialite")
        except Exception:
            dbapi_connection.load_extension(
                "/opt/homebrew/lib/mod_spatialite.dylib"
            )


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    _load_spatialite(connectable)

    with connectable.connect() as connection:
        # render_as_batch enables SQLite's "recreate table" pattern for
        # ALTERs that the dialect can't express directly.
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
