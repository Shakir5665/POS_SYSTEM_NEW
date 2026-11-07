import { useState, useEffect, useRef } from 'react'
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

// ─── Payment Modal (Cash Only) ──────────────────────────────────────────────────
function PaymentModal({ isOpen, onClose, total, onConfirm, isLoading }) {
  const { currency_symbol: currencySymbol = 'GH₵' } = useSettings()
  const [amountPaid, setAmountPaid] = useState('')
  const [errors, setErrors] = useState({})

  const paidEnough = amountPaid !== '' && toPesewas(amountPaid) >= toPesewas(total)
  const change = paidEnough ? fromPesewas(toPesewas(amountPaid) - toPesewas(total)) : 0

  function validateCash() {
    const errs = {}
    if (!amountPaid || !paidEnough) {
      errs.amountPaid = `Amount must be at least ${formatCurrency(total)}`
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
        handleCashConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [amountPaid, total])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cash Payment" size="sm">
      <div className="space-y-4">
        {/* Total Due */}
        <div className="bg-primary-50 border border-primary-100 rounded-lg p-4 text-center">
          <p className="text-sm text-primary-600 font-medium">Amount Due</p>
          <p className="text-3xl font-bold text-primary-700 mt-1">{formatCurrency(total)}</p>
        </div>

        {/* Cash: amount received */}
        <div className="space-y-2">
          <Input
            label={`Cash Received (${currencySymbol})`}
            type="number"
            step="any"
            autoFocus
            value={amountPaid}
            onChange={(e) => { setAmountPaid(e.target.value); setErrors({}) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCashConfirm()
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
              Exact Cash ({formatCurrency(total)})
            </button>
          </div>
          {paidEnough && (
            <div className="flex justify-between items-center bg-success-50 border border-success-100 rounded-lg px-3 py-2">
              <span className="text-sm text-success-700 font-medium">Change</span>
              <span className="font-bold text-success-700 text-lg">{formatCurrency(change)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="success" className="flex-1" onClick={handleCashConfirm} isLoading={isLoading}>
            Confirm Payment
          </Button>
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
export function CartItem({
  item,
  index = 0,
  itemCount = 1,
  allCartItems = [],
  productData = null,
  onUpdate,
  onRemove,
  onDiscountChange,
  onUnitChange,
  isSelected,
  isLastAdded,
}) {
  const qtyInputRef = useRef(null)
  const discountInputRef = useRef(null)
  const [stockError, setStockError] = useState('')

  const maxStock = getAvailableStockForItem(item, allCartItems, productData)
  const current = item.quantity === '' ? 0 : parseFloat(item.quantity)
  const currentVal = isNaN(current) ? 0 : current
  const isAtStockLimit = maxStock <= 0 || currentVal >= maxStock

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
    const qty = parseFloat(item.quantity) || 0
    const disc = parseFloat(item.discount) || 0
    if (disc > 0) {
      let pricingQty = qty
      if (item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME') {
        const factorSelling = item.unit === 'g' || item.unit === 'ml' ? 1 : 1000
        const factorPricing = (item.pricing_unit || 'kg') === 'g' || (item.pricing_unit || 'L') === 'ml' ? 1 : 1000
        pricingQty = (qty * factorSelling) / factorPricing
      }
      const maxDiscount = Number((pricingQty * Number(item.price)).toFixed(2))
      if (disc > maxDiscount) {
        onDiscountChange(item.product_id, maxDiscount > 0 ? String(maxDiscount) : '')
      }
    }
  }

  function handleDiscountChange(val) {
    if (val === '') {
      onDiscountChange(item.product_id, '')
      return
    }

    if (val.includes('-')) {
      val = val.replace(/-/g, '')
      if (val === '') {
        onDiscountChange(item.product_id, '')
        return
      }
    }

    val = val.replace(/[^\d.]/g, '')
    const parts = val.split('.')
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('')
    }
    if (parts.length === 2 && parts[1].length > 2) {
      val = parts[0] + '.' + parts[1].slice(0, 2)
    }

    if (val === '.') {
      onDiscountChange(item.product_id, '0.')
      return
    }

    const num = parseFloat(val)
    if (isNaN(num)) return
    if (num < 0) {
      onDiscountChange(item.product_id, '0')
      return
    }

    const qty = parseFloat(item.quantity) || 0
    if (qty > 0) {
      let pricingQty = qty
      if (item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME') {
        const factorSelling = item.unit === 'g' || item.unit === 'ml' ? 1 : 1000
        const factorPricing = (item.pricing_unit || 'kg') === 'g' || (item.pricing_unit || 'L') === 'ml' ? 1 : 1000
        pricingQty = (qty * factorSelling) / factorPricing
      }
      const maxDiscount = Number((pricingQty * Number(item.price)).toFixed(2))
      if (num > maxDiscount) {
        onDiscountChange(item.product_id, String(maxDiscount))
        return
      }
    }

    onDiscountChange(item.product_id, val)
  }

  function handleDiscountBlur() {
    const num = parseFloat(item.discount)
    if (isNaN(num) || num <= 0) {
      if (item.discount !== '' && item.discount !== '0') onDiscountChange(item.product_id, '')
      return
    }
    const qty = parseFloat(item.quantity) || 0
    if (qty > 0) {
      let pricingQty = qty
      if (item.unit_category === 'WEIGHT' || item.unit_category === 'VOLUME') {
        const factorSelling = item.unit === 'g' || item.unit === 'ml' ? 1 : 1000
        const factorPricing = (item.pricing_unit || 'kg') === 'g' || (item.pricing_unit || 'L') === 'ml' ? 1 : 1000
        pricingQty = (qty * factorSelling) / factorPricing
      }
      const maxDiscount = Number((pricingQty * Number(item.price)).toFixed(2))
      if (num > maxDiscount) {
        onDiscountChange(item.product_id, String(maxDiscount))
      }
    }
  }

  function handleQtyKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (index < itemCount - 1) {
        const nextInput = document.getElementById(`cart-qty-${index + 1}`)
        if (nextInput) {
          nextInput.focus()
          nextInput.select()
        }
      } else {
        qtyInputRef.current?.focus()
        qtyInputRef.current?.select()
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (index > 0) {
        const prevInput = document.getElementById(`cart-qty-${index - 1}`)
        if (prevInput) {
          prevInput.focus()
          prevInput.select()
        }
      } else {
        qtyInputRef.current?.focus()
        qtyInputRef.current?.select()
      }
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (discountInputRef.current) {
        discountInputRef.current.focus()
        discountInputRef.current.select()
      } else {
        const discInput = document.getElementById(`cart-discount-${index}`)
        if (discInput) {
          discInput.focus()
          discInput.select()
        }
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (index < itemCount - 1) {
        const nextInput = document.getElementById(`cart-qty-${index + 1}`)
        if (nextInput) {
          nextInput.focus()
          nextInput.select()
        }
      } else if (discountInputRef.current) {
        discountInputRef.current.focus()
        discountInputRef.current.select()
      }
      return
    }
  }

  function handleDiscountKeyDown(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      qtyInputRef.current?.focus()
      qtyInputRef.current?.select()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (index < itemCount - 1) {
        const nextDisc = document.getElementById(`cart-discount-${index + 1}`)
        if (nextDisc) {
          nextDisc.focus()
          nextDisc.select()
        }
      } else {
        discountInputRef.current?.focus()
        discountInputRef.current?.select()
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (index > 0) {
        const prevDisc = document.getElementById(`cart-discount-${index - 1}`)
        if (prevDisc) {
          prevDisc.focus()
          prevDisc.select()
        }
      } else {
        discountInputRef.current?.focus()
        discountInputRef.current?.select()
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (index < itemCount - 1) {
        const nextQty = document.getElementById(`cart-qty-${index + 1}`)
        if (nextQty) {
          nextQty.focus()
          nextQty.select()
        }
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
        {/* Quantity control with - / + buttons */}
        <div className="flex items-center gap-1.5">
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

          {/* Red Out of stock indicator beside the + button when stock limit is reached */}
          {isAtStockLimit && (
            <span
              data-testid={`out-of-stock-badge-${item.product_id}`}
              className="text-xs font-semibold text-danger-600 bg-danger-50 border border-danger-200 px-1.5 py-0.5 rounded whitespace-nowrap"
            >
              Out of stock
            </span>
          )}

          {/* Unit pill switchers for Weight / Volume */}
          {item.unit_category === 'WEIGHT' && (
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs ml-1">
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
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs ml-1">
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
            <span className="text-xs text-gray-400 font-medium ml-1">{item.unit || item.base_unit || 'pcs'}</span>
          )}
        </div>

        {/* Item discount & Line total */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-gray-500">Disc:</span>
            <input
              ref={discountInputRef}
              id={`cart-discount-${index}`}
              data-testid={`cart-discount-${item.product_id}`}
              data-cart-index={index}
              data-field="discount"
              type="text"
              inputMode="decimal"
              value={item.discount}
              onChange={(e) => handleDiscountChange(e.target.value)}
              onKeyDown={handleDiscountKeyDown}
              onBlur={handleDiscountBlur}
              placeholder="0.00"
              aria-label={`Discount for ${item.name}`}
              className="w-16 text-right text-sm border border-gray-200 rounded-lg py-1 px-2 focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium bg-white"
            />
          </div>

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
  const isAnyModalOpen = showPaymentModal || showReceiptModal || showCustomerModal || showClearConfirm

  const searchRef = useRef(null)
  const cartContainerRef = useRef(null)
  const cartEndRef = useRef(null)
  const [lastAddedId, setLastAddedId] = useState(null)
  const lastScanRef = useRef({ code: '', time: 0 })

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
    onOpenPayment: () => handleOpenPayment(),
    onOpenClearConfirm: () => setShowClearConfirm(true),
    onOpenCustomerModal: () => setShowCustomerModal(true),
    isModalOpen: isAnyModalOpen,
    searchRef,
  })

  function handleOpenPayment() {
    if (items.length === 0) return
    const unentered = items.find(
      (i) => i.quantity === '' || isNaN(parseFloat(i.quantity)) || parseFloat(i.quantity) <= 0
    )
    if (unentered) {
      toast.error(`Please enter a quantity for ${unentered.name}`)
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                const q = searchQuery.trim()
                if (q) {
                  handleBarcodeSearch(q)
                }
              }
            }}
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
                  onDiscountChange={updateDiscount}
                  onUnitChange={(pid, unit) => updateUnit(pid, unit)}
                />
              ))}
              <div ref={cartEndRef} />
            </div>
          )}
        </div>

        {/* Totals + actions */}
        <div className="border-t border-gray-100 px-4 py-3 space-y-2.5">
          {/* Cart discount */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Cart Discount</label>
            <input
              type="text"
              inputMode="decimal"
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
              className="flex-1 text-right border border-gray-200 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium bg-white"
            />
          </div>

          {/* Subtotal */}
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {(parseFloat(cartDiscount) || 0) > 0 && (
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
          onConfirm={handlePaymentConfirm}
          isLoading={isSubmitting}
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
