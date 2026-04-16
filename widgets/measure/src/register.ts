import { registerWidget, type WidgetManifest } from '@mightyspatial/widget-host'
import { MeasureWidget } from './MeasureWidget'
import { MeasureIcon } from './MeasureIcon'

export const measureManifest: WidgetManifest = {
  id: 'measure',
  name: 'Measure',
  version: '0.1.0',
  icon: MeasureIcon,
  placement: 'toolbar',
  Component: MeasureWidget,
  description: 'Measure distance and area on the globe.',
}

/** Register the Measure widget with the host. Idempotent. */
export function register(): void {
  registerWidget(measureManifest)
}
