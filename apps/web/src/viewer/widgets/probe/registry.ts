import type { NavigableSpace, NavigableConnection } from './types'

/** Frontend-only registry for NavigableSpace + NavigableConnection.
 *
 *  v1 stores in localStorage, keyed by `${siteSlug}:probe:spaces`. The
 *  intent is that this fronts a future API:
 *
 *    GET    /api/spatial/probe/spaces?site={slug}
 *    POST   /api/spatial/probe/spaces
 *    PATCH  /api/spatial/probe/spaces/:id
 *    DELETE /api/spatial/probe/spaces/:id
 *
 *  When the backend lands, the registry switches to the network calls
 *  with localStorage as a write-through cache. UI components don't
 *  change shape — they just read from useNavigableSpaces(siteSlug).
 *
 *  Seed data (the Demo Site pipe) lives in `seedDemoSpaces()` so the
 *  feature is exercisable without an admin walkthrough.
 */

const STORAGE_KEY = 'mighty:probe:spaces:v1'
const CONNECTIONS_KEY = 'mighty:probe:connections:v1'

interface Store {
  spaces: NavigableSpace[]
  connections: NavigableConnection[]
}

function load(): Store {
  try {
    const spaces = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as NavigableSpace[]
    const connections = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) ?? '[]') as NavigableConnection[]
    return { spaces, connections }
  } catch {
    return { spaces: [], connections: [] }
  }
}

function save(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.spaces))
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(store.connections))
    window.dispatchEvent(new CustomEvent('probe-registry-change'))
  } catch {
    /* Storage quota or disabled — registry is volatile this session */
  }
}

/** All NavigableSpaces for a site (path / volume / network rows). */
export function listSpaces(siteSlug: string): NavigableSpace[] {
  const store = load()
  return store.spaces.filter((s) => s.siteSlug === siteSlug)
}

export function getSpace(id: string): NavigableSpace | null {
  const store = load()
  return store.spaces.find((s) => s.id === id) ?? null
}

export function listConnectionsFor(spaceId: string): NavigableConnection[] {
  const store = load()
  return store.connections.filter(
    (c) => c.fromSpaceId === spaceId || (c.bidirectional && c.toSpaceId === spaceId),
  )
}

export function createSpace(space: Omit<NavigableSpace, 'id' | 'createdAt'>): NavigableSpace {
  const store = load()
  const created: NavigableSpace = {
    ...space,
    id: cryptoRandomId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.spaces.push(created)
  save(store)
  return created
}

export function updateSpace(id: string, patch: Partial<NavigableSpace>): NavigableSpace | null {
  const store = load()
  const idx = store.spaces.findIndex((s) => s.id === id)
  if (idx < 0) return null
  store.spaces[idx] = {
    ...store.spaces[idx],
    ...patch,
    id: store.spaces[idx].id,
    updatedAt: new Date().toISOString(),
  }
  save(store)
  return store.spaces[idx]
}

export function deleteSpace(id: string): boolean {
  const store = load()
  const next = store.spaces.filter((s) => s.id !== id)
  if (next.length === store.spaces.length) return false
  store.spaces = next
  // Cascade: drop connections too
  store.connections = store.connections.filter(
    (c) => c.fromSpaceId !== id && c.toSpaceId !== id,
  )
  save(store)
  return true
}

export function createConnection(conn: Omit<NavigableConnection, 'id'>): NavigableConnection {
  const store = load()
  const created: NavigableConnection = { ...conn, id: cryptoRandomId() }
  store.connections.push(created)
  save(store)
  return created
}

/** One-shot seeder so the feature is demoable without setup. Idempotent —
 *  only seeds if the demo site has no spaces yet. */
export function seedDemoSpaces(siteSlug: string, anchor: { lon: number; lat: number; h: number }) {
  const existing = listSpaces(siteSlug)
  if (existing.length > 0) return

  // A simple straight-pipe centerline ~30 m long, 0.6 m radius.
  // Vertices placed in [lon, lat, h(m)] tuples; spacing roughly 5 m.
  const stepMeters = 5
  const metersPerDegLon = 111320 * Math.cos(anchor.lat * Math.PI / 180)
  const metersPerDegLat = 110540
  const dLon = stepMeters / metersPerDegLon
  const vertices: Array<[number, number, number]> = []
  for (let i = 0; i <= 6; i++) {
    vertices.push([anchor.lon + i * dLon, anchor.lat, anchor.h - 1.5])  // 1.5 m below surface
  }
  void metersPerDegLat // suppress unused-var lint

  createSpace({
    siteSlug,
    kind: 'path',
    pathGeometry: { vertices },
    crossSectionRadiusM: 0.6,
    name: 'Demo pipe — north–south, 30 m',
  })
}

function cryptoRandomId(): string {
  try {
    // 16 random bytes, hex
    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Fallback for very old browsers
    return `id_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
  }
}
