import { useState } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import { usePersistedSettings } from '@mightyspatial/settings-panels'
import { AdminShell, type AdminSection } from '../AdminShell'
import { WidgetInspector } from './WidgetInspector'
import { CameraHUD } from './CameraHUD'
import { ViewerStateJson } from './ViewerStateJson'

interface DevToolsPageProps {
  /** Current viewer instance, if any. Passed through from the host app so
   *  admin-panels does not depend on cesium-core's React context. */
  viewer?: CesiumViewer | null
}

/** One-stop dev tools: widget registry + camera HUD + viewer state JSON. */
export function DevToolsPage({ viewer = null }: DevToolsPageProps) {
  const [active, setActive] = useState('widgets')
  const { update } = usePersistedSettings()

  const sections: AdminSection[] = [
    { id: 'widgets', label: 'Widgets', content: <WidgetInspector /> },
    { id: 'camera', label: 'Camera', content: <CameraHUD viewer={viewer} /> },
    { id: 'state', label: 'Viewer state', content: <ViewerStateJson viewer={viewer} /> },
  ]

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <AdminShell
        title="Dev tools"
        subtitle="Widget registry, camera state, and viewer diagnostics."
        sections={sections}
        activeSectionId={active}
        onActiveSectionChange={setActive}
      />
      <button
        type="button"
        onClick={() => update({ admin: { view: 'mock' } })}
        style={{
          position: 'absolute',
          top: 24,
          right: 28,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid rgba(99, 102, 241, 0.4)',
          background: 'rgba(99, 102, 241, 0.14)',
          color: '#a5b4fc',
          font: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
        }}
        title="Swap this admin tab to the mock admin chrome"
      >
        Switch to Mock Admin
      </button>
    </div>
  )
}
