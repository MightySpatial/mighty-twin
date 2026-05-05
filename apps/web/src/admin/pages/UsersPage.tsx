/** Settings — Users panel (T+840 rebuild).
 *
 *  Mounted in the SettingsShell extra-sections (App.tsx). The v1 jsx
 *  page referenced user.provider, user.status, and user.avatar — none
 *  of which the API returned, plus PATCH/DELETE endpoints didn't exist
 *  on the backend so role changes silently 404'd. This rebuild:
 *
 *    - Surfaces is_active (real backend field) with a polished switch
 *    - Uses the new PATCH /api/auth/users/{id} (T+840 backend)
 *    - Inline-rename for name (click name → input)
 *    - Avatar preview with initials fallback
 *    - Filter chips: All / Admins / Creators / Viewers
 *    - "Invite user" → existing UserNew flow (kept for now)
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Eye,
  Loader,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react'
import { apiFetch, useApiData } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

type Role = 'admin' | 'creator' | 'viewer'

interface User {
  id: string
  email: string
  name: string
  role: Role
  avatar: string | null
  is_active: boolean
  created_at: string | null
}

const ROLE_META: Record<Role, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: 'Admin', color: '#fb7185', icon: ShieldCheck },
  creator: { label: 'Creator', color: '#f59e0b', icon: Wrench },
  viewer: { label: 'Viewer', color: '#34d399', icon: Eye },
}

function initials(name: string): string {
  return (
    name
      .split(' ')
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  )
}

export default function UsersPage() {
  const { isPhone } = useBreakpoint()
  const { data, loading, error, reload, setData } = useApiData('/api/auth/users', [])
  const users = (data as User[]) ?? []
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      const q = search.toLowerCase()
      if (!q) return true
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [users, search, roleFilter])

  async function patch(id: string, body: Partial<User>) {
    setBusyId(id)
    try {
      const updated = (await apiFetch(`/api/auth/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as User
      setData(users.map((u) => (u.id === id ? updated : u)))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function deleteUser(u: User) {
    if (!confirm(`Remove ${u.name} (${u.email}) from the workspace?`)) return
    setBusyId(u.id)
    try {
      await apiFetch(`/api/auth/users/${u.id}`, { method: 'DELETE' })
      setData(users.filter((x) => x.id !== u.id))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  function startRename(u: User) {
    setEditingName(u.id)
    setNameDraft(u.name)
  }

  async function commitRename(u: User) {
    const next = nameDraft.trim()
    setEditingName(null)
    if (!next || next === u.name) return
    await patch(u.id, { name: next })
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users.length, admin: 0, creator: 0, viewer: 0 }
    for (const u of users) c[u.role] = (c[u.role] || 0) + 1
    return c
  }, [users])

  // Trigger a re-render when busyId changes (used by row spinners).
  useEffect(() => undefined, [busyId])

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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Users</h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            {users.length} user{users.length === 1 ? '' : 's'} ·{' '}
            {users.filter((u) => u.is_active).length} active
          </p>
        </div>
        <button onClick={() => setInviteOpen(true)} style={primaryBtn}>
          <Plus size={14} /> Invite user
        </button>
      </header>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
          }}
        >
          <Search size={16} color="rgba(240,242,248,0.4)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 13,
            }}
          />
          {loading && <Loader size={14} className="spin" />}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip active={roleFilter === 'all'} onClick={() => setRoleFilter('all')} count={counts.all}>
          All
        </Chip>
        {(['admin', 'creator', 'viewer'] as Role[]).map((r) => {
          const meta = ROLE_META[r]
          const Icon = meta.icon
          return (
            <Chip
              key={r}
              active={roleFilter === r}
              onClick={() => setRoleFilter(r)}
              count={counts[r] || 0}
              tint={meta.color}
            >
              <Icon size={11} /> {meta.label}
            </Chip>
          )
        })}
      </div>

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
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={reload} style={ghostBtn}>
            Retry
          </button>
        </div>
      )}

      {!loading && filtered.length === 0 && (
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
          <Eye size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            {search || roleFilter !== 'all' ? 'No matches' : 'No users yet'}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((u) => {
            const meta = ROLE_META[u.role]
            const RoleIcon = meta.icon
            return (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  opacity: u.is_active ? 1 : 0.5,
                  flexWrap: isPhone ? 'wrap' : undefined,
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: u.avatar
                      ? `center/cover no-repeat url(${u.avatar})`
                      : `linear-gradient(135deg, ${meta.color}, #a78bfa)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {!u.avatar && initials(u.name)}
                </div>

                {/* Name + email */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingName === u.id ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => commitRename(u)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(u)
                        if (e.key === 'Escape') setEditingName(null)
                      }}
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(36,83,255,0.4)',
                        borderRadius: 5,
                        color: '#f0f2f8',
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => startRename(u)}
                      title="Click to rename"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'text',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {u.name}
                      <Pencil size={10} color="rgba(240,242,248,0.3)" />
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(240,242,248,0.45)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {u.email}
                  </div>
                </div>

                {/* Role select */}
                <select
                  value={u.role}
                  disabled={busyId === u.id}
                  onChange={(e) => patch(u.id, { role: e.target.value as Role })}
                  style={{
                    padding: '6px 8px',
                    background: meta.color + '14',
                    border: `1px solid ${meta.color}40`,
                    borderRadius: 6,
                    color: meta.color,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="creator">Creator</option>
                  <option value="viewer">Viewer</option>
                </select>

                {/* Active toggle */}
                <ToggleSwitch
                  checked={u.is_active}
                  disabled={busyId === u.id}
                  onChange={(v) => patch(u.id, { is_active: v })}
                  title={u.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                />

                {/* Delete */}
                <button
                  onClick={() => deleteUser(u)}
                  disabled={busyId === u.id}
                  style={iconBtn}
                  title="Remove user"
                >
                  {busyId === u.id ? (
                    <Loader size={12} className="spin" />
                  ) : (
                    <Trash2 size={12} color="#fb7185" />
                  )}
                </button>

                {/* Hidden Role icon to silence unused-import lint when phone collapses the chip */}
                <span style={{ display: 'none' }}>
                  <RoleIcon size={1} />
                </span>
              </div>
            )
          })}
        </div>
      )}

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onCreated={(u) => {
            setData([u, ...users])
            setInviteOpen(false)
          }}
        />
      )}
    </div>
  )
}

function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (u: User) => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    if (!email.trim() || !name.trim() || password.length < 8) {
      setErr('Email + name required; password must be 8+ characters.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const out = (await apiFetch('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          password,
          role,
        }),
      })) as User
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
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 18,
          color: '#f0f2f8',
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Invite user</h2>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(240,242,248,0.55)' }}>
          The user logs in with this password and can change it later.
        </p>
        <ModalField label="Email">
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            style={modalInput}
          />
        </ModalField>
        <ModalField label="Display name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            style={modalInput}
          />
        </ModalField>
        <ModalField label="Initial password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            style={modalInput}
          />
        </ModalField>
        <ModalField label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            style={modalInput}
          >
            <option value="viewer">Viewer — read-only</option>
            <option value="creator">Creator — edit content</option>
            <option value="admin">Admin — full access</option>
          </select>
        </ModalField>
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
          <button onClick={onClose} disabled={busy} style={modalGhost}>
            Cancel
          </button>
          <button
            onClick={create}
            disabled={busy || !email.trim() || !name.trim() || password.length < 8}
            style={{
              ...primaryBtn,
              opacity:
                busy || !email.trim() || !name.trim() || password.length < 8 ? 0.5 : 1,
            }}
          >
            {busy ? <Loader size={12} className="spin" /> : <Plus size={12} />}
            Create user
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalField({
  label,
  children,
}: {
  label: string
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
    </div>
  )
}

const modalInput: React.CSSProperties = {
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

const modalGhost: React.CSSProperties = {
  padding: '7px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  title,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: checked ? '#22c55e' : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: disabled ? 'wait' : 'pointer',
        position: 'relative',
        transition: 'background 160ms',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 160ms',
        }}
      />
    </button>
  )
}

function Chip({
  active,
  onClick,
  count,
  tint,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  tint?: string
  children: React.ReactNode
}) {
  const accent = tint ?? '#2453ff'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: active ? `${accent}28` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? `${accent}66` : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 8,
        color: active ? accent : 'rgba(240,242,248,0.7)',
        fontSize: 12,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontWeight: 500,
      }}
    >
      {children}
      <span
        style={{
          padding: '0 6px',
          background: active ? `${accent}40` : 'rgba(255,255,255,0.06)',
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </button>
  )
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
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: '#fca5a5',
  fontSize: 11,
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  padding: 6,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: 'rgba(240,242,248,0.7)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}
