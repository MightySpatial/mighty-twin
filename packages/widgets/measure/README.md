# @mightyspatial/widget-measure

Distance and area measurement on the Cesium globe. The reference
implementation for the Mighty widget package pattern — see
[`spec.md`](./spec.md) for the contract and
[`guide/guide.html`](./guide/guide.html) for the user-facing documentation.

## Register with a host app

```ts
import { register as registerMeasure } from '@mightyspatial/widget-measure'

registerMeasure()
```

## Structure

```
measure/
├── spec.md               Contract (source of truth for behaviour)
├── src/
│   ├── index.ts
│   ├── MeasureWidget.tsx Self-contained widget component
│   ├── useMeasure.ts     Cesium-interaction hook (click lifecycle, entities)
│   ├── measureUtils.ts   Pure geometry (Cesium-free unit-testable)
│   ├── register.ts       Widget manifest
│   └── types.ts
├── guide/
│   ├── guide.html        Hand-authored user guide (static HTML)
│   └── guide.md          Mirror of the guide for ux-guide consumption
├── preview/
│   ├── preview.tsx       Live interactive demo (for ux-guide Live tab)
│   └── fixtures.ts       Canned site + camera data
└── test/
    ├── measureUtils.test.ts
    └── MeasureWidget.test.tsx
```
