/** Atlas — New Site page (T+330 rebuild).
 *
 *  v1 SiteNewPage.jsx imported SiteDetailPage.css (deleted in T+180)
 *  and used the wrong field names (is_public, top-level default_camera).
 *  This rebuild:
 *    - Uses is_public_pre_login (the real backend field)
 *    - Puts camera + branding inside config
 *    - Pretty hero header + auto-slug + storage-CRS picker
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ChevronLeft,
  Globe,
  Loader,
  Lock,
  Plus,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

const COMMON_SRIDS = [
  { code: 4326, label: '4326 — WGS84 (default, lat/lon)' },
  { code: 3857, label: '3857 — Web Mercator' },
  { code: 28350, label: '28350 — MGA2020 Zone 50 (Western Australia)' },
  { code: 28351, label: '28351 — MGA2020 Zone 51' },
  { code: 28352, label: '28352 — MGA2020 Zone 52' },
  { code: 28353, label: '28353 — MGA2020 Zone 53' },
  { code: 28354, label: '28354 — MGA2020 Zone 54' },
  { code: 28355, label: '28355 — MGA2020 Zone 55' },
  { code: 28356, label: '28356 — MGA2020 Zone 56' },
]

export default function SiteNewPage() {
  const navigate = useNavigate()
  const { isPhone } = useBreakpoint()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [storageSrid, setStorageSrid] = useState(4326)
  const [primaryColor, setPrimaryColor] = useState('#2453ff')
  const [lng, setLng] = useState('115.8575')
  const [lat, setLat] = useState('-31.9505')
  const [height, setHeight] = useState('5000')

  function handleNameChange(v: string) {
    setName(v)
    if (!slugManual) setSlug(slugify(v))
  }

  async function save() {
    if (!name.trim() || !slug.trim()) {
      setError('Name and slug are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const site = (await apiFetch('/api/spatial/sites', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          is_public_pre_login: isPublic,
          storage_srid: storageSrid,
          config: {
            primary_color: primaryColor,
            default_camera: {
              longitude: parseFloat(lng) || 0,
              latitude: parseFloat(lat) || 0,
              height: parseFloat(height) || 5000,
            },
          },
        }),
      })) as { slug: string }
      navigate(`/admin/sites/${site.slug}`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
        maxWidth: 720,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <button onClick={() => navigate('/admin/sites')} style={ghostBtn}>
          <ChevronLeft size={14} /> Sites
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader size={14} className="spin" /> : <Plus size={14} />}
          {saving ? 'Creating…' : 'Create site'}
        </button>
      </div>

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${primaryColor}, #a78bfa)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 22,
          }}
        >
          {(name.slice(0, 1) || 'N').toUpperCase()}
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
            New site
          </h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            Provision a new site for layers, snapshots, and story maps.
          </p>
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: 12,
            background: 'rgba(251,113,133,0.06)',
            border: '1px solid rgba(251,113,133,0.32)',
            borderRadius: 8,
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Section: identity */}
      <Card title="Identity">
        <Field label="Name *">
          <input
            autoFocus
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Forrest Airport"
            style={input()}
          />
        </Field>
        <Field label="Slug *" hint="URL identifier — auto-generated from name unless edited">
          <input
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value))
              setSlugManual(true)
            }}
            placeholder="forrest-airport"
            style={{ ...input(), fontFamily: 'monospace' }}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional"
            style={{ ...input(), resize: 'vertical' }}
          />
        </Field>
      </Card>

      {/* Section: access */}
      <Card title="Access">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            background: isPublic ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isPublic ? 'rgba(34,197,94,0.32)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 8,
            cursor: 'pointer',
          }}
          onClick={() => setIsPublic((v) => !v)}
        >
          {isPublic ? <Globe size={16} color="#34d399" /> : <Lock size={16} color="rgba(240,242,248,0.5)" />}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: isPublic ? '#34d399' : 'rgba(240,242,248,0.85)',
              }}
            >
              {isPublic ? 'Public — no sign-in required' : 'Authenticated only'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)', marginTop: 2 }}>
              {isPublic
                ? `Reachable at /p/${slug || '<slug>'}`
                : 'Only signed-in users with site access can view.'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            style={{ accentColor: '#22c55e', pointerEvents: 'none' }}
          />
        </div>
      </Card>

      {/* Section: appearance */}
      <Card title="Appearance">
        <Field label="Primary colour" hint="Used for the site avatar + header gradient">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              style={{
                width: 36,
                height: 28,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            />
            <input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              style={{ ...input(), maxWidth: 120, fontFamily: 'monospace' }}
            />
          </div>
        </Field>
      </Card>

      {/* Section: storage CRS */}
      <Card title="Coordinate system">
        <Field
          label="Storage SRID"
          hint="EPSG code for storing feature geometries. Pick the local projected CRS for engineering sites — the viewer always reprojects to WGS84."
        >
          <select
            value={storageSrid}
            onChange={(e) => setStorageSrid(parseInt(e.target.value, 10))}
            style={input()}
          >
            {COMMON_SRIDS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {/* Section: default camera */}
      <Card title="Default camera">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 1fr',
            gap: 10,
          }}
        >
          <Field label="Longitude">
            <input
              type="number"
              step="0.0001"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              style={input()}
            />
          </Field>
          <Field label="Latitude">
            <input
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              style={input()}
            />
          </Field>
          <Field label="Height (m)">
            <input
              type="number"
              step="100"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              style={input()}
            />
          </Field>
        </div>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        marginBottom: 14,
      }}
    >
      <h2
        style={{
          margin: '0 0 12px',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.65)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'rgba(240,242,248,0.55)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}

function input(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 7,
    color: '#f0f2f8',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}
