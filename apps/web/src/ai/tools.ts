/** Twin v1 read-only MCP tool catalog.
 *
 *  Per the consolidation brief's v1 read-only subset, these tools let
 *  the AI inspect the current site state. Write tools (pan_camera,
 *  set_layer_style, create_annotation, …) live in v1.1 with the
 *  [Tweak] [Decline] [Approve & apply] preview pattern.
 *
 *  Tools execute in the browser against the same /api endpoints the
 *  shell uses; nothing routes through Mighty servers.
 */

export interface ToolDef {
  name: string
  description: string
  /** JSON-Schema-ish input shape for AI providers that support tool use. */
  input_schema: Record<string, unknown>
  /** Browser-side executor — returns a JSON-serialisable result. */
  run: (args: Record<string, unknown>) => Promise<unknown>
}

const apiFetch = async (path: string): Promise<unknown> => {
  const token = localStorage.getItem('accessToken')
  const r = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.json()
}

export const TOOLS: ToolDef[] = [
  {
    name: 'list_sites',
    description: 'List every site the current user can see, with slug/name/center.',
    input_schema: { type: 'object', properties: {} },
    run: async () => apiFetch('/api/spatial/sites'),
  },
  {
    name: 'get_site',
    description: 'Return one site by slug, including its layers (id, name, type, visibility, opacity).',
    input_schema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string', description: 'Site slug' } },
    },
    run: async (args) => apiFetch(`/api/spatial/sites/${encodeURIComponent(String(args.slug))}`),
  },
  {
    name: 'list_layers',
    description: 'List layers under a site (by slug).',
    input_schema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string' } },
    },
    run: async (args) => apiFetch(`/api/spatial/sites/${encodeURIComponent(String(args.slug))}/layers`),
  },
  {
    name: 'list_data_sources',
    description: 'List data sources available to attach to layers.',
    input_schema: { type: 'object', properties: {} },
    run: async () => apiFetch('/api/spatial/data-sources'),
  },
  {
    name: 'get_camera_state',
    description: 'Return the current Cesium viewer camera (lon/lat/height/heading/pitch/roll).',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const viewer = (window as unknown as { __cesiumViewer?: any }).__cesiumViewer
      if (!viewer) return { error: 'No active Cesium viewer' }
      const c = viewer.camera
      const cart = c.positionCartographic
      const Math_ = (await import('cesium')).Math
      return {
        longitude: Math_.toDegrees(cart.longitude),
        latitude: Math_.toDegrees(cart.latitude),
        height: cart.height,
        heading: Math_.toDegrees(c.heading),
        pitch: Math_.toDegrees(c.pitch),
        roll: Math_.toDegrees(c.roll),
      }
    },
  },
]

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}
