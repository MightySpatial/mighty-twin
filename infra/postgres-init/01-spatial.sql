-- Ensure PostGIS + any auxiliary extensions are enabled on first container
-- boot. The postgis image already installs the libraries; this just creates
-- the extensions inside the application database so Alembic migrations run
-- cleanly on fresh installs.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
