# @mightyspatial/app-shell

Responsive app chrome for Mighty platform apps (MightyDev, MightyLite, MightyTwin).
Provides:

- Top-bar with brand + tabs (Viewer · Admin · Settings)
- Responsive layout: desktop inline / tablet drawer / phone bottom-tabs
- Five view modes: `viewer-only`, `admin-only`, `split-viewer`, `split-admin`, `settings`
- URL-driven routing so deep links and browser back/forward just work
- A stable viewer container that **never unmounts** — Cesium is constructed once
  per session and the shell clips/resizes its container via CSS + `ResizeObserver`
- `ShellContext` exposing current mode, breakpoint, display mode, pane size

## Usage

```tsx
import { AppShell } from '@mightyspatial/app-shell'

<AppShell
  brand={{ name: 'MightyDev' }}
  viewer={<ViewerSurface />}
  adminContent={<DevToolsPage />}
  settingsContent={<SettingsShell />}
/>
```

The host app must wrap `<AppShell>` in a `<BrowserRouter>`. The `viewer` prop is
mounted once; the `adminContent` and `settingsContent` props are rendered only
while their respective modes are active.

## Breakpoints

Reads `@mightyspatial/tokens` → `breakpoints`:

- Phone: `<768px` — fullscreen tab switching, bottom nav
- Tablet: `768–1023px` — split becomes overlay drawer (320px)
- Desktop: `≥1024px` — inline split (420px side pane by default)

## Dev helpers

In `import.meta.env.DEV`, append `?forceBreakpoint=phone` (or `tablet` / `desktop`)
to simulate that breakpoint for testing. Production builds ignore the param.
