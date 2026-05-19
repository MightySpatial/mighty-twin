# PROBE — interior navigation spec

> "I become my eye." A point-particle camera that respects physical interiors —
> pipes, rooms, pits, tunnels — and gives natural haptic-feeling feedback so
> you don't fly through walls. Plus first-class Google Street View as a sibling
> navigation paradigm.

Status: Architecture spec + phased build. UX mockups at `/dev/probe/`.
Naming: see §10. Cross-flows: §11.

---

## 1 — Concept

Probe is a constrained-navigation mode for inspecting the **interior of structures**:
pipes, conduits, ducts, mineshafts; rooms, chambers, halls; pits, vaults, plant
basements. One primitive — `NavigableSpace` — covers all of them. The camera
origin is treated as a 1D body. Walls don't pass through it.

Two layers of constraint:

- **Hard** — collision-and-slide. The camera cannot cross a surface; if forced,
  its motion is projected onto the surface tangent.
- **Soft** — proximity damping. As distance to a surface drops below
  `collision_threshold` (default 0.3 m), velocity in that direction is damped
  with a spring-damper. Visually, a faint vignette darkens on the wall side so
  the user **feels** the wall through the camera's response.

Net effect: the user's hand input is interpreted as if they were a single point
walking around inside the structure. Lean against a wall, slide along it,
can't punch through. This is what "eye = body" means in practice.

Probe is also the host for **Google Street View**: a sibling step-navigation
paradigm where the constraint is "stay on a panorama node, step to neighbors."
Same Fly-widget binding (WASD step), same widget tile, different geometry source.

---

## 2 — Naming

We use `Probe` throughout — class names, route segments, UI labels. Considered
and rejected: `Interior` (clashes with interior design), `Inside` (toneless),
`Hollow` (poetic but ominous), `Inhabit` (best metaphor but long), `Boresight`
(too niche). `Probe` works as noun and verb, fits buttons, and doesn't bind to
any one geometry (pipes/rooms/pits all "probe" naturally).

Street View remains "Street View" — it's a Google trademark and users already
know the term.

---

## 3 — Data model

```sql
-- One row per navigable interior. A pipe = path, a room = volume, a sewer = network.
CREATE TABLE navigable_space (
  id                    UUID PRIMARY KEY,
  site_id               UUID NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  parent_feature_id     UUID NULL REFERENCES site_feature(id) ON DELETE SET NULL,
  kind                  TEXT NOT NULL CHECK (kind IN ('path','volume','network')),

  -- Geometry. Exactly one of these must be non-null, per `kind`.
  path_geometry         GEOMETRY(LineStringZ, 4326) NULL,   -- kind = 'path'
  volume_geometry       GEOMETRY(PolyhedralSurfaceZ, 4326) NULL,  -- kind = 'volume'
  network_root_space    UUID NULL REFERENCES navigable_space(id), -- kind = 'network' (graph root)

  -- Cross-section (paths only). Either radius (cylinder) or polygon (oval/box/I-beam).
  cross_section_radius_m  REAL NULL,
  cross_section_polygon   JSONB NULL,

  -- Visual fidelity assets (optional).
  interior_tileset_url   TEXT NULL,           -- 3D Tiles serving the interior surface
  collision_mesh_url     TEXT NULL,           -- explicit collision; default = derive

  -- Surface materials (optional, for visual feedback).
  wall_color             TEXT NULL,           -- e.g. '#4a4a52' for default near-wall vignette tint

  -- Audit.
  created_at, updated_at, created_by, updated_by …
);

-- Graph edges between navigable spaces. Only used when kind='network' or when
-- two paths share an endpoint that should be navigable (T-junction in a sewer).
CREATE TABLE navigable_connection (
  id                UUID PRIMARY KEY,
  from_space_id     UUID NOT NULL REFERENCES navigable_space(id) ON DELETE CASCADE,
  to_space_id       UUID NOT NULL REFERENCES navigable_space(id) ON DELETE CASCADE,
  junction_point    GEOMETRY(PointZ, 4326) NOT NULL,
  connection_type   TEXT NOT NULL CHECK (connection_type IN ('endpoint','midpoint-branch','portal')),
  bidirectional     BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ON navigable_connection (from_space_id);
CREATE INDEX ON navigable_connection (to_space_id);

-- Workspace settings additions (not a new table; added to existing system_settings).
ALTER TABLE system_settings
  ADD COLUMN google_maps_api_key   TEXT NULL,
  ADD COLUMN probe_default_radius  REAL NOT NULL DEFAULT 0.5,
  ADD COLUMN probe_damp_threshold  REAL NOT NULL DEFAULT 0.3,
  ADD COLUMN probe_yaw_only_roll   BOOLEAN NOT NULL DEFAULT TRUE;
```

### Why one primitive instead of three

Pipes, rooms, and pits share more behavior than they differ. All:
- Need a "snap-to" anchor.
- Need a collision representation.
- Optionally have an interior 3D tileset.
- May connect to neighbors.

Different `kind`s pick different geometry storage + different constraint maths.
The widget UI, the Fly integration, the arrow primitives, the
collision-and-slide loop, the settings — all shared.

### Why `parent_feature_id` is nullable

Two creation paths:
1. **Annotated**: existing pipe/room feature → admin clicks "Make probe-navigable"
   → row is created with `parent_feature_id` pointing back.
2. **Standalone**: admin uses the Probe tool to draw a centerline that has no
   feature backing it (a planned tunnel route, a partial scan). `parent_feature_id`
   is null.

The viewer treats both identically.

---

## 4 — Camera constraint math

### 4.1 Path constraint (kind = 'path')

Centerline `L: [0,1] → ℝ³`, sampled as a polyline. Radius `r`. Camera at `P`.

```
function constrainToPath(P_target, velocity, dt):
  # Project to centerline
  t_star = nearestParam(L, P_target)
  C = L(t_star)
  T = unitTangent(L, t_star)               # along the pipe
  offset = P_target - C                    # vector from centerline to camera
  d_perp = ||offset - dot(offset, T) * T|| # orthogonal distance

  # Hard collide
  if d_perp > r - ε:
    radial = (offset - dot(offset, T)*T) / d_perp
    P_constrained = C + radial * (r - ε) + dot(offset, T)*T
  else:
    P_constrained = P_target

  # Soft damp
  if d_perp > 0.6*r:                       # 60 % of radius = damp band
    radial = (offset - dot(offset, T)*T) / max(d_perp, 1e-6)
    v_radial = dot(velocity, radial)
    if v_radial > 0:                       # only damp when moving outward
      damp = clamp((d_perp - 0.6*r) / (0.4*r), 0, 1)
      velocity -= radial * v_radial * damp

  # Roll snap (elastic spring to world up)
  if probe_yaw_only_roll:
    target_roll = 0  # local up = world up
    current_roll = camera.roll
    camera.roll = lerp(current_roll, target_roll, k_roll * dt)

  return P_constrained, velocity
```

### 4.2 Volume constraint (kind = 'volume')

Closed mesh `M` (polyhedral surface). Signed distance field `SDF`.

```
function constrainToVolume(P_target, velocity, dt):
  s = SDF(P_target, M)                     # < 0 inside, > 0 outside
  if s > -ε:                               # camera would leave interior
    n = -gradSDF(P_target, M)              # outward normal of the mesh
    # Project back into the interior
    P_constrained = P_target - n * (s + ε)
    # Slide: kill velocity component into the wall
    v_into = dot(velocity, n)
    if v_into > 0:
      velocity -= n * v_into
  else:
    P_constrained = P_target

  # Soft damp near walls
  if -damp_threshold < s < -ε:
    damp = clamp((s + damp_threshold) / damp_threshold, 0, 1)
    n = -gradSDF(P_target, M)
    v_into = dot(velocity, n)
    if v_into > 0:
      velocity -= n * v_into * damp

  return P_constrained, velocity
```

In practice we don't compute a true SDF on a complex mesh — we use a **BVH +
nearest-triangle distance** and treat the surface as locally planar. Cesium
ships a BVH on Cesium3DTileset (used for picking); for plain meshes we use
`three-mesh-bvh` or our own kd-tree.

### 4.3 Network arrows

When the camera is within `2 * r` of a `NavigableConnection.junction_point`,
the connection becomes "active":

- For each connected NavigableSpace, render a billboard arrow at the junction,
  oriented along that space's tangent at the junction.
- Tap an arrow → fly the camera smoothly along the connection's tangent into
  the new space; at t=1 the new space takes over as the active probe.
- The forward arrow (continuation of the current space) is always rendered as
  long as the current `t` < 1.

For non-networked paths, we still synthesise forward/back arrows from the
current path's tangent so the user always has a "step further" affordance —
matching Street View muscle memory.

---

## 5 — Street View integration

Google's `StreetViewService.getPanorama(location, radius)` returns the nearest
panorama or rejects. The widget mounts on demand:

```
when user taps Street View tile:
  if google maps api key not set:
    show settings prompt → Engine > Google
    return
  if !google.maps loaded:
    inject <script async src="…&key=APIKEY&libraries=streetview"></script>
    await load
  show "tap a point" hint over the map
  on point tap:
    StreetViewService.getPanorama({location, radius: probe_default_radius * 50})
    if hit: open StreetViewPanel with that panoId
    if miss: toast "No Street View imagery here"
```

### Layout

| viewport | layout |
|---|---|
| phone | top half panorama, bottom half Cesium thumbnail showing pano position |
| tablet portrait | panorama full-width on top (60 %), Cesium below (40 %) |
| tablet landscape | side-by-side, 50/50, draggable divider |
| desktop | side-by-side, 50/50, draggable divider |

The Cesium half is always live — moving the panorama updates the Cesium
camera's position-on-the-ground to match.

### Fly-widget binding in Street View

Street View is **step nav**. The continuous-fly gear shifter is irrelevant.
The binding becomes:

| Fly input | Street View action |
|---|---|
| WASD-W | step to closest forward-link panorama |
| WASD-S | step to closest backward-link panorama |
| WASD-A | look left (-yaw) |
| WASD-D | look right (+yaw) |
| Arrow up/down | look up/down (±pitch) |
| Q/E | no-op |
| 1–5 (gears) | no-op |
| ESC | close Street View, return to map |

The Fly widget's own UI shows a "Step nav" indicator instead of gears when
Street View is active.

---

## 5b — Activation: drag-to-probe (the "pegman" pattern)

Both Probe and Street View activate by **dragging their tile glyph onto the map**.
Same gesture, different drop semantics. This is Google Maps' Street View pegman
pattern, generalised to two paradigms.

### Probe drag flow

1. User pinches/clicks-and-holds the **Probe** tile in the primary rail.
2. A floating Probe glyph (target reticle + radiating circles) appears under the cursor / finger.
3. The map enters **probe-drop mode**:
   - All navigable features highlight (pipes glow indigo, navigable polygons get an indigo outline).
   - Cursor over a navigable feature → glyph turns solid + cursor changes to `grabbing`.
   - Cursor over non-navigable space → glyph stays semi-transparent + cursor `not-allowed`.
4. On release:
   - **Over a navigable feature** → snap to nearest point on the feature's NavigableSpace, fly-to-entry, Probe activates at that t.
   - **Over empty / non-navigable** → glyph snaps back to the tile with a quick bounce; toast: "Drop on a navigable feature."
   - **Over a feature without a NavigableSpace** but the user is an admin → inline prompt "Mark this feature navigable?"; tap = open the admin-mark modal (W1 with values pre-filled).
5. The Probe tile in the rail becomes the **active** state (tile fills with indigo) until the user exits.

### Street View drag flow

1. Pinch/click-and-hold the **Street View** tile.
2. A blue pegman glyph follows the cursor.
3. The map enters **streetview-drop mode**:
   - Roads with Street View imagery render as blue glow lines (uses `StreetViewCoverageLayer` from Google Maps JS API).
   - Cursor over a road segment with coverage → glyph turns solid blue.
   - Cursor over non-covered area → glyph semi-transparent.
4. On release:
   - **Over a covered road** → `StreetViewService.getPanorama` at drop point → panorama opens in split-pane.
   - **Over uncovered area** → snap-back + toast "No Street View imagery here."

### Drag mechanics — implementation notes

- HTML5 drag-and-drop is too restrictive on touch (no touch drag spec). Use a custom pointer-events driver: `pointerdown` on tile → grab; `pointermove` on document → update glyph position + map hit-test; `pointerup` → drop.
- Glyph element is a `position: fixed` div, transform-translated by JS each frame.
- Map hit-test: Cesium's `scene.pick(windowPosition)` returns the entity / primitive under the cursor. If primitive has a NavigableSpace tag, it's a valid drop target.
- The drop preview (highlight + glyph) is computed in the map's coordinate frame so the user can see *where* they'll land before releasing.
- Drag-from-tile must also accept a **tap** as a fallback: a tap on the Probe tile (no drag, just release) → "Tap a feature on the map to probe" hint (same as drag-then-release-over-feature, but with a follow-up tap). Mobile users with no precise drag will use the tap+tap path.

### Visual: the Probe glyph

A 24×24 reticle: a centered dot (4px) with two concentric circles (8px and 14px diameters) and a small downward triangle (3×3) at 6 o'clock — like a target lock with a "drop here" hint. Indigo when valid, neutral gray when invalid. The glyph is the same image used on the Probe rail tile, scaled up.

### Visual: the Street View pegman

Reuse Google's official pegman SVG (allowed under the Maps Platform terms when paired with Google imagery). Blue when over coverage, gray when not.

---

## 6 — Widget composition

| Existing | Probe adds |
|---|---|
| Fly widget — continuous 6DOF | Constrained mode: clamps motion via §4.1 or §4.2 when probe is active |
| Create widget — draws features | New tool: "Probe centerline" — outputs a NavigableSpace of kind='path' on save |
| Story widget — replays camera | Adds Probe step nodes; replay snaps into Probe mode on entry |
| Snap widget — screenshot | Captures Probe view too (works from any camera state) |
| Layers widget | New layer type: "Probe" — toggles NavigableSpace visualization (centerlines, junction dots) |
| Legend widget | Auto-includes probe entries when any are visible |
| Measure | Disabled inside Probe (pick rays would land on collision walls, not real-world features). Toast: "Exit Probe to measure." |
| Table | Lists NavigableSpace entries when Probe layer is visible |

---

## 7 — Detection — three paths from cheap to ambitious

### Annotated (Phase B, mandatory)
Admin draws a centerline + sets radius via Create > Probe centerline tool, or
admin imports a GeoJSON LineString file with a `radius` property. One row, one
form, one save click.

### Auto-link (Phase D)
Background job scans existing features:
- LineString or MultiLineString feature with `tileset_url` set → auto-create a
  NavigableSpace of kind='path', radius from the feature's
  `cross_section_radius` property (or settings default).
- Polygon + `extruded_height` + `tileset_url` → kind='volume'.
- Network: if two paths share an endpoint within `ε`, auto-create a
  NavigableConnection.

Output: a "Detected N navigable spaces — review" toast that opens an admin
page where the user accepts/rejects.

### Voxel flood-fill (Phase F)
For a 3D tileset of a building exterior, derive the interior:

1. Voxelize the tileset bounding box at a chosen resolution (e.g. 0.5 m).
2. For each voxel, ray-cast outward in 6 directions: if all 6 rays hit a
   surface, the voxel is interior.
3. Connected-component label the interior voxels.
4. Each component becomes a NavigableSpace of kind='volume' with the
   component's voxel hull as `volume_geometry`.

Cost: O(N³) memory, O(N³ * 6) rays. For a 100×100×30 m building at 0.5 m → 12 M
voxels, 72 M rays. Tractable on a worker thread, ~30 s per building. Output:
"Detected N rooms in this building — accept?".

This is research-grade and not in v1; Phase F sketch only.

---

## 8 — Click-by-click workflows

### W1 — Admin marks an existing pipe as Probe-navigable

| step | UI | action | state change |
|---|---|---|---|
| 1 | Map view | Admin opens site, sees pipe feature on map | — |
| 2 | Map view | Click pipe → FeaturePopup opens | popup state |
| 3 | FeaturePopup | Action group includes "Make navigable" (new button) | — |
| 4 | (modal) | Click → modal: "Mark as Probe-navigable?" with fields: Radius (m), Interior tileset URL (optional) | modal open |
| 5 | Modal | Fill radius (default 0.5), optionally paste tileset URL, click Save | POST `/api/spatial/probe/spaces` |
| 6 | Map view | Toast "Pipe is now navigable" with "Open Probe" action | NavigableSpace row exists |
| 7 | Map view | (optional) Click Open Probe → enters Probe mode on this space | activeProbe = id |

### W2 — Casual user enters Probe on a pipe

| step | UI | action | state change |
|---|---|---|---|
| 1 | Map view | User taps a pipe (with NavigableSpace) | FeaturePopup |
| 2 | FeaturePopup | "Probe" button visible | — |
| 3 | Map view | Click Probe → camera flies to entry point, fade-to-interior transition | probeOpen=true, activeProbe=id |
| 4 | Probe view | Camera locked to centerline at t=0.0. Fly HUD shows step indicator | — |
| 5 | Probe view | Press W → camera advances along centerline (continuous fly, soft-radius clamp) | t += dt * speed |
| 6 | Probe view | Press W again as we hit junction → forward arrow lights up | arrowActive=fwd |
| 7 | Probe view | Click forward arrow (or just keep pressing W) → smooth fly into next space | activeProbe=next |
| 8 | Probe view | Press ESC → fade-out, camera returns to start position | probeOpen=false |

### W3 — Switching from Probe to Street View

| step | UI | action | state change |
|---|---|---|---|
| 1 | Probe view | Camera inside pipe | activeProbe=id |
| 2 | Primary rail | Click Street View tile | (intent) |
| 3 | Toast | "Exit Probe to enter Street View?" with Confirm | — |
| 4 | (transition) | Click Confirm → exit Probe (camera returns to surface entry), Street View activates | probeOpen=false, svOpen=true |
| 5 | Map view | "Tap a point on the map" hint | — |
| 6 | Map view | User taps street point → panorama opens | svOpen=true, panoId=… |

### W4 — Switching from Street View to Probe

| step | UI | action | state change |
|---|---|---|---|
| 1 | Street View | Panorama open | svOpen=true |
| 2 | Cesium half | Pipe visible underground in Cesium half | — |
| 3 | Cesium half | Tap pipe → "Probe this pipe" prompt | — |
| 4 | (transition) | Confirm → Street View closes, Probe enters at pipe segment closest to current panorama position | svOpen=false, probeOpen=true |

### W5 — Drawing a brand-new Probe path (no parent feature)

| step | UI | action | state change |
|---|---|---|---|
| 1 | Map view | Open Create widget → DRAW tab | createOpen=true |
| 2 | Create widget | Pick "Probe centerline" tool from More > Probe | activeTool='probe-centerline' |
| 3 | Map view | Click points along the route; each click adds a vertex with depth (depth slider in the tool's options) | working centerline |
| 4 | (option panel) | Set Radius (default 0.5 m), optional Interior tileset URL | — |
| 5 | Create widget | Click Save | POST creates NavigableSpace with parent_feature_id=null |
| 6 | Map view | Centerline now renders on map; clickable to enter Probe | NavigableSpace persisted |

### W6 — Probe path with interior 3D tiles

| step | UI | action | state change |
|---|---|---|---|
| 1 | Probe view | Enter Probe on a space that has `interior_tileset_url` set | activeProbe=id, tileset loading |
| 2 | Probe view | Tileset streams in, replaces flat radius cylinder with real geometry | tileset visible |
| 3 | Probe view | Camera collides against tileset BVH instead of the synthetic radius | constraint = mesh-BVH |
| 4 | Probe view | Press W into a junction → arrow lights up if mesh portal exists; otherwise no arrow | — |
| 5 | Probe view | Press ESC → tileset unloads (with 5 s grace), camera returns | — |

### W7 — Visual feedback near wall (the "feel")

| step | UI | action | state change |
|---|---|---|---|
| 1 | Probe view | Camera at centerline, t=0.3, far from any wall | normal render |
| 2 | Probe view | User holds D → camera attempts to drift right | velocity.x > 0 |
| 3 | Probe view | d_perp passes 0.6*r threshold → vignette starts darkening on the right side | vignette opacity 0→0.4 |
| 4 | Probe view | d_perp approaches r-ε → vignette near max; subtle camera shake (1px scale) | vignette opacity 0.4→0.6 |
| 5 | Probe view | d_perp = r-ε → motion in that direction stops; vignette stays | velocity.x = 0 |
| 6 | Probe view | User releases D, taps A → vignette fades, camera moves freely back | — |

---

## 9 — Edge cases (every one of these has a behaviour)

| edge case | behaviour |
|---|---|
| User enters Probe at a path's endpoint where another space connects | Auto-show junction arrows on entry; user can pick which way to start |
| Probe has interior_tileset_url but tileset fails to load | Fall back to synthetic radius cylinder; toast "Interior tiles unavailable, using approximation" |
| Probe path has zero length (single point) | Reject creation in admin UI; toast "Probe path needs ≥ 2 vertices" |
| Probe radius < 0.05 m | Reject; toast "Radius must be ≥ 0.05 m" |
| User exits browser tab mid-Probe and returns | Probe state persisted in URL: `/viewer/site/X/probe/Y@t=0.42`; resumes on reload |
| Two probes selected simultaneously (Layers panel multi-select) | Only the active probe constrains the camera; others show their centerlines as picker affordances |
| User clicks a feature in Cesium while in Probe | Pick ray hits collision wall first (good — prevents underground picking confusion). FeaturePopup shows the wall point's containing space info |
| User triggers Fly inside Probe | Fly engages with constrained-mode flag — gear shifter still works but speeds are capped near walls |
| Street View API key absent | Street View tile shows lock icon; tap → toast "Add Google Maps API key in Settings" with link |
| Street View imagery missing for picked point | Toast "No imagery within {radius} m"; suggest panning to a nearby road |
| User tries to Probe a 3D feature that isn't navigable | "Make this navigable?" inline prompt if user is admin; "Owner hasn't enabled Probe" toast otherwise |
| NavigableConnection points to a deleted space | Edge auto-deleted (FK cascade); arrow not rendered |
| Camera enters a path's radius cylinder from outside (e.g. user clicked an end) | Snap to nearest centerline `t`, then drop into Probe normally |
| Path centerline crosses itself (e.g. a loop) | Argmin-t allows ambiguity at intersection; Fly keeps the t direction it started on (no teleporting) |
| Mobile user has no keyboard | Fly widget on mobile already uses tap-to-move; in Probe mode taps become "step forward toward tap point", clamped to constraint |

---

## 10 — Naming consistency

| concept | name | URL / class / API |
|---|---|---|
| The mode | Probe | `/viewer/site/X/probe/Y` |
| The data primitive | NavigableSpace | `navigable_space` table, `NavigableSpace` TS type |
| The widget | ProbeWidget | rail tile labeled "Probe" |
| The hook | useProbe | — |
| The state | probeOpen, activeProbeId | — |
| The constraint engine | probeConstraint | — |
| Street View | Street View | "Street View" (unchanged Google term) |
| The settings group | Engine > Google | — |

---

## 11 — Cross-flows (every combination has a defined behaviour)

| from \ to | viewer (overview) | viewer (per-site) | Probe | Street View | Create | Measure | Story | Settings |
|---|---|---|---|---|---|---|---|---|
| **viewer overview** | — | tap site card | (n/a) | tap SV tile, then point | (n/a) | (n/a) | (n/a) | bottom nav |
| **viewer per-site** | brand button → picker | — | tap feature → Probe / pick from layer | tap SV tile, then point | rail tile → Create | rail icon → Measure | rail tile → Story | bottom nav |
| **Probe** | brand button (confirm exit) | ESC | — | confirm exit Probe first | rail tile (exits Probe to Create) | disabled toast | rail tile (exits Probe; Story can include Probe segments) | bottom nav |
| **Street View** | brand button (confirm exit SV) | ESC closes SV | tap a pipe in Cesium half | — | (disabled while SV open; rail tile dimmed) | (disabled) | rail tile (closes SV; Story can include SV nodes) | bottom nav |
| **Create** | (n/a) | rail toggle / close | save+exit, then activate new Probe on result | — | — | (rail toggle) | — | — |
| **Measure** | (n/a) | exit measure | — | — | — | — | — | — |
| **Story** | (n/a) | exit story | story can include Probe → enters Probe automatically | story can include SV → enters SV | — | — | — | — |
| **Settings** | bottom nav | bottom nav | bottom nav (Probe persists in URL → restored on return) | bottom nav (SV closes on leaving viewer mode) | bottom nav | bottom nav | bottom nav | — |

Reading the table: **rows are current state, columns are intent**. Cells with
"confirm exit" mean a modal/toast confirms the destructive transition. Cells
with "exits X" mean the current mode auto-closes when entering the new one.

---

## 12 — Phased build (this PR series)

| phase | scope | PR |
|---|---|---|
| **A** | Settings field for Google API key. Street View widget + panel. Panorama mount + Cesium-side position mirroring. WASD step-nav | #N |
| **B** | NavigableSpace types + hook. Probe widget + activation. Path constraint (§4.1). Fly integration. Synthetic radius cylinder visualization | #N+1 |
| **C** | Interior 3D Tiles. BVH-based collision. `interior_tileset_url` loading + unload-on-exit | #N+2 |
| **D** | NavigableConnection + network arrows. Auto-link Phase (background job) | #N+3 |
| **E** | Volume/room kind. Signed-distance against mesh. Volume admin UI | #N+4 |
| **F** | Voxel flood-fill auto-detect (worker thread, building-scale) | #N+5 |
| **G** | Live near-analysis HUD — admin-configured in Atlas: which layers feed the HUD, threshold radii, what fields to surface. Renders as a side strip while probe is active showing nearest features streamed as the camera moves. See §14 below. | #N+6 |

Each PR is fully self-contained. Each includes:
- Type-checked build
- Updated mockups for new states
- Updated cross-flow table entries
- Test plan in PR description

---

## 14 — Live near-analysis HUD (Phase G)

While the user is inside a probe, a side HUD streams nearby features so the
operator has live context — a parallel cable, an upcoming valve, the floor of
a parent room, the next manhole. Configured in Atlas (admin pane) per
workspace.

### Atlas configuration UI

`/admin/probe-hud` lists each NavigableSpace kind (path / volume) and lets
admins choose:

- **Feeder layers** — which layer ids participate (e.g. "utility-cables", "service-pits"). Multi-select.
- **Search radius (m)** per layer.
- **Display fields** — which feature attributes to surface (e.g. `diameter`, `material`, `installed_date`).
- **Severity rules** — optional thresholds: "if `installed_date` < 1980 highlight in amber".
- **Sample rate** — how often the near-query re-runs (10 Hz default; admin can lower for performance).

### Runtime feed

`useProbeHud(viewer, activeSpace, hudConfig)` runs a sampled near-query each
~100 ms. Uses a quadtree built from the configured layers' feature
geometries (computed once per layer load, cached). Returns:

```
{
  nearest: [
    { layerId, featureId, distanceM, fields: {...}, severity: 'normal' | 'warn' | 'alert' },
    ...
  ],
}
```

The HUD renders these as a vertical strip on the right side (desktop /
tablet) or as a horizontal strip below the CtrlPill (phone). Each row shows:
distance · feature label · key fields · severity badge. Tap a row → fly
camera to the feature (exits Probe with a "return to probe" toast).

### Performance

- Quadtree build is O(N log N) once per layer load; query is O(log N + k).
- Near-query throttled to the configured sample rate.
- Off the hot path: HUD updates in a `requestIdleCallback` whenever possible.

### Cross-flow

| from | to | behaviour |
|---|---|---|
| Probe (HUD off) | Probe (HUD on) | Atlas saves → next probe entry mounts HUD |
| Probe + HUD | Story | Story records HUD config used; replay re-mounts same HUD |
| Probe + HUD | Settings | HUD pauses; resumes on return |
| Probe + HUD | Tap a row | Fly to feature (exits Probe) |

---

## 15 — Open questions (answered)

- **Network vs ad-hoc**: Both. `NavigableConnection` is optional. Spaces stand alone.
- **Auto-detect required**: No, manual annotation works for v1. Phase F is research.
- **Built-in 3D tiles support**: Yes, every path/volume can attach a tileset URL.
- **Pits and buildings**: Same kind='volume', different SDF source. Single code path.
- **Street View paid?**: Yes (Google's pricing). API key in Settings, user's responsibility.
