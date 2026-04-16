import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useApiData, apiFetch } from '../hooks/useApi'
import { Search, Plus, ChevronRight, Loader, AlertCircle, Trash2, ShieldCheck, Eye, Wrench } from 'lucide-react'
import '../styles/components.css'
import './ListPage.css'

const ROLE_BADGE_CLASS = {
  admin:   'status-error',    // red — elevated
  creator: 'status-pending',  // amber — power user
  viewer:  'status-active',   // green — standard
}

const ROLE_ICON = {
  admin:   <ShieldCheck size={13} />,
  creator: <Wrench size={13} />,
  viewer:  <Eye size={13} />,
}

function initials(name = '') {
  return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?'
}

export default function UsersPage() {
  const navigate = useNavigate()
  const { isDesktop } = useBreakpoint()
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [updatingRole, setUpdatingRole] = useState(null)

  const { data: users, loading, error, reload } = useApiData('/api/auth/users', [])

  const filteredUsers = (users || []).filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleRoleChange = async (e, user) => {
    e.stopPropagation()
    const newRole = e.target.value
    setUpdatingRole(user.id)
    try {
      await apiFetch(`/api/auth/users/${user.id}`, {
        method: 'PATCH',
        body: { role: newRole },
      })
      reload()
    } catch (err) {
      alert(`Failed to update role: ${err.message}`)
    } finally {
      setUpdatingRole(null)
    }
  }

  const handleDelete = async (e, user) => {
    e.stopPropagation()
    if (!window.confirm(`Remove ${user.name} from the system?`)) return
    setDeleting(user.id)
    try {
      await apiFetch(`/api/auth/users/${user.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      alert(`Failed to delete: ${err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  const toggleStatus = async (e, user) => {
    e.stopPropagation()
    const newStatus = user.status === 'active' ? 'inactive' : 'active'
    try {
      await apiFetch(`/api/auth/users/${user.id}`, {
        method: 'PATCH',
        body: { status: newStatus },
      })
      reload()
    } catch (err) {
      alert(`Failed to update status: ${err.message}`)
    }
  }

  return (
    <div className="list-page">
      {isDesktop && (
        <header className="page-header page-header-with-action">
          <div>
            <h1 className="page-title">Users</h1>
            <p className="page-subtitle">
              {loading ? 'Loading…' : `${(users || []).length} users`}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/admin/users/new')}>
            <Plus size={20} />
            Invite User
          </button>
        </header>
      )}

      <div className="list-toolbar">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {loading && <Loader size={18} className="spin" style={{ flexShrink: 0, opacity: 0.5 }} />}
      </div>

      {error && (
        <div className="inline-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={reload}>Retry</button>
        </div>
      )}

      {isDesktop ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Provider</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="table-user-cell">
                      <div className="avatar avatar-sm">
                        {user.avatar
                          ? <img src={user.avatar} alt={user.name} style={{ width: '100%', borderRadius: '50%' }} />
                          : initials(user.name)}
                      </div>
                      <span>{user.name}</span>
                    </div>
                  </td>
                  <td className="text-secondary" style={{ fontSize: 13 }}>{user.email}</td>
                  <td className="text-secondary" style={{ fontSize: 12, textTransform: 'capitalize' }}>
                    {user.provider}
                  </td>
                  <td>
                    {updatingRole === user.id
                      ? <Loader size={14} className="spin" />
                      : (
                        <select
                          className="form-select-inline"
                          value={user.role}
                          onChange={e => handleRoleChange(e, user)}
                          onClick={e => e.stopPropagation()}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="creator">Creator</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                  </td>
                  <td>
                    <button
                      className={`status-badge ${user.status === 'active' ? 'status-active' : 'status-inactive'}`}
                      style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
                      onClick={e => toggleStatus(e, user)}
                      title={user.status === 'active' ? 'Click to deactivate' : 'Click to activate'}
                    >
                      {user.status}
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-icon"
                      title="Remove user"
                      disabled={deleting === user.id}
                      onClick={e => handleDelete(e, user)}
                    >
                      {deleting === user.id
                        ? <Loader size={16} className="spin" />
                        : <Trash2 size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-secondary" style={{ textAlign: 'center', padding: '2rem' }}>
                    {search ? 'No users match.' : 'No users yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-list">
          {filteredUsers.map(user => (
            <div key={user.id} className="card list-card">
              <div className="avatar avatar-md">
                {user.avatar
                  ? <img src={user.avatar} alt={user.name} style={{ width: '100%', borderRadius: '50%' }} />
                  : initials(user.name)}
              </div>
              <div className="list-card-content">
                <span className="list-card-title">{user.name}</span>
                <span className="list-card-subtitle">{user.email}</span>
              </div>
              <div className="list-card-meta" style={{ gap: 6 }}>
                <span className={`status-badge ${ROLE_BADGE_CLASS[user.role] || ''}`}>
                  {ROLE_ICON[user.role]} {user.role}
                </span>
              </div>
            </div>
          ))}
          {!loading && filteredUsers.length === 0 && (
            <p className="empty-state-hint">
              {search ? 'No users match.' : 'No users yet.'}
            </p>
          )}
        </div>
      )}

      {!isDesktop && (
        <button className="fab fab-br" onClick={() => navigate('/admin/users/new')}>
          <Plus size={24} />
        </button>
      )}
    </div>
  )
}
