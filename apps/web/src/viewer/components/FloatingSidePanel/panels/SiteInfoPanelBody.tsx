/** SiteInfoPanelBody — body slot for the "Site info" floating panel.
 *
 *  Renders the welcome content for a per-site route — site name +
 *  description + the existing HomePanel content (hero image / intro
 *  HTML / links sourced from site.config.home_content).
 *
 *  Replaces ViewerSidebar's HOME tab. */

import HomePanel from './HomePanel'

export interface SiteInfoPanelBodyProps {
  siteName: string
  description?: string | null
  homeContent?: {
    hero_image_url?: string | null
    hero_video_url?: string | null
    intro_html?: string | null
    links?: { label: string; url: string }[]
  } | null
}

export function SiteInfoPanelBody({
  siteName,
  description,
  homeContent,
}: SiteInfoPanelBodyProps) {
  if (!homeContent && !description) {
    return (
      <div style={{ padding: '12px 14px', color: 'rgba(240,242,248,0.72)', fontSize: 13 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f0f2f8' }}>{siteName}</h3>
      </div>
    )
  }
  return (
    <div style={{ padding: '4px 8px' }}>
      <HomePanel siteName={siteName} content={homeContent ?? null} />
      {description && (
        <p style={{ fontSize: 12, color: 'rgba(240,242,248,0.6)', margin: '12px 14px 0' }}>
          {description}
        </p>
      )}
    </div>
  )
}

export default SiteInfoPanelBody
