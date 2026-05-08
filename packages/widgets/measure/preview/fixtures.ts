import type { Site } from '@mightyspatial/types'

export const previewSite: Site = {
  id: 'preview-measure',
  name: 'Measure preview',
  slug: 'preview-measure',
  description: 'Canned site for the Measure widget preview in the ux-guide.',
  bounds: [115.7, -32.1, 115.85, -31.95],
  defaultCamera: {
    longitude: 115.78,
    latitude: -32.0,
    height: 1500,
    heading: 0,
    pitch: -45,
    roll: 0,
  },
  layers: [],
  widgets: [{ id: 'measure', type: 'measure', enabled: true }],
  access: { public: true },
  createdAt: '2026-04-16T00:00:00.000Z',
  updatedAt: '2026-04-16T00:00:00.000Z',
}
