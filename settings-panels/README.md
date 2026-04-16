# @mightyspatial/settings-panels

The four settings tabs shared by all Mighty apps. Persisted to localStorage,
subscribeable via a `CustomEvent` so consumers (widgets, viewer, theme) react
live.

## Usage

```tsx
import { SettingsShell, usePersistedSettings } from '@mightyspatial/settings-panels'

<AppShell settingsContent={<SettingsShell />} ... />
```

Consumers read settings via `usePersistedSettings()`:

```tsx
const { settings, update } = usePersistedSettings()
console.log(settings.units.length)  // 'metric'
```

## Persistence

`localStorage['mighty-settings-v1']`. On write, `window` dispatches a
`CustomEvent('mighty-settings-change', { detail: settings })`. Consumers
subscribe to stay live without prop-drilling.

## Reload-required vs live

- **Reload required** (flagged with a badge in the UI): basemap provider,
  terrain enabled, Ion token.
- **Live**: units, theme, density, widget enable toggles, debug overlays.
