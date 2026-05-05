/** Atlas Story Maps editor (T+570).
 *
 *  Lists every story map across all sites. Click a row → opens the
 *  StoryMapEditor (single-page editor with slide list + slide form).
 *  New stories are created via a modal that captures the site + name.
 *
 *  Slides are stored as JSON on the StoryMap record. The editor
 *  treats them as an ordered list — Up/Down to reorder, Plus to add,
 *  X to remove. The right pane is the form for the selected slide.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  Globe,
  Loader,
  Lock,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface SlideCamera {
  longitude: number
  latitude: number
  height: number
  heading?: number
  pitch?: number
  roll?: number
}

interface Slide {
  title: string
  narrative: string
  camera: SlideCamera
  visible_layers?: string[]
  duration?: number
}

interface StoryMap {
  id: string
  site_id: string
  name: string
  description: string | null
  is_published: boolean
  slides: Slide[]
}

interface SiteListItem {
  id: string
  slug: string
  name: string
}

const EMPTY_CAMERA: SlideCamera = {
  longitude: 0,
  latitude: 0,
  height: 5000,
  heading: 0,
  pitch: -45,
  roll: 0,
}

export default function StoryMapsPage() {
  const { isPhone } = useBreakpoint()
  const [stories, setStories] = useState<StoryMap[]>([])
  const [sites, setSites] = useState<SiteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [storiesData, sitesData] = await Promise.all([
        apiFetch('/api/story-maps'),
        apiFetch('/api/spatial/sites'),
      ])
      setStories((storiesData as StoryMap[]) ?? [])
      setSites(((sitesData as SiteListItem[]) ?? []))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const active = useMemo(
    () => stories.find((s) => s.id === activeId) ?? null,
    [stories, activeId],
  )

  if (active) {
    return (
      <StoryMapEditor
        story={active}
        sites={sites}
        onBack={() => setActiveId(null)}
        onSaved={(updated) => {
          setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
        }}
        onDeleted={(id) => {
          setStories((prev) => prev.filter((s) => s.id !== id))
          setActiveId(null)
        }}
      />
    )
  }

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Story maps</h1>
          <p
            style={{
              margin: '4px 0 0',
              color: 'rgba(240,242,248,0.5)',
              fontSize: 13,
            }}
          >
            Guided narratives that walk users through a site, slide by slide.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} style={primaryBtn}>
          <Plus size={14} /> New story
        </button>
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
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && <div style={{ color: 'rgba(240,242,248,0.5)' }}>Loading…</div>}

      {!loading && stories.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'rgba(240,242,248,0.5)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 10,
          }}
        >
          <BookOpen size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            No story maps yet
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Stories pair narrative with camera flights through a site.
          </div>
        </div>
      )}

      {!loading && stories.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stories.map((s) => {
            const site = sites.find((x) => x.id === s.site_id)
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  color: '#f0f2f8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  font: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: s.is_published
                      ? 'rgba(45,212,191,0.18)'
                      : 'rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: s.is_published ? '#2dd4bf' : 'rgba(240,242,248,0.5)',
                  }}
                >
                  <BookOpen size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(240,242,248,0.45)',
                      marginTop: 2,
                    }}
                  >
                    {s.slides.length} slide{s.slides.length === 1 ? '' : 's'}
                    {site && <> · {site.name}</>}
                  </div>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: s.is_published ? '#2dd4bf' : 'rgba(240,242,248,0.5)',
                  }}
                >
                  {s.is_published ? <Globe size={12} /> : <Lock size={12} />}
                  {s.is_published ? 'Published' : 'Draft'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {showNew && (
        <NewStoryModal
          sites={sites}
          onClose={() => setShowNew(false)}
          onCreated={(s) => {
            setStories((prev) => [s, ...prev])
            setActiveId(s.id)
            setShowNew(false)
          }}
        />
      )}
    </div>
  )
}

function NewStoryModal({
  sites,
  onClose,
  onCreated,
}: {
  sites: SiteListItem[]
  onClose: () => void
  onCreated: (s: StoryMap) => void
}) {
  const [name, setName] = useState('')
  const [siteSlug, setSiteSlug] = useState(sites[0]?.slug ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    if (!name.trim() || !siteSlug) {
      setErr('Name and site are required.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const out = (await apiFetch('/api/story-maps', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), site_slug: siteSlug, slides: [] }),
      })) as StoryMap
      onCreated(out)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          maxWidth: 'calc(100vw - 32px)',
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 18,
          color: '#f0f2f8',
        }}
      >
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>
          New story map
        </h2>
        <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spaceport tour"
            style={inputStyle}
          />
        </Field>
        <Field label="Site">
          <select
            value={siteSlug}
            onChange={(e) => setSiteSlug(e.target.value)}
            style={inputStyle}
          >
            {sites.length === 0 ? (
              <option value="" disabled>
                No sites available
              </option>
            ) : (
              sites.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </Field>
        {err && (
          <div
            style={{
              padding: 8,
              background: 'rgba(251,113,133,0.06)',
              border: '1px solid rgba(251,113,133,0.32)',
              borderRadius: 7,
              color: '#fca5a5',
              fontSize: 11,
              marginBottom: 12,
            }}
          >
            {err}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={ghostBtn}>
            Cancel
          </button>
          <button
            onClick={create}
            disabled={busy || !name.trim() || !siteSlug}
            style={{
              ...primaryBtn,
              opacity: busy || !name.trim() || !siteSlug ? 0.5 : 1,
            }}
          >
            {busy ? <Loader size={12} className="spin" /> : <Plus size={12} />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function StoryMapEditor({
  story,
  sites,
  onBack,
  onSaved,
  onDeleted,
}: {
  story: StoryMap
  sites: SiteListItem[]
  onBack: () => void
  onSaved: (s: StoryMap) => void
  onDeleted: (id: string) => void
}) {
  const { isPhone } = useBreakpoint()
  const [draft, setDraft] = useState<StoryMap>(story)
  const [activeIdx, setActiveIdx] = useState<number>(story.slides.length > 0 ? 0 : -1)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(story)
  const siteSlug = sites.find((s) => s.id === story.site_id)?.slug ?? null

  function previewSlide(slide: Slide) {
    if (!siteSlug) return
    const c = slide.camera
    const params = [
      c.longitude,
      c.latitude,
      c.height,
      c.heading ?? 0,
      c.pitch ?? -45,
      c.roll ?? 0,
    ].join(',')
    window.open(
      `/viewer/sites/${siteSlug}?camera=${encodeURIComponent(params)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  function captureFromViewer() {
    if (!siteSlug || activeIdx < 0) return
    const raw = localStorage.getItem(`mighty:viewer-cam:${siteSlug}`)
    if (!raw) {
      alert(
        `No camera captured yet for "${siteSlug}". Open the viewer in another tab and move the camera, then try again.`,
      )
      return
    }
    try {
      const cam = JSON.parse(raw) as {
        longitude: number
        latitude: number
        height: number
        heading: number
        pitch: number
        roll: number
        ts: number
      }
      const ageMins = (Date.now() - cam.ts) / 60_000
      if (ageMins > 10) {
        if (
          !confirm(
            `The captured camera is ${Math.round(ageMins)} min old. Use it anyway?`,
          )
        )
          return
      }
      patchSlide(activeIdx, {
        camera: {
          longitude: cam.longitude,
          latitude: cam.latitude,
          height: cam.height,
          heading: cam.heading,
          pitch: cam.pitch,
          roll: cam.roll,
        },
      })
    } catch {
      alert('Captured camera is corrupted — try moving the viewer again.')
    }
  }

  // Keep draft in sync if the parent gets a fresh server copy.
  useEffect(() => {
    setDraft(story)
  }, [story])

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const updated = (await apiFetch(`/api/story-maps/${story.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          is_published: draft.is_published,
          slides: draft.slides,
        }),
      })) as StoryMap
      onSaved(updated)
      setSavedAt(Date.now())
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteStory() {
    if (!confirm(`Delete story map "${story.name}"?`)) return
    try {
      await apiFetch(`/api/story-maps/${story.id}`, { method: 'DELETE' })
      onDeleted(story.id)
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  function patchSlide(idx: number, patch: Partial<Slide>) {
    setDraft((d) => ({
      ...d,
      slides: d.slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }))
  }

  function addSlide() {
    const next: Slide = {
      title: `Slide ${draft.slides.length + 1}`,
      narrative: '',
      camera: { ...EMPTY_CAMERA },
    }
    setDraft((d) => ({ ...d, slides: [...d.slides, next] }))
    setActiveIdx(draft.slides.length)
  }

  function removeSlide(idx: number) {
    setDraft((d) => ({ ...d, slides: d.slides.filter((_, i) => i !== idx) }))
    setActiveIdx((cur) => Math.max(0, Math.min(cur, draft.slides.length - 2)))
  }

  function moveSlide(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= draft.slides.length) return
    setDraft((d) => {
      const next = [...d.slides]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, slides: next }
    })
    setActiveIdx(target)
  }

  const activeSlide = activeIdx >= 0 ? draft.slides[activeIdx] : null

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={onBack} style={ghostBtn}>
          <ChevronLeft size={14} /> Story maps
        </button>
        <div style={{ flex: 1 }} />
        {savedAt && Date.now() - savedAt < 4_000 && (
          <span style={{ fontSize: 11, color: '#34d399' }}>Saved</span>
        )}
        <button onClick={deleteStory} style={dangerBtn}>
          <Trash2 size={14} />
        </button>
        <button
          onClick={save}
          disabled={busy || !isDirty}
          style={{ ...primaryBtn, opacity: busy || !isDirty ? 0.5 : 1 }}
        >
          {busy ? <Loader size={14} className="spin" /> : <Save size={14} />}
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {err && (
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
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {/* Story metadata */}
      <Card title="Story details">
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            style={inputStyle}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={draft.description ?? ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value || null }))
            }
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 10,
            background: draft.is_published
              ? 'rgba(45,212,191,0.06)'
              : 'rgba(255,255,255,0.03)',
            border: `1px solid ${
              draft.is_published ? 'rgba(45,212,191,0.32)' : 'rgba(255,255,255,0.07)'
            }`,
            borderRadius: 8,
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          <input
            type="checkbox"
            checked={draft.is_published}
            onChange={(e) =>
              setDraft((d) => ({ ...d, is_published: e.target.checked }))
            }
            style={{ accentColor: '#2dd4bf' }}
          />
          {draft.is_published ? (
            <Globe size={14} color="#2dd4bf" />
          ) : (
            <Lock size={14} color="rgba(240,242,248,0.5)" />
          )}
          <span style={{ fontSize: 13 }}>
            {draft.is_published ? 'Published — visible in viewer' : 'Draft'}
          </span>
        </label>
      </Card>

      {/* Slide list + editor (two-column on desktop, stacked on phone) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : '260px 1fr',
          gap: 14,
          marginTop: 14,
        }}
      >
        {/* Slide list */}
        <Card title={`Slides (${draft.slides.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {draft.slides.length === 0 && (
              <div
                style={{
                  padding: 16,
                  textAlign: 'center',
                  color: 'rgba(240,242,248,0.45)',
                  fontSize: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed rgba(255,255,255,0.08)',
                  borderRadius: 8,
                }}
              >
                No slides yet
              </div>
            )}
            {draft.slides.map((slide, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: 8,
                  background:
                    idx === activeIdx
                      ? 'rgba(36,83,255,0.10)'
                      : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${
                    idx === activeIdx
                      ? 'rgba(36,83,255,0.4)'
                      : 'rgba(255,255,255,0.07)'
                  }`,
                  borderRadius: 7,
                  cursor: 'pointer',
                }}
                onClick={() => setActiveIdx(idx)}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: 'rgba(240,242,248,0.4)',
                    width: 18,
                    textAlign: 'right',
                  }}
                >
                  {idx + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {slide.title || '(untitled)'}
                </span>
                {siteSlug && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      previewSlide(slide)
                    }}
                    style={miniBtn(false)}
                    title="Preview in viewer"
                  >
                    <ExternalLink size={11} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    moveSlide(idx, -1)
                  }}
                  disabled={idx === 0}
                  style={miniBtn(idx === 0)}
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    moveSlide(idx, 1)
                  }}
                  disabled={idx === draft.slides.length - 1}
                  style={miniBtn(idx === draft.slides.length - 1)}
                >
                  <ChevronDown size={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSlide(idx)
                  }}
                  style={miniBtn(false)}
                  title="Remove slide"
                >
                  <X size={11} color="#fb7185" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addSlide} style={ghostBtn}>
            <Plus size={12} /> Add slide
          </button>
        </Card>

        {/* Slide editor */}
        <Card title={activeSlide ? `Slide ${activeIdx + 1}` : 'No slide selected'}>
          {activeSlide ? (
            <>
              {siteSlug && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => previewSlide(activeSlide)}
                    style={ghostBtn}
                    title="Open the viewer at this slide's camera"
                  >
                    <ExternalLink size={12} /> Preview in viewer
                  </button>
                  <button
                    onClick={captureFromViewer}
                    style={ghostBtn}
                    title="Pull camera coords from the most recent viewer tab"
                  >
                    <Camera size={12} /> Capture from viewer
                  </button>
                </div>
              )}
              <Field label="Title">
                <input
                  value={activeSlide.title}
                  onChange={(e) => patchSlide(activeIdx, { title: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Narrative">
                <textarea
                  value={activeSlide.narrative}
                  onChange={(e) => patchSlide(activeIdx, { narrative: e.target.value })}
                  rows={4}
                  placeholder="What does the user see at this slide?"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </Field>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(3, 1fr)',
                  gap: 10,
                }}
              >
                <Field label="Longitude">
                  <input
                    type="number"
                    step="0.0001"
                    value={activeSlide.camera.longitude}
                    onChange={(e) =>
                      patchSlide(activeIdx, {
                        camera: {
                          ...activeSlide.camera,
                          longitude: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    style={inputStyle}
                  />
                </Field>
                <Field label="Latitude">
                  <input
                    type="number"
                    step="0.0001"
                    value={activeSlide.camera.latitude}
                    onChange={(e) =>
                      patchSlide(activeIdx, {
                        camera: {
                          ...activeSlide.camera,
                          latitude: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    style={inputStyle}
                  />
                </Field>
                <Field label="Height (m)">
                  <input
                    type="number"
                    step="100"
                    value={activeSlide.camera.height}
                    onChange={(e) =>
                      patchSlide(activeIdx, {
                        camera: {
                          ...activeSlide.camera,
                          height: parseFloat(e.target.value) || 5000,
                        },
                      })
                    }
                    style={inputStyle}
                  />
                </Field>
                <Field label="Heading °">
                  <input
                    type="number"
                    step="1"
                    value={activeSlide.camera.heading ?? 0}
                    onChange={(e) =>
                      patchSlide(activeIdx, {
                        camera: {
                          ...activeSlide.camera,
                          heading: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    style={inputStyle}
                  />
                </Field>
                <Field label="Pitch °">
                  <input
                    type="number"
                    step="1"
                    value={activeSlide.camera.pitch ?? -45}
                    onChange={(e) =>
                      patchSlide(activeIdx, {
                        camera: {
                          ...activeSlide.camera,
                          pitch: parseFloat(e.target.value) || -45,
                        },
                      })
                    }
                    style={inputStyle}
                  />
                </Field>
                <Field label="Duration (s)">
                  <input
                    type="number"
                    step="0.5"
                    value={activeSlide.duration ?? ''}
                    onChange={(e) =>
                      patchSlide(activeIdx, {
                        duration: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="auto"
                    style={inputStyle}
                  />
                </Field>
              </div>
            </>
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'rgba(240,242,248,0.5)',
                fontSize: 13,
              }}
            >
              Pick a slide to edit, or add the first one.
            </div>
          )}
        </Card>
      </div>
      {/* Hide the unused sites variable lint warning */}
      <span style={{ display: 'none' }}>{sites.length}</span>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
    </div>
  )
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: 4,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 5,
    color: disabled ? 'rgba(240,242,248,0.2)' : 'rgba(240,242,248,0.6)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: 0,
  }
}

const inputStyle: React.CSSProperties = {
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
  padding: '6px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const dangerBtn: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(251,113,133,0.10)',
  border: '1px solid rgba(251,113,133,0.32)',
  borderRadius: 7,
  color: '#fb7185',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}
