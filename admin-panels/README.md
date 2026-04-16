# @mightyspatial/admin-panels

Admin content for Mighty apps. Two variants, available via subpath imports:

```ts
import { DevToolsPage } from '@mightyspatial/admin-panels/dev-tools'
import { MockAdminPage } from '@mightyspatial/admin-panels/mock'
```

## Dev tools

Useful for widget development — inspect registered widgets, watch live
camera state, view scene JSON, tweak widget registry.

- `WidgetInspector` — lists `getWidgets()` with per-widget detail.
- `CameraHUD` — live camera position. Takes `viewer` prop (no context dep).
- `ViewerStateJson` — JSON dump of scene state for debugging.

## Mock admin

Placeholder pages that mimic MightyTwin's real admin chrome. Useful for
designing widgets that render next to realistic admin UI.

- `MockSitesPage`, `MockUsersPage`, `MockDataPage`, `MockLibraryPage`
- `MockAdminPage` wraps them with a faux sidebar nav.
