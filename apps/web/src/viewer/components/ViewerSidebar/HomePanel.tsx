/** Home tab — welcome panel for the active site.
 *
 *  Reads from `site.config.home` so admins can put a hero image, a
 *  short video, intro text (HTML), and a row of links straight in
 *  front of the user when they open a site. Same content the V1
 *  Welcome widget used on MightyDT.
 *
 *  When the site has no home content, falls back to a friendly
 *  placeholder that nudges the admin toward Atlas → Site detail to
 *  set it up. The placeholder is also the right look for the demo.
 */

import { ExternalLink, ImageIcon, Sparkles } from 'lucide-react'

interface HomeContent {
  hero_image_url?: string | null
  hero_video_url?: string | null
  intro_html?: string | null
  links?: { label: string; url: string }[]
}

export default function HomePanel({
  siteName,
  content,
}: {
  siteName: string | null
  content: HomeContent | null
}) {
  const hasAny =
    !!content &&
    (content.hero_image_url ||
      content.hero_video_url ||
      content.intro_html ||
      (content.links && content.links.length > 0))

  return (
    <div className="home-panel">
      {/* Hero — video wins over still image when both are set. */}
      {content?.hero_video_url ? (
        <div className="home-panel-hero">
          <video
            src={content.hero_video_url}
            poster={content.hero_image_url ?? undefined}
            controls
            playsInline
            preload="metadata"
            style={{ width: '100%', display: 'block' }}
          />
        </div>
      ) : content?.hero_image_url ? (
        <div className="home-panel-hero">
          <img
            src={content.hero_image_url}
            alt={siteName ? `${siteName} hero` : 'Site hero'}
            style={{ width: '100%', display: 'block' }}
          />
        </div>
      ) : null}

      {/* Title */}
      {siteName && (
        <h2 className="home-panel-title">
          <Sparkles size={14} className="home-panel-title-glyph" />
          Welcome to {siteName}
        </h2>
      )}

      {/* Intro */}
      {content?.intro_html ? (
        <div
          className="home-panel-intro"
          // The intro is admin-authored HTML stored in site.config —
          // sanitisation happens server-side at write time, so we trust
          // it here. Caveat: if anonymous viewers ever get write access
          // to home_content, revisit.
          dangerouslySetInnerHTML={{ __html: content.intro_html }}
        />
      ) : (
        !hasAny && (
          <div className="home-panel-empty">
            <ImageIcon size={24} className="home-panel-empty-icon" />
            <div className="home-panel-empty-title">Tell visitors about this site</div>
            <div className="home-panel-empty-hint">
              Drop a hero image or short video, write a paragraph or two, and
              add a few links — Atlas → Site detail → Welcome.
            </div>
          </div>
        )
      )}

      {/* Links row */}
      {content?.links && content.links.length > 0 && (
        <div className="home-panel-links">
          {content.links.map((l, i) => (
            <a
              key={`${i}:${l.url}`}
              href={l.url}
              target={l.url.startsWith('http') ? '_blank' : undefined}
              rel={l.url.startsWith('http') ? 'noreferrer' : undefined}
              className="home-panel-link"
            >
              <span style={{ flex: 1 }}>{l.label}</span>
              <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
