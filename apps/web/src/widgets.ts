import { register as registerMeasure } from '@mightyspatial/widget-measure'

export function registerAll(): void {
  registerMeasure()
  // Day-2+: register enterprise widgets (feature-editing, strike, terrain)
  // as they ship from the platform.
}
