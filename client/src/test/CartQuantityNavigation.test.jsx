import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CartItem } from '../pages/POSPage'
import { lineTotalPesewas, cartTotals, fromPesewas } from '../utils/money'

describe('Cart Quantity and Stepper Controls', () => {
  const countProduct = {
    product_id: 'prod-1',
    name: 'Coca Cola 500ml',
    price: 15.0,
    quantity: '2',
    discount: '',
    unit: 'pcs',
    pricing_unit: 'pcs',
    unit_category: 'COUNT',
  }

  const weightProduct = {
    product_id: 'prod-2',
    name: 'Basmati Rice',
    price: 20.0,
    quantity: '1.5',
    discount: '',
    unit: 'kg',
    pricing_unit: 'kg',
    unit_category: 'WEIGHT',
  }

  it('increments quantity by 1 when + button is clicked', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={countProduct} index={0} itemCount={1} onUpdate={onUpdate} />)

    const incBtn = screen.getByRole('button', { name: /increase quantity/i })
    fireEvent.click(incBtn)

    expect(onUpdate).toHaveBeenCalledWith('prod-1', '3')
  })

  it('increments quantity from empty to 1', () => {
    const onUpdate = vi.fn()
    const emptyItem = { ...countProduct, quantity: '' }
    render(<CartItem item={emptyItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const incBtn = screen.getByRole('button', { name: /increase quantity/i })
    fireEvent.click(incBtn)

    expect(onUpdate).toHaveBeenCalledWith('prod-1', '1')
  })

  it('increments quantity from 0 to 1', () => {
    const onUpdate = vi.fn()
    const zeroItem = { ...countProduct, quantity: '0' }
    render(<CartItem item={zeroItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const incBtn = screen.getByRole('button', { name: /increase quantity/i })
    fireEvent.click(incBtn)

    expect(onUpdate).toHaveBeenCalledWith('prod-1', '1')
  })

  it('decrements quantity by 1 when − button is clicked', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={countProduct} index={0} itemCount={1} onUpdate={onUpdate} />)

    const decBtn = screen.getByRole('button', { name: /decrease quantity/i })
    fireEvent.click(decBtn)

    expect(onUpdate).toHaveBeenCalledWith('prod-1', '1')
  })

  it('does not reduce quantity below zero when decrementing a zero or empty quantity', () => {
    const onUpdate = vi.fn()
    const zeroItem = { ...countProduct, quantity: '0' }
    render(<CartItem item={zeroItem} index={0} itemCount={1} onUpdate={onUpdate} />)

    const decBtn = screen.getByRole('button', { name: /decrease quantity/i })
    fireEvent.click(decBtn)

    expect(onUpdate).toHaveBeenCalledWith('prod-1', '0')
  })

  it('allows manual typing and allows quantity to start at 0 or empty', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={countProduct} index={0} itemCount={1} onUpdate={onUpdate} />)

    const input = screen.getByRole('textbox', { name: /quantity for/i })
    fireEvent.change(input, { target: { value: '0' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-1', '0')

    fireEvent.change(input, { target: { value: '' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-1', '')

    fireEvent.change(input, { target: { value: '5' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-1', '5')
  })

  it('supports decimal quantities for weight products', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={weightProduct} index={0} itemCount={1} onUpdate={onUpdate} />)

    const input = screen.getByRole('textbox', { name: /quantity for/i })
    fireEvent.change(input, { target: { value: '2.75' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-2', '2.75')
  })

  it('rejects decimal input for COUNT items', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={countProduct} index={0} itemCount={1} onUpdate={onUpdate} />)

    const input = screen.getByRole('textbox', { name: /quantity for/i })
    fireEvent.change(input, { target: { value: '2.5' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-1', '2')
  })
})

describe('Input Validation and Negative Rejections', () => {
  const item = {
    product_id: 'prod-val',
    name: 'Validation Test Product',
    price: 50.0,
    quantity: '2',
    discount: '',
    unit: 'pcs',
    pricing_unit: 'pcs',
    unit_category: 'COUNT',
  }

  it('rejects negative quantity values', () => {
    const onUpdate = vi.fn()
    render(<CartItem item={item} index={0} itemCount={1} onUpdate={onUpdate} />)

    const qtyInput = screen.getByRole('textbox', { name: /quantity for/i })
    fireEvent.change(qtyInput, { target: { value: '-3' } })
    expect(onUpdate).toHaveBeenCalledWith('prod-val', '3')
  })

  it('toggles predefined discount when checkbox is toggled', () => {
    const onToggleDiscount = vi.fn()
    const discountedItem = {
      ...item,
      usual_price: 60,
      our_price: 50,
      apply_predefined_discount: true,
    }
    render(<CartItem item={discountedItem} index={0} itemCount={1} onToggleDiscount={onToggleDiscount} />)

    const toggle = screen.getByTestId('predefined-discount-toggle-prod-val')
    expect(toggle).toBeDefined()
    expect(toggle.checked).toBe(true)

    fireEvent.click(toggle)
    expect(onToggleDiscount).toHaveBeenCalledWith('prod-val', false)
  })

  it('renders predefined discount as disabled when apply_predefined_discount is false', () => {
    const onToggleDiscount = vi.fn()
    const discountedItem = {
      ...item,
      usual_price: 60,
      our_price: 50,
      apply_predefined_discount: false,
    }
    render(<CartItem item={discountedItem} index={0} itemCount={1} onToggleDiscount={onToggleDiscount} />)

    const toggle = screen.getByTestId('predefined-discount-toggle-prod-val')
    expect(toggle.checked).toBe(false)
    expect(screen.getByText('Disabled')).toBeDefined()
  })

  it('lets the cashier edit our price for this cart line only', () => {
    const onOurPriceChange = vi.fn()
    const discountedItem = {
      ...item,
      usual_price: 60,
      our_price: 50,
      catalog_our_price: 50,
      apply_predefined_discount: true,
    }
    render(
      <CartItem
        item={discountedItem}
        index={0}
        itemCount={1}
        onUpdate={vi.fn()}
        onOurPriceChange={onOurPriceChange}
      />
    )

    const priceInput = screen.getByTestId('cart-our-price-prod-val')
    expect(priceInput.value).toBe('50')

    fireEvent.change(priceInput, { target: { value: '45.5' } })
    expect(onOurPriceChange).toHaveBeenCalledWith('prod-val', 45.5)
  })
})

describe('Keyboard Navigation', () => {
  function MultiItemCart() {
    const items = [
      { product_id: 'p1', name: 'Product 1', price: 10, quantity: '2', discount: '', unit: 'pcs', unit_category: 'COUNT' },
      { product_id: 'p2', name: 'Product 2', price: 20, quantity: '5', discount: '2.00', unit: 'pcs', unit_category: 'COUNT' },
      { product_id: 'p3', name: 'Product 3', price: 30, quantity: '1', discount: '', unit: 'pcs', unit_category: 'COUNT' },
    ]

    return (
      <div>
        {items.map((item, idx) => (
          <CartItem
            key={item.product_id}
            item={item}
            index={idx}
            itemCount={items.length}
            onUpdate={vi.fn()}
            onRemove={vi.fn()}
            onDiscountChange={vi.fn()}
            onUnitChange={vi.fn()}
          />
        ))}
      </div>
    )
  }

  it('moves focus to the next item quantity and calls select on ArrowDown', () => {
    render(<MultiItemCart />)

    const qty0 = screen.getByTestId('cart-qty-p1')
    const qty1 = screen.getByTestId('cart-qty-p2')
    const qty2 = screen.getByTestId('cart-qty-p3')

    const selectSpy = vi.spyOn(qty1, 'select')
    qty0.focus()

    fireEvent.keyDown(qty0, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(qty1)
    expect(selectSpy).toHaveBeenCalled()

    // Move to 3rd item
    const selectSpy2 = vi.spyOn(qty2, 'select')
    fireEvent.keyDown(qty1, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(qty2)
    expect(selectSpy2).toHaveBeenCalled()
  })

  it('stops at the last cart item on ArrowDown and keeps focus', () => {
    render(<MultiItemCart />)

    const qty2 = screen.getByTestId('cart-qty-p3')
    qty2.focus()

    const selectSpy = vi.spyOn(qty2, 'select')
    fireEvent.keyDown(qty2, { key: 'ArrowDown' })

    // Stays focused on the last item
    expect(document.activeElement).toBe(qty2)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('moves focus to the next item quantity on Enter, and to Additional Cart Discount only on the last item', () => {
    render(
      <div>
        <MultiItemCart />
        <input data-testid="additional-cart-discount-input" />
      </div>
    )

    const qty0 = screen.getByTestId('cart-qty-p1')
    const qty1 = screen.getByTestId('cart-qty-p2')
    const qty2 = screen.getByTestId('cart-qty-p3')
    const discountInput = screen.getByTestId('additional-cart-discount-input')
    const discountFocusSpy = vi.spyOn(discountInput, 'focus')

    // 1. Enter on first item (qty0) moves focus to second item (qty1)
    qty0.focus()
    fireEvent.keyDown(qty0, { key: 'Enter' })
    expect(document.activeElement).toBe(qty1)
    expect(discountFocusSpy).not.toHaveBeenCalled()

    // 2. Enter on second item (qty1) moves focus to third item (qty2)
    fireEvent.keyDown(qty1, { key: 'Enter' })
    expect(document.activeElement).toBe(qty2)
    expect(discountFocusSpy).not.toHaveBeenCalled()

    // 3. Enter on LAST item (qty2) moves focus to Additional Cart Discount
    fireEvent.keyDown(qty2, { key: 'Enter' })
    expect(discountFocusSpy).toHaveBeenCalled()
  })

  it('moves focus to the previous item quantity on ArrowUp', () => {
    render(<MultiItemCart />)

    const qty0 = screen.getByTestId('cart-qty-p1')
    const qty1 = screen.getByTestId('cart-qty-p2')

    const selectSpy = vi.spyOn(qty0, 'select')
    qty1.focus()

    fireEvent.keyDown(qty1, { key: 'ArrowUp' })

    expect(document.activeElement).toBe(qty0)
    expect(selectSpy).toHaveBeenCalled()
  })
})

describe('Cart Calculations Integrity', () => {
  it('correctly calculates line total and handles 0 or empty quantity without NaN', () => {
    const itemEmpty = { price: 25, quantity: '', discount: '' }
    expect(lineTotalPesewas(itemEmpty)).toBe(0)

    const itemZero = { price: 25, quantity: '0', discount: '' }
    expect(lineTotalPesewas(itemZero)).toBe(0)

    const itemValid = { price: 25, quantity: '3', discount: '5' }
    // 3 * 25.00 - 5.00 = 70.00 -> 7000 pesewas
    expect(lineTotalPesewas(itemValid)).toBe(7000)
    expect(fromPesewas(lineTotalPesewas(itemValid))).toBe(70)
  })

  it('correctly computes cart totals with multiple items, discounts and taxes', () => {
    const items = [
      { price: 10, quantity: '2', discount: '0' }, // 20
      { price: 15, quantity: '1', discount: '5' }, // 10
    ]
    const totals = cartTotals(items, '2', 10) // subtotal 30, discount 2 -> taxable 28, 10% tax = 2.80, total = 30.80
    expect(totals.subtotal).toBe(30)
    expect(totals.discount).toBe(2)
    expect(totals.tax).toBe(2.8)
    expect(totals.total).toBe(30.8)
  })
})
