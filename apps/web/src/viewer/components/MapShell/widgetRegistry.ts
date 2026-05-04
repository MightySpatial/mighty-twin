/** Per-widget registration shape — Phase L of the new map layout.
 *
 *  Each widget that wants to live in the bottom rails or a docked panel
 *  registers a config here. Settings → Engine → Widgets layout edits the
 *  global catalog; the deferred Atlas Site Layout Designer lets admins
 *  override fields whose `scope: 'per-site'` per site.
 *
 *  loadMode determines how the widget is rendered when active:
 *    floating  — anchored panel over the map (Layers default)
 *    sharePane — stack above AI chat in the right rail (chat shrinks)
 *    drawer    — slide-up bottom drawer (Attribute table default)
 *    inline    — fixed map-edge component (zoom column, gimbal — not user-toggleable)
 */

export type WidgetController = 'primary' | 'secondary' | 'none'
export type WidgetLoadMode = 'floating' | 'sharePane' | 'drawer' | 'inline'
export type WidgetSize = 'compact' | 'standard' | 'expanded'
export type WidgetScope = 'global' | 'per-site'

export interface WidgetDef {
  id: string
  label: string
  /** lucide icon name; resolved at render time so the registry stays
   *  framework-agnostic. */
  icon: string
  controller: WidgetController
  /** order index within the controller; lower renders first. */
  position: number
  loadMode: WidgetLoadMode
  defaultSize: WidgetSize
  scope: WidgetScope
  /** Whether this widget is visible in basic public-pre-login viewers
   *  (Phase M). Defaults to false — only viewing-essential widgets opt
   *  in. */
  publicVisible?: boolean
}

export const DEFAULT_WIDGETS: WidgetDef[] = [
  // Inline (always at fixed map-edge positions, not user-toggleable)
  { id: 'zoom',     label: 'Zoom',     icon: 'ZoomIn',  controller: 'none', position: 0, loadMode: 'inline', defaultSize: 'compact', scope: 'global', publicVisible: true },
  { id: 'gimbal',   label: 'Compass',  icon: 'Compass', controller: 'none', position: 0, loadMode: 'inline', defaultSize: 'compact', scope: 'global', publicVisible: true },

  // Primary rail — the four every user reaches for
  { id: 'search',   label: 'Search',   icon: 'Search',  controller: 'primary',   position: 0, loadMode: 'floating',  defaultSize: 'compact',  scope: 'global', publicVisible: true },
  { id: 'measure',  label: 'Measure',  icon: 'Ruler',   controller: 'primary',   position: 1, loadMode: 'floating',  defaultSize: 'compact',  scope: 'global', publicVisible: true },
  { id: 'layers',   label: 'Layers',   icon: 'Layers',  controller: 'primary',   position: 2, loadMode: 'sharePane', defaultSize: 'standard', scope: 'per-site', publicVisible: true },
  { id: 'legend',   label: 'Legend',   icon: 'List',    controller: 'primary',   position: 3, loadMode: 'floating',  defaultSize: 'compact',  scope: 'per-site', publicVisible: true },

  // Secondary rail
  { id: 'story',    label: 'Story',    icon: 'BookOpen', controller: 'secondary', position: 0, loadMode: 'sharePane', defaultSize: 'standard', scope: 'per-site', publicVisible: true },
  { id: 'snap',     label: 'Snap',     icon: 'Camera',   controller: 'secondary', position: 1, loadMode: 'floating',  defaultSize: 'compact',  scope: 'per-site' },
  { id: 'design',   label: 'Design',   icon: 'Hexagon',  controller: 'secondary', position: 2, loadMode: 'floating',  defaultSize: 'expanded', scope: 'per-site' },
  { id: 'table',    label: 'Table',    icon: 'Table',    controller: 'secondary', position: 3, loadMode: 'drawer',    defaultSize: 'standard', scope: 'per-site' },
  { id: 'strike',   label: 'Strike',   icon: 'Slash',    controller: 'secondary', position: 4, loadMode: 'sharePane', defaultSize: 'standard', scope: 'per-site' },
  { id: 'terrain',  label: 'Terrain',  icon: 'Mountain', controller: 'secondary', position: 5, loadMode: 'floating',  defaultSize: 'compact',  scope: 'per-site' },
]

export function widgetsForController(
  defs: WidgetDef[],
  c: WidgetController,
): WidgetDef[] {
  return defs
    .filter((d) => d.controller === c)
    .sort((a, b) => a.position - b.position)
}

/** Filter to only widgets visible in public/pre-login viewers (Phase M).
 *  When the site is public-pre-login, callers thread the result of this
 *  through to the rails so Design / Snap / Strike / etc. don't appear
 *  for unauthenticated visitors. */
export function publicWidgets(defs: WidgetDef[]): WidgetDef[] {
  return defs.filter((d) => d.publicVisible === true)
}
