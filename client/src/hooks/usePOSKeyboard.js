import { useState, useEffect } from 'react'

/** Matches the POS product grid: 2 / sm:3 / lg:4 columns. */
export function getPosProductColumnCount() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1024
  if (w >= 1024) return 4
  if (w >= 640) return 3
  return 2
}

function clampIndex(i, length) {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, i))
}

/**
 * State machine and shortcut handler for the keyboard-first POS experience.
 */
export function usePOSKeyboard({
  products = [],
  cartItems = [],
  onAddProduct,
  onUpdateCartQuantity,
  onRemoveCartItem,
  onToggleCartUnit,
  onOpenPayment,
  onOpenClearConfirm,
  onOpenCustomerModal,
  isModalOpen = false,
  searchRef,
}) {
  const [selectedProductIndex, setSelectedProductIndex] = useState(0)
  const [selectedCartIndex, setSelectedCartIndex] = useState(-1)
  const [activeZone, setActiveZone] = useState('SEARCH') // 'SEARCH' | 'PRODUCTS' | 'CART'
  const [productColumnCount, setProductColumnCount] = useState(getPosProductColumnCount)

  useEffect(() => {
    function onResize() {
      setProductColumnCount(getPosProductColumnCount())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Reset indices when lists change
  useEffect(() => {
    if (selectedProductIndex >= products.length) {
      setSelectedProductIndex(Math.max(0, products.length - 1))
    }
  }, [products.length, selectedProductIndex])

  useEffect(() => {
    if (cartItems.length === 0) {
      setSelectedCartIndex(-1)
    } else if (selectedCartIndex >= cartItems.length) {
      setSelectedCartIndex(cartItems.length - 1)
    }
  }, [cartItems.length, selectedCartIndex])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.defaultPrevented) return
      // If a modal is open, let modal handle its own keys (Tab, Esc, Enter)
      if (isModalOpen) return

      // Global F-Keys
      if (e.key === 'F1') {
        e.preventDefault()
        setActiveZone('SEARCH')
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }

      if (e.key === 'F2') {
        e.preventDefault()
        if (cartItems.length > 0) {
          onOpenPayment?.()
        }
        return
      }

      if (e.key === 'F4') {
        e.preventDefault()
        if (cartItems.length > 0) {
          onOpenClearConfirm?.()
        }
        return
      }

      if (e.key === 'F5') {
        e.preventDefault()
        onOpenCustomerModal?.()
        return
      }

      // Shortcut 'S' / 's' to immediately activate product search (even from quantity editing box)
      if ((e.key === 's' || e.key === 'S' || e.code === 'KeyS') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // If product search input is already focused, let user type 's' or 'S' normally
        if (document.activeElement === searchRef.current) {
          return
        }

        // If customer search text input is focused, let user type 's' or 'S' normally
        if (document.activeElement?.getAttribute('data-testid') === 'customer-search-inline-input') {
          return
        }

        e.preventDefault()
        setActiveZone('SEARCH')
        if (searchRef.current) {
          searchRef.current.focus()
          searchRef.current.select?.()
        }
        return
      }

      const isInputFocused =
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA' ||
          document.activeElement.tagName === 'SELECT')

      // If search input is focused, search input's onKeyDown handles arrows and Enter directly
      if (document.activeElement === searchRef.current) {
        return
      }

      // If another input is focused (cart qty, our-price, discount), don't intercept
      if (isInputFocused) return

      const cols = productColumnCount || 2

      // Product grid: left / right / up / down. Skip while the cart list is the active zone
      // so existing cart arrow, +/-, Delete, and U shortcuts stay unchanged.
      if (activeZone !== 'CART' && products.length > 0) {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          setActiveZone('PRODUCTS')
          setSelectedProductIndex((i) => clampIndex(i + 1, products.length))
          return
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setActiveZone('PRODUCTS')
          setSelectedProductIndex((i) => clampIndex(i - 1, products.length))
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveZone('PRODUCTS')
          setSelectedProductIndex((i) => clampIndex(i + cols, products.length))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (selectedProductIndex < cols) {
            setActiveZone('SEARCH')
            searchRef.current?.focus()
          } else {
            setActiveZone('PRODUCTS')
            setSelectedProductIndex((i) => clampIndex(i - cols, products.length))
          }
          return
        }
        if (e.key === 'Enter' && activeZone === 'PRODUCTS') {
          e.preventDefault()
          const prod = products[selectedProductIndex]
          if (prod) onAddProduct?.(prod)
          return
        }
        if (e.key === 'Tab' && activeZone === 'PRODUCTS') {
          e.preventDefault()
          if (cartItems.length > 0) {
            setActiveZone('CART')
            setSelectedCartIndex(0)
          } else {
            setActiveZone('SEARCH')
            searchRef.current?.focus()
          }
          return
        }
      }

      // Cart navigation
      if (activeZone === 'CART' && cartItems.length > 0) {
        const currentItem = cartItems[selectedCartIndex >= 0 ? selectedCartIndex : 0]

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedCartIndex((i) => Math.min(cartItems.length - 1, i + 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedCartIndex((i) => Math.max(0, i - 1))
          return
        }
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          if (currentItem) {
            const step = currentItem.unit_category === 'COUNT' ? 1 : currentItem.unit === 'g' || currentItem.unit === 'ml' ? 100 : 0.5
            onUpdateCartQuantity?.(currentItem.product_id, Number((Number(currentItem.quantity) + step).toFixed(3)))
          }
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          if (currentItem) {
            const step = currentItem.unit_category === 'COUNT' ? 1 : currentItem.unit === 'g' || currentItem.unit === 'ml' ? 100 : 0.5
            const nextQty = Number((Number(currentItem.quantity) - step).toFixed(3))
            if (nextQty > 0) {
              onUpdateCartQuantity?.(currentItem.product_id, nextQty)
            } else {
              onRemoveCartItem?.(currentItem.product_id)
            }
          }
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          if (currentItem) {
            onRemoveCartItem?.(currentItem.product_id)
          }
          return
        }
        if (e.key === 'u' || e.key === 'U') {
          e.preventDefault()
          if (currentItem) {
            onToggleCartUnit?.(currentItem.product_id)
          }
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          setActiveZone('SEARCH')
          searchRef.current?.focus()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    products,
    cartItems,
    selectedProductIndex,
    selectedCartIndex,
    activeZone,
    productColumnCount,
    isModalOpen,
    onAddProduct,
    onUpdateCartQuantity,
    onRemoveCartItem,
    onToggleCartUnit,
    onOpenPayment,
    onOpenClearConfirm,
    onOpenCustomerModal,
    searchRef,
  ])

  return {
    selectedProductIndex,
    setSelectedProductIndex,
    selectedCartIndex,
    setSelectedCartIndex,
    activeZone,
    setActiveZone,
    productColumnCount,
  }
}
