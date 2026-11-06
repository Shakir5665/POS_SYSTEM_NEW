import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useCart } from '../hooks/useCart'
import { productsService } from '../services/products'
import { salesService } from '../services/sales'
import { customersService } from '../services/customers'
import { paymentsService } from '../services/payments'
import { formatCurrency } from '../utils/formatCurrency'
import { toPesewas, fromPesewas, lineTotalPesewas } from '../utils/money'
import { formatQuantityWithUnit } from '../utils/uom'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Badge } from '../components/Badge'
import { Receipt } from '../components/Receipt'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { usePOSKeyboard } from '../hooks/usePOSKeyboard'

// ─── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ isOpen, onClose, total, onConfirm, isLoading, customer }) {
  const { currency_symbol: currencySymbol = 'GH₵' } = useSettings()
  const [method, setMethod] = useState('CASH')
  const [amountPaid, setAmountPaid] = useState('')
  // The parent mounts this modal only while it is open, so state starts fresh each time
  const [email, setEmail] = useState(customer?.email || '')
  const [errors, setErrors] = useState({})
  const [paystackLoading, setPaystackLoading] = useState(false)

  const paidEnough = amountPaid !== '' && toPesewas(amountPaid) >= toPesewas(total)
  const change = method === 'CASH' ? fromPesewas(toPesewas(amountPaid) - toPesewas(total)) : 0

  function validateCash() {
    const errs = {}
    if (!paidEnough) {
      errs.amountPaid = `Amount must be at least ${formatCurrency(total)}`
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateEmail() {
    const errs = {}
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'A valid email is required for Paystack payments'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleCashConfirm() {
    if (!validateCash()) return
    onConfirm({ payment_method: 'CASH', amount_paid: parseFloat(amountPaid) })
  }

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (method === 'CASH') {
          handleCashConfirm()
        } else {
          handlePaystackPay()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [method, amountPaid, email, total])

  async function handlePaystackPay() {
    if (!validateEmail()) return
    setPaystackLoading(true)

    try {
      // 1. Get a Paystack reference from our backend
      const initRes = await paymentsService.initialize(total, email.trim(), {
        pos_cashier: true,
        payment_method: method,
      })
      const { reference, access_code } = initRes.data.data

      // 2. Open Paystack popup (loaded via CDN script in index.html)
      const PaystackPop = window.PaystackPop
      if (!PaystackPop) {
        toast.error('Paystack script not loaded. Check your internet connection.')
        setPaystackLoading(false)
        return
      }

      const handler = PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: email.trim(),
        amount: toPesewas(total),
        currency: 'GHS',
        ref: reference,
        access_code,
        onSuccess(transaction) {
          // 3. Pass reference back — backend will verify before completing sale
          onConfirm({
            payment_method: method,
            amount_paid: total,
            reference: transaction.reference,
          })
        },
        onCancel() {
          toast('Payment cancelled.')
          setPaystackLoading(false)
        },
      })

      handler.openIframe()
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to initialize Paystack payment'
      toast.error(msg)
      setPaystackLoading(false)
    }
  }

  const methods = [
    { value: 'CASH', label: 'Cash' },
    { value: 'MOBILE_MONEY', label: 'Mobile Money' },
    { value: 'CARD', label: 'Card' },
  ]

  const isPaystack = method === 'MOBILE_MONEY' || method === 'CARD'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Process Payment" size="sm">
      <div className="space-y-4">
        {/* Total */}
        <div className="bg-primary-50 border border-primary-100 rounded-lg p-4 text-center">
          <p className="text-sm text-primary-600 font-medium">Amount Due</p>
          <p className="text-3xl font-bold text-primary-700 mt-1">{formatCurrency(total)}</p>
        </div>

        {/* Payment Method */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button
                key={m.value}
                onClick={() => { setMethod(m.value); setErrors({}) }}
                className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition ${
                  method === m.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cash: amount paid */}
        {method === 'CASH' && (
          <div className="space-y-2">
            <Input
              label={`Amount Paid (${currencySymbol})`}
              type="number"
              min={total}
              step="0.01"
              value={amountPaid}
              onChange={(e) => { setAmountPaid(e.target.value); setErrors({}) }}
              placeholder={Number(total || 0).toFixed(2)}
              error={errors.amountPaid}
            />
            {paidEnough && (
              <div className="flex justify-between items-center bg-success-50 border border-success-100 rounded-lg px-3 py-2">
                <span className="text-sm text-success-700">Change</span>
                <span className="font-bold text-success-700">{formatCurrency(change)}</span>
              </div>
            )}
          </div>
        )}

        {/* Paystack: email + pay button */}
        {isPaystack && (
          <div className="space-y-3">
            <Input
              label="Customer Email (required for Paystack)"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors({}) }}
              placeholder="customer@example.com"
              error={errors.email}
            />
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
              <span>A Paystack popup will open for the customer to complete payment.</span>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading || paystackLoading}>
            Cancel
          </Button>
          {method === 'CASH' ? (
            <Button variant="success" className="flex-1" onClick={handleCashConfirm} isLoading={isLoading}>
              Confirm Payment
            </Button>
          ) : (
            <Button variant="success" className="flex-1" onClick={handlePaystackPay} isLoading={paystackLoading || isLoading}>
              Pay with Paystack
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Customer Search Modal ─────────────────────────────────────────────────────
function CustomerModal({ isOpen, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) { setQuery(''); setResults([]) }
  }, [isOpen])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const id = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await customersService.list({ search: query, per_page: 10 })
        setResults(res.data?.data || [])
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 300)
    return () => clearTimeout(id)
  }, [query])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Customer" size="md">
      <div className="space-y-3">
        <Input
          placeholder="Search by name or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {isLoading && <p className="text-sm text-gray-400 text-center py-2">Searching...</p>}
        {!isLoading && results.length === 0 && query && (
          <p className="text-sm text-gray-400 text-center py-2">No customers found.</p>
        )}
        <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
          {results.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => { onSelect(c); onClose() }}
                className="w-full text-left px-4 py-3 hover:bg-primary-50 transition"
              >
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">{c.phone || c.email || 'No contact info'} &bull; {c.loyalty_points} pts</p>
              </button>
            </li>
          ))}
        </ul>
        <div className="pt-1">
          <Button variant="ghost" size="sm" onClick={() => { onSelect(null); onClose() }} className="w-full">
            Clear Customer (Walk-in)
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Cart Item Row ─────────────────────────────────────────────────────────────
function CartItem({ item, onUpdate, onRemove, onDiscountChange, onUnitChange, isSelected }) {
  const isDecimal = item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME'
  const step = isDecimal ? (item.unit === 'g' || item.unit === 'ml' ? 100 : 0.5) : 1
  const min = isDecimal ? 0.001 : 1

  return (
    <div className={`py-2.5 px-2.5 rounded-lg border transition ${
      isSelected ? 'border-primary-500 bg-primary-50/40 shadow-sm' : 'border-transparent border-b-gray-100 last:border-b-0'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
          <p className="text-xs text-gray-400">
            {formatCurrency(item.price)} / {item.pricing_unit || 'pcs'}
          </p>
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
        {/* Quantity controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdate(item.product_id, Math.max(min, Number((Number(item.quantity) - step).toFixed(3))))}
            className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition text-sm font-semibold"
          >
            −
          </button>
          <input
            type="number"
            min={min}
            step={isDecimal ? 'any' : '1'}
            value={item.quantity}
            onChange={(e) => {
              if (e.target.value === '') return
              const raw = parseFloat(e.target.value)
              if (isNaN(raw) || raw <= 0) return
              const val = isDecimal ? raw : Math.floor(raw)
              onUpdate(item.product_id, val)
            }}
            className="w-16 text-center text-sm border border-gray-200 rounded py-1 focus:outline-none focus:ring-1 focus:ring-primary-400 font-medium"
          />
          <button
            onClick={() => onUpdate(item.product_id, Number((Number(item.quantity) + step).toFixed(3)))}
            className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition text-sm font-semibold"
          >
            +
          </button>

          {/* Unit pill switchers for Weight / Volume */}
          {item.unit_category === 'WEIGHT' && (
            <div className="flex rounded border border-gray-200 overflow-hidden text-xs ml-1.5">
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
            <div className="flex rounded border border-gray-200 overflow-hidden text-xs ml-1.5">
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
            <span className="text-xs text-gray-400 font-medium ml-1.5">pcs</span>
          )}
        </div>

        {/* Item discount & Line total */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">disc:</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.discount || 0}
              onChange={(e) => onDiscountChange(item.product_id, Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-16 text-right text-xs border border-gray-200 rounded py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>

          <p className="text-sm font-bold text-gray-900 min-w-[70px] text-right">
            {formatCurrency(fromPesewas(lineTotalPesewas(item)))}
          </p>
        </div>
      </div>
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
  const { items, cartDiscount, customer, subtotal, tax, total, addItem, removeItem, updateQuantity, updateUnit, updateDiscount, setCartDiscount, setCustomer, clearCart } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [allProducts, setAllProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [completedSale, setCompletedSale] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const searchRef = useRef(null)

  // Load all products and categories on mount
  useEffect(() => {
    searchRef.current?.focus()

    async function loadInitialData() {
      setIsLoadingProducts(true)
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          productsService.list({ per_page: 100, is_active: true }),
          productsService.categories(),
        ])
        setAllProducts(productsRes.data?.data || [])
        setCategories(categoriesRes.data?.data || [])
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

  async function handleBarcodeSearch(barcode) {
    try {
      const res = await productsService.byBarcode(barcode)
      const product = res.data?.data
      if (product) {
        if (Number(product.quantity) <= 0) {
          toast.error(`${product.name} is out of stock`)
          return
        }
        handleAddProduct(product)
      } else {
        toast.error('Product not found for barcode: ' + barcode)
      }
    } catch {
      toast.error('Barcode lookup failed')
    }
  }

  // Hardware barcode scanner
  useBarcodeScanner((barcode) => {
    handleBarcodeSearch(barcode)
  })

  function handleAddProduct(product) {
    if (Number(product.quantity) <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }
    addItem(product)
    toast.success(`${product.name} added to cart`, { duration: 1500 })
    searchRef.current?.focus()
  }

  const isAnyModalOpen = showPaymentModal || showReceiptModal || showCustomerModal || showClearConfirm

  const {
    selectedProductIndex,
    selectedCartIndex,
    activeZone,
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
    onOpenPayment: () => setShowPaymentModal(true),
    onOpenClearConfirm: () => setShowClearConfirm(true),
    onOpenCustomerModal: () => setShowCustomerModal(true),
    isModalOpen: isAnyModalOpen,
    searchRef,
  })

  async function handlePaymentConfirm({ payment_method, amount_paid, reference }) {
    setIsSubmitting(true)
    try {
      const payload = {
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit: i.unit,
          discount: i.discount || 0,
        })),
        customer_id: customer?.id || null,
        payment_method,
        amount_paid,
        discount_amount: cartDiscount || 0,
        ...(reference ? { reference } : {}),
      }
      const res = await salesService.create(payload)
      const sale = res.data?.data
      setCompletedSale(sale)
      setShowPaymentModal(false)
      setShowReceiptModal(true)
      clearCart()
      toast.success('Sale completed successfully!')
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to process sale'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const itemCount = items.length

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
                <kbd className="bg-gray-200 px-1 rounded text-xs">F1</kbd> Search &nbsp;
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
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, SKU, or scan barcode… (F1)"
            className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); searchRef.current?.focus() }}
              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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
                const isSelected = activeZone === 'PRODUCTS' && selectedProductIndex === idx
                const isOut = Number(product.quantity) <= 0
                return (
                  <button
                    key={product.id}
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
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-bold text-primary-600">
                        {formatCurrency(product.price)}
                        {product.pricing_unit && product.pricing_unit !== 'pcs' ? ` / ${product.pricing_unit}` : ''}
                      </span>
                      <Badge variant={isOut ? 'danger' : Number(product.quantity) <= Number(product.low_stock_threshold) ? 'warning' : 'success'}>
                        {isOut ? 'Out' : formatQuantityWithUnit(product.quantity, product.base_unit)}
                      </Badge>
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
            {itemCount > 0 && (
              <Badge variant="primary">{itemCount} item{itemCount !== 1 ? 's' : ''}</Badge>
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

        {/* Customer selector */}
        <div className="px-4 py-2 border-b border-gray-100">
          <button
            onClick={() => setShowCustomerModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50 transition text-left"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {customer ? (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{customer.name}</p>
                <p className="text-xs text-gray-400">{customer.loyalty_points} loyalty points</p>
              </div>
            ) : (
              <span className="text-sm text-gray-400">Add customer (optional, F5)</span>
            )}
          </button>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4">
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
                  isSelected={activeZone === 'CART' && selectedCartIndex === idx}
                  onUpdate={updateQuantity}
                  onRemove={removeItem}
                  onDiscountChange={updateDiscount}
                  onUnitChange={(pid, unit) => updateUnit(pid, unit)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Totals + actions */}
        <div className="border-t border-gray-100 px-4 py-3 space-y-2.5">
          {/* Cart discount */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500 whitespace-nowrap">Cart Discount</label>
            <input
              type="number"
              min={0}
              max={subtotal}
              step="0.01"
              value={cartDiscount || ''}
              onChange={(e) => setCartDiscount(Math.min(parseFloat(e.target.value) || 0, subtotal))}
              placeholder="0.00"
              className="flex-1 text-right border border-gray-200 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Subtotal */}
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {(cartDiscount || 0) > 0 && (
            <div className="flex justify-between text-sm text-danger-600">
              <span>Discount</span>
              <span>-{formatCurrency(cartDiscount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax</span>
              <span>{formatCurrency(tax)}</span>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="text-base font-bold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-primary-600">{formatCurrency(total)}</span>
          </div>

          {/* Charge button */}
          <Button
            variant="success"
            size="lg"
            className="w-full text-base"
            disabled={items.length === 0}
            onClick={() => setShowPaymentModal(true)}
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
          onConfirm={handlePaymentConfirm}
          isLoading={isSubmitting}
          customer={customer}
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

      <CustomerModal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSelect={setCustomer}
      />

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
