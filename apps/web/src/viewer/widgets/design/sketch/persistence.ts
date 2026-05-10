/**
 * Three-tier sketch storage — port of v1's localStorage + S3 layering.
 *
 *   Tier 1: localStorage `mightydt_sketches_{siteId}` — crash recovery
 *           only. Wiped after the first successful S3 read.
 *   Tier 2: /api/me/json-files/{name} — authoritative store, S3-backed
 *           in prod, FS-backed in dev.
 *           Two file kinds per user-per-site:
 *             design-sketch-index-{siteId}.json
 *             design-sketch-{siteId}-{sketchId}.json
 *   Tier 3: /api/sites/{slug}/design-templates — shared site templates
 *           (Postgres-backed). Read-only from the engine's perspective —
 *           templates are managed by the AttributesEditor save-as flow.
 *
 * Spec V1_SPEC.md §1 + §9.4.
 */
import type {
  Sketch,
  SketchDoc,
  SketchIndexDoc,
  SketchIndexEntry,
  SketchNode,
  PersistenceIO,
} from './types'

// ── File-name helpers ────────────────────────────────────────────────────

export function indexFileName(siteId: string): string {
  // Sanitise siteId for safety — the JSON-file shop's name validator is
  // strict. UUIDs already match, but slugs containing dashes etc. are
  // allowed too.
  return `design-sketch-index-${sanitize(siteId)}.json`
}

export function sketchFileName(siteId: string, sketchId: string): string {
  return `design-sketch-${sanitize(siteId)}-${sanitize(sketchId)}.json`
}

function sanitize(part: string): string {
  return String(part).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 96)
}

// ── localStorage tier ────────────────────────────────────────────────────

const LS_KEY_PREFIX = 'mightydt_sketches_'
const LS_INDEX_KEY = 'mightydt_sketch_index_'

interface LocalRecoveryPayload {
  version: 2
  siteId: string
  index: SketchIndexDoc
  sketches: SketchDoc[]
  savedAt: number
}

export function readLocalRecovery(siteId: string): LocalRecoveryPayload | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY_PREFIX + siteId)
    return raw ? (JSON.parse(raw) as LocalRecoveryPayload) : null
  } catch {
    return null
  }
}

export function writeLocalRecovery(
  siteId: string,
  index: SketchIndexDoc,
  sketches: SketchDoc[],
): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: LocalRecoveryPayload = {
      version: 2,
      siteId,
      index,
      sketches,
      savedAt: Date.now(),
    }
    localStorage.setItem(LS_KEY_PREFIX + siteId, JSON.stringify(payload))
  } catch {
    // Quota exceeded or private mode — recovery is optional, skip.
  }
}

export function clearLocalRecovery(siteId: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(LS_KEY_PREFIX + siteId)
    localStorage.removeItem(LS_INDEX_KEY + siteId)
  } catch {
    // ignore
  }
}

// ── S3 (via /api/me/json-files) tier ─────────────────────────────────────

export async function fetchSketchIndex(
  io: PersistenceIO,
  siteId: string,
): Promise<SketchIndexDoc | null> {
  return io.readJsonFile<SketchIndexDoc>(indexFileName(siteId))
}

export async function fetchSketchDoc(
  io: PersistenceIO,
  siteId: string,
  sketchId: string,
): Promise<SketchDoc | null> {
  return io.readJsonFile<SketchDoc>(sketchFileName(siteId, sketchId))
}

export async function writeSketchIndex(
  io: PersistenceIO,
  siteId: string,
  index: SketchIndexDoc,
): Promise<void> {
  await io.writeJsonFile(indexFileName(siteId), index)
}

export async function writeSketchDoc(
  io: PersistenceIO,
  doc: SketchDoc,
): Promise<void> {
  await io.writeJsonFile(sketchFileName(doc.siteId, doc.sketchId), doc)
}

export async function deleteSketchDoc(
  io: PersistenceIO,
  siteId: string,
  sketchId: string,
): Promise<void> {
  await io.deleteJsonFile(sketchFileName(siteId, sketchId))
}

// ── Default fetch-based PersistenceIO ────────────────────────────────────

export function makeFetchIO(): PersistenceIO {
  return {
    async readJsonFile<T>(name: string): Promise<T | null> {
      const r = await fetch(`${apiBase()}/api/me/json-files/${encodeURIComponent(name)}`, {
        headers: authHeaders(),
      })
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`json-files GET ${name} → ${r.status}`)
      return (await r.json()) as T
    },
    async writeJsonFile(name, body) {
      const r = await fetch(`${apiBase()}/api/me/json-files/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`json-files PUT ${name} → ${r.status}`)
    },
    async deleteJsonFile(name) {
      const r = await fetch(`${apiBase()}/api/me/json-files/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!r.ok && r.status !== 404) throw new Error(`json-files DELETE ${name} → ${r.status}`)
    },
  }
}

function apiBase(): string {
  // Vite injects import.meta.env at build time. Wrapped because some
  // test envs don't expose the property at all.
  try {
    const meta = import.meta as unknown as { env?: { VITE_API_URL?: string } }
    return meta?.env?.VITE_API_URL || ''
  } catch {
    return ''
  }
}

function authHeaders(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  const token = localStorage.getItem('accessToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Index/doc factories ──────────────────────────────────────────────────

export function buildIndex(
  siteId: string,
  sketches: Record<string, Sketch>,
  nodes: Record<string, SketchNode>,
  activeSketchId: string | null,
): SketchIndexDoc {
  const entries: SketchIndexEntry[] = []
  for (const sk of Object.values(sketches)) {
    const nodeCount = Object.values(nodes).filter(
      n => n.params.sketchId === sk.id,
    ).length
    entries.push({
      id: sk.id,
      name: sk.name,
      nodeCount,
      savedAt: Date.now(),
    })
  }
  return {
    version: 2,
    siteId,
    activeSketchId,
    sketches: entries,
  }
}

export function buildSketchDoc(
  siteId: string,
  sketch: Sketch,
  nodes: Record<string, SketchNode>,
): SketchDoc {
  return {
    version: 2,
    siteId,
    sketchId: sketch.id,
    sketch,
    nodes: Object.values(nodes).filter(n => n.params.sketchId === sketch.id),
    savedAt: Date.now(),
  }
}
