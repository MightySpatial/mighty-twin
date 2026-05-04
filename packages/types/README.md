# @mightyspatial/types

Shared API contract types — source of truth for TypeScript consumers across MightyDev, MightyLite, and MightyTwin.

The Zod schemas live in this package alongside the plain TS types; both are
generated in CI from the FastAPI backend's `/openapi.json`, so drift between
backend Pydantic models and frontend schemas becomes a build failure.
