import { useState, useEffect } from 'react'

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

  // Derive clamped values during render:
  const safeProductIndex = products.length === 0
    ? 0
    : Math.min(selectedProductIndex, products.length - 1)

  const safeCartIndex = cartItems.length === 0
    ? -1
    : Math.min(selectedCartIndex, cartItems.length - 1)

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
          setSelectedProductIndex(Math.min(products.length - 1, safeProductIndex + 1))
          return
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setSelectedProductIndex(Math.max(0, safeProductIndex - 1))
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedProductIndex(Math.min(products.length - 1, safeProductIndex + 4)) // assume ~4 columns
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (safeProductIndex < 4) {
            setActiveZone('SEARCH')
            searchRef.current?.focus()
          } else {
            setSelectedProductIndex(Math.max(0, safeProductIndex - 4))
          }
          return
        }
        if (e.key === 'Enter' && activeZone === 'PRODUCTS') {
          e.preventDefault()
          const prod = products[safeProductIndex]
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
        const currentItem = cartItems[safeCartIndex >= 0 ? safeCartIndex : 0]

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedCartIndex(Math.min(cartItems.length - 1, (safeCartIndex >= 0 ? safeCartIndex : 0) + 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedCartIndex(Math.max(0, (safeCartIndex >= 0 ? safeCartIndex : 0) - 1))
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
    safeProductIndex,
    safeCartIndex,
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
    selectedProductIndex: safeProductIndex,
    setSelectedProductIndex,
    selectedCartIndex: safeCartIndex,
    setSelectedCartIndex,
    activeZone,
    setActiveZone,
    productColumnCount,
  }
}
