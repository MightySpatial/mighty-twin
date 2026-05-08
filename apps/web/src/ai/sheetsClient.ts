/** Phase K — Twin-as-MCP-client to Mighty Sheets.
 *
 *  Browser-side client that talks to a user's Sheets MCP server over
 *  Streamable HTTP (Sheets Stage 11 calls this the Claude Connector
 *  transport). Configured via Settings → Integrations → Mighty Sheets:
 *  user pastes their MCP URL + (optional) bearer token; we store both
 *  in localStorage alongside the AI provider settings.
 *
 *  v1 v1: read-only — list_sheets + get_sheet only. Write tools land
 *  when the UI for "Apply changes back to Sheets" is built (will use
 *  the same [Tweak]/[Decline]/[Approve] preview pattern as Twin's own
 *  write tools).
 */

const KEY = 'mighty-twin.sheets-mcp'

export interface SheetsConfig {
  url: string  // streaming-http endpoint
  bearer?: string  // optional bearer token
}

export function loadSheetsConfig(): SheetsConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as SheetsConfig
  } catch {
    return null
  }
}

export function saveSheetsConfig(cfg: SheetsConfig | null): void {
  if (cfg === null) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, JSON.stringify(cfg))
}

/** Call an MCP tool on the user's configured Sheets server. */
export async function sheetsTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const cfg = loadSheetsConfig()
  if (!cfg) throw new Error('Sheets MCP not configured (Settings → Integrations)')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  }
  if (cfg.bearer) headers.authorization = `Bearer ${cfg.bearer}`
  // Streamable HTTP MCP envelope — JSON-RPC over HTTP POST.
  const body = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: 'tools/call',
    params: { name, arguments: args },
  }
  const r = await fetch(cfg.url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`Sheets MCP ${r.status}: ${await r.text()}`)
  const j = await r.json()
  if (j.error) throw new Error(`Sheets MCP error: ${j.error.message ?? j.error}`)
  return j.result
}

/** Convenience: list the sheets this Sheets MCP server exposes. */
export async function listSheets(): Promise<unknown> {
  return sheetsTool('list_sheets', {})
}

/** Convenience: read one sheet by id (or name). */
export async function getSheet(sheetId: string): Promise<unknown> {
  return sheetsTool('get_sheet', { id: sheetId })
}
