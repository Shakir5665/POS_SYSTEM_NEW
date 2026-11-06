import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { settingsService } from '../services/settings'

function SkeletonField() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-2" />
      <div className="h-10 bg-gray-200 rounded" />
    </div>
  )
}

const FIELDS = [
  { key: 'store_name', label: 'Store Name', type: 'text', placeholder: 'My POS Store' },
  { key: 'store_address', label: 'Store Address', type: 'text', placeholder: '123 Main St, Accra, Ghana' },
  { key: 'store_phone', label: 'Store Phone', type: 'text', placeholder: '0XX-XXX-XXXX' },
  { key: 'currency_symbol', label: 'Currency Symbol', type: 'text', placeholder: 'GH₵' },
  { key: 'tax_rate', label: 'Tax Rate (%)', type: 'number', placeholder: '0', min: 0, max: 100, step: 0.01 },
  { key: 'loyalty_points_rate', label: 'Loyalty Points Rate (GHS per 1 point)', type: 'number', placeholder: '10', min: 1, step: 1 },
  { key: 'receipt_footer', label: 'Receipt Footer Message', type: 'text', placeholder: 'Thank you for your business!' },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    settingsService.get()
      .then((res) => setSettings(res.data?.data || {}))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setIsLoading(false))
  }, [])

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
      setSettings(res.data?.data || settings)
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

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure store information, tax, and loyalty rates.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-semibold text-gray-800 border-b pb-3">Store Information</h2>

            {isLoading ? (
              FIELDS.map((f) => <SkeletonField key={f.key} />)
            ) : (
              FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                  </label>
                  <Input
                    type={field.type}
                    value={settings[field.key] ?? ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    error={errors[field.key]}
                  />
                  {errors[field.key] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.key]}</p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit" variant="primary" isLoading={isSaving} disabled={isLoading || isSaving}>
              Save Settings
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
