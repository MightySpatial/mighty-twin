# MightyTwin v2 — Design Widget Port Plan

Derived from `V1_SPEC.md` (the deep-read brief from session
`local_440023fd-094e-4610-a0f3-7a26d6e1a1ee`). Branch: `claude/design-widget-port`.

This plan reorganises the spec's §10/§12 attack order against what is
already on disk in v2, so we don't redo finished pieces and we tackle
the load-bearing pieces in dependency order.

---

## 0 · Audit — what v2 has vs spec

### Backend — present
- `submission_routes.py` — partial: list/get/approve/reject/promote exist; **schema-changes pipeline missing**, plan-preview different shape, no `_inject_wkt_into_plan`, no `_execute_plan_pg` per-entry rollback semantics. Will need rewrite to match spec contract.
- `design_export_routes.py` — covers GeoJSON / CSV / Shapefile / KML / GeoPackage / DXF + 4-step CRS reproject + 21-preset CRS catalogue. **Matches spec §7.** Keep.
- `design_template_routes.py` — per-site templates in `Site.config.design_templates` with GET / PUT / POST / DELETE. **Matches spec §8 site-level layer.** Keep.
- `feature_routes.py`, `feature_import_routes.py`, `spatial_routes.py`, `me_routes.py` — partial overlap with spec §4 endpoints. Need spec-specific extensions.

### Backend — missing (must build)
- `design_import_routes.py` — multi-format import (geojson/shp/gpkg/kml/kmz/dxf/csv) with CRS detection and field schema preview. v1 module portable largely as-is.
- `design_models_routes.py` — GLB / glTF / STL / IFC upload + S3 + ifcopenshell→GLB conversion + presigned URL list/get/delete.
- **Source-CRS endpoint** — `GET /api/data-sources/{id}/source-crs` with the spec §2 4-step fallback returning `{epsg, source}`.
- **String-group endpoint** — `GET /api/data-sources/{id}/string-group?polyline_feature_id=…` returning polyline + ordered child points.
- **`/api/data-sources/{id}/fields`** — fields available on a data source (props, schema, columns fallback). Required for redline schema-import.
- **`/api/data-sources/{id}/preview`** — distinct values for a field, limit 100. Required for legend dropdowns.
- **Feature mutation** — `PUT /api/data-sources/{ds_id}/features/{feature_id}` (geometry+props), `…/attributes`, `…/vertex` (single ST_SetPoint with reproject).
- **`/api/data-sources/{id}/pipe-data`** — lines + diameter_m for the 3D pipe renderer.
- **Per-user JSON files** — `GET / PUT / DELETE /api/me/json-files/{name}` — currently `me_routes.py` has snapshots + sketch-layers only; must add the generic per-user JSON shop. Spec §1 sketch storage + §8 user templates depend on this.
- **`/api/admin/submissions/{id}/plan`** — preview-only promotion plan (no DDL/DML side-effects). Currently absent.
- **`/api/admin/submissions/{id}/approve-schema-changes`** — DDL gate, allowed actions `add_column` only, allowed prefixes `spatial_features_` / `site_`, allowed types in the spec §9 list. Currently absent.

### Backend — DB / migrations missing
- `sketch_submissions` — needs the spec columns: `schema_changes` JSONB, `schema_changes_approved_at`, `schema_changes_approved_by`, plus the partial pending-changes index and the redline-target expression index. The current migration may need an additive migration.
- `schema_change_log` — DDL audit, currently absent.
- `design_models` — full table per spec §3.
- `data_source_crs`, `data_source_properties` — auxiliary tables consumed by the source-crs probe.
- `data_sources.source_srid` and `data_sources.source_crs_info` columns — confirm/add.
- `spatial_features_{id}_vw_4326` view-creation helper — confirm `mighty_spatial.views.create_reproject_view` exposes both `geom_src` and `geometry`.

### Frontend — present
- Shell + horizontal rail + status bar + sketch context strip + mobile mini ✓
- Layers / Sketch / Edit / Style / History / Submit / Download tabs (different shape from spec's 6-tab layout: spec has Layers / Sketch / Features / Properties / Download / History — Style folds into Properties, Edit/Submit don't exist as tabs).
- Rough drawing tools — Point / Line / Polygon / Rect / Circle / Traverse / Box / Pit / Cylinder. No central registry, no section-ordering pattern, no Parameters components, no flags system.
- `useDesignState`, `useFeatureOps`, `useLayerOps`, `useSketchPersistence`, `useDownload`, `useDesignTemplates` hooks — none match the spec DAG semantics.
- DownloadPanel + AttributesEditor partially wired to backend ✓.

### Frontend — missing (must build, per spec §10)
- DAG engine port (`useCadEngine` → Zustand) with full surface: `state.nodes`, `state.outputIds`, dirty-set propagation, topological sort, per-sketch dirty tracking, undo/redo with cesium primitive cleanup + cascade-delete, `_persistReady` mount-restore guard.
- `ToolRegistry.js` JS module + 19 tool records + `SECTIONS` constant.
- 16 React `Parameters` components (Curve / Ellipse / Rectangle / PolygonN / Pipe / Traverse / PtLine / PtCircle / PtCylinder / PtSphere / PtCone / PtBox / PtPit / Extrude / Loft + Wire/Hole as flagless tools).
- 4 shared components (Spinner / BoxPreview3D / AttributesEditor (already partial — needs templates merge + chip layout) / VertexListEditor).
- Tab restructure to spec's 6: collapse Edit/Style → Properties, add Features (tree + table + CSV diff).
- `place-mode-bar` orchestration: SECTIONS 0–5 declarative render driven by registry flags.
- `modify-props-bar`: pinned inspector when `solidInspectorNodeId && !activeTool`.
- Redline creation modal (site → scope → target → name) + redline validation banner (pending / complete / failed).
- Unified schema editor modal (sketch / layer / object scopes; layer scope has Shared/Points/Lines/Polygons sub-tabs).
- Submission flow: submit → `/api/design/submit` with `schema_changes` payload → "My Submissions" list → admin plan preview → approve → promote.
- Three-tier sketch storage glue:
  - localStorage recovery (`mightydt_sketches` key).
  - S3 per-user-per-site index + per-sketch files via `/api/me/json-files/`.
  - Mount-restore guard against overwriting recovery before fetch lands.
- Pipe canonical schema reuse (`pipes3DConfig.js` lifted as JS, both backend + frontend import).
- Definition-key auto-template synthesis (`autoDefinitionKeyTemplates`).
- Smooth look-at on zoom (first-wheel-after-selection ease).

---

## 1 · Phasing

Each phase is one or more atomic commits. Build runs green at end of phase. Push only after phase passes verification AND `origin/main-dev` has advanced past `0290a16` (and we've rebased onto it).

### Phase 1 — Backend lift+shift (foundation)
- 1A · DB migrations: sketch_submissions+, schema_change_log, design_models, data_source_crs, data_source_properties, data_sources columns. Single alembic revision.
- 1B · `design_submissions_v2.py` rewrite — match spec contract exactly: `_build_promotion_plan`, `_inject_wkt_into_plan`, `_execute_plan_pg`, plan/approve/reject/promote/approve-schema-changes endpoints. Replace existing `submission_routes.py`.
- 1C · `design_import_routes.py` — port v1 module.
- 1D · `design_models_routes.py` — port v1 module + S3 wiring + IFC→GLB.
- 1E · Data-source surgical endpoints: `source-crs`, `string-group`, `fields`, `preview`, `pipe-data`, `features/{id}` mutations.
- 1F · `me_routes.py` extension: generic `/api/me/json-files/{name}` GET/PUT/DELETE.
- 1G · `pipes3DConfig.py` — single source of truth Python module mirroring the JS.

**Test gate:** `pytest -x` green; smoke-test the 6 export formats via TestClient (already passing); add submission + plan + promote roundtrip test.

### Phase 2 — DAG engine
- 2A · `dagStore.ts` (Zustand) — pure logic, no Cesium. Public surface mirrors `useCadEngine`. State: nodes, outputIds, dirty set, undo/redo stack.
- 2B · `dagOps.ts` — addNode / removeNode / updateNodeAttributes / updateNodePositions / updateNodeStyle / updateNodeParam, each routing through `markDirty` + topo sort + `evaluate`.
- 2C · `dagPersistence.ts` — three-tier: localStorage recovery, S3 index+per-sketch via `/api/me/json-files/`, debounced 500ms with immediate-flush on destructive ops, `_persistReady` guard.
- 2D · `dagCesium.ts` — primitive lifecycle (`_meshPrimitives`) tied to dirty set; reconciled on undo.
- 2E · Vitest suite: load fixture, addNode → dirty propagates, removeNode cascade, undo/redo round-trip, persist→reload→equality.

**Test gate:** vitest green; one e2e test that drops a 50-node fixture into the DAG, mutates, persists, reloads, asserts equality.

### Phase 3 — ToolRegistry + Parameters
- 3A · `toolRegistry.ts` — module registry of 19 tool records: `{ id, geometryType, parameters, flags, sectionOrder, finishLabel }`. `SECTIONS` constant.
- 3B · `pipes3DConfig.ts` — full canonical schema mirror (Size / Configuration / Material / AssetType / DepthReference / WallThickness / Name / Status / Owner / InstallDate + aliases + UOM + depth refs).
- 3C · 16 Parameters components, alphabetical: Curve, Ellipse, Extrude, Loft, PipeParameters (largest, last), PolygonN, PtBox, PtCircle, PtCone, PtCylinder, PtLine, PtPit, PtSphere, Rectangle, Traverse + the boolean ops (Wire/Hole) as flagless variants.
- 3D · `usePipeTool` hook to replace v1's `inject('pipeTool')`.

**Test gate:** every Parameters component renders standalone with synthetic props.

### Phase 4 — Shared components
- 4A · `Spinner.tsx`
- 4B · `BoxPreview3D.tsx` — dimension + heading wireframe preview.
- 4C · `AttributesEditor.tsx` — refactor existing to spec layout (3-tier template merge, fields driven by template/schema, save-as-template inline form, definition-key auto-templates).
- 4D · `VertexListEditor.tsx` — list of `[lon, lat, alt]` rows with inline edit, drag-handle reorder, vertex marker highlight sync (via callback to map).

**Test gate:** Storybook-style harness page rendering all four with mock data.

### Phase 5 — Shell + tabs
- 5A · `designCtx.ts` (React Context wrapping the Zustand store) — single bundle the tabs consume.
- 5B · Restructure tabs to spec's 6: kill Edit + Style separate tabs; rename Submit → fold into Download; add Features tab.
- 5C · Tabs in size order (smallest → largest):
  1. PropertiesTab (Move/Rotate/Scale + DesignObjectEditor wrapper).
  2. HistoryTab (already close — extend with By-Type view, live-history toggle, Rebuild button).
  3. DownloadTab (current DownloadPanel + Submit-for-Review section + import-objects + import-geometry).
  4. LayersTab (sketch gallery + redline creation modal + schema editor + sketch settings popover + preset selector + layer list).
  5. FeaturesTab (tree view + table view toggle, drag-drop, batch select, attribute table with CSV diff preview).
  6. SketchTab (tools grid Create/Modify, template browser chips, op-param/pick-second bars, auto-scroll).

**Test gate:** every tab renders without console error; click between tabs clean; selection state survives.

### Phase 6 — Orchestration bars
- 6A · `PlaceModeBar.tsx` — SECTIONS 0–5 declarative render from active tool's registry record. Auto-scroll on op-param / pick-second bars.
- 6B · `ModifyPropsBar.tsx` — pinned inspector with collapsible header, type-specific editor (DesignObjectEditor for solids, VertexListEditor for strings, etc.), schema-editor button.
- 6C · Smooth look-at on zoom — first wheel after selection eases to selected (Cesium camera).

**Test gate:** drawing flow end-to-end: pick tool → place-mode-bar appears → set params → click → node added; click existing solid → modify-props-bar appears.

### Phase 7 — Persistence + Cesium smoke test + e2e
- 7A · S3 persistence wired through Phase 2's `dagPersistence` → `/api/me/json-files/`.
- 7B · Cesium primitive lifecycle integrated into the DAG (Phase 2D + the real viewer).
- 7C · End-to-end manual test the spec calls out (§12 step 11):
  blank sketch → draw → save → reload → edit → submit → admin approve → promote → verify rows in PostGIS via spatial_routes.

**Final gate:** PR-ready. `pnpm --filter @mighty-twin/web build`, `pnpm --filter @mighty-twin/web exec tsc --noEmit`, and `cd apps/api && uv run pytest -x` all green.

---

## 2 · Branch + commit cadence

Branch: **`claude/design-widget-port`** (created off `1241e10`).

**Commit policy:**
- One logical chunk per commit. Phase 1A is a single migration commit; 1B is one rewrite commit; etc.
- Conventional commits per repo style: `feat(design)`, `feat(api)`, `refactor(design)`, `test(api)`, `migration(api)`.
- Build green at every commit boundary.

**Push policy:**
- ZERO pushes until `origin/main-dev` advances past `0290a16` AND we've rebased `claude/design-widget-port` onto it.
- After rebase: push the branch only, never to `main-dev`. PR from there.

**Conflict expectations on rebase:**
- Other session's `cbe3f88 feat(design): building wizard` will collide with the design-widget tree. Resolve by integrating wizard tool into the new ToolRegistry (Phase 3) rather than into the legacy panel structure.
- `30c6faa feat(splat): in-Cesium Gaussian-splat rendering` and `1e4114e feat(splat): volumetric box…` shouldn't conflict (different widget tree).
- `0290a16 fix(viewer): kill rail fade-out…` may touch viewer chrome / rail CSS — minor; rebase will likely clean-merge.

---

## 3 · Risk + decision points

These are the calls I'd flag for review during the build, not auto-decide:

1. **Replace vs additive on `submission_routes.py`** — current v2 file is a different contract from spec. Replacing is cleaner; additive risks dual surfaces. Recommend **replace**, name new file `design_submissions_routes.py`, mount under same prefix, delete old.
2. **`mighty_spatial` view shape** — spec's `_vw_4326` exposes both `geom_src` (original SRID) and `geometry` (4326). Confirm the existing `create_reproject_view` matches before lifting promotion code.
3. **IFC→GLB** — needs `ifcopenshell` + `trimesh`. Heavy deps. Worth gating Phase 1D behind a build flag if Railway image size becomes a problem; alternative is a separate worker service (out of scope).
4. **Tab restructure breakage** — current persisted user state may have `activeTab='style'` etc. Need a migration map in `useDesignState` from old tab ids to new (`style → properties`, `edit → properties`, `submit → download`).
5. **Pipe canonical schema location** — spec §9.12 wants ONE source. Cleanest is a shared TS file imported by frontend + a Python file generated from it (or a tiny build step). Lower-effort alternative: maintain two files, document the rule in both.
6. **Phase 5 tab restructure as a single commit or as 6** — leaning 6 commits (one per tab) so any mid-phase regression is bisectable.
7. **Smooth look-at** — Cesium has multiple camera APIs. v1 likely uses `viewer.camera.flyToBoundingSphere` w/ ease. Confirm v2 viewer's camera helper matches.

---

## 4 · What stays / what dies

**Stays from current v2:**
- `design_export_routes.py`, `design_template_routes.py`, the `panels/download/` helper modules, `panels/edit/` helpers, `panels/history/` helpers — all align with spec.
- Primitives layer (SectionLabel, ColorRow, SliderRow, NumberRow, SelectRow, ToggleGroup, HexInput, SaveIndicator, MobileToolMini, SketchContextStrip, StatusBar) — useful as-is across the new tabs.
- v2 design tokens + per-component CSS files (already on the system-font / 12px-radius / 44px-tap track).
- `useCursorCoords` hook.

**Dies:**
- `useFeatureOps`, `useLayerOps`, `useSketchPersistence` — superseded by the DAG store + dagPersistence.
- `useDesignState` — superseded by `designCtx` over Zustand.
- `panels/StylePanel.tsx`, `panels/EditPanel.tsx` — folded into PropertiesTab.
- Per-tool standalone hooks (`useBoxTool`, `usePitTool`, `useCylinderTool`, `usePointTool`, `useLineTool`, `usePolygonTool`, `useRectTool`, `useCircleTool`, `useTraverseTool`, `usePrimitiveTools`) — superseded by ToolRegistry + a single `useActiveTool` dispatcher.
- `tools/solidCommit.ts`, `tools/drawUtils.ts`, `tools/designStyleUtils.ts` — folded into the DAG's Cesium reconciler.
- `panels/DesignObjectEditor.tsx`, `panels/AttributesEditor.tsx` (current shape — re-do per Phase 4C/4D).

**Dead-code-on-arrival (don't port):**
- `Draw.vue`, `DesignWidget.archive-2026-03-28.vue`, `DrawingToolbox.vue` (per spec §9.13).
- SQLite branch in any postgis_setup logic (per spec §10 "things to drop").

---

## 5 · State right now

- Branch: `claude/design-widget-port` at `1241e10` (= origin/main-dev tip).
- Spec read, plan written, no code touched.
- Waiting on: `origin/main-dev` advancing past `0290a16` (other session's local-only HEAD).
- Next action when origin advances: `git fetch origin && git rebase origin/main-dev` on this branch, resolve any wizard/splat collisions, then start Phase 1A (single migration).
