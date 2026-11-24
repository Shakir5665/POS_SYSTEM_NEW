import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { usersService } from '../services/users'
import { useAuth } from '../hooks/useAuth'

const ROLE_BADGE = {
  ADMIN: 'danger',
  MANAGER: 'warning',
  CASHIER: 'success',
}

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER']

const EMPTY_CREATE = { username: '', email: '', password: '', full_name: '', role: 'CASHIER' }
const EMPTY_EDIT = { full_name: '', email: '', role: 'CASHIER', is_active: true }

function validate(form, mode) {
  const errors = {}
  if (!form.full_name?.trim()) errors.full_name = 'Full name is required'
  if (!form.email?.trim()) errors.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Invalid email address'
  if (mode === 'create') {
    if (!form.username?.trim()) errors.username = 'Username is required'
    if (!form.password?.trim()) errors.password = 'Password is required'
    else if (form.password.length < 6) errors.password = 'Password must be at least 6 characters'
  }
  return errors
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'ADMIN'

  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [editTarget, setEditTarget] = useState(null)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')

  const [createErrors, setCreateErrors] = useState({})
  const [editErrors, setEditErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [unlocking, setUnlocking] = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await usersService.list({ page, per_page: 20 })
      setUsers(res.data?.data ?? res.data ?? [])
      setMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  function openCreate() {
    setCreateForm(EMPTY_CREATE)
    setCreateErrors({})
    setCreateOpen(true)
  }

  function handleCreateChange(e) {
    const { name, value } = e.target
    setCreateForm((f) => ({ ...f, [name]: value }))
    if (createErrors[name])
      setCreateErrors((e) => {
        const n = { ...e }
        delete n[name]
        return n
      })
  }

  async function handleCreateSubmit(e) {
    e.preventDefault()
    const errs = validate(createForm, 'create')
    if (Object.keys(errs).length) {
      setCreateErrors(errs)
      return
    }
    setSaving(true)
    try {
      await usersService.create({
        username: createForm.username.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        full_name: createForm.full_name.trim(),
        role: createForm.role,
      })
      toast.success('User created successfully')
      setCreateOpen(false)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(user) {
    setEditTarget(user)
    setEditForm({
      full_name: user.full_name ?? '',
      email: user.email ?? '',
      role: user.role ?? 'CASHIER',
      is_active: user.is_active ?? true,
    })
    setEditErrors({})
    setEditOpen(true)
  }

  function handleEditChange(e) {
    const { name, value, type, checked } = e.target
    setEditForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
    if (editErrors[name])
      setEditErrors((e) => {
        const n = { ...e }
        delete n[name]
        return n
      })
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    const errs = validate(editForm, 'edit')
    if (Object.keys(errs).length) {
      setEditErrors(errs)
      return
    }
    setSaving(true)
    try {
      await usersService.update(editTarget.id, {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        is_active: editForm.is_active,
      })
      toast.success('User updated successfully')
      setEditOpen(false)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  function openReset(user) {
    setEditTarget(user)
    setNewPassword('')
    setNewPasswordError('')
    setResetOpen(true)
  }

  async function handleResetSubmit(e) {
    e.preventDefault()
    if (!newPassword.trim()) {
      setNewPasswordError('New password is required')
      return
    }
    if (newPassword.length < 6) {
      setNewPasswordError('Password must be at least 6 characters')
      return
    }
    setSaving(true)
    try {
      await usersService.resetPassword(editTarget.id, newPassword)
      toast.success(`Password reset for ${editTarget.full_name}`)
      setResetOpen(false)
    } catch (err) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to reset password')
    } finally {
      setSaving(false)
    }
  }

  async function handleUnlock(user) {
    setUnlocking(user.id)
    try {
      await usersService.unlock(user.id)
      toast.success(`Account unlocked for ${user.full_name}`)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to unlock user')
    } finally {
      setUnlocking(null)
    }
  }

  async function handleDeleteConfirm() {
    setDeleting(true)
    try {
      await usersService.delete(deleteTarget.id)
      toast.success(`User ${deleteTarget.full_name} deleted`)
      setDeleteTarget(null)
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    {
      key: 'full_name',
      label: 'Staff Member',
      render: (val, row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-2xs">
            {val?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-slate-900">{val}</p>
            <p className="text-[11px] text-slate-400 font-mono">@{row.username}</p>
          </div>
        </div>
      ),
    },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Role',
      render: (v) => <Badge variant={ROLE_BADGE[v] || 'default'}>{v}</Badge>,
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (val, row) => {
        const isLocked = row.locked_until && new Date(row.locked_until) > new Date()
        if (isLocked) return <Badge variant="danger">Locked</Badge>
        return <Badge variant={val ? 'success' : 'default'}>{val ? 'Active' : 'Inactive'}</Badge>
      },
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (v) => (v ? new Date(v).toLocaleDateString() : '—'),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => {
        const isSelf = row.id === currentUser?.id
        const isLocked = row.locked_until && new Date(row.locked_until) > new Date()
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isLocked && isAdmin && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleUnlock(row)}
                isLoading={unlocking === row.id}
                className="text-amber-600 hover:text-amber-700"
              >
                Unlock
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
              Edit
            </Button>
            {isAdmin && (
              <Button size="sm" variant="ghost" onClick={() => openReset(row)}>
                Reset PW
              </Button>
            )}
            {isAdmin && !isSelf && (
              <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => setDeleteTarget(row)}>
                Delete
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Management</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">Configure user accounts, roles, access levels, and security settings.</p>
          </div>
          {isAdmin && (
            <Button variant="primary" onClick={openCreate} className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Staff Member
            </Button>
          )}
        </div>

        {/* Table */}
        <Table columns={columns} data={users} isLoading={loading} emptyMessage="No users found." />

        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-medium text-slate-500">
              Page {page} of {meta.total_pages}
            </p>
            <Pagination page={page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add New User">
        <form onSubmit={handleCreateSubmit} noValidate className="space-y-4">
          <Input
            label="Full Name *"
            name="full_name"
            value={createForm.full_name}
            onChange={handleCreateChange}
            placeholder="e.g. Alice Smith"
            error={createErrors.full_name}
            autoFocus
          />
          <Input
            label="Username *"
            name="username"
            value={createForm.username}
            onChange={handleCreateChange}
            placeholder="e.g. asmith"
            error={createErrors.username}
          />
          <Input
            label="Email *"
            name="email"
            type="email"
            value={createForm.email}
            onChange={handleCreateChange}
            placeholder="e.g. alice@example.com"
            error={createErrors.email}
          />
          <Input
            label="Password *"
            name="password"
            type="password"
            value={createForm.password}
            onChange={handleCreateChange}
            placeholder="Min 6 characters"
            error={createErrors.password}
          />
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Role *</label>
            <select
              name="role"
              value={createForm.role}
              onChange={handleCreateChange}
              className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving}>
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={`Edit Staff: ${editTarget?.full_name}`}>
        <form onSubmit={handleEditSubmit} noValidate className="space-y-4">
          <Input
            label="Full Name *"
            name="full_name"
            value={editForm.full_name}
            onChange={handleEditChange}
            error={editErrors.full_name}
            autoFocus
          />
          <Input
            label="Email *"
            name="email"
            type="email"
            value={editForm.email}
            onChange={handleEditChange}
            error={editErrors.email}
          />
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Role *</label>
            <select
              name="role"
              value={editForm.role}
              onChange={handleEditChange}
              className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 pt-1">
            <input
              type="checkbox"
              name="is_active"
              checked={editForm.is_active}
              onChange={handleEditChange}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
            />
            Account Active
          </label>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} title={`Reset Password: ${editTarget?.full_name}`} size="sm">
        <form onSubmit={handleResetSubmit} noValidate className="space-y-4">
          <Input
            label="New Password *"
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              setNewPasswordError('')
            }}
            placeholder="Min 6 characters"
            error={newPasswordError}
            autoFocus
          />
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" type="button" onClick={() => setResetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving}>
              Reset Password
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete User Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <span className="font-bold text-slate-900">{deleteTarget?.full_name}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} isLoading={deleting}>
              Delete User
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
