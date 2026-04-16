import { useState } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
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

  const sections: AdminSection[] = [
    { id: 'widgets', label: 'Widgets', content: <WidgetInspector /> },
    { id: 'camera', label: 'Camera', content: <CameraHUD viewer={viewer} /> },
    { id: 'state', label: 'Viewer state', content: <ViewerStateJson viewer={viewer} /> },
  ]

  return (
    <AdminShell
      title="Dev tools"
      subtitle="Widget registry, camera state, and viewer diagnostics."
      sections={sections}
      activeSectionId={active}
      onActiveSectionChange={setActive}
    />
  )
}
