import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { settingsService } from '../services/settings'
import { useSettings } from '../hooks/useSettings'

function SkeletonField() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-slate-200/70 rounded-md w-1/4" />
      <div className="h-10 bg-slate-200/50 rounded-xl" />
    </div>
  )
}

const getFields = (symbol = 'LKR') => [
  { key: 'store_name', label: 'Store Name', type: 'text', placeholder: 'My POS Store' },
  { key: 'store_address', label: 'Store Address', type: 'text', placeholder: '123 Main St, Colombo' },
  { key: 'store_phone', label: 'Store Phone', type: 'text', placeholder: '0XX-XXX-XXXX' },
  { key: 'currency_symbol', label: 'Currency Symbol', type: 'text', placeholder: symbol || 'LKR' },
  { key: 'tax_rate', label: 'Tax Rate (%)', type: 'number', placeholder: '0', min: 0, max: 100, step: 'any' },
  {
    key: 'loyalty_points_rate',
    label: `Loyalty Points Rate (${symbol || 'LKR'} per 1 point)`,
    type: 'number',
    placeholder: '10',
    min: 1,
    step: 'any',
  },
  { key: 'receipt_footer', label: 'Receipt Footer Message', type: 'text', placeholder: 'Thank you for your business!' },
]

export default function SettingsPage() {
  const { updateSettings } = useSettings()
  const [settings, setSettings] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    settingsService
      .get()
      .then((res) => {
        const data = res.data?.data || {}
        setSettings(data)
        if (updateSettings) updateSettings(data)
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setIsLoading(false))
  }, [updateSettings])

  function validate() {
    const errs = {}
    const taxRate = parseFloat(settings.tax_rate)
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      errs.tax_rate = 'Tax rate must be between 0 and 100'
    }
    const loyaltyRate = parseFloat(settings.loyalty_points_rate)
    if (isNaN(loyaltyRate) || loyaltyRate < 1) {
      errs.loyalty_points_rate = 'Loyalty points rate must be at least 1'
    }
    if (!settings.store_name?.trim()) {
      errs.store_name = 'Store name is required'
    }
    if (!settings.currency_symbol?.trim()) {
      errs.currency_symbol = 'Currency symbol is required'
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setIsSaving(true)
    try {
      const res = await settingsService.update(settings)
      const updated = res.data?.data || settings
      setSettings(updated)
      if (updateSettings) updateSettings(updated)
      toast.success('Settings saved successfully')
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  function handleChange(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const fields = getFields(settings.currency_symbol)

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="text-xs font-medium text-slate-500 mt-1">Configure store information, tax, and currency settings.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 sm:p-8 space-y-5">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonField key={i} />)
              : fields.map(({ key, label, type, placeholder, min, max, step }) => (
                  <Input
                    key={key}
                    label={label}
                    type={type}
                    min={min}
                    max={max}
                    step={step}
                    placeholder={placeholder}
                    value={settings[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    error={errors[key]}
                  />
                ))}

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Button type="submit" variant="primary" isLoading={isSaving} disabled={isLoading}>
                Save Settings
              </Button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
