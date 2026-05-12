# MightyTwin Connector — Capability Plan

> Ready-to-implement plan for exposing MightyTwin data as a **connector** in
> Claude, ChatGPT, Cursor, Gemini CLI, and any other host that speaks
> **Model Context Protocol (MCP)**. Optimised for **enterprise / on-prem**
> deployment alongside the existing PostGIS-backed API.

---

## 1. Outcome

A user with MightyTwin installed (cloud or on-prem) can, from inside their
preferred AI host, do things like:

- "Find every gravity main within 30 m of Bay 3 at Forrest Airport and show
  me the worst-condition segments."
- "Plot today's drainage submissions on the site map and summarise the
  schema deltas."
- "Snapshot the current Cesium view of Hangar 4 and drop it into our
  Tuesday status update."

The connector returns **structured data** the model can reason over **plus a
rich preview** (map tile snapshot, signed embed URL, feature card) the host
renders inline — the same pattern Claude already uses for its Google Maps
card.

## 2. Standard: Model Context Protocol (MCP)

MCP is now the common substrate across hosts:

| Host                | MCP transport               | Status              |
|---------------------|-----------------------------|---------------------|
| Claude Desktop / Web| Streamable HTTP, stdio       | GA                  |
| Claude Code         | Streamable HTTP, stdio, SSE  | GA                  |
| ChatGPT (Apps SDK)  | Streamable HTTP              | GA (2025-Q4)        |
| Cursor / Windsurf   | Streamable HTTP, stdio       | GA                  |
| Gemini CLI / Studio | Streamable HTTP, stdio       | GA                  |
| VS Code (Copilot)   | Streamable HTTP, stdio       | GA                  |

One server, all hosts. No bespoke "Claude plugin" or "ChatGPT GPT" surface
to maintain.

## 3. Architecture

```
   ┌──────────────────────────────────────────────────────────────┐
   │                        AI Host (Claude / ChatGPT / Cursor)   │
   └──────────────┬───────────────────────────────────────────────┘
                  │  Streamable HTTP /  OAuth 2.1 + PKCE
                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │   apps/mcp  —  FastAPI sub-app, single binary, same image    │
   │   ───────────────────────────────────────────────────────    │
   │   /.well-known/oauth-protected-resource    (RFC 9728)        │
   │   /.well-known/oauth-authorization-server  (RFC 8414)        │
   │   /mcp                       Streamable HTTP endpoint        │
   │   /mcp/register              DCR (RFC 7591, allow-listed)    │
   │                                                              │
   │   • Tool registry   →  twin_api service layer                │
   │   • Resource URIs   →  mightytwin://...                      │
   │   • Audit sink      →  audit_log (Postgres)                  │
   └──────────────┬───────────────────────────────────────────────┘
                  │  In-process service calls (no HTTP hop)
                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │   Existing twin_api packages — spatial, feature, voxel,      │
   │   story, library, submission, analytics, embed (signed)      │
   │   on top of mighty_db / mighty_models / mighty_spatial.      │
   └──────────────────────────────────────────────────────────────┘
```

Key choices:

- **Same process, same image.** `apps/mcp` is a sibling FastAPI app
  mounted on the same Uvicorn worker (or a separate worker behind the
  same ingress). No new database, no new service mesh — it imports the
  service layer directly so RBAC and licensing apply automatically.
- **Streamable HTTP only** as the primary transport. Stdio binary
  shipped for local-IDE installs that prefer it.
- **No new auth system.** Reuse the existing JWT + Google/Microsoft
  OAuth via standard MCP authorization metadata.

## 4. Capability surface

### 4.1 Tools (model-callable)

Grouped by domain. Each tool returns `{ structuredContent, content[] }`
where `content[]` includes a `text` summary plus, where useful, an
`image` (PNG of the rendered scene) or a `resource` link
(`mightytwin://...`) the host can fetch on demand.

| Tool                                   | Domain       | Backed by                                |
|----------------------------------------|--------------|------------------------------------------|
| `list_sites`                           | spatial      | `spatial_routes.list_sites`              |
| `get_site`                             | spatial      | `spatial_routes.get_site`                |
| `list_layers`                          | spatial      | `spatial_routes.list_layers`             |
| `search_features`                      | spatial      | new — wraps PostGIS ST_DWithin / bbox / attr filters |
| `get_feature`                          | spatial      | `feature_routes.get_feature`             |
| `nearest_features`                     | spatial      | new — k-NN via `<->` operator            |
| `summarise_layer`                      | analytics    | `analytics_routes.overview` + ad-hoc agg |
| `render_view`                          | rich         | new — server-side Cesium-Headless or static map renderer → PNG |
| `snapshot_url`                         | rich         | `embed_routes.sign` — signed `/embed/...` URL |
| `list_voxel_layers` / `voxel_sample`   | voxel        | `voxel_routes` + `mai_voxel_routes`      |
| `list_submissions` / `get_submission`  | governance   | `submission_routes`                      |
| `list_snapshots` / `get_snapshot`      | story        | `me_routes`, `story_routes`              |
| `run_feed_preview`                     | data         | `feed_routes.preview`                    |
| `create_annotation` *(write — gated)*  | sketch       | `me_routes.sketch_layers`                |

Write tools are off by default; admins toggle them per-connector via the
existing `system` settings router.

### 4.2 Resources

| URI template                                  | Returns                              |
|-----------------------------------------------|--------------------------------------|
| `mightytwin://sites/{slug}`                   | Site card (JSON + thumbnail)         |
| `mightytwin://sites/{slug}/features/{id}`     | Feature record + map preview         |
| `mightytwin://sites/{slug}/snapshots/{id}`    | Snapshot view (signed embed URL)     |
| `mightytwin://submissions/{id}`               | Submission diff + status             |
| `mightytwin://voxel/{slug}/{layer}/{x,y,z}`   | Voxel sample                         |

The host can list and subscribe; `resources/subscribe` powers
"watch this submission" flows.

### 4.3 Prompts

Three pre-baked prompts shipped with the server so hosts surface them
as slash-commands:

- `/twin site-briefing <slug>`
- `/twin submission-review <id>`
- `/twin layer-summary <slug> <layer>`

## 5. Rich rendering strategy

The screenshot in the brief works because Claude renders an **image** the
tool returned plus a **structured card** the host knows how to lay out.
We give the host the same ingredients:

1. **Image preview** — `content[]` entry of type `image` with a PNG
   produced by either:
   - `render_view` — a headless Cesium / MapLibre tile composite at a
     fixed zoom around the feature(s) bbox, watermarked with the site
     name. Renders out-of-process via a small `mighty-renderer`
     worker (puppeteer + MapLibre GL Native, or `cesium-headless` once
     stable). Cached by `(site, layer, bbox, style_hash)`.
   - For low-stakes calls, a static raster from the configured basemap
     provider with feature SVG overlay (~50 ms, no headless browser).

2. **Signed embed URL** — `snapshot_url` returns a 10-minute signed
   `/embed/...` URL via the **existing** `embed_routes.sign` HMAC
   path. Hosts that support iframe-rendered cards (ChatGPT Apps SDK,
   Claude Artifacts) embed the live Cesium viewer; hosts that don't
   show the PNG preview and a link.

3. **Structured card** — every tool also emits a typed
   `structuredContent` block (Pydantic → JSON Schema) so the host /
   model can decide layout when the connector itself doesn't dictate
   it. Schemas are versioned (`x-twin-card: site/v1`, `feature/v1`,
   etc.) to keep host-side renderers stable.

## 6. Authentication & authorization (enterprise grade)

The MCP authorization spec (2025-06 revision) cleanly separates the
**Protected Resource** (us) from the **Authorization Server**. We
support three deployment modes, chosen per-tenant in
`settings_routes`:

| Mode             | AS                                  | Use case                             |
|------------------|-------------------------------------|--------------------------------------|
| `local`          | MightyTwin itself (existing JWT)    | On-prem, no IdP integration          |
| `idp_oidc`       | Customer's OIDC IdP (Okta, Entra)   | Enterprise SSO                       |
| `federated`      | Existing Google / Microsoft routes  | Cloud / mixed                        |

In every mode we expose:

- `/.well-known/oauth-protected-resource` — points hosts at the
  configured AS, advertises required scopes
  (`twin.read`, `twin.write`, `twin.admin`).
- `/.well-known/oauth-authorization-server` — only in `local` mode.
- `/mcp/register` — Dynamic Client Registration (RFC 7591), **gated
  by an admin allow-list** of client metadata fingerprints. Hosts not
  on the allow-list see `403 registration_not_allowed` with the email
  of the workspace admin who must approve. (Some enterprises will
  pre-register clients out of band — both paths are supported.)
- **PKCE required** for every auth flow.
- **Resource indicators (RFC 8707)** — every access token is bound to
  the MCP resource URL so it can't be replayed against the regular
  API and vice-versa. (Mandatory in the 2025-06 MCP spec.)
- **Audience validation on every request** — tokens missing the
  expected `aud` are rejected before any tool dispatches.

### Authorization model

- The token's `sub` resolves to a `User` row; existing column-level
  RBAC in the service layer applies as-is.
- Tool definitions declare `requires: ["twin.read"]` etc.; the MCP
  middleware enforces scopes **and** re-runs row-level checks inside
  each service call (defence in depth).
- Per-tool admin toggles live in `system_settings`; flipping
  `mcp.tools.create_annotation = false` removes it from `tools/list`
  immediately.

## 7. Multi-tenant & data scoping

- A connector instance is tied to **one workspace** (one MightyTwin
  deployment / one license). Multi-workspace use means the user
  installs the connector twice, each pointing at a different host.
- Inside a workspace, every tool result is filtered by the calling
  user's site/layer permissions exactly as the web UI does, by reusing
  `auth.current_user` + the existing site-membership checks.
- License gate: `mighty_licensing` validates on `apps/mcp` startup
  the same way it does for `twin_api`. No license → server boots in
  read-only demo mode against the sample Forrest Airport seed.

## 8. Audit, observability, rate limiting

- **Audit log** — new `audit_log` table (Postgres). Every
  `tools/call` and `resources/read` writes
  `(ts, user_id, client_id, tool, args_hash, latency_ms, result_size,
   trace_id, deny_reason)`. Retention configurable per tenant; export
  endpoint emits JSONL / Parquet for SIEM ingestion.
- **OpenTelemetry** — OTLP exporter wired into the lifespan; traces
  cover MCP request → service call → DB query. Existing OTel config
  from `twin_api` is reused.
- **Rate limits** — token-bucket per `(user_id, tool)` and per
  `client_id`. Defaults: 60 calls/min/user, 10/min for write tools,
  configurable in `system_settings`.
- **Cost guard** — hard caps on response payload size (default 256 KB
  per tool call, paginated cursor in tool args). `render_view`
  budgeted separately because of CPU cost.

## 9. Deployment topology

### On-prem (Space Angel and similar)

- One extra service in `infra/docker-compose.onprem.yml`:
  `mighty-mcp`, sharing the Postgres volume and the existing
  ingress. No new outbound dependencies — DCR/AS metadata is served
  by the same binary.
- Behind the customer's reverse proxy. mTLS optional, IP allowlist
  optional, both terminate before hitting the FastAPI app.

### Cloud / Railway

- New Railway service on the same project, same image, command
  `uv run uvicorn mcp_app.main:app --port 5101`. Public URL
  `https://twin-mcp.mightyspatial.com`.

### IDE / local

- `mighty-twin-mcp` stdio binary published to npm + PyPI so
  `cursor`/`claude-code`/`vscode` can install with a one-liner; it
  proxies to the deployed Streamable HTTP endpoint after an OAuth
  device-code flow. Avoids shipping credentials in IDE config.

## 10. Implementation phases & file layout

### Phase 0 — Scaffolding (½ day)

```
apps/mcp/
  Dockerfile
  pyproject.toml
  railway.toml
  src/mcp_app/
    main.py            # FastAPI app, lifespan, mounts /mcp
    transport.py       # Streamable HTTP impl (mcp-python-sdk)
    auth_metadata.py   # /.well-known/* routes
    middleware.py      # token validation, scope enforcement, audit
    rate_limit.py
    audit.py
    tools/
      __init__.py      # registry
      spatial.py
      feature.py
      analytics.py
      submission.py
      voxel.py
      rendering.py
      story.py
    resources/
      __init__.py
      sites.py
      features.py
      submissions.py
    prompts/
      __init__.py
      briefings.py
  tests/
```

New python package `python/mighty_mcp/` for tool-schema helpers we
might reuse from `twin_api` (no circular import — `twin_api` does
not import it).

### Phase 1 — Read-only tools + local AS (1 week)

- Tools: `list_sites`, `get_site`, `list_layers`, `get_feature`,
  `search_features`, `list_snapshots`, `snapshot_url`.
- Auth: `local` mode only, reuse `auth.issue_token` with new
  `aud=mcp` claim. PKCE, RFC 8707, RFC 9728 metadata.
- Audit log table + Alembic migration.
- E2E test with Anthropic's `mcp-inspector` CLI hitting a local
  server.

### Phase 2 — Rich rendering (3-4 days)

- `mighty-renderer` worker (small Node container, MapLibre GL Native)
  + `render_view` tool. Cache in Postgres `bytea` keyed by hash;
  separate `render_cache` table to keep `audit_log` lean.
- `summarise_layer`, `nearest_features`, `run_feed_preview`.

### Phase 3 — Enterprise auth & governance (1 week)

- `idp_oidc` mode (OIDC discovery + JWKS fetch + signature verify).
- DCR allow-list, admin UI panel under existing `settings_routes`.
- Per-tool toggles, rate-limit configuration UI.
- SIEM export endpoint.

### Phase 4 — Write tools + ChatGPT/Cursor card schemas (1 week)

- `create_annotation`, `add_to_snapshot`.
- Versioned `structuredContent` schemas + golden-file tests so
  ChatGPT Apps SDK custom renderers stay stable across releases.

### Phase 5 — Distribution (3 days)

- `mighty-twin-mcp` stdio binary (npm + PyPI), device-code OAuth.
- Connector listing submitted to Anthropic's directory, ChatGPT
  Apps SDK directory, Cursor MCP registry.
- Customer-facing docs in `docs/connector/`.

Total: ~4 weeks elapsed for a 1-engineer build.

## 11. Compatibility matrix

| Capability                  | Claude | ChatGPT | Cursor | Gemini | VS Code |
|-----------------------------|:------:|:-------:|:------:|:------:|:-------:|
| `tools/list`, `tools/call`  |   ✓    |    ✓    |   ✓    |   ✓    |    ✓    |
| `resources/*`               |   ✓    |    ✓    |   ✓    |   ✓    |    ✓    |
| `prompts/*` (slash-cmds)    |   ✓    |    —    |   ✓    |   ✓    |    ✓    |
| Inline image preview        |   ✓    |    ✓    |   ✓    |   ✓    |    ✓    |
| Iframe embed (signed URL)   |   ✓ (Artifacts) | ✓ (Apps SDK) | —   |   —    |    —    |
| OAuth + PKCE                |   ✓    |    ✓    |   ✓    |   ✓    |    ✓    |
| DCR                         |   ✓    |    ✓    |   ✓    |   partial |  ✓   |

Where iframe embed isn't supported, the PNG preview + link is the
fallback — same data either way.

## 12. Risks & open questions

1. **Headless rendering throughput.** MapLibre GL Native on CPU is
   fine for tens of req/s, Cesium-Headless is heavier. Decision: ship
   MapLibre first; only add Cesium-Headless if customers ask for
   3D snapshots.
2. **DCR exposure on on-prem ingress.** Allow-listed by default;
   `mcp.dcr.enabled = false` is the safe shipping default for
   air-gapped installs.
3. **Token replay between MCP and main API.** Mitigated by RFC 8707
   resource indicators and strict `aud` checks; verified by
   integration test.
4. **Schema drift in `structuredContent`.** Versioned URIs +
   golden-file tests; any breaking change ships a new `x-twin-card`
   version and keeps the previous one for two minor releases.
5. **Licensing on a connector that runs cross-host.** Existing
   `mighty_licensing` covers it — the license is per-deployment, not
   per-host. No change needed.

## 13. Decision checklist before kick-off

- [ ] Confirm "1 connector = 1 workspace" model (vs. workspace
      switching inside a single connector).
- [ ] Pick rendering stack: MapLibre GL Native (recommended) vs.
      Cesium-Headless vs. both.
- [ ] DCR default for on-prem: allow-list (recommended) or off.
- [ ] Confirm scopes set: `twin.read` / `twin.write` /
      `twin.admin` (recommended) or finer-grained per-domain.
- [ ] Confirm tool-schema versioning policy.

Once these are signed off, Phase 0 + Phase 1 can land behind a
`mcp.enabled` system setting (default `false` in prod) for internal
dog-fooding without changing any customer-visible surface.
