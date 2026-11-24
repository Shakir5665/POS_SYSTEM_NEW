import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useCart } from '../hooks/useCart'
import { productsService } from '../services/products'
import { salesService } from '../services/sales'
import { customersService } from '../services/customers'
import { warehouseService } from '../services/warehouses'
import { formatCurrency } from '../utils/formatCurrency'
import { toPesewas, fromPesewas, lineTotalPesewas } from '../utils/money'
import { formatQuantityWithUnit, getAvailableStockForItem, getUnitFactor } from '../utils/uom'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import { Receipt } from '../components/Receipt'
import { LogoutModal } from '../components/LogoutModal'
import { broadcastRealtimeEvent } from '../utils/realtime'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { usePOSKeyboard } from '../hooks/usePOSKeyboard'

// ─── Payment Modal (Cash, Credit & Partial Payments) ──────────────────────────
function PaymentModal({ isOpen, onClose, total, customer, onConfirm, onOpenQuickCustomer, isLoading }) {
  const { currency_symbol: currencySymbol = 'LKR' } = useSettings()
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountPaid, setAmountPaid] = useState('')
  const [deposit, setDeposit] = useState('0')
  const [errors, setErrors] = useState({})
  const amountPaidInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        amountPaidInputRef.current?.focus()
        amountPaidInputRef.current?.select?.()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const cashVal = parseFloat(amountPaid) || 0
  const paidEnough = amountPaid !== '' && toPesewas(amountPaid) >= toPesewas(total)
  const isPartial = customer && amountPaid !== '' && toPesewas(amountPaid) > 0 && toPesewas(amountPaid) < toPesewas(total)
  const change = paidEnough ? fromPesewas(toPesewas(amountPaid) - toPesewas(total)) : 0
  const balanceDue = isPartial ? fromPesewas(toPesewas(total) - toPesewas(amountPaid)) : 0

  const depositVal = parseFloat(deposit) || 0
  const creditBalanceDue = Math.max(0, fromPesewas(toPesewas(total) - toPesewas(depositVal)))

  const handleConfirm = useCallback(() => {
    if (paymentMethod === 'CASH') {
      if (!customer && (!amountPaid || !paidEnough)) {
        setErrors({ amountPaid: `Amount must be at least ${formatCurrency(total)}. Select a customer for partial or credit payments.` })
        return
      }
      if (customer && amountPaid !== '' && cashVal < 0) {
        setErrors({ amountPaid: 'Amount paid cannot be negative' })
        return
      }
      onConfirm({
        payment_method: 'CASH',
        amount_paid: amountPaid === '' ? total : cashVal,
      })
    } else if (paymentMethod === 'CREDIT') {
      if (!customer) {
        setErrors({ general: 'A registered customer is required for credit sales.' })
        return
      }
      if (depositVal < 0) {
        setErrors({ deposit: 'Deposit cannot be negative' })
        return
      }
      if (depositVal > total) {
        setErrors({ deposit: `Deposit cannot exceed total amount (${formatCurrency(total)})` })
        return
      }
      onConfirm({
        payment_method: 'CREDIT',
        amount_paid: depositVal,
      })
    }
  }, [paymentMethod, customer, amountPaid, paidEnough, total, cashVal, onConfirm, depositVal])

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleConfirm])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Payment" size="md">
      <div className="space-y-4">
        {/* Total Due & Customer Badge */}
        <div className="bg-gradient-to-br from-primary-50/90 via-indigo-50/50 to-primary-50/40 border border-primary-200/80 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-3xs text-primary-700 font-bold uppercase tracking-wider">Amount Due</p>
            <p className="text-3xl font-extrabold text-primary-950 tracking-tight mt-0.5">{formatCurrency(total)}</p>
          </div>
          <div className="text-right">
            {customer ? (
              <div className="bg-white/90 backdrop-blur-sm border border-primary-200/80 rounded-xl px-3 py-1.5 shadow-2xs">
                <p className="text-xs font-bold text-slate-900">{customer.name}</p>
                <p className="text-3xs text-emerald-700 font-bold tracking-wide uppercase">Registered Customer</p>
              </div>
            ) : (
              <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-3 py-1.5">
                <p className="text-xs font-semibold text-slate-700">Walk-in Customer</p>
                <p className="text-3xs text-slate-400 font-medium">Credit disabled</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method Tabs */}
        <div className="flex border-b border-slate-200/80">
          <button
            type="button"
            onClick={() => { setPaymentMethod('CASH'); setErrors({}) }}
            className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition ${
              paymentMethod === 'CASH'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cash / Partial Payment
          </button>
          <button
            type="button"
            onClick={() => { setPaymentMethod('CREDIT'); setErrors({}) }}
            className={`flex-1 py-2.5 text-sm font-bold border-b-2 transition ${
              paymentMethod === 'CREDIT'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Customer Credit Sale
          </button>
        </div>

        {errors.general && (
          <div className="bg-danger-50/90 border border-danger-200/80 text-danger-700 rounded-xl p-3 text-xs font-medium">
            {errors.general}
          </div>
        )}

        {/* CASH / PARTIAL PAYMENT TAB */}
        {paymentMethod === 'CASH' && (
          <div className="space-y-3">
            <Input
              ref={amountPaidInputRef}
              id="amount-paid-input"
              data-testid="amount-paid-input"
              label={`Cash Received (${currencySymbol})`}
              type="number"
              step="any"
              autoFocus
              value={amountPaid}
              onChange={(e) => { setAmountPaid(e.target.value); setErrors({}) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirm()
                }
              }}
              placeholder={Number(total || 0).toFixed(2)}
              error={errors.amountPaid}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAmountPaid(String(total)); setErrors({}) }}
                className="px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50/80 hover:bg-primary-100 rounded-xl border border-primary-200/80 transition shadow-2xs"
              >
                Exact Amount ({formatCurrency(total)})
              </button>
            </div>

            {/* Change banner */}
            {paidEnough && (
              <div className="flex justify-between items-center bg-emerald-50/80 border border-emerald-200/80 rounded-xl px-3.5 py-2.5 shadow-2xs">
                <span className="text-sm text-emerald-800 font-semibold">Change Returned</span>
                <span className="font-extrabold text-emerald-700 text-xl tracking-tight">{formatCurrency(change)}</span>
              </div>
            )}

            {/* Partial payment banner */}
            {isPartial && (
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-sm space-y-1 shadow-2xs">
                <div className="flex justify-between text-amber-900 font-semibold">
                  <span>Partial Payment:</span>
                  <span>{formatCurrency(cashVal)}</span>
                </div>
                <div className="flex justify-between text-danger-700 font-bold border-t border-amber-200/60 pt-1">
                  <span>Balance Due (added to {customer.name}):</span>
                  <span>{formatCurrency(balanceDue)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CREDIT SALE TAB */}
        {paymentMethod === 'CREDIT' && (
          <div className="space-y-3">
            {!customer ? (
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 text-center space-y-2 shadow-2xs">
                <p className="text-sm font-bold text-amber-900">
                  Registered Customer Required
                </p>
                <p className="text-xs text-slate-600">
                  Credit sales cannot be issued to walk-in customers. Please select or quick-register a customer first.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onClose()
                    onOpenQuickCustomer?.()
                  }}
                >
                  Quick Register Customer
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 shadow-2xs">
                  <p className="text-3xs uppercase tracking-wider font-bold text-slate-500">Customer Account</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{customer.name}</p>
                  <p className="text-xs text-slate-500">{customer.phone || customer.email || 'No phone recorded'}</p>
                </div>

                <Input
                  label={`Initial Deposit / Down Payment (${currencySymbol})`}
                  type="number"
                  step="any"
                  value={deposit}
                  onChange={(e) => { setDeposit(e.target.value); setErrors({}) }}
                  placeholder="0.00"
                  error={errors.deposit}
                />

                <div className="bg-danger-50/80 border border-danger-200/80 rounded-xl p-3 shadow-2xs">
                  <div className="flex justify-between text-sm font-bold text-danger-800">
                    <span>Outstanding Debt to Record:</span>
                    <span>{formatCurrency(creditBalanceDue)}</span>
                  </div>
                  <p className="text-3xs text-danger-600 mt-1 font-medium">
                    This amount will be added to {customer.name}&apos;s ledger balance.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant={paymentMethod === 'CREDIT' ? 'warning' : 'success'}
            className="flex-1"
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={paymentMethod === 'CREDIT' && !customer}
          >
            {paymentMethod === 'CREDIT' ? 'Confirm Credit Sale' : 'Confirm Payment'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Quick Customer Registration Modal ──────────────────────────────────────────
function QuickCustomerModal({ isOpen, onClose, onCustomerCreated }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    if (!name.trim()) {
      setError('Customer name is required')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const res = await customersService.create({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      })
      const newCust = res.data?.data || res.data
      toast.success(`Customer "${newCust.name}" registered successfully!`)
      onCustomerCreated(newCust)
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to register customer'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick Customer Registration" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-danger-50/90 border border-danger-200/80 text-danger-700 rounded-xl p-3 text-xs font-medium">
            {error}
          </div>
        )}
        <Input
          label="Customer Full Name *"
          value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
          placeholder="e.g. Ama Osei"
          autoFocus
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0244123456"
          />
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. ama@example.com"
          />
        </div>
        <Input
          label="Address / Location"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. Colombo Central Market"
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isLoading}>
            Register & Select
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Customer Search Modal ─────────────────────────────────────────────────────
export function InlineCustomerSelector({ customer, customersList = [], onSelect, onOpenQuickCustomer }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [extraCustomers, setExtraCustomers] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const localCustomers = useMemo(() => {
    const map = new Map()
    for (const c of customersList || []) {
      if (c && c.id) map.set(c.id, c)
    }
    for (const c of extraCustomers) {
      if (c && c.id) map.set(c.id, c)
    }
    return Array.from(map.values())
  }, [customersList, extraCustomers])

  // Fallback initial fetch if parent hasn't loaded customers yet
  useEffect(() => {
    if (customersList && customersList.length > 0) return
    let cancelled = false
    customersService.list({ per_page: 100 })
      .then((res) => {
        if (!cancelled && res.data?.data) {
          setExtraCustomers(res.data.data)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [customersList])

  // Background search to discover uncached customers in database without blocking UI
  useEffect(() => {
    if (!isOpen || !query.trim()) return
    const timeout = setTimeout(async () => {
      try {
        const res = await customersService.list({ search: query.trim(), per_page: 30 })
        const serverResults = res.data?.data || []
        if (serverResults.length > 0) {
          setExtraCustomers((prev) => {
            const map = new Map(prev.map((c) => [c.id, c]))
            serverResults.forEach((c) => map.set(c.id, c))
            return Array.from(map.values())
          })
        }
      } catch {
        // ignore
      }
    }, 350)
    return () => clearTimeout(timeout)
  }, [isOpen, query])

  // Instant in-memory relevance ranking
  const sortedResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return localCustomers.slice(0, 10)

    const scored = []
    for (const c of localCustomers) {
      const name = (c.name || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const email = (c.email || '').toLowerCase()

      let score = 0
      if (name === q || phone === q) {
        score = 100 // exact match
      } else if (name.startsWith(q) || phone.startsWith(q)) {
        score = 80 // prefix match
      } else if (name.includes(q) || phone.includes(q)) {
        score = 50 // substring match
      } else if (email.includes(q)) {
        score = 30 // email match
      }

      if (score > 0) {
        scored.push({ customer: c, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 10).map((s) => s.customer)
  }, [localCustomers, query])

  const totalDropdownItems = 1 + sortedResults.length
  const safeSelectedIndex = sortedResults.length === 0 ? 0 : Math.min(Math.max(0, selectedIndex), totalDropdownItems - 1)

  // Auto-scroll highlighted dropdown item into view
  useEffect(() => {
    if (isOpen) {
      const el = document.getElementById(`customer-search-item-${safeSelectedIndex}`)
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [safeSelectedIndex, isOpen])

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative flex-1">
      {customer && !isOpen ? (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl border border-primary-200/90 bg-primary-50/80 backdrop-blur-sm hover:bg-primary-50 transition shadow-2xs">
          <div
            onClick={() => {
              setIsOpen(true)
              setTimeout(() => inputRef.current?.focus(), 50)
            }}
            className="flex-1 min-w-0 cursor-pointer flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-primary-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <div className="truncate">
              <span className="text-xs font-bold text-slate-900">{customer.name}</span>
              {(customer.phone || customer.email) && (
                <span className="text-3xs text-slate-500 ml-1.5 font-medium">
                  ({customer.phone || customer.email})
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(null)
            }}
            className="p-1 text-slate-400 hover:text-danger-600 rounded-lg hover:bg-danger-50 transition"
            title="Remove customer (Walk-in)"
            aria-label="Remove customer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            data-testid="customer-search-inline-input"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              const val = e.target.value
              setQuery(val)
              setIsOpen(true)
              setSelectedIndex(val.trim() ? 1 : 0)
            }}
            onKeyDown={(e) => {
              if (!isOpen) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  setIsOpen(true)
                  return
                }
                return
              }

              const totalItems = 1 + sortedResults.length

              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex((prev) => (prev + 1) % totalItems)
                return
              }

              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems)
                return
              }

              if (e.key === 'Escape') {
                e.preventDefault()
                setIsOpen(false)
                return
              }

              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                if (safeSelectedIndex === 0) {
                  onSelect(null)
                  setIsOpen(false)
                  setQuery('')
                } else {
                  const selectedCust = sortedResults[safeSelectedIndex - 1]
                  if (selectedCust) {
                    onSelect(selectedCust)
                    setIsOpen(false)
                    setQuery('')
                  }
                }
                return
              }
            }}
            placeholder="Search customer by name or phone (F5)..."
            className="w-full pl-8 pr-8 py-1.5 text-xs font-medium rounded-xl border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white/90 shadow-2xs transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSelectedIndex(0)
              }}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div
          data-testid="customer-search-dropdown"
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-white/95 backdrop-blur-xl rounded-2xl shadow-glass-xl border border-white/90 divide-y divide-slate-100 max-h-72 overflow-y-auto"
        >
          {/* Walk-in option */}
          <div
            id="customer-search-item-0"
            data-testid="customer-search-item-walk-in"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setSelectedIndex(0)}
            onClick={() => {
              onSelect(null)
              setIsOpen(false)
              setQuery('')
            }}
            className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between transition select-none ${
              safeSelectedIndex === 0
                ? 'bg-primary-50/90 text-primary-950 font-bold border-l-4 border-primary-600 pl-[10px]'
                : 'text-slate-700 hover:bg-slate-50/80'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <span className="text-xs font-bold">Walk-in Customer (None)</span>
                <p className="text-3xs text-slate-400 font-medium">Cash / Immediate payment only</p>
              </div>
            </div>
            <span className="text-3xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">Default</span>
          </div>

          {/* Customer results */}
          {sortedResults.length === 0 && query.trim() ? (
            <div className="py-4 text-center px-3">
              <p className="text-xs text-slate-500 font-medium">No customers found for &quot;{query}&quot;.</p>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  onOpenQuickCustomer?.()
                }}
                className="mt-1.5 text-xs text-primary-600 hover:text-primary-800 font-bold"
              >
                + Quick Register Customer
              </button>
            </div>
          ) : (
            sortedResults.map((c, idx) => {
              const itemIndex = idx + 1
              const isSelected = safeSelectedIndex === itemIndex
              const isCurrentCustomer = customer?.id === c.id

              return (
                <div
                  key={c.id}
                  id={`customer-search-item-${itemIndex}`}
                  data-testid={`customer-search-item-${c.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelectedIndex(itemIndex)}
                  onClick={() => {
                    onSelect(c)
                    setIsOpen(false)
                    setQuery('')
                  }}
                  className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between transition select-none ${
                    isSelected
                      ? 'bg-primary-50/90 text-primary-950 font-bold border-l-4 border-primary-600 pl-[10px]'
                      : isCurrentCustomer
                      ? 'bg-primary-50/40 text-primary-900'
                      : 'hover:bg-slate-50/80 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                      {(c.name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-slate-900 truncate">{c.name}</p>
                      <p className="text-3xs text-slate-400 truncate mt-0.5 font-medium">
                        {c.phone || c.email || 'No contact info'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {Number(c.outstanding_debt || 0) > 0 ? (
                      <span className="inline-block text-3xs px-2 py-0.5 rounded-full font-bold bg-danger-50 text-danger-700 border border-danger-200">
                        Debt: {c.outstanding_debt}
                      </span>
                    ) : (
                      <span className="text-3xs text-emerald-700 font-bold">Clean balance</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cart Item Row ─────────────────────────────────────────────────────────────
export function CartItem({
  item,
  index = 0,
  allCartItems = [],
  productData = null,
  onUpdate,
  onRemove,
  onToggleDiscount,
  onToggleWholesale,
  onOurPriceChange,
  onUnitChange,
  isSelected,
  isLastAdded,
}) {
  const qtyInputRef = useRef(null)
  const ourPriceInputRef = useRef(null)
  const [stockError, setStockError] = useState('')
  const [isEditingOurPrice, setIsEditingOurPrice] = useState(false)
  const [ourPriceDraft, setOurPriceDraft] = useState(() =>
    String(item.our_price != null ? item.our_price : item.price ?? '')
  )
  const [prevPriceProp, setPrevPriceProp] = useState(
    item.our_price != null ? item.our_price : item.price
  )
  const currentPriceProp = item.our_price != null ? item.our_price : item.price
  if (prevPriceProp !== currentPriceProp) {
    setPrevPriceProp(currentPriceProp)
    if (!isEditingOurPrice) {
      setOurPriceDraft(currentPriceProp == null ? '' : String(currentPriceProp))
    }
  }

  const maxStock = getAvailableStockForItem(item, allCartItems, productData)
  const current = item.quantity === '' ? 0 : parseFloat(item.quantity)
  const currentVal = isNaN(current) ? 0 : current
  const isAtStockLimit = maxStock <= 0 || currentVal >= maxStock

  const usualPrice = Number(item.usual_price != null ? item.usual_price : item.price)
  const catalogOurPrice = Number(item.catalog_our_price != null ? item.catalog_our_price : (item.our_price != null ? item.our_price : item.price))
  const hasPredefinedDiscount = usualPrice > catalogOurPrice
  const isPredefinedApplied = item.apply_predefined_discount !== false
  const predefinedDiff = Math.max(0, usualPrice - catalogOurPrice)

  let pricingQty = currentVal
  if (item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME' || item.unit_category === 'LENGTH') {
    const factorSelling = getUnitFactor(item.unit_category, item.unit || item.pricing_unit)
    const factorPricing = getUnitFactor(item.unit_category, item.pricing_unit || item.unit)
    pricingQty = (currentVal * factorSelling) / factorPricing
  }
  const predefinedDiscountAmount = isPredefinedApplied && hasPredefinedDiscount
    ? Number((predefinedDiff * pricingQty).toFixed(2))
    : 0

  useEffect(() => {
    if (isLastAdded) {
      qtyInputRef.current?.focus()
      qtyInputRef.current?.select()
    }
  }, [isLastAdded])

  function handleDecrement() {
    setStockError('')
    if (currentVal <= 0) {
      onUpdate(item.product_id, '0')
      return
    }
    const nextVal = Math.max(0, Number((currentVal - 1).toFixed(3)))
    onUpdate(item.product_id, nextVal === 0 ? '0' : String(nextVal))
  }

  function handleIncrement() {
    if (isAtStockLimit) return
    const nextVal = Math.min(maxStock, Number((currentVal + 1).toFixed(3)))
    setStockError('')
    onUpdate(item.product_id, String(nextVal))
  }

  function handleQuantityChange(val) {
    if (val === '') {
      setStockError('')
      onUpdate(item.product_id, '')
      return
    }

    if (val.includes('-')) {
      val = val.replace(/-/g, '')
      if (val === '') {
        setStockError('')
        onUpdate(item.product_id, '')
        return
      }
    }

    if (item.unit_category === 'COUNT') {
      if (val.includes('.')) {
        val = val.split('.')[0]
        if (val === '') {
          setStockError('')
          onUpdate(item.product_id, '')
          return
        }
      }
      val = val.replace(/[^\d]/g, '')
      if (val === '') {
        setStockError('')
        onUpdate(item.product_id, '')
        return
      }
    } else {
      val = val.replace(/[^\d.]/g, '')
      const parts = val.split('.')
      if (parts.length > 2) {
        val = parts[0] + '.' + parts.slice(1).join('')
      }
      if (parts.length === 2 && parts[1].length > 3) {
        val = parts[0] + '.' + parts[1].slice(0, 3)
      }
    }

    if (val === '.') {
      onUpdate(item.product_id, '0.')
      return
    }

    const num = parseFloat(val)
    if (isNaN(num)) return
    if (num < 0) {
      setStockError('')
      onUpdate(item.product_id, '0')
      return
    }

    const unitLabel = item.unit || item.base_unit || 'units'
    if (num > maxStock) {
      setStockError(`Only ${maxStock} ${unitLabel} available in stock.`)
      onUpdate(item.product_id, String(maxStock))
      return
    }

    setStockError('')
    onUpdate(item.product_id, val)
  }

  function handleQuantityBlur() {
    if (item.quantity === '' || isNaN(parseFloat(item.quantity))) {
      onUpdate(item.product_id, '0')
    }
  }

  function commitOurPrice(raw) {
    let val = String(raw ?? '').trim()
    if (val === '' || val === '.') {
      const fallback = item.catalog_our_price != null ? item.catalog_our_price : (item.our_price != null ? item.our_price : item.price)
      setOurPriceDraft(String(fallback ?? ''))
      onOurPriceChange?.(item.product_id, fallback)
      return
    }
    val = val.replace(/[^\d.]/g, '')
    const parts = val.split('.')
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
    if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
    const num = parseFloat(val)
    if (isNaN(num) || num < 0) {
      const fallback = item.catalog_our_price != null ? item.catalog_our_price : (item.our_price != null ? item.our_price : item.price)
      setOurPriceDraft(String(fallback ?? ''))
      onOurPriceChange?.(item.product_id, fallback)
      return
    }
    const normalized = Number(num.toFixed(2))
    setOurPriceDraft(String(normalized))
    onOurPriceChange?.(item.product_id, normalized)
  }

  function handleOurPriceChange(raw) {
    let val = String(raw ?? '')
    if (val.includes('-')) val = val.replace(/-/g, '')
    val = val.replace(/[^\d.]/g, '')
    const parts = val.split('.')
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
    if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
    setOurPriceDraft(val)
    if (val === '' || val === '.') return
    const num = parseFloat(val)
    if (!isNaN(num) && num >= 0) {
      onOurPriceChange?.(item.product_id, Number(num.toFixed(2)))
    }
  }

  function handleQtyKeyDown(e) {
    if ((e.key === 's' || e.key === 'S' || e.code === 'KeyS') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const searchInput = document.querySelector('input[placeholder*="Search by name"]') || document.querySelector('input[placeholder*="Search"]')
      if (searchInput) {
        searchInput.focus()
        searchInput.select?.()
      }
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      ourPriceInputRef.current?.focus()
      ourPriceInputRef.current?.select?.()
      return
    }

    const allQtyInputs = Array.from(document.querySelectorAll('input[data-field="qty"]'))
    const currentIndex = allQtyInputs.indexOf(e.target)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (currentIndex >= 0 && currentIndex < allQtyInputs.length - 1) {
        const nextInput = allQtyInputs[currentIndex + 1]
        nextInput?.focus()
        nextInput?.select?.()
      } else {
        qtyInputRef.current?.focus()
        qtyInputRef.current?.select?.()
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (currentIndex > 0) {
        const prevInput = allQtyInputs[currentIndex - 1]
        prevInput?.focus()
        prevInput?.select?.()
      } else {
        qtyInputRef.current?.focus()
        qtyInputRef.current?.select?.()
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      // If there is another product line in the cart after this one, advance focus to it
      if (currentIndex >= 0 && currentIndex < allQtyInputs.length - 1) {
        const nextInput = allQtyInputs[currentIndex + 1]
        if (nextInput) {
          nextInput.focus()
          nextInput.select?.()
          return
        }
      }

      // If this is the LAST product line in the cart, advance focus to Additional Discount
      const cartDiscountInput = document.querySelector('[data-testid="additional-cart-discount-input"]')
      if (cartDiscountInput) {
        cartDiscountInput.focus()
        cartDiscountInput.select?.()
      }
      return
    }
  }

  return (
    <div
      id={`cart-item-${item.product_id}`}
      className={`p-3 rounded-2xl border transition-all duration-200 ${
        isLastAdded
          ? 'border-primary-400 bg-primary-50/70 shadow-glass-sm ring-2 ring-primary-400/30'
          : isSelected
          ? 'border-primary-400 bg-primary-50/50 shadow-glass-sm'
          : 'border-slate-200/80 bg-white/80 hover:bg-white hover:border-slate-300 shadow-2xs'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>

          <div className="mt-1.5 flex items-center justify-between text-xs bg-primary-50/60 border border-primary-100 rounded-xl px-2.5 py-1">
            {/* Left: Discount Checkbox */}
            <div className="flex items-center gap-1.5 min-w-0">
              {hasPredefinedDiscount ? (
                <>
                  <label className={`flex items-center gap-1.5 select-none text-primary-950 font-bold ${item.is_wholesale ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      data-testid={`predefined-discount-toggle-${item.product_id}`}
                      checked={!item.is_wholesale && isPredefinedApplied}
                      disabled={Boolean(item.is_wholesale)}
                      onChange={(e) => onToggleDiscount?.(item.product_id, e.target.checked)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (isPredefinedApplied) {
                            onToggleDiscount?.(item.product_id, false)
                          }
                          qtyInputRef.current?.focus()
                          qtyInputRef.current?.select?.()
                        }
                      }}
                      className="rounded text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 border-slate-300"
                    />
                    <span>Discount</span>
                  </label>
                  {!item.is_wholesale && (
                    <span className="font-extrabold text-emerald-700 ml-1 text-3xs">
                      {isPredefinedApplied ? `-${formatCurrency(predefinedDiscountAmount)}` : 'Off'}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-400 font-medium">Standard</span>
              )}
            </div>

            {/* Right: Wholesale Checkbox */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-primary-950 font-bold">
                <input
                  type="checkbox"
                  data-testid={`wholesale-toggle-${item.product_id}`}
                  checked={Boolean(item.is_wholesale)}
                  onChange={(e) => onToggleWholesale?.(item.product_id, e.target.checked)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (!item.is_wholesale) {
                        onToggleWholesale?.(item.product_id, true)
                      }
                      qtyInputRef.current?.focus()
                      qtyInputRef.current?.select?.()
                    }
                  }}
                  className="rounded text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 border-slate-300"
                />
                <span>Wholesale</span>
              </label>
              {item.is_wholesale && (
                <span className="font-bold text-primary-700 text-3xs bg-primary-100 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => onRemove(item.product_id)}
          className="text-slate-300 hover:text-danger-500 transition flex-shrink-0 p-1 rounded-lg hover:bg-danger-50/60"
          title="Remove item"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between mt-2.5 gap-2">
        {/* Quantity control with - / + buttons and Our Price editing box */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-2xs focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500">
            <button
              type="button"
              id={`cart-qty-dec-${index}`}
              data-testid={`qty-dec-${item.product_id}`}
              onClick={handleDecrement}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition font-bold select-none text-sm"
              title="Decrease quantity (−)"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <input
              ref={qtyInputRef}
              id={`cart-qty-${index}`}
              data-testid={`cart-qty-${item.product_id}`}
              data-cart-index={index}
              data-field="qty"
              type="text"
              inputMode="decimal"
              value={item.quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              onKeyDown={handleQtyKeyDown}
              onBlur={handleQuantityBlur}
              placeholder="0"
              aria-label={`Quantity for ${item.name}`}
              className="w-14 text-center text-sm font-bold text-slate-900 border-x border-slate-200/90 py-1 px-1 focus:outline-none bg-transparent"
            />
            <button
              type="button"
              id={`cart-qty-inc-${index}`}
              data-testid={`cart-qty-inc-${item.product_id}`}
              onClick={handleIncrement}
              disabled={isAtStockLimit}
              className={`w-7 h-7 flex items-center justify-center transition font-bold select-none text-sm ${
                isAtStockLimit
                  ? 'text-slate-300 bg-slate-50 cursor-not-allowed'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200'
              }`}
              title={isAtStockLimit ? 'Stock limit reached' : 'Increase quantity (+)'}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          {/* Unit pill switchers for Weight / Volume */}
          {item.unit_category === 'WEIGHT' && (
            <div className="flex rounded-xl border border-slate-200/90 overflow-hidden text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'g')}
                className={`px-2 py-1 font-bold transition ${item.unit === 'g' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                g
              </button>
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'kg')}
                className={`px-2 py-1 font-bold transition ${item.unit === 'kg' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                kg
              </button>
            </div>
          )}

          {item.unit_category === 'VOLUME' && (
            <div className="flex rounded-xl border border-slate-200/90 overflow-hidden text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'ml')}
                className={`px-2 py-1 font-bold transition ${item.unit === 'ml' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                ml
              </button>
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'L')}
                className={`px-2 py-1 font-bold transition ${item.unit === 'L' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                L
              </button>
            </div>
          )}

          {item.unit_category === 'LENGTH' && (
            <div className="flex rounded-xl border border-slate-200/90 overflow-hidden text-xs shadow-2xs">
              {['m', 'cm', 'yd'].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => onUnitChange(item.product_id, u)}
                  className={`px-2 py-1 font-bold transition ${item.unit === u ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          )}

          {item.unit_category === 'COUNT' && (
            <span className="text-xs text-slate-400 font-bold">{item.unit || item.base_unit || 'pcs'}</span>
          )}

          {/* Our Price editing box directly next to the product count box */}
          <div className="flex items-center gap-1 bg-white border border-slate-200/90 rounded-xl px-2 py-0.5 shadow-2xs focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500">
            <span className="text-xs text-slate-400 font-bold">@</span>
            <input
              ref={ourPriceInputRef}
              data-testid={`cart-our-price-${item.product_id}`}
              data-field="our-price"
              type="text"
              inputMode="decimal"
              aria-label={`Our price for ${item.name}`}
              value={ourPriceDraft}
              onFocus={() => setIsEditingOurPrice(true)}
              onChange={(e) => handleOurPriceChange(e.target.value)}
              onBlur={() => {
                setIsEditingOurPrice(false)
                commitOurPrice(ourPriceDraft)
              }}
              onKeyDown={(e) => {
                if ((e.key === 's' || e.key === 'S' || e.code === 'KeyS') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault()
                  const searchInput = document.querySelector('input[placeholder*="Search by name"]') || document.querySelector('input[placeholder*="Search"]')
                  searchInput?.focus()
                  searchInput?.select?.()
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  commitOurPrice(ourPriceDraft)
                  const allPriceInputs = Array.from(document.querySelectorAll('input[data-field="our-price"]'))
                  const currentIndex = allPriceInputs.indexOf(e.target)
                  if (currentIndex > 0) {
                    const prevInput = allPriceInputs[currentIndex - 1]
                    prevInput?.focus()
                    prevInput?.select?.()
                  } else {
                    ourPriceInputRef.current?.focus()
                    ourPriceInputRef.current?.select?.()
                  }
                  return
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  commitOurPrice(ourPriceDraft)
                  const allPriceInputs = Array.from(document.querySelectorAll('input[data-field="our-price"]'))
                  const currentIndex = allPriceInputs.indexOf(e.target)
                  if (currentIndex >= 0 && currentIndex < allPriceInputs.length - 1) {
                    const nextInput = allPriceInputs[currentIndex + 1]
                    nextInput?.focus()
                    nextInput?.select?.()
                  } else {
                    ourPriceInputRef.current?.focus()
                    ourPriceInputRef.current?.select?.()
                  }
                  return
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  commitOurPrice(ourPriceDraft)
                  qtyInputRef.current?.focus()
                  qtyInputRef.current?.select?.()
                  return
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitOurPrice(e.target.value)
                  qtyInputRef.current?.focus()
                  qtyInputRef.current?.select?.()
                }
              }}
              className="w-14 text-right text-xs font-bold text-primary-900 bg-transparent focus:outline-none"
            />
            <span className="text-3xs text-slate-400 font-medium">/{item.pricing_unit || 'pcs'}</span>
          </div>

          {/* Red Out of stock indicator beside the + button when stock limit is reached */}
          {isAtStockLimit && (
            <span
              data-testid={`out-of-stock-badge-${item.product_id}`}
              className="text-3xs font-bold text-danger-700 bg-danger-50 border border-danger-200/80 px-2 py-0.5 rounded-full whitespace-nowrap shadow-2xs"
            >
              Out of stock
            </span>
          )}
        </div>

        {/* Line total */}
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-extrabold text-slate-900 min-w-[70px] text-right tracking-tight">
            {formatCurrency(fromPesewas(lineTotalPesewas(item)))}
          </p>
        </div>
      </div>

      {/* Red validation message for manual quantity entry exceeding stock */}
      {stockError && (
        <p
          data-testid={`stock-error-${item.product_id}`}
          className="text-xs font-medium text-danger-600 mt-1.5"
        >
          {stockError}
        </p>
      )}
    </div>
  )
}

// ─── Main POSPage ──────────────────────────────────────────────────────────────
export default function POSPage() {
  const { user, logout } = useAuth()
  const { logo_url: logoUrl, pos_default_warehouse_id: configuredWarehouseId } = useSettings()
  const navigate = useNavigate()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [activeBranchName, setActiveBranchName] = useState('')

  useEffect(() => {
    async function resolveBranch() {
      try {
        const whId = configuredWarehouseId || user?.warehouse_id
        if (whId) {
          const res = await warehouseService.get(whId)
          if (res.data?.data?.name) {
            setActiveBranchName(res.data.data.name)
            return
          }
        }
        const defRes = await warehouseService.getDefault()
        if (defRes.data?.data?.name) {
          setActiveBranchName(defRes.data.data.name)
        }
      } catch {
        // non-fatal
      }
    }
    resolveBranch()
  }, [configuredWarehouseId, user?.warehouse_id])

  async function handleConfirmLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
      setShowLogoutModal(false)
      navigate('/login')
      toast.success('Logged out successfully')
    } catch {
      toast.error('Failed to log out cleanly')
    } finally {
      setIsLoggingOut(false)
    }
  }
  const {
    items,
    cartDiscount,
    customer,
    predefined_discounts,
    subtotal,
    tax,
    total,
    distinct_items,
    total_quantity,
    addItem,
    removeItem,
    updateQuantity,
    togglePredefinedDiscount,
    toggleWholesale,
    updateUnit,
    updateDiscount,
    updateOurPrice,
    setCartDiscount,
    setCustomer,
    clearCart,
  } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(0)
  const searchDropdownContainerRef = useRef(null)
  const [allProducts, setAllProducts] = useState([])
  const [allCustomers, setAllCustomers] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [completedSale, setCompletedSale] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isAnyModalOpen = showPaymentModal || showReceiptModal || showClearConfirm || showQuickCustomerModal

  const searchRef = useRef(null)
  const cartContainerRef = useRef(null)
  const cartEndRef = useRef(null)
  const [lastAddedId, setLastAddedId] = useState(null)
  const lastScanRef = useRef({ code: '', time: 0 })

  // Load all products, categories, and customers on mount
  useEffect(() => {
    searchRef.current?.focus()

    async function loadInitialData() {
      setIsLoadingProducts(true)
      try {
        const [productsRes, categoriesRes, customersRes] = await Promise.all([
          productsService.list({ per_page: 100, is_active: true }),
          productsService.categories(),
          customersService.list({ per_page: 100 }).catch(() => ({ data: { data: [] } })),
        ])
        setAllProducts(productsRes.data?.data || [])
        setCategories(categoriesRes.data?.data || [])
        setAllCustomers(customersRes.data?.data || [])
      } catch {
        toast.error('Failed to load products')
      } finally {
        setIsLoadingProducts(false)
      }
    }

    loadInitialData()
  }, [])

  // Background search to discover uncached products across all database records
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) return

    const timeout = setTimeout(async () => {
      try {
        const res = await productsService.list({ search: q, per_page: 50, is_active: true })
        const serverResults = res.data?.data || []
        if (serverResults.length > 0) {
          setAllProducts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id))
            const newOnes = serverResults.filter((p) => !existingIds.has(p.id))
            return newOnes.length > 0 ? [...prev, ...newOnes] : prev
          })
        }
      } catch {
        // silent fallback to local in-memory products
      }
    }, 200)

    return () => clearTimeout(timeout)
  }, [searchQuery])

  // Derived: products filtered by search query and selected category
  const products = allProducts.filter((p) => {
    const matchesCategory = selectedCategory === 'ALL' || p.category_id === selectedCategory
    if (!searchQuery.trim()) return matchesCategory
    const q = searchQuery.toLowerCase()
    return matchesCategory && (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q))
    )
  })

  // Derived: ranked product search dropdown results
  const searchDropdownResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const scored = []
    for (const p of allProducts) {
      if (p.is_active === false) continue

      const name = (p.name || '').toLowerCase()
      const sku = (p.sku || '').toLowerCase()
      const barcode = (p.barcode || '').toLowerCase()

      let score = 0
      if (name === q || sku === q || barcode === q) {
        score = 100 // Exact match
      } else if (name.startsWith(q)) {
        score = 80 // Name starts with query
      } else if (sku.startsWith(q)) {
        score = 70 // SKU starts with query
      } else if (name.includes(q)) {
        score = 50 // Name contains query
      } else if (sku.includes(q)) {
        score = 40 // SKU contains query
      } else if (barcode.includes(q)) {
        score = 30 // Barcode contains query
      }

      if (score > 0) {
        // Boost if matches currently selected category
        const categoryBonus = selectedCategory !== 'ALL' && p.category_id === selectedCategory ? 5 : 0
        scored.push({ product: p, score: score + categoryBonus })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 8).map((item) => item.product)
  }, [allProducts, searchQuery, selectedCategory])

  async function handleBarcodeSearch(barcode) {
    const code = String(barcode || '').trim()
    if (!code) return

    // Prevent duplicate events from scanner key bounces (< 250ms)
    const now = Date.now()
    if (lastScanRef.current.code === code && (now - lastScanRef.current.time) < 250) {
      return
    }
    lastScanRef.current = { code, time: now }

    // Fast O(1) in-memory check for products already in the active cart
    const inCart = items.find((i) => i.barcode === code)
    if (inCart) {
      const fullProduct = allProducts.find((p) => p.id === inCart.product_id) || inCart
      handleAddProduct(fullProduct)
      setSearchQuery('')
      return
    }

    // Fast in-memory check for products already loaded in product catalog
    const localProduct = allProducts.find((p) => p.barcode === code)
    if (localProduct) {
      handleAddProduct(localProduct)
      setSearchQuery('')
      return
    }

    // Single indexed backend query if not present in memory
    try {
      const res = await productsService.byBarcode(code)
      const product = res.data?.data
      if (product && product.is_active !== false) {
        setAllProducts((prev) => {
          if (prev.some((p) => p.id === product.id)) return prev
          return [...prev, product]
        })
        handleAddProduct(product)
        setSearchQuery('')
      } else {
        toast.error('Product not found. Please register the product or search manually.')
      }
    } catch {
      toast.error('Product not found. Please register the product or search manually.')
    }
  }

  // Hardware barcode scanner
  useBarcodeScanner((barcode) => {
    handleBarcodeSearch(barcode)
  }, { enabled: !isAnyModalOpen })

  function handleAddProduct(product) {
    if (!product) return
    const availableStock = Number(product.quantity ?? product.quantity_available ?? 0)
    if (availableStock <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }
    const pid = product.id || product.product_id
    const existing = items.find((i) => i.product_id === pid)
    if (existing) {
      const maxStock = getAvailableStockForItem(existing, items, product)
      const currentQty = Number(existing.quantity || 0)
      if (currentQty >= maxStock) {
        const unitLabel = existing.unit || existing.base_unit || 'units'
        toast.error(`Cannot add more. Only ${maxStock} ${unitLabel} available in stock.`)
        return
      }
    }
    setLastAddedId(pid)
    addItem(product, 1)
    toast.success(`${product.name} added to cart`, { duration: 1500 })
  }

  // Auto-scroll cart ONLY when a new product is added (never when editing quantities)
  useEffect(() => {
    if (!lastAddedId) return
    const timer = setTimeout(() => {
      const el = document.getElementById(`cart-item-${lastAddedId}`)
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
      setLastAddedId(null)
    }, 80)
    return () => clearTimeout(timer)
  }, [lastAddedId])

  const {
    selectedProductIndex,
    setSelectedProductIndex,
    selectedCartIndex,
    activeZone,
    setActiveZone,
    productColumnCount,
  } = usePOSKeyboard({
    products,
    cartItems: items,
    onAddProduct: handleAddProduct,
    onUpdateCartQuantity: updateQuantity,
    onRemoveCartItem: removeItem,
    onToggleCartUnit: (productId) => {
      const item = items.find((i) => i.product_id === productId)
      if (!item) return
      if (item.unit_category === 'WEIGHT') {
        updateUnit(productId, item.unit === 'g' ? 'kg' : 'g')
      } else if (item.unit_category === 'VOLUME') {
        updateUnit(productId, item.unit === 'ml' ? 'L' : 'ml')
      } else if (item.unit_category === 'LENGTH') {
        const lengthUnits = ['m', 'cm', 'yd']
        const nextIdx = (lengthUnits.indexOf(item.unit) + 1) % lengthUnits.length
        updateUnit(productId, lengthUnits[nextIdx])
      }
    },
    onOpenPayment: () => handleOpenPayment(),
    onOpenClearConfirm: () => setShowClearConfirm(true),
    onOpenCustomerModal: () => {
      const input = document.querySelector('[data-testid="customer-search-inline-input"]')
      if (input) {
        input.focus()
      }
    },
    isModalOpen: isAnyModalOpen,
    searchRef,
  })

  // Reset selected product highlight when search query or filtered list changes
  useEffect(() => {
    if (typeof setSelectedProductIndex === 'function') {
      setSelectedProductIndex(0)
    }
  }, [searchQuery, setSelectedProductIndex])

  // Scroll highlighted product card into view during keyboard navigation
  useEffect(() => {
    if (products.length > 0 && selectedProductIndex >= 0 && selectedProductIndex < products.length) {
      const targetProd = products[selectedProductIndex]
      if (targetProd) {
        const el = document.getElementById(`product-card-${targetProd.id}`)
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }
    }
  }, [selectedProductIndex, products])

  // Close search dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchDropdownContainerRef.current && !searchDropdownContainerRef.current.contains(e.target)) {
        setShowProductDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-scroll highlighted dropdown item into view
  useEffect(() => {
    if (showProductDropdown && searchDropdownResults.length > 0) {
      const el = document.getElementById(`search-dropdown-item-${dropdownSelectedIndex}`)
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [dropdownSelectedIndex, showProductDropdown, searchDropdownResults.length])

  // Centralized keyboard & barcode search submission
  async function handleSearchSubmit() {
    const q = searchQuery.trim()
    if (!q) {
      if (products.length > 0) {
        const target = products[selectedProductIndex] || products[0]
        if (target) {
          handleAddProduct(target)
        }
      }
      return
    }

    // 1. Exact Barcode match in memory
    const exactBarcode = allProducts.find((p) => p.barcode && p.barcode.toLowerCase() === q.toLowerCase())
    if (exactBarcode) {
      handleAddProduct(exactBarcode)
      setSearchQuery('')
      setSelectedProductIndex(0)
      return
    }

    // 2. Exact SKU match in memory
    const exactSku = allProducts.find((p) => p.sku && p.sku.toLowerCase() === q.toLowerCase())
    if (exactSku) {
      handleAddProduct(exactSku)
      setSearchQuery('')
      setSelectedProductIndex(0)
      return
    }

    // 3. Exact Name match in memory
    const exactName = allProducts.find((p) => p.name && p.name.toLowerCase() === q.toLowerCase())
    if (exactName) {
      handleAddProduct(exactName)
      setSearchQuery('')
      setSelectedProductIndex(0)
      return
    }

    // 4. Highlighted or first matching result from filtered products
    if (products.length > 0) {
      const target = products[selectedProductIndex] || products[0]
      if (target) {
        handleAddProduct(target)
        setSearchQuery('')
        setSelectedProductIndex(0)
        return
      }
    }

    // 5. Fallback: Query backend by search term (name/SKU/barcode) or barcode for uncached database products
    try {
      const searchRes = await productsService.list({ search: q, per_page: 10, is_active: true })
      const found = searchRes.data?.data || []
      if (found.length > 0) {
        setAllProducts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id))
          const newOnes = found.filter((p) => !existingIds.has(p.id))
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev
        })
        const exactMatch =
          found.find(
            (p) =>
              (p.barcode && p.barcode.toLowerCase() === q.toLowerCase()) ||
              (p.sku && p.sku.toLowerCase() === q.toLowerCase()) ||
              (p.name && p.name.toLowerCase() === q.toLowerCase())
          ) || found[0]
        handleAddProduct(exactMatch)
        setSearchQuery('')
        setSelectedProductIndex(0)
        return
      }
    } catch {
      // fallback to barcode query
    }

    // 6. Direct barcode scanner endpoint fallback
    await handleBarcodeSearch(q)
  }

  function handleOpenPayment() {
    if (items.length === 0) return
    const unentered = items.find(
      (i) => i.quantity === '' || isNaN(parseFloat(i.quantity)) || parseFloat(i.quantity) <= 0
    )
    if (unentered) {
      toast.error(`Please enter a quantity for ${unentered.name}`)
      return
    }
    const badPrice = items.find((i) => {
      const p = parseFloat(i.our_price)
      return i.our_price === '' || isNaN(p) || p < 0
    })
    if (badPrice) {
      toast.error(`Please enter a valid our price for ${badPrice.name}`)
      return
    }

    // Verify all cart items against available stock before opening payment modal
    for (const item of items) {
      const product = allProducts.find((p) => p.id === item.product_id)
      const maxStock = getAvailableStockForItem(item, items, product)
      const requested = parseFloat(item.quantity) || 0
      if (requested > maxStock) {
        const unitLabel = item.unit || item.base_unit || 'units'
        toast.error(`Cannot checkout. Only ${maxStock} ${unitLabel} of ${item.name} available in stock.`)
        return
      }
    }

    setShowPaymentModal(true)
  }

  async function handlePaymentConfirm({ amount_paid }) {
    setIsSubmitting(true)
    try {
      const payload = {
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: parseFloat(i.quantity) || 0,
          unit: i.unit,
          predefined_discount_applied: i.apply_predefined_discount !== false,
          is_wholesale: Boolean(i.is_wholesale),
          wholesale_price: parseFloat(i.wholesale_price) || 0,
          our_price: parseFloat(i.our_price),
          discount: parseFloat(i.discount) || 0,
        })),
        customer_id: customer?.id || null,
        payment_method: 'CASH',
        amount_paid,
        discount_amount: parseFloat(cartDiscount) || 0,
        warehouse_id: configuredWarehouseId || undefined,
      }
      const res = await salesService.create(payload)
      const sale = res.data?.data
      setCompletedSale(sale)
      setShowPaymentModal(false)
      setShowReceiptModal(true)
      clearCart()
      toast.success('Sale completed successfully!')
      broadcastRealtimeEvent('sale:created', sale)
      try {
        const productsRes = await productsService.list({ per_page: 100, is_active: true })
        setAllProducts(productsRes.data?.data || [])
      } catch (e) {
        console.warn('Failed to refresh products:', e)
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to process sale'
      toast.error(msg)
      try {
        const productsRes = await productsService.list({ per_page: 100, is_active: true })
        setAllProducts(productsRes.data?.data || [])
      } catch (e) {
        console.warn('Failed to refresh products:', e)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-slate-100/60 overflow-hidden relative selection:bg-primary-500 selection:text-white">
      {/* Subtle ambient light gradient background */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(59,130,246,0.08),rgba(255,255,255,0))]" />

      {/* ── LEFT PANEL: Product Search ── */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-3 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl || '/logo.png'}
              alt="Store Logo"
              className="h-9 w-auto object-contain hidden sm:block drop-shadow-xs"
            />
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight tracking-tight">Point of Sale</h1>
              {activeBranchName && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Branch: <span className="text-slate-800">{activeBranchName}</span>
                  </span>
                </div>
              )}
            </div>
           
          </div>
          <div className="flex items-center gap-3">
            {['ADMIN', 'MANAGER'].includes(user?.role) && (
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/90 bg-white/80 backdrop-blur-md hover:border-primary-200 hover:bg-white text-slate-700 hover:text-primary-700 transition-all text-xs font-bold shadow-glass-sm hover:shadow-glass"
              >
                <svg className="w-4 h-4 text-slate-500 group-hover:text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>Dashboard</span>
              </button>
            )}

            

            <button
              onClick={() => setShowLogoutModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/90 bg-white/80 backdrop-blur-md hover:border-danger-200 hover:bg-danger-50/60 text-slate-600 hover:text-danger-600 transition-all text-xs font-bold shadow-glass-sm hover:shadow-glass"
              title="Sign out of POS"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
             <div className="text-right">
              <p className="text-sm font-bold uppercase tracking-wider text-primary-600 leading-tight">{user?.role === 'CASHIER' ? 'Cashier' : user?.role}</p>
              
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div ref={searchDropdownContainerRef} className="relative">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onFocus={() => {
              if (searchQuery.trim().length > 0) {
                setShowProductDropdown(true)
              }
            }}
            onChange={(e) => {
              const val = e.target.value
              setSearchQuery(val)
              setShowProductDropdown(val.trim().length > 0)
              setDropdownSelectedIndex(0)
            }}
            onKeyDown={(e) => {
              const hasDropdown = showProductDropdown && searchDropdownResults.length > 0
              const cols = productColumnCount || 2

              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (hasDropdown) {
                  const nextIdx = (dropdownSelectedIndex + 1) % searchDropdownResults.length
                  setDropdownSelectedIndex(nextIdx)
                  const target = searchDropdownResults[nextIdx]
                  if (target) {
                    const gridIdx = products.findIndex((p) => p.id === target.id)
                    if (gridIdx >= 0) setSelectedProductIndex(gridIdx)
                  }
                } else if (products.length > 0) {
                  setActiveZone('PRODUCTS')
                  setSelectedProductIndex((i) => Math.min(products.length - 1, i + cols))
                }
                return
              }

              if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (hasDropdown) {
                  const prevIdx = (dropdownSelectedIndex - 1 + searchDropdownResults.length) % searchDropdownResults.length
                  setDropdownSelectedIndex(prevIdx)
                  const target = searchDropdownResults[prevIdx]
                  if (target) {
                    const gridIdx = products.findIndex((p) => p.id === target.id)
                    if (gridIdx >= 0) setSelectedProductIndex(gridIdx)
                  }
                } else if (products.length > 0) {
                  setSelectedProductIndex((i) => Math.max(0, i - cols))
                }
                return
              }

              if (e.key === 'ArrowRight') {
                e.preventDefault()
                if (hasDropdown) {
                  const nextIdx = Math.min(searchDropdownResults.length - 1, dropdownSelectedIndex + 1)
                  setDropdownSelectedIndex(nextIdx)
                  const target = searchDropdownResults[nextIdx]
                  if (target) {
                    const gridIdx = products.findIndex((p) => p.id === target.id)
                    if (gridIdx >= 0) setSelectedProductIndex(gridIdx)
                  }
                } else if (products.length > 0) {
                  setActiveZone('PRODUCTS')
                  setSelectedProductIndex((i) => Math.min(products.length - 1, i + 1))
                }
                return
              }

              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                if (hasDropdown) {
                  const prevIdx = Math.max(0, dropdownSelectedIndex - 1)
                  setDropdownSelectedIndex(prevIdx)
                  const target = searchDropdownResults[prevIdx]
                  if (target) {
                    const gridIdx = products.findIndex((p) => p.id === target.id)
                    if (gridIdx >= 0) setSelectedProductIndex(gridIdx)
                  }
                } else if (products.length > 0) {
                  setActiveZone('PRODUCTS')
                  setSelectedProductIndex((i) => Math.max(0, i - 1))
                }
                return
              }

              if (e.key === 'Escape') {
                setShowProductDropdown(false)
                return
              }

              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                if (hasDropdown) {
                  const target = searchDropdownResults[dropdownSelectedIndex] || searchDropdownResults[0]
                  if (target) {
                    handleAddProduct(target)
                    setSearchQuery('')
                    setShowProductDropdown(false)
                    setDropdownSelectedIndex(0)
                    searchRef.current?.focus()
                    return
                  }
                }
                handleSearchSubmit()
                setShowProductDropdown(false)
                searchRef.current?.focus()
                return
              }
            }}
            placeholder="Search by name, SKU, or scan barcode… (S / F1)"
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-white/90 bg-white/90 backdrop-blur-md shadow-glass-sm text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setShowProductDropdown(false)
                setDropdownSelectedIndex(0)
                searchRef.current?.focus()
              }}
              className="absolute inset-y-0 right-3.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Autocomplete Dropdown Menu */}
          {showProductDropdown && searchDropdownResults.length > 0 && (
            <div
              data-testid="product-search-dropdown"
              className="absolute left-0 right-0 top-full mt-2 z-50 bg-white/95 backdrop-blur-xl rounded-2xl shadow-glass-xl border border-white/90 divide-y divide-slate-100 max-h-80 overflow-y-auto"
            >
              {searchDropdownResults.map((product, idx) => {
                const isSelected = idx === dropdownSelectedIndex
                const isOut = Number(product.quantity) <= 0
                const lowStock = !isOut && Number(product.quantity) <= Number(product.low_stock_threshold || 5)
                const currentPrice = product.our_price || product.price

                return (
                  <div
                    key={product.id}
                    id={`search-dropdown-item-${idx}`}
                    data-testid={`search-dropdown-item-${product.id}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setDropdownSelectedIndex(idx)}
                    onClick={() => {
                      handleAddProduct(product)
                      setSearchQuery('')
                      setShowProductDropdown(false)
                      setDropdownSelectedIndex(0)
                      searchRef.current?.focus()
                    }}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-primary-50/90 text-primary-950 border-l-4 border-primary-600 pl-[12px]'
                        : 'hover:bg-slate-50/80 text-slate-800'
                    }`}
                  >
                    {/* Left: Thumbnail/Icon + Product Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          className="w-10 h-10 object-cover rounded-xl border border-slate-100 flex-shrink-0 shadow-2xs"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-400">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm truncate text-slate-900">
                            {product.name} <span className="text-slate-400 font-normal text-xs">({product.sku || 'Product'})</span>
                          </span>
                          {product.unit_category && (
                            <span className="text-3xs uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">
                              {product.base_unit || product.unit_category}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate flex items-center gap-2 mt-0.5 font-medium">
                          {product.barcode && <span>Barcode: {product.barcode}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Right: Stock Badge & Price */}
                    <div className="flex items-center gap-3 flex-shrink-0 text-right">
                      <div>
                        {isOut ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold bg-danger-50 text-danger-700 border border-danger-200">
                            Out of Stock
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold ${
                              lowStock
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {formatQuantityWithUnit(product.quantity, product.base_unit)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-[70px]">
                        {product.cost_price != null && product.cost_price !== '' && (
                          <div className="text-3xs text-slate-400 font-medium leading-tight">
                            Cost: {formatCurrency(product.cost_price)}
                          </div>
                        )}
                        <span className="text-sm font-extrabold text-primary-700 tracking-tight">
                          {formatCurrency(currentPrice)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Category filter tabs */}
        {!isLoadingProducts && categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-2xs ${
                selectedCategory === 'ALL'
                  ? 'bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-primary-glow border border-transparent'
                  : 'bg-white/80 backdrop-blur-md text-slate-600 border border-slate-200/80 hover:bg-white hover:text-slate-900'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-2xs ${
                  selectedCategory === cat.id
                    ? 'bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-primary-glow border border-transparent'
                    : 'bg-white/80 backdrop-blur-md text-slate-600 border border-slate-200/80 hover:bg-white hover:text-slate-900'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingProducts && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="bg-white/80 backdrop-blur-md rounded-2xl p-3 border border-white/90 shadow-glass-sm animate-pulse">
                  <div className="w-full h-24 bg-slate-200/80 rounded-xl mb-2.5" />
                  <div className="h-4 bg-slate-200/80 rounded mb-1.5" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {!isLoadingProducts && products.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <svg className="w-12 h-12 mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold">{searchQuery ? `No products found for "${searchQuery}"` : 'No products in this category'}</p>
            </div>
          )}

          {!isLoadingProducts && products.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((product, idx) => {
                const isSelected = selectedProductIndex === idx
                const isOut = Number(product.quantity) <= 0
                return (
                  <button
                    key={product.id}
                    id={`product-card-${product.id}`}
                    data-testid={`product-card-${product.id}`}
                    onClick={() => handleAddProduct(product)}
                    disabled={isOut}
                    className={`bg-white/85 backdrop-blur-md rounded-2xl p-3 text-left shadow-glass-sm border transition-all duration-200 hover:shadow-glass hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
                      isSelected
                        ? 'border-primary-500 ring-2 ring-primary-500/30 ring-offset-2 ring-offset-slate-50'
                        : isOut
                        ? 'border-slate-200/60'
                        : 'border-white/90 hover:border-primary-200/80'
                    }`}
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-24 object-cover rounded-xl mb-2 border border-slate-100 shadow-2xs" />
                    ) : (
                      <div className="w-full h-24 bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl mb-2 flex items-center justify-center border border-slate-100/80">
                        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    <p className="text-sm font-bold text-slate-900 truncate">{product.name}</p>
                    <p className="text-xs font-mono text-slate-400">{product.sku}</p>
                    <p className="text-2xs text-slate-400 mb-1 font-medium">
                      cost price: {product.cost_price != null && product.cost_price !== '' ? formatCurrency(product.cost_price) : '—'}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      <div>
                        {Number(product.usual_price) > Number(product.our_price || product.price) && (
                          <span className="text-xs text-slate-400 line-through mr-1 block font-medium">
                            {formatCurrency(product.usual_price)}
                          </span>
                        )}
                        <span className="text-sm font-extrabold text-primary-700 block tracking-tight">
                          {formatCurrency(product.our_price || product.price)}
                          {product.pricing_unit && product.pricing_unit !== 'pcs' ? ` / ${product.pricing_unit}` : ''}
                        </span>
                      </div>

                      {/* Existing Quantity below the price */}
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                        <div className="flex items-center gap-1 text-slate-500">
                          <span className="font-normal text-slate-400 text-3xs">Qty:</span>
                          <span className={`font-bold text-xs ${isOut ? 'text-danger-600' : Number(product.quantity) <= Number(product.low_stock_threshold) ? 'text-amber-600' : 'text-slate-800'}`}>
                            {formatQuantityWithUnit(product.quantity, product.base_unit)}
                          </span>
                        </div>
                        <Badge variant={isOut ? 'danger' : Number(product.quantity) <= Number(product.low_stock_threshold) ? 'warning' : 'success'}>
                          {isOut ? 'Out' : Number(product.quantity) <= Number(product.low_stock_threshold) ? 'Low' : 'In Stock'}
                        </Badge>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Cart + Payment ── */}
      <div className="w-[460px] xl:w-[500px] flex-shrink-0 bg-white/90 backdrop-blur-xl border-l border-white/80 flex flex-col shadow-glass-xl relative z-20">
        {/* Cart header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="font-extrabold text-slate-900 tracking-tight">Cart</h2>
            {items.length > 0 && (
              <Badge variant="primary">
                {distinct_items || items.length} distinct item{(distinct_items || items.length) !== 1 ? 's' : ''} ({total_quantity || items.reduce((s, i) => s + Number(i.quantity || 0), 0)} units)
              </Badge>
            )}
          </div>
          {items.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs font-bold text-danger-500 hover:text-danger-700 hover:bg-danger-50 px-2.5 py-1 rounded-lg transition"
              title="Clear cart (F4)"
            >
              Clear
            </button>
          )}
        </div>

        {/* Inline customer selector with Quick Register button */}
        <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <InlineCustomerSelector
            customer={customer}
            customersList={allCustomers}
            onSelect={setCustomer}
            onOpenQuickCustomer={() => setShowQuickCustomerModal(true)}
          />
          <button
            type="button"
            onClick={() => setShowQuickCustomerModal(true)}
            className="px-3 py-1.5 bg-primary-50/80 hover:bg-primary-100 text-primary-700 border border-primary-200/80 rounded-xl flex items-center gap-1 text-xs font-bold transition shadow-2xs flex-shrink-0"
            title="Quick Register Customer (+)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>New</span>
          </button>
        </div>

        {/* Cart items */}
        <div ref={cartContainerRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 py-12">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-600">Cart is empty</p>
              <p className="text-xs text-slate-400 mt-0.5">Search for products to add</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <CartItem
                  key={item.product_id}
                  item={item}
                  index={idx}
                  itemCount={items.length}
                  allCartItems={items}
                  productData={allProducts.find((p) => p.id === item.product_id)}
                  isSelected={activeZone === 'CART' && selectedCartIndex === idx}
                  isLastAdded={lastAddedId === item.product_id}
                  onUpdate={updateQuantity}
                  onRemove={(pid) => {
                    if (lastAddedId === pid) setLastAddedId(null)
                    removeItem(pid)
                  }}
                  onToggleDiscount={togglePredefinedDiscount}
                  onToggleWholesale={toggleWholesale}
                  onDiscountChange={updateDiscount}
                  onOurPriceChange={updateOurPrice}
                  onUnitChange={(pid, unit) => updateUnit(pid, unit)}
                />
              ))}
              <div ref={cartEndRef} />
            </div>
          )}
        </div>

        {/* Totals + actions */}
        <div className="border-t border-slate-100 px-5 py-3.5 space-y-3 bg-white/60 backdrop-blur-md">
          {/* Additional discount input */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Additional Discount</label>
            <input
              type="text"
              inputMode="decimal"
              data-testid="additional-cart-discount-input"
              value={cartDiscount}
              onChange={(e) => {
                let val = e.target.value
                if (val === '') {
                  setCartDiscount('')
                  return
                }
                if (val.includes('-')) {
                  val = val.replace(/-/g, '')
                  if (val === '') {
                    setCartDiscount('')
                    return
                  }
                }
                val = val.replace(/[^\d.]/g, '')
                const parts = val.split('.')
                if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
                if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
                const num = parseFloat(val)
                if (isNaN(num)) {
                  setCartDiscount('')
                } else {
                  setCartDiscount(String(Math.min(Math.max(0, num), subtotal)))
                }
              }}
              placeholder="0.00"
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const allQtyInputs = Array.from(document.querySelectorAll('input[data-field="qty"]'))
                  const targetInput = (lastAddedId && document.querySelector(`[data-testid="cart-qty-${lastAddedId}"]`)) || allQtyInputs[allQtyInputs.length - 1]
                  if (targetInput) {
                    targetInput.focus()
                    targetInput.select?.()
                  }
                  return
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (items.length > 0) handleOpenPayment()
                }
              }}
              className="flex-1 text-right border border-slate-200/90 rounded-xl py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 font-bold text-slate-900 bg-white/90 shadow-2xs transition-all"
            />
          </div>

          {/* Breakdown summary */}
          <div className="space-y-1 pt-1.5 border-t border-slate-100 text-xs font-semibold text-slate-600">
            {Number(predefined_discounts || 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span className="font-bold">-{formatCurrency(predefined_discounts)}</span>
              </div>
            )}
            {(parseFloat(cartDiscount) || 0) > 0 && (
              <div className="flex justify-between text-danger-600">
                <span>Additional Discount</span>
                <span className="font-bold">-{formatCurrency(cartDiscount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Tax</span>
                <span className="font-bold">{formatCurrency(tax)}</span>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="flex justify-between items-center pt-2.5 border-t border-slate-100">
            <div>
              <span className="text-base font-extrabold text-slate-900 block leading-tight tracking-tight">Grand Total</span>
              <span className="text-xs text-slate-400 font-medium">
                {distinct_items || items.length} distinct item{(distinct_items || items.length) !== 1 ? 's' : ''} ({total_quantity || items.reduce((s, i) => s + Number(i.quantity || 0), 0)} units)
              </span>
            </div>
            <span className="text-3xl font-extrabold text-primary-700 tracking-tight">{formatCurrency(total)}</span>
          </div>

          {/* Charge button */}
          <Button
            variant="success"
            size="lg"
            className="w-full text-base font-bold shadow-glass-md py-3.5"
            disabled={items.length === 0}
            onClick={handleOpenPayment}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Charge {items.length > 0 && formatCurrency(total)} <span className="ml-1 text-xs opacity-80 font-normal">(F2)</span>
          </Button>
        </div>
      </div>

      {/* ── Modals ── */}
      {showPaymentModal && (
        <PaymentModal
          isOpen
          onClose={() => setShowPaymentModal(false)}
          total={total}
          customer={customer}
          onConfirm={handlePaymentConfirm}
          onOpenQuickCustomer={() => setShowQuickCustomerModal(true)}
          isLoading={isSubmitting}
        />
      )}

      {showQuickCustomerModal && (
        <QuickCustomerModal
          isOpen
          onClose={() => setShowQuickCustomerModal(false)}
          onCustomerCreated={(newCust) => {
            setCustomer(newCust)
            setAllCustomers((prev) => [newCust, ...prev.filter((c) => c.id !== newCust.id)])
          }}
        />
      )}

      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="Sale Complete — Receipt"
        size="md"
      >
        <Receipt sale={completedSale} onClose={() => setShowReceiptModal(false)} />
      </Modal>

      {/* Clear cart confirmation */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear Cart"
        size="sm"
      >
        <p className="text-sm text-slate-600 mb-4 font-medium">Are you sure you want to clear all items from the cart? This cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => { clearCart(); setShowClearConfirm(false); toast.success('Cart cleared') }}
          >
            Clear Cart
          </Button>
        </div>
      </Modal>

      {/* Glassmorphic Logout Confirmation Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
        isLoading={isLoggingOut}
      />
    </div>
  )
}
