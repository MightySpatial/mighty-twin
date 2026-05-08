# @mightyspatial/utils

Shared utilities that are **Cesium-agnostic** — geometry helpers, formatters,
and pipe depth-offset math that can run on both the viewer side (applied to
Cesium Cartesian3 positions) and server-side code.

If a helper needs Cesium types, it belongs in `@mightyspatial/cesium-core`,
not here.
