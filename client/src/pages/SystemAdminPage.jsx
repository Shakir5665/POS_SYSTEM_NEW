import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { systemAdminService } from '../services/systemAdmin'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { PageHeader } from '../components/PageHeader'
import { GlassCard } from '../components/GlassCard'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'

export default function SystemAdminPage() {
  const { user, updateSession } = useAuth()
  const [status, setStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [savingAccess, setSavingAccess] = useState(false)
  const [confirmAccess, setConfirmAccess] = useState(null)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountForm, setAccountForm] = useState({
    username: user?.username || '',
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const response = await systemAdminService.getStatus()
      setStatus(response.data.data)
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Unable to load system status')
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function handleAccessChange() {
    if (confirmAccess === null) return
    setSavingAccess(true)
    try {
      const response = await systemAdminService.setAccessEnabled(confirmAccess)
      setStatus((current) => ({ ...current, ...response.data.data }))
      toast.success(confirmAccess ? 'System access restored' : 'System access paused')
      setConfirmAccess(null)
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Unable to update system access')
    } finally {
      setSavingAccess(false)
    }
  }

  function handleAccountChange(event) {
    const { name, value } = event.target
    setAccountForm((current) => ({ ...current, [name]: value }))
  }

  async function handleAccountSubmit(event) {
    event.preventDefault()
    const nextUsername = accountForm.username.trim()
    const usernameChanged = nextUsername !== user?.username
    const passwordChanged = Boolean(accountForm.new_password)

    if (!accountForm.current_password) {
      toast.error('Enter your current password')
      return
    }
    if (!usernameChanged && !passwordChanged) {
      toast.error('Enter a new username or password')
      return
    }
    if (usernameChanged && nextUsername.length < 3) {
      toast.error('Username must be at least 3 characters')
      return
    }
    if (passwordChanged && accountForm.new_password.length < 12) {
      toast.error('New password must be at least 12 characters')
      return
    }
    if (passwordChanged && accountForm.new_password !== accountForm.confirm_password) {
      toast.error('New passwords do not match')
      return
    }

    const payload = { current_password: accountForm.current_password }
    if (usernameChanged) payload.username = nextUsername
    if (passwordChanged) payload.password = accountForm.new_password

    setAccountSaving(true)
    try {
      const response = await systemAdminService.updateAccount(payload)
      const { accessToken, user: updatedUser } = response.data.data
      updateSession(updatedUser, accessToken)
      setAccountForm({
        username: updatedUser.username,
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
      toast.success('Account updated. Other signed-in sessions were ended.')
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Unable to update account')
    } finally {
      setAccountSaving(false)
    }
  }

  const enabled = status?.access_enabled
  const updatedAt = status?.updated_at ? new Date(status.updated_at).toLocaleString() : null

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="System control" subtitle="Manage system access and the owner account." />

        <GlassCard hover={false}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-900">System access</h2>
                {!statusLoading && status && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                    {enabled ? 'Enabled' : 'Paused'}
                  </span>
                )}
              </div>
              <p className="max-w-2xl text-sm text-slate-500">
                {enabled === false
                  ? 'Staff sign-in and POS requests are blocked until access is restored.'
                  : 'Pause access to stop staff sign-in and POS requests. You can restore it here.'}
              </p>
              {updatedAt && (
                <p className="text-xs text-slate-400">
                  Last changed {updatedAt}{status.updated_by?.full_name ? ` by ${status.updated_by.full_name}` : ''}
                </p>
              )}
            </div>
            <Button
              variant={enabled === false ? 'success' : 'danger'}
              disabled={statusLoading || !status || savingAccess}
              isLoading={savingAccess}
              onClick={() => setConfirmAccess(!enabled)}
              className="shrink-0"
            >
              {enabled === false ? 'Restore access' : 'Pause access'}
            </Button>
          </div>
        </GlassCard>

        <GlassCard hover={false}>
          <div className="mb-5">
            <h2 className="text-base font-bold text-slate-900">Owner account</h2>
            <p className="mt-1 text-sm text-slate-500">Change your username or password. Your current password is required.</p>
          </div>
          <form onSubmit={handleAccountSubmit} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Username"
              name="username"
              value={accountForm.username}
              onChange={handleAccountChange}
              autoComplete="username"
              minLength={3}
              maxLength={50}
            />
            <Input
              label="Current password"
              name="current_password"
              type="password"
              value={accountForm.current_password}
              onChange={handleAccountChange}
              autoComplete="current-password"
            />
            <Input
              label="New password"
              name="new_password"
              type="password"
              value={accountForm.new_password}
              onChange={handleAccountChange}
              autoComplete="new-password"
              minLength={12}
              placeholder="Leave blank to keep the current password"
            />
            <Input
              label="Confirm new password"
              name="confirm_password"
              type="password"
              value={accountForm.confirm_password}
              onChange={handleAccountChange}
              autoComplete="new-password"
              minLength={12}
              disabled={!accountForm.new_password}
            />
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={accountSaving}>Save account changes</Button>
            </div>
          </form>
        </GlassCard>
      </div>

      <Modal
        isOpen={confirmAccess !== null}
        onClose={() => !savingAccess && setConfirmAccess(null)}
        title={confirmAccess ? 'Restore system access?' : 'Pause system access?'}
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-600">
            {confirmAccess
              ? 'Staff will be able to sign in and use the POS again.'
              : 'Staff will not be able to sign in or use the POS until access is restored.'}
          </p>
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" type="button" onClick={() => setConfirmAccess(null)} disabled={savingAccess}>Cancel</Button>
            <Button variant={confirmAccess ? 'success' : 'danger'} type="button" onClick={handleAccessChange} isLoading={savingAccess}>
              {confirmAccess ? 'Restore access' : 'Pause access'}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
