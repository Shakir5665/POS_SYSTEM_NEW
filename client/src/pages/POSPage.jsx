import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useCart } from '../hooks/useCart'
import { productsService } from '../services/products'
import { salesService } from '../services/sales'
import { customersService } from '../services/customers'
import { formatCurrency } from '../utils/formatCurrency'
import { toPesewas, fromPesewas, lineTotalPesewas } from '../utils/money'
import { formatQuantityWithUnit, getAvailableStockForItem } from '../utils/uom'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import { Receipt } from '../components/Receipt'
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
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-primary-600 font-semibold uppercase tracking-wider">Amount Due</p>
            <p className="text-3xl font-bold text-primary-800 mt-0.5">{formatCurrency(total)}</p>
          </div>
          <div className="text-right">
            {customer ? (
              <div className="bg-white border border-primary-200 rounded-lg px-3 py-1.5 shadow-2xs">
                <p className="text-xs font-bold text-gray-900">{customer.name}</p>
                <p className="text-2xs text-success-700 font-medium">Registered Customer</p>
              </div>
            ) : (
              <div className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5">
                <p className="text-xs font-medium text-gray-600">Walk-in Customer</p>
                <p className="text-2xs text-gray-400">Credit disabled</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => { setPaymentMethod('CASH'); setErrors({}) }}
            className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition ${
              paymentMethod === 'CASH'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Cash / Partial Payment
          </button>
          <button
            type="button"
            onClick={() => { setPaymentMethod('CREDIT'); setErrors({}) }}
            className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition ${
              paymentMethod === 'CREDIT'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Customer Credit Sale
          </button>
        </div>

        {errors.general && (
          <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-lg p-3 text-xs">
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
                className="px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded border border-primary-200 transition"
              >
                Exact Amount ({formatCurrency(total)})
              </button>
            </div>

            {/* Change banner */}
            {paidEnough && (
              <div className="flex justify-between items-center bg-success-50 border border-success-100 rounded-lg px-3 py-2">
                <span className="text-sm text-success-700 font-medium">Change Returned</span>
                <span className="font-bold text-success-700 text-lg">{formatCurrency(change)}</span>
              </div>
            )}

            {/* Partial payment banner */}
            {isPartial && (
              <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between text-warning-800 font-semibold">
                  <span>Partial Payment:</span>
                  <span>{formatCurrency(cashVal)}</span>
                </div>
                <div className="flex justify-between text-danger-700 font-bold border-t border-warning-200 pt-1">
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
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 text-center space-y-2">
                <p className="text-sm font-semibold text-warning-800">
                  Registered Customer Required
                </p>
                <p className="text-xs text-gray-600">
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
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Customer Account</p>
                  <p className="text-sm font-bold text-gray-900">{customer.name}</p>
                  <p className="text-xs text-gray-500">{customer.phone || customer.email || 'No phone recorded'}</p>
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

                <div className="bg-danger-50 border border-danger-200 rounded-lg p-3">
                  <div className="flex justify-between text-sm font-bold text-danger-800">
                    <span>Outstanding Debt to Record:</span>
                    <span>{formatCurrency(creditBalanceDue)}</span>
                  </div>
                  <p className="text-2xs text-danger-600 mt-1">
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
          <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-lg p-3 text-xs">
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
          placeholder="e.g. Accra Central Market"
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
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg border border-primary-300 bg-primary-50/50 hover:bg-primary-50 transition">
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
              <span className="text-sm font-semibold text-gray-900">{customer.name}</span>
              {(customer.phone || customer.email) && (
                <span className="text-xs text-gray-500 ml-1.5">
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
            className="p-1 text-gray-400 hover:text-danger-600 rounded transition"
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
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
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
            className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSelectedIndex(0)
              }}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
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
          className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 divide-y divide-gray-100 max-h-72 overflow-y-auto"
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
            className={`px-3 py-2.5 cursor-pointer flex items-center justify-between transition select-none ${
              safeSelectedIndex === 0
                ? 'bg-primary-50 text-primary-950 font-semibold border-l-4 border-primary-600 pl-[8px]'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-medium">Walk-in Customer (None)</span>
                <p className="text-2xs text-gray-400">Cash / Immediate payment only</p>
              </div>
            </div>
            <span className="text-2xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">Default</span>
          </div>

          {/* Customer results */}
          {sortedResults.length === 0 && query.trim() ? (
            <div className="py-4 text-center px-3">
              <p className="text-xs text-gray-500">No customers found for "{query}".</p>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  onOpenQuickCustomer?.()
                }}
                className="mt-1.5 text-xs text-primary-600 hover:text-primary-800 font-semibold"
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
                  className={`px-3 py-2.5 cursor-pointer flex items-center justify-between transition select-none ${
                    isSelected
                      ? 'bg-primary-50 text-primary-950 font-semibold border-l-4 border-primary-600 pl-[8px]'
                      : isCurrentCustomer
                      ? 'bg-primary-50/50 text-primary-900'
                      : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(c.name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900 truncate">{c.name}</p>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {c.phone || c.email || 'No contact info'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {Number(c.outstanding_debt || 0) > 0 ? (
                      <span className="inline-block text-2xs px-2 py-0.5 rounded font-semibold bg-danger-50 text-danger-700 border border-danger-200">
                        Debt: {c.outstanding_debt}
                      </span>
                    ) : (
                      <span className="text-2xs text-success-700 font-medium">Clean balance</span>
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
  const ourPrice = Number(item.our_price != null ? item.our_price : item.price)
  const hasPredefinedDiscount = usualPrice > ourPrice
  const isPredefinedApplied = item.apply_predefined_discount !== false
  const activeSellingPrice = isPredefinedApplied ? ourPrice : usualPrice
  const predefinedDiff = Math.max(0, usualPrice - ourPrice)

  let pricingQty = currentVal
  if (item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME') {
    const factorSelling = item.unit === 'g' || item.unit === 'ml' ? 1 : 1000
    const factorPricing = (item.pricing_unit || 'kg') === 'g' || (item.pricing_unit || 'L') === 'ml' ? 1 : 1000
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

      // If this is the LAST product line in the cart, advance focus to Additional Cart Discount
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
      className={`py-2.5 px-2.5 rounded-lg border transition-all duration-300 ${
        isLastAdded
          ? 'border-primary-400 bg-primary-50/50 shadow-sm ring-1 ring-primary-200'
          : isSelected
          ? 'border-primary-500 bg-primary-50/40 shadow-sm'
          : 'border-transparent border-b-gray-100 last:border-b-0'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
            {hasPredefinedDiscount ? (
              <>
                <span className="line-through text-gray-400">MRKT_Price: {formatCurrency(usualPrice)}</span>
                <span className="font-semibold text-primary-700">
                  Our_price: {formatCurrency(isPredefinedApplied ? ourPrice : usualPrice)}
                </span>
              </>
            ) : (
              <span className="font-medium text-gray-700">{formatCurrency(usualPrice)}</span>
            )}
            <span>/ {item.pricing_unit || 'pcs'}</span>
            <span className="text-gray-300">•</span>
            <span className="font-medium text-gray-700">
              Active: {formatCurrency(activeSellingPrice)}
            </span>
          </div>

          {hasPredefinedDiscount && (
            <div className="mt-1.5 flex items-center justify-between text-xs bg-primary-50/70 border border-primary-100 rounded-md px-2 py-1">
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-primary-900 font-medium">
                <input
                  type="checkbox"
                  data-testid={`predefined-discount-toggle-${item.product_id}`}
                  checked={isPredefinedApplied}
                  onChange={(e) => onToggleDiscount?.(item.product_id, e.target.checked)}
                  className="rounded text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 border-gray-300"
                />
                <span>Discount</span>
              </label>
              <span className="font-bold text-success-700">
                {isPredefinedApplied ? `-${formatCurrency(predefinedDiscountAmount)}` : 'Disabled'}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => onRemove(item.product_id)}
          className="text-gray-300 hover:text-danger-500 transition flex-shrink-0 p-1 rounded hover:bg-danger-50"
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
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xs focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
            <button
              type="button"
              id={`cart-qty-dec-${index}`}
              data-testid={`qty-dec-${item.product_id}`}
              onClick={handleDecrement}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition font-bold select-none text-sm"
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
              className="w-14 text-center text-sm font-semibold text-gray-900 border-x border-gray-200 py-1 px-1 focus:outline-none bg-transparent"
            />
            <button
              type="button"
              id={`cart-qty-inc-${index}`}
              data-testid={`cart-qty-inc-${item.product_id}`}
              onClick={handleIncrement}
              disabled={isAtStockLimit}
              className={`w-7 h-7 flex items-center justify-center transition font-bold select-none text-sm ${
                isAtStockLimit
                  ? 'text-gray-300 bg-gray-50 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'
              }`}
              title={isAtStockLimit ? 'Stock limit reached' : 'Increase quantity (+)'}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          {/* Unit pill switchers for Weight / Volume */}
          {item.unit_category === 'WEIGHT' && (
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'g')}
                className={`px-2 py-1 font-medium transition ${item.unit === 'g' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                g
              </button>
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'kg')}
                className={`px-2 py-1 font-medium transition ${item.unit === 'kg' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                kg
              </button>
            </div>
          )}

          {item.unit_category === 'VOLUME' && (
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'ml')}
                className={`px-2 py-1 font-medium transition ${item.unit === 'ml' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                ml
              </button>
              <button
                type="button"
                onClick={() => onUnitChange(item.product_id, 'L')}
                className={`px-2 py-1 font-medium transition ${item.unit === 'L' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                L
              </button>
            </div>
          )}

          {item.unit_category === 'COUNT' && (
            <span className="text-xs text-gray-400 font-medium">{item.unit || item.base_unit || 'pcs'}</span>
          )}

          {/* Our Price editing box directly next to the product count box */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-0.5 shadow-xs focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
            <span className="text-xs text-gray-400 font-medium">@</span>
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
              className="w-14 text-right text-xs font-semibold text-primary-800 bg-transparent focus:outline-none"
            />
            <span className="text-3xs text-gray-400 font-normal">/{item.pricing_unit || 'pcs'}</span>
          </div>

          {/* Red Out of stock indicator beside the + button when stock limit is reached */}
          {isAtStockLimit && (
            <span
              data-testid={`out-of-stock-badge-${item.product_id}`}
              className="text-xs font-semibold text-danger-600 bg-danger-50 border border-danger-200 px-1.5 py-0.5 rounded whitespace-nowrap"
            >
              Out of stock
            </span>
          )}
        </div>

        {/* Line total */}
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-bold text-gray-900 min-w-[70px] text-right">
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
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
    toast.success('Logged out successfully')
  }
  const {
    items,
    cartDiscount,
    customer,
    usual_subtotal,
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

    // 5. Fallback: Query backend by barcode for uncached / unloaded products
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
          our_price: parseFloat(i.our_price),
          discount: parseFloat(i.discount) || 0,
        })),
        customer_id: customer?.id || null,
        payment_method: 'CASH',
        amount_paid,
        discount_amount: parseFloat(cartDiscount) || 0,
      }
      const res = await salesService.create(payload)
      const sale = res.data?.data
      setCompletedSale(sale)
      setShowPaymentModal(false)
      setShowReceiptModal(true)
      clearCart()
      toast.success('Sale completed successfully!')
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
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ── LEFT PANEL: Product Search ── */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NexTill" className="h-9 w-auto object-contain hidden sm:block" />
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Point of Sale</h1>
              <p className="text-xs text-gray-400">
                <kbd className="bg-gray-200 px-1 rounded text-xs">S</kbd> or <kbd className="bg-gray-200 px-1 rounded text-xs">F1</kbd> Search &nbsp;
                <kbd className="bg-gray-200 px-1 rounded text-xs">F2</kbd> Pay &nbsp;
                <kbd className="bg-gray-200 px-1 rounded text-xs">F4</kbd> Clear
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {['ADMIN', 'MANAGER'].includes(user?.role) && (
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50 text-gray-700 hover:text-primary-700 transition text-xs font-medium shadow-sm"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>Dashboard</span>
              </button>
            )}

            <div className="text-right">
              <p className="text-xs text-gray-400 leading-tight">{user?.role === 'CASHIER' ? 'Cashier' : user?.role}</p>
              <p className="text-sm font-semibold text-gray-700 leading-tight">{user?.full_name}</p>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-danger-300 hover:bg-danger-50 text-gray-600 hover:text-danger-600 transition text-xs font-medium shadow-sm"
              title="Sign out of POS"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div ref={searchDropdownContainerRef} className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            className="w-full pl-9 pr-8 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
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
              className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 divide-y divide-gray-100 max-h-80 overflow-y-auto"
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
                    className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-primary-50 text-primary-950 border-l-4 border-primary-600 pl-[10px]'
                        : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    {/* Left: Thumbnail/Icon + Product Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          className="w-9 h-9 object-cover rounded-lg border border-gray-100 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate text-gray-900">
                            {product.name} <span className="text-gray-400 font-normal text-xs">({product.sku || 'Product'})</span>
                          </span>
                          {product.unit_category && (
                            <span className="text-3xs uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">
                              {product.base_unit || product.unit_category}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 truncate flex items-center gap-2 mt-0.5">
                          {product.barcode && <span>Barcode: {product.barcode}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Right: Stock Badge & Price */}
                    <div className="flex items-center gap-3 flex-shrink-0 text-right">
                      <div>
                        {isOut ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold bg-danger-50 text-danger-700 border border-danger-200">
                            Out of Stock
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium ${
                              lowStock
                                ? 'bg-warning-50 text-warning-800 border border-warning-200'
                                : 'bg-success-50 text-success-800 border border-success-200'
                            }`}
                          >
                            {formatQuantityWithUnit(product.quantity, product.base_unit)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-[70px]">
                        <span className="text-sm font-bold text-primary-700">
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
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                selectedCategory === 'ALL'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  selectedCategory === cat.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
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
                <div key={i} className="bg-white rounded-xl p-3 animate-pulse">
                  <div className="w-full h-20 bg-gray-200 rounded-lg mb-2" />
                  <div className="h-4 bg-gray-200 rounded mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {!isLoadingProducts && products.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">{searchQuery ? `No products found for "${searchQuery}"` : 'No products in this category'}</p>
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
                    className={`bg-white rounded-xl p-3 text-left shadow-sm border transition hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'border-primary-500 ring-2 ring-primary-500 ring-offset-2'
                        : isOut
                        ? 'border-gray-100'
                        : 'border-gray-100 hover:border-primary-200'
                    }`}
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-20 object-cover rounded-lg mb-2" />
                    ) : (
                      <div className="w-full h-20 bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-400 mb-1">{product.sku}</p>
                    <div className="mt-1.5 space-y-1">
                      <div>
                        {Number(product.usual_price) > Number(product.our_price || product.price) && (
                          <span className="text-xs text-gray-400 line-through mr-1 block">
                            {formatCurrency(product.usual_price)}
                          </span>
                        )}
                        <span className="text-sm font-bold text-primary-600 block">
                          {formatCurrency(product.our_price || product.price)}
                          {product.pricing_unit && product.pricing_unit !== 'pcs' ? ` / ${product.pricing_unit}` : ''}
                        </span>
                      </div>

                      {/* Existing Quantity below the price */}
                      <div className="flex items-center justify-between text-xs pt-0.5 border-t border-gray-100">
                        <div className="flex items-center gap-1 text-gray-500">
                          <span className="font-normal text-gray-400">Qty:</span>
                          <span className={`font-semibold ${isOut ? 'text-danger-600' : Number(product.quantity) <= Number(product.low_stock_threshold) ? 'text-warning-600' : 'text-gray-800'}`}>
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
      <div className="w-[460px] xl:w-[500px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col shadow-xl">
        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="font-semibold text-gray-900">Cart</h2>
            {items.length > 0 && (
              <Badge variant="primary">
                {distinct_items || items.length} distinct item{(distinct_items || items.length) !== 1 ? 's' : ''} ({total_quantity || items.reduce((s, i) => s + Number(i.quantity || 0), 0)} units)
              </Badge>
            )}
          </div>
          {items.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-danger-500 hover:text-danger-700 transition"
              title="Clear cart (F4)"
            >
              Clear
            </button>
          )}
        </div>

        {/* Inline customer selector with Quick Register button */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
          <InlineCustomerSelector
            customer={customer}
            customersList={allCustomers}
            onSelect={setCustomer}
            onOpenQuickCustomer={() => setShowQuickCustomerModal(true)}
          />
          <button
            type="button"
            onClick={() => setShowQuickCustomerModal(true)}
            className="px-3 py-2 bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 rounded-lg flex items-center gap-1 text-sm font-medium transition shadow-xs flex-shrink-0"
            title="Quick Register Customer (+)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>New</span>
          </button>
        </div>

        {/* Cart items */}
        <div ref={cartContainerRef} className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 py-8">
              <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs">Search for products to add</p>
            </div>
          ) : (
            <div>
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
        <div className="border-t border-gray-100 px-4 py-3 space-y-2.5">
          {/* Additional Cart discount input */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Additional Cart Discount</label>
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
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (items.length > 0) handleOpenPayment()
                }
              }}
              className="flex-1 text-right border border-gray-200 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium bg-white"
            />
          </div>

          {/* Breakdown summary */}
          <div className="space-y-1 pt-1 border-t border-gray-100 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>MRKT_Price Subtotal</span>
              <span>{formatCurrency(usual_subtotal != null ? usual_subtotal : subtotal)}</span>
            </div>
            {Number(predefined_discounts || 0) > 0 && (
              <div className="flex justify-between text-success-700">
                <span>Discount</span>
                <span>-{formatCurrency(predefined_discounts)}</span>
              </div>
            )}
            {(parseFloat(cartDiscount) || 0) > 0 && (
              <div className="flex justify-between text-danger-600">
                <span>Additional Cart Discount</span>
                <span>-{formatCurrency(cartDiscount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tax</span>
                <span>{formatCurrency(tax)}</span>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <div>
              <span className="text-base font-bold text-gray-900 block leading-tight">Grand Total</span>
              <span className="text-xs text-gray-400">
                {distinct_items || items.length} distinct item{(distinct_items || items.length) !== 1 ? 's' : ''} ({total_quantity || items.reduce((s, i) => s + Number(i.quantity || 0), 0)} units)
              </span>
            </div>
            <span className="text-2xl font-bold text-primary-600">{formatCurrency(total)}</span>
          </div>

          {/* Charge button */}
          <Button
            variant="success"
            size="lg"
            className="w-full text-base"
            disabled={items.length === 0}
            onClick={handleOpenPayment}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Charge {items.length > 0 && formatCurrency(total)} <span className="ml-1 text-xs opacity-75">(F2)</span>
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
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to clear all items from the cart? This cannot be undone.</p>
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
    </div>
  )
}
