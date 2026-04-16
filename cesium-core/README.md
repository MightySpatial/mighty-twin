# @mightyspatial/cesium-core

The foundation every Mighty first-party widget builds on:

- `CesiumProvider` — a React context that owns the viewer instance and exposes
  it to descendants via `useViewer()` and `useViewerRef()`.
- `useCameraState` — reactive camera position and orientation.
- `useGlobePicker` — typed helper for converting screen-space clicks into
  `Cartesian3` globe positions.
- `basemaps` — the canonical imagery + terrain presets we ship.
- Utility exports of re-exported Cesium types for widgets that need them.

Cesium itself is a **peer dependency** — the host app pins the version, so
widgets never ship their own copy.
