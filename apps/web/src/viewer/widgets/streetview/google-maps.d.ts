/** Minimal ambient declarations for the parts of the Google Maps JS API
 *  we touch in the Street View widget. Avoids the full
 *  `@types/google.maps` dep (which is ~500 KB of types we don't need).
 *
 *  Source of truth:
 *  https://developers.google.com/maps/documentation/javascript/reference/street-view
 */

declare namespace google.maps {
  interface LatLng {
    lat(): number
    lng(): number
  }

  interface LatLngLiteral {
    lat: number
    lng: number
  }

  interface StreetViewLocation {
    pano: string
    description?: string
    latLng?: LatLng
  }

  interface StreetViewPanoramaData {
    location?: StreetViewLocation
    links?: StreetViewLink[]
    copyright?: string
  }

  interface StreetViewLink {
    pano?: string
    heading?: number
    description?: string
  }

  interface StreetViewPov {
    heading: number
    pitch: number
  }

  interface StreetViewPanoramaOptions {
    pano?: string
    position?: LatLng | LatLngLiteral
    pov?: StreetViewPov
    zoom?: number
    visible?: boolean
    addressControl?: boolean
    panControl?: boolean
    zoomControl?: boolean
    fullscreenControl?: boolean
    showRoadLabels?: boolean
    motionTracking?: boolean
    motionTrackingControl?: boolean
    enableCloseButton?: boolean
    linksControl?: boolean
  }

  class StreetViewPanorama {
    constructor(container: Element, opts?: StreetViewPanoramaOptions)
    getPosition(): LatLng | undefined
    getPov(): StreetViewPov
    setPov(pov: StreetViewPov): void
    setPano(pano: string): void
    getLinks(): StreetViewLink[]
    setVisible(visible: boolean): void
    addListener(event: string, handler: (...args: unknown[]) => void): void
  }

  interface StreetViewLocationRequest {
    location: LatLngLiteral | LatLng
    radius?: number
    source?: StreetViewSource
    preference?: StreetViewPreference
  }

  interface StreetViewResponse {
    data: StreetViewPanoramaData
  }

  enum StreetViewSource {
    DEFAULT = 'default',
    OUTDOOR = 'outdoor',
  }

  enum StreetViewPreference {
    BEST = 'best',
    NEAREST = 'nearest',
  }

  class StreetViewService {
    getPanorama(request: StreetViewLocationRequest): Promise<StreetViewResponse>
  }

  interface StreetViewCoverageLayer {
    setMap(map: object | null): void
  }
}
