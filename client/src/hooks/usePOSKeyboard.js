import { useState, useEffect, useRef } from 'react'

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

      const isInputFocused =
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA' ||
          document.activeElement.tagName === 'SELECT')

      // If search input is focused:
      if (document.activeElement === searchRef.current) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (products.length > 0) {
            setActiveZone('PRODUCTS')
            setSelectedProductIndex(0)
            searchRef.current?.blur()
          }
          return
        }
        if (e.key === 'Enter') {
          // If only 1 product matches, or user presses enter in search, add the selected/first product
          if (products.length > 0) {
            e.preventDefault()
            const target = products[selectedProductIndex] || products[0]
            if (target) {
              onAddProduct?.(target)
            }
          }
          return
        }
        return
      }

      // If another input is focused, don't intercept standard editing keys
      if (isInputFocused) return

      // Product grid navigation
      if (activeZone === 'PRODUCTS') {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          setSelectedProductIndex((i) => Math.min(products.length - 1, i + 1))
          return
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setSelectedProductIndex((i) => Math.max(0, i - 1))
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedProductIndex((i) => Math.min(products.length - 1, i + 4)) // assume ~4 columns
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (selectedProductIndex < 4) {
            setActiveZone('SEARCH')
            searchRef.current?.focus()
          } else {
            setSelectedProductIndex((i) => Math.max(0, i - 4))
          }
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const prod = products[selectedProductIndex]
          if (prod) onAddProduct?.(prod)
          return
        }
        if (e.key === 'Tab') {
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
  }
}
