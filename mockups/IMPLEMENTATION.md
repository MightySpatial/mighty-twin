# MightyTwin · Three-Form-Factor Redesign · Implementation Brief

> Self-contained handoff document. The fresh Claude Code session has none of the
> previous chat context — this file plus the two HTML mockups (`mockups/mobile-redesign.html`
> and `mockups/desktop-tablet-redesign.html`) are the source of truth.
>
> The mockups are **design ground truth**. This document is the **implementation
> ground truth** — patterns, file paths, acceptance criteria, anti-patterns.
>
> **Rule zero:** apply patterns deeply and uniformly. The whole point of doing a
> redesign is consistency; landing the carousel on one nav and a different
> pattern on another nav is worse than leaving everything as it was. If a
> pattern says "every nav-strip uses the bottom-carousel with snap-x", that
> applies to **every** nav-strip in the codebase, not just the obvious ones.

---

## 0 · Status snapshot

- **Repo:** `github.com/MightySpatial/mighty-twin`
- **Branch:** `main-local` (this doc lives on it)
- **Base:** `origin/main-dev` — branch is currently `N` commits ahead of base where `N = git rev-list --count origin/main-dev..HEAD`. Pure fast-forward; no divergence.
- **Mockups:**
  - `mockups/mobile-redesign.html` — 8 frames + pattern key. Map mode (overview entry, compact rail, Snap sheet, Design setup, Design drawing), Atlas mode (Overview, Sites cards), Settings.
  - `mockups/desktop-tablet-redesign.html` — 7 frames + pattern key. Desktop (D0 overview, D1 Snap right-pane, D2 Layers side-panel, D3 Atlas, D4 Settings), Tablet (T1 portrait, T2 landscape).
  - Each frame has a `.desktop-note` annotation + a `.change-list` box listing exactly which files need editing.
- **Already-shipped live code** on `main-local`:
  - `Carousel` primitive in `apps/web/src/viewer/components/MapShell/`
  - Atlas bottom-nav as scrollable carousel (`apps/web/src/admin/layouts/AppLayout.{jsx,css}`)
  - Atlas pane scoping fixes (`apps/web/src/admin/styles/global.css`, AppLayout.css)
  - Mai hide in `?forceBreakpoint=` preview + clearance bump (88 → 142) (`apps/web/src/ai/DraggableMai.tsx`)
  - ViewerSidebar class-based hide (`apps/web/src/viewer/components/ViewerSidebar/{ViewerSidebar.tsx,ViewerSidebar.css}`)
  - Settings nav with per-section icons (`packages/settings-panels/src/SettingsShell.{tsx,module.css}`, `apps/web/src/App.tsx`)

---

## 1 · How to read this brief

1. **Skim §2 (Principles) and §4 (Anti-patterns) first.** They are short. Internalise them before reading anything else — every later decision references them.
2. **Open both mockups in a browser** before reading §3 (Patterns) or §5 (Plan). Sentences like "the bottom slot has exactly one job" only make sense once you've seen the frames they describe.
3. **Treat the mockup HTML as the spec.** If this document disagrees with the mockup, the mockup wins. If both agree but the live code does something different, update the live code, not the mockup.
4. **Phases are ordered for safety, not by priority.** Phase 1 unblocks 2–4; Phase 5 is optional polish. Land them one at a time, push each as its own commit on `main-local`, and verify on phone + tablet portrait + tablet landscape + desktop + the `?forceBreakpoint=` preview before moving on.
5. **Never start coding a phase before its acceptance criteria are written down and visible.** If they aren't here, write them on the phase you're about to start before opening any file.

---

## 2 · Design principles (non-negotiables)

These are **always true**. If you find yourself reasoning around one of these to justify a change, you are making the wrong change.

1. **Bottom-anchored UI is the default.** Phones drop notification banners at the top mid-action. Anything critical must be reachable at the bottom of the screen. The top is for identity (brand + mode tabs on desktop/landscape, brand only on mobile/portrait) — never for critical controls.
2. **One bottom slot per pane, one job at a time.** The Map pane's bottom shows the site list strip *or* the widget rail, never both. The Atlas/Settings pane's bottom shows the section nav. No "stack two carousels" arrangements.
3. **Mode switcher placement is orientation-driven, not breakpoint-driven.**
   - Phone (portrait): bottom
   - Tablet portrait: bottom
   - Tablet landscape: top (segmented pill in brand bar)
   - Desktop: top (segmented pill in brand bar)
4. **Same component across form factors, sized differently.** The site list strip is one component; it just renders at full width on phone and capped at 960px on desktop. Don't fork by breakpoint where one component with responsive sizing works.
5. **Carousels everywhere, never "More" sheets.** Atlas navigation went from "5 primary + More sheet for the other 4" to "scrollable carousel of all 9". The same logic applies to every nav that has more items than fit — make it scrollable, never split into primary/secondary.
6. **Icons + labels for nav items. Icons alone only for clearly-identified actions.** The mode-tabs carry both icon and label. The Overview tile (square 48×48) is icon-only because it's a tightly-scoped navigation action that the user learns once. New nav items should follow the icon+label convention unless there is a specific reason.
7. **Floating chrome (icons, pill, FAB) is for "always-available" actions, not data.** The primary controller pill carries map controls (zoom/home/bounds/basemap) and the site chip. The left-edge floating icons carry panel-bearing chrome (Search/Site/Layers/Measure/Terrain/Legend). Anything that's not a "small action button" doesn't belong floating.
8. **Widget tools render in two places, never both at once.** Phone → bottom widget sheet (slides over carousel + tab bar; dynamic height per state). Desktop → right pane (docked, fixed width). Tablet portrait uses phone pattern, tablet landscape uses desktop. Both surfaces consume the **same widget component** — the rendering target is different, the contract is identical.
9. **Mai is the FAB. Mai is always present. Mai is hidden only in preview mode.** Default Y clearance is 142px (clears stacked 64+64+14 chrome). Mai listens for `mighty:tools-open` / `mighty:tools-close` window events and fades when the phone tools sheet is open. Mai listens for `mighty:rp-open` / `mighty:rp-close` and shifts left by `RP_SHIFT` (320px) when the desktop right pane opens.
10. **Class-gate phone styles, never `@media (max-width: 767px)`.** Reason: `?forceBreakpoint=phone` on a 1920px viewport keeps the device frame at 390px wide, but the browser viewport is still 1920px — so media queries don't fire. Always read `isPhone` from `useBreakpoint()` (which respects the shell's forced-breakpoint state) and set a `.is-phone` class on the relevant container. CSS targets `.parent.is-phone .child`, not `@media`.

---

## 3 · Pattern catalogue

Every reusable pattern. For each: **purpose**, **mockup reference**, **current live location**, **target location** (if it needs to be extracted into a shared component), and where the styling lives.

### 3.1 Primary controller pill (`CtrlPill`)

- **Purpose:** Top-left floating pill on the Map pane. Carries the site chip + map controls (zoom +/-, home, fit-bounds, basemap toggle). Single home for everything that controls camera/basemap.
- **Two states:**
  - **Overview** (no site loaded): site chip shows `All sites · N` with a stack-of-maps avatar
  - **Site loaded**: site chip shows the site avatar (single letter from site name, violet gradient) + site name. **No** Overview button here — that lives in the widget rail (see §3.5).
- **Right of the site chip:** zoom in / zoom out (icon buttons) | divider | home / fit-bounds / basemap (icon buttons)
- **Mockup ref:** Mobile frame 0 (Overview state), Mobile frames 1–4 (Site state). Desktop D0 (Overview state), D1/D2 (Site state). Tablet T1/T2.
- **Current live state:** Doesn't exist as a shared component yet. The site-chip duty is in `ViewerSidebar` Home tab; zoom controls are scattered in `CesiumViewer.css` (`.map-controls`).
- **Target:** New shared component at `apps/web/src/viewer/components/CtrlPill/`.
  - `CtrlPill.tsx`: takes `currentSite: Site | null`, renders Overview or Site state.
  - `CtrlPill.module.css`: copy the styling from the mockup verbatim.
  - Mounted by `MapShell` (phone, tablet portrait) and `CesiumViewer` (desktop, tablet landscape) — exact same component.

### 3.2 Floating left icon stack

- **Purpose:** Vertical column of icon buttons on the left edge of the map. The "primary sidebar" half of the VSCode-style primary+secondary sidebar pattern.
- **6 icons (top to bottom):** Search · Site info · Layers · Measure · Terrain · Legend
- **Active state:** indigo tint background, full-opacity icon, when the corresponding side panel is open (or Measure is engaged).
- **Mockup ref:** Mobile frames 1–4 (3 icons — Search/Measure/Legend). Desktop D1/D2 (6 icons). Tablet T1/T2 (3 icons — same as mobile).
- **Live state:** Currently only a subset exists in `CesiumViewer.tsx` (the live mobile chrome). The user's actual phone screenshot shows: layers, search, ruler, list — close to the mockup's 6 minus Site info and Terrain.
- **Target:** Promote to a shared component `apps/web/src/viewer/components/FloatingIconStack/`. Each icon button is `<FloatingIcon icon={...} label={...} panelId={...} />`. Layers/Site/Terrain icons open a `FloatingSidePanel` (§3.3); Measure toggles the measure tool; Search/Legend open small floating sheets.
- **Phone vs desktop:** identical component, identical positioning (left: 14px, top: 76px below the ctrl-pill). Stack is taller on desktop because there are more icons.

### 3.3 Floating side panel (`FloatingSidePanel`)

- **Purpose:** The "secondary sidebar" — a 300px panel that slides out next to the icon column when an icon is tapped. Single slot; tapping a second icon swaps the panel content; tapping the active icon again (or ESC) dismisses.
- **Pattern:** VSCode primary+secondary side bar, exactly.
- **Layout:** `position: absolute; top: 76px; left: 64px; width: 300px; max-height: calc(100% - 200px)`.
- **Slots inside the panel:** header (icon + label + close X) → body (scrollable) → footer (optional, e.g. `+ Add layer`).
- **Mockup ref:** Desktop frame D2 (`Map · Layers panel open from icon stack`). Annotations in the frame's `.desktop-note` and `.change-list` cover the interaction model.
- **Live state:** Doesn't exist. `ViewerSidebar` is the closest analogue (vertical tabs with per-tab content), but it owns its own tab strip; the new pattern decouples the tab strip (floating icons) from the panel.
- **Target:** New component at `apps/web/src/viewer/components/FloatingSidePanel/`. State lives in the viewer host: `activeSidePanel: string | null`. Each panel is a discrete component imported into a registry: `{ layers: LayersPanel, site: SiteInfoPanel, terrain: TerrainPanel, search: SearchPanel, legend: LegendPanel }`.
- **Measure is the exception** — it's a tool toggle, no panel. Clicking the Measure icon engages measure mode (separate `measureActive` state) and changes the cursor; clicking again disengages.
- **Phone behaviour:** the same `FloatingSidePanel` component renders as a **bottom sheet** instead of a side panel when `isPhone`. Same `activeSidePanel` state, same panel registry, different render target. Reuses the existing `.widget-sheet` styling from the mockup.

### 3.4 Bottom widget rail (Map mode · site loaded)

- **Purpose:** Horizontal carousel of widget controllers at the bottom of the Map pane when a site is loaded. Each tile = launcher for one widget (Story, Snap, Design, Terrain). Tapping the active tile (or any tile) opens the widget's surface.
- **On phone:** tile tap → widget sheet slides up (§3.6).
- **On desktop:** tile tap → widget content renders in the right pane (existing behaviour).
- **Order:** `[Overview tile (§3.5)] [Story] [Snap] [Design] [Terrain]`. **Fly is excluded on phone** (already filtered by `phoneMode` in main-dev's `1fbfa82`; do not re-add).
- **Mockup ref:** Mobile frames 1–4. Desktop D1/D2 (with Fly tile present on desktop). Tablet T1/T2.
- **Live state:** Exists in `MapShell.tsx` as `SecondaryRail`. Currently uses the `Carousel` primitive (cherry-picked in `0712ad6`).
- **Target:** Keep `SecondaryRail` where it is. Add the Overview tile as the first child of the carousel (§3.5).

### 3.5 Overview tile (back-to-overview)

- **Purpose:** Square icon-only button at the START of the widget rail. Tapping → navigates to the all-sites overview state (no site loaded).
- **Style:** 48×48 (phone) / 44×44 (desktop+tablet) square with violet tint background, violet border, violet icon. Lucide `Globe` icon (concentric circles + equator). 1px separator on its right edge dividing it from the widget tiles.
- **Rendering:** Only rendered when a site is loaded. In Overview state (no site), the widget rail itself isn't shown (it's replaced by the site list strip §3.7), so the Overview tile naturally disappears.
- **Mockup ref:** Mobile frames 1–4 (every site-loaded Map frame). Desktop D1/D2. Tablet T1/T2.
- **Live state:** Doesn't exist. Earlier iterations put it in the ctrl-pill as a labelled pill button; this was rejected — it ate horizontal space in the pill and the violet tile is more glanceable.
- **Target:** Render conditionally in `SecondaryRail`:
  ```tsx
  {currentSite && <RailTile variant="overview" onClick={() => navigate('/viewer')} />}
  ```

### 3.6 Widget sheet (decoupled, dynamic height)

- **Purpose:** When a widget tile is tapped on phone, the widget's tools render in a sheet that slides up **over** the widget rail AND the Map/Atlas/Settings tab bar. The widget gets the full lower viewport for its UI.
- **Sheet height is dynamic per widget-state:**
  - Quick-action widgets (Snap take-photo, Terrain opacity slider): ~36% of viewport
  - Setup/configure widgets (Design choosing sketch type): ~78% of viewport
  - Active-drawing widgets (Design with a tool selected): ~36%, with the map taking 2/3 of the screen
- **Sheet auto-sizes to content**, capped at ~92vh, with a sensible minimum (~240px). User can drag the handle to override within those bounds. Pull-down past a threshold dismisses entirely.
- **Inside the sheet:**
  - Drag handle at top (36×4 pill)
  - Header: widget icon + name + close X
  - Body: widget's compact tools (nested carousels OK; e.g. Snap shows a horizontal recent-snaps strip; Design in drawing-state shows a tools-row + inputs-ribbon)
  - Optional footer (primary action pill)
- **Mockup ref:** Mobile frame 2 (Snap, medium height), frame 3 (Design setup, tall), frame 4 (Design drawing, compact with 2/3 map visible).
- **Live state:** Doesn't exist yet. Widget content currently goes to the right pane on desktop (works) and to a tools sheet on mobile (different design — needs replacement).
- **Target:** New `WidgetSheet` component at `apps/web/src/viewer/components/WidgetSheet/`. Each widget registers a `MobileSheet` slot. Widget host (in `MapShell`) renders `<WidgetSheet widget={activeWidget} onClose={...}>` when `activeWidget && isPhone`.
- **Pairs with:** Mai hide via `mighty:tools-open` event (already wired in `DraggableMai`).

### 3.7 Site list strip (`SiteStrip`)

- **Purpose:** Bottom of the Map pane in Overview state (no site loaded). Horizontal scroll-snap strip of site cards. Replaces the widget rail one-for-one — widget rail is per-site, no site means no widget rail.
- **Card content:** thumb (60–64 px) + name + meta line (location · N layers · optional Public badge).
- **Active state:** teal border on the card that matches the focused pin on the map. Bidirectional sync: pin click scrolls the strip to the matching card; card click navigates to `/viewer/site/<slug>`.
- **Width:** phone full-width; desktop centered, max-width 960px.
- **Mockup ref:** Mobile frame 0, Desktop D0.
- **Live state:** Currently the all-sites view (`SitesMapPage`) shows a hero "Welcome to All Sites" splash inside the sidebar. No dedicated site picker strip.
- **Target:** New component at `apps/web/src/viewer/components/SiteStrip/`. Data from `/api/sites` (already wired). Mounted by `SitesMapPage` (the all-sites route) as a sibling of the Cesium canvas.

### 3.8 Bottom mode-switcher (Map/Atlas/Settings)

- **Purpose:** Switch between the three top-level panes. Provided by `@mightyspatial/app-shell`.
- **Placement:**
  - **Phone:** bottom of the phone-grid (the `tab-bar` row, currently 64px). Three tabs, icon-above-label.
  - **Tablet portrait:** bottom of the tablet-grid (the `tablet-bottom-nav` row, 56px). Three tabs, icon-above-label.
  - **Tablet landscape:** top of the brand bar (the `mode-tabs` segmented pill). Three pill buttons, icon-left-of-label.
  - **Desktop:** top of the brand bar (the `mode-tabs` segmented pill). Same as tablet landscape.
- **Icons:** all four sizes use the same SVGs — Map (folded-map polygon), Atlas (4-rect grid), Settings (gear). Defined in `packages/app-shell/src/components/MobileTabSwitcher.tsx` (or wherever the live equivalent lives).
- **Live state:** Already correctly placed across breakpoints in `@mightyspatial/app-shell`. Mode tabs at top currently text-only; the mockup adds icons inline. Verify the icons are in the shell package and rendered uniformly.

### 3.9 Atlas section nav (carousel)

- **Phone:** bottom of the atlas-pane (the `nav-bar` element, 64px tall). Horizontal scrollable carousel of all 9 sections (Overview · Sites · Data · Feeds · Library · Stories · Snaps · Submissions · Upload). Snap-x, hidden scrollbar, ~72px min-width per tab. Active = teal color. **No "More" sheet. No 5-tab cap.**
- **Tablet portrait:** Same as phone (bottom carousel).
- **Tablet landscape:** Desktop left sidebar (drawer pattern is dead).
- **Desktop:** 240px left sidebar, vertical list. Each `nav-link` is icon-left-of-label.
- **Mockup ref:** Mobile frame 5 (Overview), 6 (Sites cards). Desktop D3.
- **Live state:** Already shipped in `apps/web/src/admin/layouts/AppLayout.{jsx,css}` for phone + tablet drawer + desktop. The tablet drawer pattern needs to die — see Phase 3.

### 3.10 Settings section nav (carousel)

- Same pattern as §3.9, but rendered by `packages/settings-panels/src/SettingsShell.tsx`. 13 sections (5 builtins + 8 Twin extras).
- Already shipped (icons added, layout flipped to content-top / carousel-bottom on phone).
- Desktop currently hides the icons via `.shell.isPhone .navItemIcon { display: none }`. **Phase 2 fixes this** — drop the gate, render icons everywhere.

### 3.11 Mai FAB (`DraggableMai`)

- Already mostly correct in live code. Three properties matter:
  - `defaultFabPos.y = window.innerHeight - FAB_SIZE - 142` (covers stacked 64 + 64 + 14 chrome). Do not regress.
  - Hides when `?forceBreakpoint=` URL param is set (preserves the preview's usability).
  - Listens for `mighty:tools-open` / `mighty:tools-close` (phone tools sheet) and `mighty:rp-open` / `mighty:rp-close` (desktop right pane).
- **Acceptance:** Mai never overlaps the bottom nav on any pane / any form factor in normal use.

---

## 4 · Anti-patterns (DO NOT)

Each of these was tried during the design session and explicitly rejected. If you find yourself building one of these, stop.

1. **Don't put critical UI at the top of the screen on phone/portrait.** Notifications eat it.
2. **Don't put the mode switcher in two places per frame.** Tablet portrait had this bug; we removed the top mode-tabs in favour of the bottom.
3. **Don't fork the site picker by form factor.** One component sized differently. Do not write a `SiteStripPhone` and `SiteStripDesktop`.
4. **Don't add a right-edge floating icon stack** (Layers/3D buttons stacked on the right). That was an AllTrails copy-mistake. The primary controller pill already carries those.
5. **Don't duplicate the Layers button on the floating icon stack if it's already in the pill** — pick one home and live with it. The pill owns map basemap; the floating stack owns the LAYERS data list. Different concerns.
6. **Don't bring emoji icons back into the Fly widget gear shifter.** Use Lucide SVGs (main-dev `2ce8109` already did this; do not regress).
7. **Don't add Fly to the phone widget rail.** Already filtered by `phoneMode` in `1fbfa82` — "Fly locomotion is WASD/arrows/Q/E, drop it from the rail and tools sheet when phoneMode is true". Fingers already move the camera on touch.
8. **Don't gate phone styles on a viewport `@media` query.** It doesn't fire in `?forceBreakpoint=phone` preview at desktop width. Always class-gate on `useBreakpoint().isPhone`.
9. **Don't put the Overview back-button inside the ctrl-pill** — it ate horizontal space and read as a generic affordance. The square violet Overview tile at the start of the widget rail is the correct affordance.
10. **Don't ship a "More" sheet for nav overflow.** Make the strip scrollable. Always.
11. **Don't bring back the ViewerSidebar's site chip** once the ctrl-pill exists. The ctrl-pill owns site identity. Duplicates confuse users.
12. **Don't hide settings nav icons on desktop.** They render on phone today (`icon-above-label`) and are CSS-hidden on desktop (`.shell.isPhone .navItemIcon { display: none }`). Phase 2 drops this — render icons everywhere. Coherent.

---

## 5 · Implementation plan (phased)

Each phase ships as its own commit on `main-local`. Verify on all four form factors (phone real, tablet portrait, tablet landscape, desktop, and the `?forceBreakpoint=phone` preview at desktop width) before moving on.

### Phase 1 · Shared `CtrlPill` component

**Scope:** Extract the primary controller pill into a shared component. Mount it on phone (via `MapShell`), tablet portrait/landscape (via `MapShell` or `CesiumViewer` depending on which mounts at which breakpoint), and desktop (via `CesiumViewer`).

**Tasks:**
1. Create `apps/web/src/viewer/components/CtrlPill/CtrlPill.tsx`.
2. Create `apps/web/src/viewer/components/CtrlPill/CtrlPill.module.css` — copy styles from the mockup verbatim. Specifically: `.ctrl-pill`, `.ctrl-site`, `.ctrl-site .avatar`, `.ctrl-site .avatar.all-sites`, `.ctrl-divider`, `.ctrl-btn`.
3. Props: `currentSite: Site | null`, `onZoomIn`, `onZoomOut`, `onHome`, `onFitBounds`, `onBasemapClick`.
4. **Two render branches inside:** if `currentSite === null`, render the All-sites label with the stack-of-maps avatar. Otherwise render the site avatar + site name. Right of the chip: zoom + divider + home/bounds/basemap. Same in both branches.
5. Mount in `MapShell` (phone, tablet portrait — replace whatever exists there) AND in `CesiumViewer` (desktop, tablet landscape — replace `.map-controls` and ViewerSidebar's site chip).
6. **Delete the now-duplicate map-controls** in `CesiumViewer.css` (`.map-controls` rules around line 1285). Delete the site-chip render from `ViewerSidebar.tsx` HOME tab.

**Acceptance criteria:**
- Pill renders identically on every form factor (use the mockup screenshots as visual reference).
- Site chip shows "All sites · N" when on `/viewer` (no site selected), and shows the site's avatar + name when on `/viewer/site/<slug>`.
- Zoom / home / bounds / basemap buttons work and are wired to the existing Cesium camera methods.
- No duplicate map-controls anywhere — search the codebase for `.map-controls` and verify only the pill remains.
- `ViewerSidebar` HOME tab no longer renders a site chip.
- Existing tests pass; no new visual regressions on the per-site viewer.

### Phase 1b · `SiteStrip` component

**Scope:** Bottom of the Map pane in Overview state. Horizontal scroll-snap strip of site cards. Replaces the widget rail when no site is loaded.

**Tasks:**
1. Create `apps/web/src/viewer/components/SiteStrip/SiteStrip.tsx`.
2. Create `apps/web/src/viewer/components/SiteStrip/SiteStrip.module.css` — copy `.site-strip`, `.site-strip-header`, `.site-strip-cards`, `.site-card-mini` (and variants) from the mockup verbatim.
3. Props: `sites: Site[]`, `activeSiteSlug: string | null`, `onSelectSite: (slug: string) => void`.
4. Data: source from the existing `/api/sites` endpoint via the existing fetch in `SitesMapPage`. Don't duplicate the fetch — read the same data.
5. Bidirectional sync with map pins: clicking a pin scrolls the strip to the matching card; clicking a card navigates to `/viewer/site/<slug>` (use existing router).
6. Mount in `SitesMapPage` (the all-sites route) as a sibling of the Cesium canvas. Only renders when on the all-sites route, not on per-site routes.

**Acceptance criteria:**
- All sites appear as scroll-snap cards in the strip on `/viewer`.
- Tap a card → navigates to `/viewer/site/<slug>`, widget rail appears, site strip is gone.
- Pin click → strip scrolls to the matching card.
- On desktop, strip is centered with max-width 960px; on phone, full width with horizontal scroll.
- No regressions on the per-site viewer — strip does not render there.

### Phase 1c · Overview tile + widget-rail integration

**Scope:** Add the square 48×48 Overview tile as the first child of `SecondaryRail` whenever a site is loaded.

**Tasks:**
1. Add `RailTile variant="overview"` (or new component `OverviewRailTile`) at the start of `MapShell`'s widget rail render.
2. Pass an `onClick` that navigates to `/viewer` (the all-sites route).
3. CSS: copy `.rail-tile.overview` from the mockup verbatim.
4. Conditional: only render when `currentSite !== null`. In Overview state the `SecondaryRail` itself isn't shown (replaced by `SiteStrip` via §1b's mount logic).

**Acceptance criteria:**
- On `/viewer/site/<slug>`, the first carousel item is the violet Overview tile.
- Tapping the Overview tile navigates to `/viewer` (all-sites overview).
- The widget tiles (Story / Snap / Design / Terrain on phone; +Fly on desktop) appear after the Overview tile.
- The 1px separator between Overview and Story is visible.
- On `/viewer` (no site loaded) the widget rail does not render at all.

### Phase 2 · Drop the settings-icon gate on desktop

**Scope:** One-line CSS fix. Make the per-section icons in `SettingsShell` visible on every breakpoint, not just phone.

**Tasks:**
1. Open `packages/settings-panels/src/SettingsShell.module.css`.
2. Find the `.navItemIcon { display: none }` rule in the desktop default branch.
3. Replace with: `display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-right: 10px;` (or similar — show the icon inline left of the label).
4. Verify the icon-above-label phone layout still wins inside `.shell.isPhone .navItem` (it should — that rule is more specific).

**Acceptance criteria:**
- Desktop sidebar shows each section's icon to the left of its label.
- Phone bottom carousel still shows icon-above-label (unchanged).
- Tablet portrait carousel still shows icon-above-label (unchanged).
- Tablet landscape sidebar shows icon-left-of-label (matches desktop).
- No visual regression on any breakpoint.

### Phase 3 · `layoutMode` (orientation pivot)

**Scope:** Replace the breakpoint-only `useBreakpoint` decision tree with an orientation-aware `layoutMode` that returns one of `'phone' | 'tabletPortrait' | 'tabletLandscape' | 'desktop'`. Use it everywhere the layout currently branches on `isTablet`.

**Tasks:**
1. Add a `layoutMode` derived value to `useBreakpoint` in `apps/web/src/admin/hooks/useBreakpoint.js` AND `apps/web/src/viewer/hooks/useBreakpoint.ts`. Derive from `breakpoint` × `useOrientation()`.
2. Replace `isTablet` drawer branches in `AppLayout.jsx` with: `layoutMode === 'tabletPortrait'` → phone-style bottom nav; `layoutMode === 'tabletLandscape'` → desktop-style sidebar.
3. Delete the `.sidebar-tablet` drawer styles in `AppLayout.css` (they are now dead code).
4. Apply the same pivot to `SettingsShell` if it currently branches on tablet.
5. Apply the same pivot to `MapShell` and `CesiumViewer` for widget surface routing (portrait → widget sheet, landscape → right pane).

**Acceptance criteria:**
- Tablet portrait viewing Atlas shows the bottom scrollable carousel nav (same as phone).
- Tablet landscape viewing Atlas shows the desktop left sidebar.
- Tablet portrait viewing Map shows widget tools in a bottom sheet (same as phone).
- Tablet landscape viewing Map shows widget tools in the right pane (same as desktop).
- Rotating the device live triggers the pivot (no reload needed).
- No `isTablet` branches remain that produce a drawer. The drawer pattern is dead.

### Phase 4 · `FloatingSidePanel` + `ViewerSidebar` retirement

**Scope:** Replace the existing `ViewerSidebar` (HOME/SITE/LAYERS/MEASURE tabbed left rail) with a floating icon stack + side panel pattern. Same components on phone, tablet portrait, tablet landscape, desktop.

**Tasks:**
1. Create `apps/web/src/viewer/components/FloatingIconStack/` — the 6-icon vertical stack.
2. Create `apps/web/src/viewer/components/FloatingSidePanel/` — the 300px sliding panel container.
3. Extract `ViewerSidebar` HOME/SITE/LAYERS/MEASURE/TERRAIN content into discrete panel components: `SiteInfoPanel`, `LayersPanel`, `TerrainPanel` (Measure is a tool toggle, no panel). Mount them via a panel registry that `FloatingSidePanel` reads from.
4. Add `activeSidePanel: string | null` state in the viewer host (`CesiumViewer` likely).
5. Wire icons: clicking an icon toggles its panel ID; clicking the active icon (or ESC) clears.
6. On phone (and tablet portrait), the same panels render as bottom sheets via the existing `WidgetSheet` infrastructure (Phase 1c) instead of side panels. Same panel components, different render target.
7. Delete `ViewerSidebar.tsx`, `ViewerSidebar.css`, and remove all `<ViewerSidebar>` imports/mounts (`SitesMapPage`, `CesiumViewer`).
8. The HOME tab's site picker functionality is **already covered** by §3.1 (CtrlPill) and §3.7 (SiteStrip) — verify no functionality is lost.

**Acceptance criteria:**
- `ViewerSidebar` no longer exists in the codebase (file deleted).
- Floating left icon stack is visible on every Map pane (phone, tablet, desktop).
- Tapping Layers shows the layer list with eye-toggles, opacity sliders. Same on every form factor (panel on desktop/tablet-landscape; bottom sheet on phone/tablet-portrait).
- Site info, Terrain, Search, Legend all open their respective panels.
- Measure icon toggles measure mode (cursor change), no panel opens.
- Existing layer-toggle / measure / terrain functionality is preserved 1:1.

### Phase 5 · Atlas Sites card carousel on desktop (optional)

**Scope:** Optional polish. Add the AllTrails-style site cards carousel as a secondary "map view" toggle on the desktop Atlas → Sites page. Defaults to the existing table view.

**Tasks:**
1. Add a view-toggle pill (Table / Map) at the top of `SitesPage`.
2. In Map view: render the same `SiteStrip` from §1b inside a Cesium-backed all-sites map view, embedded in the Atlas pane.
3. Tap a card → navigate to `/admin/sites/:slug` (existing site detail page).

**Acceptance criteria:**
- Sites page on desktop has a Table/Map toggle.
- Map view shows the same site cards strip + Cesium map with pins.
- Table view continues to work unchanged.

---

## 6 · Cross-cutting consistency checks

After every phase, verify the following are still true throughout the codebase:

### 6.1 No viewport media queries gating phone styles

Run: `grep -rn '@media.*max-width.*7[6-9][0-9]\|@media.*max-width.*8[0-9][0-9]' apps/web/src packages/`

Every result is a candidate for class-gating. If the rule is a positional refinement (e.g. shifting a button by 10px on phone), it can stay as `@media` — but if the rule **hides or shows** content based on breakpoint, it must be class-gated. Convert it.

### 6.2 No duplicate site chips

Run: `grep -rn 'site-chip\|currentSite\|activeSite' apps/web/src`

There should be exactly one mounted instance of the site chip — inside `CtrlPill`. Verify no other component renders the current site's name+avatar.

### 6.3 No "More" sheets for nav overflow

Run: `grep -rn 'bottom-nav-more\|PHONE_PRIMARY' apps/web/src`

Zero results. The "More" pattern is dead. Atlas already kills it; verify nothing else introduces it.

### 6.4 No `isTablet` branches that produce a drawer

Run: `grep -rn 'isTablet.*drawer\|sidebar-tablet' apps/web/src`

Zero results after Phase 3.

### 6.5 No emoji in widget icons

Run: `grep -rn '[\x{1F300}-\x{1F9FF}]' apps/web/src/viewer/widgets`

Zero results (Lucide only). If any appear, replace with Lucide equivalents.

### 6.6 Mai clearance unchanged

Run: `grep -n 'innerHeight - FAB_SIZE -' apps/web/src/ai/DraggableMai.tsx`

Should be `142`. Do not regress to `88` or other values without explicitly updating Phase 2 of this brief.

### 6.7 `?forceBreakpoint=phone` preview is usable

Manual check after every phase:
1. `pnpm dev` (port 3003).
2. Open `http://localhost:3003/admin/overview?forceBreakpoint=phone` and `http://localhost:3003/?forceBreakpoint=phone` and `http://localhost:3003/settings?forceBreakpoint=phone`.
3. Verify: no UI elements outside the device frame; Mai hidden; Atlas/Settings bottom nav inside the frame; map controls inside the frame; the user can navigate using only what's inside the frame.

---

## 7 · Verification recipe (per phase)

Each phase must be verified on **every** of the following before pushing:

| Surface | URL / device | What to check |
|---|---|---|
| Phone (real) | `mighty-twin-web.up.railway.app` on iPhone | Floating chrome inside the visible viewport, Mai not blocking the carousel, mode tabs at the bottom |
| Tablet portrait (real or device emulation) | Same URL on iPad in portrait | Phone pattern: bottom mode tabs, bottom section nav, widget sheet for tools |
| Tablet landscape | iPad in landscape | Desktop pattern: top mode tabs, left sidebar, right pane for widget tools |
| Desktop | `localhost:3003` at 1440px | All chrome visible, ctrl-pill at top-left, sidebar at left, right pane on the right when widget open |
| `?forceBreakpoint=phone` preview | `localhost:3003/?forceBreakpoint=phone` at 1440px | Same as phone, but inside the centred 390×780 device frame; Mai hidden; nothing leaks outside the frame |

Typecheck after every phase: `cd apps/web && pnpm exec tsc --noEmit`.

Run the build once before pushing: `cd apps/web && pnpm build` (catches Vite-time errors that `tsc --noEmit` misses).

---

## 8 · File reference

Quick index of files touched or relevant. Organised by area.

### Viewer (`apps/web/src/viewer/`)
- `components/MapShell/MapShell.tsx` — phone/tablet-portrait shell; renders ctrl-pill, floating icons, secondary rail, mobile widget sheet host
- `components/MapShell/MapShell.module.css`
- `components/MapShell/Carousel.tsx` — shared carousel primitive (already shipped)
- `components/MapShell/Carousel.module.css`
- `components/CesiumViewer/CesiumViewer.tsx` — desktop/tablet-landscape shell; needs Phase 1 / Phase 4 changes
- `components/CesiumViewer/CesiumViewer.css` — has `.map-controls` that Phase 1 deletes
- `components/ViewerSidebar/` — Phase 4 deletes this directory
- `components/CtrlPill/` — Phase 1 creates this (new)
- `components/SiteStrip/` — Phase 1b creates this (new)
- `components/FloatingIconStack/` — Phase 4 creates this (new)
- `components/FloatingSidePanel/` — Phase 4 creates this (new)
- `pages/SitesMapPage.tsx` — all-sites route; mounts `SiteStrip` per Phase 1b
- `hooks/useBreakpoint.ts` — Phase 3 adds `layoutMode`
- `widgets/fly/` — keep, but never re-add Fly to phone (anti-pattern §4.7)
- `extensions/` — widget registry; needs `MobileSheet` slot per §3.6

### Admin (`apps/web/src/admin/`)
- `layouts/AppLayout.jsx` — Atlas chrome; carousel nav (already shipped); Phase 3 retires tablet drawer
- `layouts/AppLayout.css` — Phase 3 deletes `.sidebar-tablet` rules
- `hooks/useBreakpoint.js` — Phase 3 adds `layoutMode`
- `styles/global.css` — has `.admin-root` height fix (already shipped)

### AI / Mai (`apps/web/src/ai/`)
- `DraggableMai.tsx` — clearance bump + preview-mode hide (already shipped). Do not regress (anti-pattern §4.10 conceptually).

### Packages
- `packages/settings-panels/src/SettingsShell.tsx` — Section interface with `icon?: ReactNode`. Settings carousel.
- `packages/settings-panels/src/SettingsShell.module.css` — Phase 2 drops the `.navItemIcon { display: none }` gate
- `packages/app-shell/src/components/AppShell.tsx` — outer shell with device-frame wrappers for preview mode
- `packages/app-shell/src/hooks/useBreakpoint.ts` — reads `?forceBreakpoint=` URL param; do not break this contract

### Mockups
- `mockups/mobile-redesign.html` — phone frames; design source of truth
- `mockups/desktop-tablet-redesign.html` — desktop + tablet frames; design source of truth
- `mockups/IMPLEMENTATION.md` — **this document**

### Top-level
- `apps/web/src/App.tsx` — Twin's extra settings sections with Lucide icons (already shipped)

---

## 9 · Decisions log

For each contentious decision: what we chose, what we considered, and why we landed where we did. Future-you (or a successor) will want this when revisiting.

| Decision | Chose | Considered | Why |
|---|---|---|---|
| Site picker vs widget rail | Exclusive swap | Overlay (preserves widget context), Stacked (both visible) | One job per bottom slot. Widget rail is per-site; no site → nothing to put there. |
| Overview back affordance | Square tile at start of widget rail | Pill button in ctrl-pill, chevron-only in ctrl-pill | Distinct violet square is glanceable; pill version ate horizontal space; chevron-only was cryptic. |
| Tablet pattern | Orientation-driven | Breakpoint-only (always drawer), always desktop, always phone | Portrait and landscape have different ergonomics; one pattern doesn't fit both. |
| Settings nav location on phone | Bottom carousel | Top pill nav, sidebar | Bottom slot is thumb-reachable; top is notification-collision territory. |
| Mode switcher placement | Bottom on phone/portrait, top on desktop/landscape | Bottom everywhere, top everywhere | Mobile thumb-reach + desktop convention. Forced consistency would harm one or the other. |
| Atlas overflow | Scroll carousel of all 9 | 5 primary + "More" sheet | "More" hides half the nav and adds an extra tap. Carousel keeps every tab one flick away. |
| Floating layers/3D buttons on the right edge | Removed | Keep (AllTrails-style) | Layers is in the pill. 3D doesn't have its own button; basemap toggle handles it. AllTrails copy was a mistake. |
| Fly on phone | Removed (filtered by `phoneMode`) | Keep, gate by cursor MQ | Touch already moves the camera. Fly is keyboard-only (WASD/arrows/Q/E). |
| Settings icons on desktop | Show inline (after Phase 2) | Hidden (current state) | Coherence — phone shows icons; desktop should too. Same icon set, two layouts. |
| Sheet height policy | Dynamic per widget-state | Fixed 50vh, user-resizable only | Different widgets need different room (Snap = small, Design setup = large). Auto-fit-to-content with a cap is closer to AllTrails's snap-points pattern. |
| Mai default Y | 142 px | 72 px (original), 88 px (intermediate) | Has to clear stacked 64+64 chrome on phones + 14 px gap. Don't regress below 142. |

---

## 10 · How to start

If you're a fresh Claude Code session reading this for the first time:

1. `git fetch origin && git checkout main-local && git pull`
2. Open the two HTML mockups in a browser (Chrome/Safari). Read every frame's `.desktop-note` and `.change-list`.
3. Skim §2 (Principles) and §4 (Anti-patterns) here. Internalise them.
4. Pick Phase 1 (CtrlPill). Read §5.1, §3.1, §6.1–§6.4. Write the acceptance criteria on a sticky note where you can see them.
5. Open the relevant files from §8 (File reference).
6. Build. Verify on each surface in §7 (Verification recipe).
7. Commit as `feat(viewer): shared CtrlPill component` (or similar) and push to `main-local`.
8. Move to the next phase.

If something is unclear, **ask** — do not guess. The user is `rahman@mightyspatial.com` (`MightySpatial/mighty-twin` repo owner). Stop and request clarification rather than ship a guess.

---

**End of brief.**
