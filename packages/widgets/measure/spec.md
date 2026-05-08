# Measure — Specification

**Spec version:** 1  
**Implementation version:** 0.1.0  
**Status:** In development

## Purpose

One sentence: let a user measure the distance between two or more points on
the globe, and optionally the polygon area enclosed by three or more points.

## Controls

| Control | Behaviour |
|---|---|
| **Start button** | Arms the tool. Pointer picks globe positions. Active-state indicator is shown. |
| **Cancel button** | Visible only while active. Tears down the tool without saving a result. |
| **Clear button** | Visible only after a result exists. Removes the entities and the result panel. |
| **ESC key** | Equivalent to Cancel when active; no-op otherwise. |

## Interaction lifecycle

1. **Idle** — the widget is mounted; no entities on the globe. Only the Start button is visible.
2. **Active — 0 points placed** — a hint tooltip reads "Click on the globe to place points. ESC to cancel." No running distance shown.
3. **Active — N ≥ 1 points placed** — each placed point is a visible dot clamped to the ground. A dynamic polyline follows the cursor from the last placed point. A floating tooltip reads "<running distance> — N point(s) — double-click to finish."
4. **Finished** — double-click commits the measurement. The dynamic polyline is replaced with a static clamped polyline, and (if ≥ 3 points) a translucent polygon fill. The result panel appears with Distance, Area (if polygon), and Point count. Cancel is replaced with Clear.
5. **Cleared** — Clear removes all entities and returns to the Idle state.

## States and appearance

| State | Dot colour | Line | Polygon fill | Result panel |
|---|---|---|---|---|
| Idle | — | — | — | Hidden |
| Active, 0 pts | — | — | — | Hint tooltip |
| Active, 1+ pts | Indigo `#6366f1` | Indigo 80% opacity, dynamic | — | Running tooltip |
| Finished (line) | Indigo | Solid indigo, static | — | Distance + points |
| Finished (polygon) | Indigo | Solid closed-ring | Indigo 15% opacity | Distance + area + points |

## Geometry model

- Points picked via `globe.pick` against a ray from the current camera through the screen position. No terrain-height offset — all points are clamped to ground for rendering.
- **Distance**: sum of great-circle `Cartesian3.distance` between consecutive points. Unit: metres.
- **Area**: signed spherical-polygon area using Earth radius `R = 6 371 000 m`; absolute value taken. Unit: square metres. Only computed when point count ≥ 3.

## Formatting

- Distance: `meters.toFixed(1) + ' m'` when < 1000 m, else `(meters/1000).toFixed(2) + ' km'`.
- Area: `sqm.toFixed(0) + ' m²'` when < 1 ha, `(sqm/10000).toFixed(2) + ' ha'` when < 1 km², else `(sqm/1_000_000).toFixed(2) + ' km²'`.

## Integration points

- **`@mightyspatial/cesium-core` → `useViewerRef()`**: obtains the live viewer.
- **Cesium globals used**: `Entity`, `ScreenSpaceEventHandler`, `CallbackProperty`, `PolygonHierarchy`, `HeightReference.CLAMP_TO_GROUND`.
- **No API calls** — Measure is stateless; it does not persist measurements to the backend in v1.
- **No auth requirements** — available to all roles (viewer, creator, admin).
- **No layer dependencies** — does not register a layer renderer.

## Out of scope (v1)

- Saving measurements as features
- Editing a finished measurement (click-drag vertices)
- Terrain-height measurements (ground vs above-ground)
- Unit switching (imperial, nautical miles)
- Measuring along a path constrained to an existing layer
- Exporting results
- Multiple simultaneous measurements

## Capabilities required

None. Measure runs with no host-granted capabilities.

## Accessibility

- All controls are keyboard-reachable.
- Running tooltip uses `aria-live="polite"`.
- Result panel close button is labeled "Close measurement".
- Colour is never the sole differentiator; active state also changes the button label.
