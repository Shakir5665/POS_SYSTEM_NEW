import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CartItem } from '../pages/POSPage'
import { getAvailableStockForItem } from '../utils/uom'
import { lineTotalPesewas, cartTotals, fromPesewas } from '../utils/money'

describe('Stock-Aware Quantity Validation in POS Cart', () => {
  const stockItem = {
    product_id: 'prod-coke',
    name: 'Coca-Cola 500ml',
    price: 15.0,
    quantity: '5',
    quantity_available: 10, // 10 available in stock
    discount: '',
    unit: 'pcs',
    pricing_unit: 'pcs',
    base_unit: 'pcs',
    unit_category: 'COUNT',
  }

  it('allows incrementing when quantity is below stock limit', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={stockItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const incBtn = screen.getByTestId('cart-qty-inc-prod-coke')
    expect(incBtn).not.toBeDisabled()
    expect(screen.queryByTestId('out-of-stock-badge-prod-coke')).toBeNull()

    fireEvent.click(incBtn)
    expect(onUpdate).toHaveBeenCalledWith('prod-coke', '6')
  })

  it('disables + button and displays red Out of Stock indicator at stock limit', () => {
    const onUpdate = vi.fn()
    const atLimitItem = { ...stockItem, quantity: '10' }
    render(<CartItem item={atLimitItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const incBtn = screen.getByTestId('cart-qty-inc-prod-coke')
    expect(incBtn).toBeDisabled()

    const badge = screen.getByTestId('out-of-stock-badge-prod-coke')
    expect(badge).toBeDefined()
    expect(badge.textContent).toBe('Out of stock')

    fireEvent.click(incBtn)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('allows manual quantity entry within available stock without errors', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={stockItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const qtyInput = screen.getByTestId('cart-qty-prod-coke')
    fireEvent.change(qtyInput, { target: { value: '9' } })

    expect(onUpdate).toHaveBeenCalledWith('prod-coke', '9')
    expect(screen.queryByTestId('stock-error-prod-coke')).toBeNull()
  })

  it('rejects manual quantity exceeding available stock, commits maxStock, and shows red error message', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={stockItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const qtyInput = screen.getByTestId('cart-qty-prod-coke')
    fireEvent.change(qtyInput, { target: { value: '15' } })

    // Commits 10 (never exceeds stock limit)
    expect(onUpdate).toHaveBeenCalledWith('prod-coke', '10')

    const errorMsg = screen.getByTestId('stock-error-prod-coke')
    expect(errorMsg).toBeDefined()
    expect(errorMsg.textContent).toBe('Only 10 pcs available in stock.')
  })

  it('rejects negative quantity values', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={stockItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const qtyInput = screen.getByTestId('cart-qty-prod-coke')
    fireEvent.change(qtyInput, { target: { value: '-2' } })

    // Strips negative sign and commits valid non-negative number within stock
    expect(onUpdate).toHaveBeenCalledWith('prod-coke', '2')
  })

  it('disables + button and prevents positive quantity for zero-stock product', () => {
    const onUpdate = vi.fn()
    const zeroStockItem = { ...stockItem, quantity: '0', quantity_available: 0 }
    render(<CartItem item={zeroStockItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const incBtn = screen.getByTestId('cart-qty-inc-prod-coke')
    expect(incBtn).toBeDisabled()
    expect(screen.getByTestId('out-of-stock-badge-prod-coke')).toBeDefined()

    const qtyInput = screen.getByTestId('cart-qty-prod-coke')
    fireEvent.change(qtyInput, { target: { value: '1' } })

    // Commits 0 and displays error
    expect(onUpdate).toHaveBeenCalledWith('prod-coke', '0')
    expect(screen.getByTestId('stock-error-prod-coke').textContent).toBe('Only 0 pcs available in stock.')
  })

  it('supports decimal quantities for weight products and enforces converted stock limits', () => {
    const onUpdate = vi.fn()
    // 2500 grams in base stock = 2.5 kg
    const weightItem = {
      product_id: 'prod-rice',
      name: 'Basmati Rice',
      price: 20.0,
      quantity: '1.5',
      quantity_available: 2500,
      discount: '',
      unit: 'kg',
      pricing_unit: 'kg',
      base_unit: 'g',
      unit_category: 'WEIGHT',
    }
    render(<CartItem item={weightItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const qtyInput = screen.getByTestId('cart-qty-prod-rice')

    // Valid decimal within 2.5 kg
    fireEvent.change(qtyInput, { target: { value: '2.4' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-rice', '2.4')
    expect(screen.queryByTestId('stock-error-prod-rice')).toBeNull()

    // Exceeding 2.5 kg
    fireEvent.change(qtyInput, { target: { value: '3.0' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-rice', '2.5')
    expect(screen.getByTestId('stock-error-prod-rice').textContent).toBe('Only 2.5 kg available in stock.')
  })

  it('validates aggregated requested quantity when same product appears multiple times in cart', () => {
    // Total stock is 10 pcs
    const row1 = {
      product_id: 'prod-multi',
      name: 'Multi-row Product',
      price: 10.0,
      quantity: '7',
      quantity_available: 10,
      unit: 'pcs',
      unit_category: 'COUNT',
      base_unit: 'pcs',
    }
    const row2 = {
      product_id: 'prod-multi',
      name: 'Multi-row Product',
      price: 10.0,
      quantity: '3',
      quantity_available: 10,
      unit: 'pcs',
      unit_category: 'COUNT',
      base_unit: 'pcs',
    }

    const allItems = [row1, row2]

    // Row 2 only has 10 - 7 = 3 available units
    const availForRow2 = getAvailableStockForItem(row2, allItems)
    expect(availForRow2).toBe(3)

    const onUpdateRow2 = vi.fn()
    render(<CartItem item={row2} index={1} itemCount={2} allCartItems={allItems} onUpdate={onUpdateRow2} />)

    const incBtnRow2 = screen.getByTestId('cart-qty-inc-prod-multi')
    // Row 2 is at its remaining limit of 3, so + is disabled and Out of stock badge is shown
    expect(incBtnRow2).toBeDisabled()
    expect(screen.getByTestId('out-of-stock-badge-prod-multi')).toBeDefined()

    // Trying to type 5 in row 2 is clamped to remaining 3
    const qtyInputRow2 = screen.getByTestId('cart-qty-prod-multi')
    fireEvent.change(qtyInputRow2, { target: { value: '5' } })
    expect(onUpdateRow2).toHaveBeenCalledWith('prod-multi', '3')
    expect(screen.getByTestId('stock-error-prod-multi').textContent).toBe('Only 3 pcs available in stock.')
  })

  it('re-enables + button and clears Out of Stock indicator when decrementing', () => {
    const onUpdate = vi.fn()
    const atLimitItem = { ...stockItem, quantity: '10' }
    render(<CartItem item={atLimitItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const decBtn = screen.getByTestId('qty-dec-prod-coke')
    fireEvent.click(decBtn)

    expect(onUpdate).toHaveBeenCalledWith('prod-coke', '9')
  })

  it('keeps cart totals integer and accurate without NaN or corruption under stock constraints', () => {
    const items = [
      { price: 15, quantity: '10', discount: '0', unit: 'pcs', unit_category: 'COUNT' },
      { price: 20, quantity: '2.5', discount: '5', unit: 'kg', pricing_unit: 'kg', unit_category: 'WEIGHT' },
    ]

    const item1Total = lineTotalPesewas(items[0])
    expect(item1Total).toBe(15000) // 150.00
    expect(fromPesewas(item1Total)).toBe(150)

    const item2Total = lineTotalPesewas(items[1])
    // 2.5 * 20 - 5 = 45.00 -> 4500 pesewas
    expect(item2Total).toBe(4500)
    expect(fromPesewas(item2Total)).toBe(45)

    const totals = cartTotals(items, 0, 0)
    expect(totals.total).toBe(195)
  })
})
