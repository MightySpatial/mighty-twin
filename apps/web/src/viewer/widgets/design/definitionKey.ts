/** Loader + types for the utility-category palette at
 *  `public/data/definition_key.json`. This is the authoritative
 *  colour standard for redline layers shared with MightyDT —
 *  redline sketches pick a category instead of a free-form colour
 *  so the same utility renders the same colour across products.
 *
 *  The JSON is fetched once on first use and memoised. Callers
 *  can pre-warm with `preloadDefinitionKey()` on app start, or
 *  rely on lazy load.
 */

export interface UtilityCode {
  code: string
  label: string
}

export interface UtilityCategory {
  id: string
  label: string
  colour: string
  codes: UtilityCode[]
}

export interface DefinitionKey {
  version: number
  description?: string
  categories: UtilityCategory[]
}

let cached: DefinitionKey | null = null
let inflight: Promise<DefinitionKey> | null = null

export function preloadDefinitionKey(): Promise<DefinitionKey> {
  if (cached) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = fetch('/data/definition_key.json', { credentials: 'same-origin' })
    .then(r => {
      if (!r.ok) throw new Error(`definition_key.json ${r.status}`)
      return r.json() as Promise<DefinitionKey>
    })
    .then(d => { cached = d; return d })
    .finally(() => { inflight = null })
  return inflight
}

/** Synchronous accessor — returns null until the JSON resolves.
 *  Call `preloadDefinitionKey()` from a useEffect and re-render
 *  when it resolves. */
export function getDefinitionKey(): DefinitionKey | null {
  return cached
}

/** Resolve a category id → colour. Falls back to the "unknown"
 *  grey when the id isn't a known category. */
export function colourForCategory(id: string | null | undefined): string {
  if (!cached || !id) return '#555555'
  const cat = cached.categories.find(c => c.id === id)
  return cat?.colour ?? '#555555'
}
