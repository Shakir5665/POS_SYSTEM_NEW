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

function LockIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

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

  // Create
  function openCreate() {
    setCreateForm(EMPTY_CREATE)
    setCreateErrors({})
    setCreateOpen(true)
  }

  function handleCreateChange(e) {
    const { name, value } = e.target
    setCreateForm((f) => ({ ...f, [name]: value }))
    if (createErrors[name]) setCreateErrors((e) => { const n = { ...e }; delete n[name]; return n })
  }

  async function handleCreate(e) {
    e.preventDefault()
    const errs = validate(createForm, 'create')
    if (Object.keys(errs).length) { setCreateErrors(errs); return }
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
      const msg = err?.response?.data?.error?.message ?? 'Failed to create user'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Edit
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
    const val = type === 'checkbox' ? checked : value
    setEditForm((f) => ({ ...f, [name]: val }))
    if (editErrors[name]) setEditErrors((e) => { const n = { ...e }; delete n[name]; return n })
  }

  async function handleEdit(e) {
    e.preventDefault()
    const errs = validate(editForm, 'edit')
    if (Object.keys(errs).length) { setEditErrors(errs); return }
    setSaving(true)
    try {
      await usersService.update(editTarget.id, {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        is_active: editForm.is_active,
      })
      toast.success('User updated')
      setEditOpen(false)
      fetchUsers()
    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? 'Failed to update user'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Reset password
  function openReset(user) {
    setEditTarget(user)
    setNewPassword('')
    setNewPasswordError('')
    setResetOpen(true)
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!newPassword.trim()) { setNewPasswordError('Password is required'); return }
    if (newPassword.length < 6) { setNewPasswordError('Password must be at least 6 characters'); return }
    setSaving(true)
    try {
      await usersService.resetPassword(editTarget.id, { password: newPassword })
      toast.success('Password reset successfully')
      setResetOpen(false)
    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? 'Failed to reset password'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Unlock
  async function handleUnlock(user) {
    setUnlocking(user.id)
    try {
      await usersService.unlock(user.id)
      toast.success(`${user.full_name}'s account unlocked`)
      fetchUsers()
    } catch {
      toast.error('Failed to unlock account')
    } finally {
      setUnlocking(null)
    }
  }

  const columns = [
    {
      key: 'full_name',
      label: 'Name',
      render: (v, row) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {v?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900 flex items-center gap-1.5">
              {v}
              {row.is_locked && <LockIcon className="text-danger-500" />}
            </p>
            <p className="text-xs text-gray-400">@{row.username}</p>
          </div>
        </div>
      ),
    },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Role',
      render: (v) => <Badge variant={ROLE_BADGE[v] ?? 'default'}>{v}</Badge>,
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (v) => (
        <Badge variant={v ? 'success' : 'default'}>{v ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (v) =>
        v
          ? new Date(v).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openReset(row)}>
            Reset Pwd
          </Button>
          {row.is_locked && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => handleUnlock(row)}
              isLoading={unlocking === row.id}
            >
              Unlock
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-1">Manage system users and permissions</p>
          </div>
          <Button onClick={openCreate}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={columns} data={users} isLoading={loading} emptyMessage="No users found." />
        </div>

        {meta.total_pages > 1 && (
          <div className="flex justify-end">
            <Pagination page={meta.page ?? page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add New User">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Full Name *"
            name="full_name"
            value={createForm.full_name}
            onChange={handleCreateChange}
            error={createErrors.full_name}
            placeholder="e.g. Ama Owusu"
            autoFocus
          />
          <Input
            label="Username *"
            name="username"
            value={createForm.username}
            onChange={handleCreateChange}
            error={createErrors.username}
            placeholder="e.g. aowusu"
          />
          <Input
            label="Email *"
            name="email"
            type="email"
            value={createForm.email}
            onChange={handleCreateChange}
            error={createErrors.email}
            placeholder="e.g. ama@store.com"
          />
          <Input
            label="Password *"
            name="password"
            type="password"
            value={createForm.password}
            onChange={handleCreateChange}
            error={createErrors.password}
            placeholder="Min 6 characters"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Role</label>
            <select
              name="role"
              value={createForm.role}
              onChange={handleCreateChange}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit User">
        <form onSubmit={handleEdit} className="space-y-4">
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
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Role</label>
            <select
              name="role"
              value={editForm.role}
              onChange={handleEditChange}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              checked={editForm.is_active}
              onChange={handleEditChange}
              className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Account Active
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} title="Reset Password" size="sm">
        <form onSubmit={handleReset} className="space-y-4">
          {editTarget && (
            <p className="text-sm text-gray-600">
              Set a new password for <strong>{editTarget.full_name}</strong>.
            </p>
          )}
          <Input
            label="New Password *"
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              if (newPasswordError) setNewPasswordError('')
            }}
            error={newPasswordError}
            placeholder="Min 6 characters"
            autoFocus
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              Reset Password
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  )
}
