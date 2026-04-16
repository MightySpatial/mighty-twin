# mighty-twin

Enterprise on-prem digital twin backed by **PostgreSQL/PostGIS**. Thin
consumer of the `@mightyspatial/*` packages published from
[mighty-platform](https://github.com/MightySpatial/mighty-platform).

Priority customer: **Space Angel** (Forrest Airport spaceport operations,
perpetual-licence model).

## Philosophy

- **On-prem by default** — customer-controlled infrastructure, zero egress.
- **Enterprise-grade from day one** — license validation on startup, signed
  container images, SBOM, audit logging.
- **CRS-native storage** — sites store feature geometries in a projected
  CRS (MGA2020, UTM, etc.) for survey-grade precision; a reprojection VIEW
  exposes 4326 for the Cesium viewer. Seed site Forrest Airport uses
  **EPSG:28350 (MGA2020 Zone 50)**. Pattern described in
  [platform docs](https://github.com/MightySpatial/mighty-platform/blob/main/docs/architecture/crs-storage-and-views.md).
- **Same widget contract as MightyLite** — every widget built in MightyDev
  runs here unchanged.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 18 + Cesium + `@mightyspatial/app-shell` |
| Backend | FastAPI + SQLAlchemy 2.0 + GeoAlchemy2 |
| Storage | PostgreSQL 16 + PostGIS |
| Licensing | `mighty_licensing` (validates signed token on API startup) |
| On-prem package | Signed OCI bundle + docker-compose + SBOM |

## Development

```bash
# Bring up web + api + postgres-postgis together
docker compose -f infra/docker-compose.yml up --build

# Or for a faster dev loop with live reload
pnpm install                 # requires NODE_AUTH_TOKEN for @mightyspatial packages
uv sync
docker compose -f infra/docker-compose.yml up postgres -d
pnpm dev &                   # web on :3000
uv run uvicorn twin_api.main:app --reload --port 5001 --app-dir apps/api/src
```

## On-prem deployment (Space Angel, etc.)

```bash
# On the customer's airgap-capable host:
# 1. Load the signed OCI bundle
docker load -i mighty-twin-v0.1.0-images.tar
# 2. Configure site via env file
cp infra/spaceangel.env.example infra/spaceangel.env
$EDITOR infra/spaceangel.env           # set VITE_LICENSE_KEY, database creds
# 3. Bring up
docker compose -f infra/docker-compose.onprem.yml --env-file infra/spaceangel.env up -d
```

## Upgrading the platform

Bump the `tag` in `pyproject.toml` `[tool.uv.sources]` and `@mightyspatial/*`
versions in `apps/web/package.json`, then:

```bash
uv lock && pnpm install
```
