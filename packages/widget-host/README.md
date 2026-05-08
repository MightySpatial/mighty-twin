# @mightyspatial/widget-host

The contract every first-party Mighty widget implements, plus a small runtime
that host apps (MightyDev, MightyLite, MightyTwin) use to register and render
widgets.

Widgets built against this SDK run **in-process** with the host, have **direct
access to the Cesium viewer**, and are fully trusted by the app shell. This
is the SDK for widgets authored inside the Mighty monorepo.

For untrusted, sandboxed widgets loaded from customer buckets, use
[`@mightyspatial/widget-sdk`](../widget-sdk) instead — it's a separate,
postMessage-based contract.

## Quick shape

```ts
import { registerWidget } from '@mightyspatial/widget-host'

registerWidget({
  id: 'measure',
  name: 'Measure',
  version: '0.1.0',
  icon: Ruler,
  placement: 'toolbar',
  Component: MeasureWidget,
})
```

See `src/index.ts` for the full `WidgetManifest` and `WidgetContext` shapes.
