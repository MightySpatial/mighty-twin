# @mightyspatial/widget-sdk

**Third-party, sandboxed widget SDK** — for widgets loaded from customer
buckets that must run in an iframe, isolated from the host viewer. Widgets
built with this SDK communicate with the host via structured `postMessage`
requests and never touch the host's Cesium instance directly.

This is the right SDK for:
- Customer-authored widgets the platform should not fully trust
- Embedded dashboards loaded from external domains
- Widgets that may run in contexts other than the main viewer (e.g. a mobile
  shell with the SDK driven by a React Native bridge)

**For first-party widgets** authored inside this monorepo that need direct
Cesium access and tight integration, use
[`@mightyspatial/widget-host`](../widget-host) instead.
