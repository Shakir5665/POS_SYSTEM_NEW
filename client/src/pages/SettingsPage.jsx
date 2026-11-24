import { useState, useEffect, useRef } from 'react'
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
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState('')
  const [errors, setErrors] = useState({})
  const fileInputRef = useRef(null)

  useEffect(() => {
    settingsService
      .get()
      .then((res) => {
        const data = res.data?.data || {}
        setSettings(data)
        if (data.logo_url) {
          setLogoPreview(data.logo_url)
        }
        if (updateSettings) updateSettings(data)
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setIsLoading(false))
  }, [updateSettings])

  async function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // Enforce 10MB limit
    const MAX_SIZE_MB = 10
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image exceeds maximum size of ${MAX_SIZE_MB}MB. Please select a smaller image.`)
      e.target.value = ''
      return
    }

    // Client preview
    const previewUrl = URL.createObjectURL(file)
    setLogoPreview(previewUrl)

    const formData = new FormData()
    formData.append('logo', file)

    setIsUploadingLogo(true)
    const toastId = toast.loading('Uploading store logo...')
    try {
      const res = await settingsService.uploadLogo(formData)
      const newLogoUrl = res.data?.data?.logo_url
      if (newLogoUrl) {
        setLogoPreview(newLogoUrl)
        setSettings((prev) => ({ ...prev, logo_url: newLogoUrl }))
        if (updateSettings) updateSettings({ logo_url: newLogoUrl })
        toast.success('Store logo updated successfully!', { id: toastId })
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to upload logo', { id: toastId })
      // Revert preview on failure
      setLogoPreview(settings.logo_url || '')
    } finally {
      setIsUploadingLogo(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function handleRemoveLogo() {
    setLogoPreview('')
    setSettings((prev) => ({ ...prev, logo_url: '' }))
    if (updateSettings) updateSettings({ logo_url: '' })
  }

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
          <p className="text-xs font-medium text-slate-500 mt-1">Configure store information, branding, tax, and currency settings.</p>
        </div>

        {/* Store Branding & Logo Card */}
        <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Store Logo & Branding</h2>
          
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/80">
              Max size 10 MB
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            {/* Logo Display Box */}
            <div className="w-48 h-20 rounded-2xl bg-slate-50/80 border border-slate-200/90 flex items-center justify-center p-3 shadow-inner relative overflow-hidden group flex-shrink-0">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Store Logo Preview"
                  className="max-h-full max-w-full object-contain drop-shadow-xs"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <img src="/logo.png" alt="Default NexTill" className="h-8 w-auto opacity-40 grayscale object-contain mb-1" />
                  <span className="text-[10px] font-medium text-slate-400">Default Logo</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-2 flex-1 w-full text-center sm:text-left">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                onChange={handleLogoSelect}
                className="hidden"
                id="store-logo-file-input"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={isUploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="shadow-2xs font-bold"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload New Logo
                </Button>

                {logoPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveLogo}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold"
                  >
                    Reset to Default
                  </Button>
                )}
              </div>
              <p className="text-sm text-slate-400">
                Supported formats: PNG, JPG, WebP, SVG
              </p>
            </div>
          </div>
        </div>

        {/* Store Settings Form */}
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
