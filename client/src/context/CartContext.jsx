import { useReducer } from 'react'
import { CartContext } from './contexts'
import { useSettings } from '../hooks/useSettings'
import { cartTotals } from '../utils/money'
import { getUnitFactor } from '../utils/uom'

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const product = action.payload
      const existing = state.items.find((i) => i.product_id === product.product_id)
      if (existing) {
        const step = existing.unit_category === 'COUNT' ? 1 : (existing.unit === 'g' || existing.unit === 'ml' ? 100 : 1)
        return {
          ...state,
          items: state.items.map((i) =>
            i.product_id === product.product_id
              ? { ...i, quantity: Number((Number(i.quantity) + step).toFixed(3)) }
              : i
          ),
        }
      }
      const initialUnit = product.pricing_unit || product.base_unit || 'pcs'
      const initialQty = ''
      return {
        ...state,
        items: [
          ...state.items,
          {
            ...product,
            unit: initialUnit,
            quantity: initialQty,
            discount: '',
          },
        ],
      }
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.product_id !== action.payload) }
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map((i) =>
          i.product_id === action.payload.product_id ? { ...i, quantity: action.payload.quantity } : i
        ),
      }
    case 'UPDATE_UNIT': {
      const { product_id, newUnit } = action.payload
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.product_id !== product_id) return i
          if (i.unit === newUnit) return i
          const factorOld = getUnitFactor(i.unit_category, i.unit)
          const factorNew = getUnitFactor(i.unit_category, newUnit)
          const newQty = Number(((Number(i.quantity) * factorOld) / factorNew).toFixed(3))
          return {
            ...i,
            unit: newUnit,
            quantity: newQty > 0 ? newQty : 1,
          }
        }),
      }
    }
    case 'UPDATE_DISCOUNT':
      return {
        ...state,
        items: state.items.map((i) =>
          i.product_id === action.payload.product_id ? { ...i, discount: action.payload.discount } : i
        ),
      }
    case 'SET_CART_DISCOUNT':
      return { ...state, cartDiscount: action.payload }
    case 'SET_CUSTOMER':
      return { ...state, customer: action.payload }
    case 'CLEAR_CART':
      return initialState
    default:
      return state
  }
}

const initialState = {
  items: [],
  cartDiscount: '',
  customer: null,
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState)

  const settings = useSettings()
  // Exact totals, including tax, matching what the server will charge
  const { subtotal, tax, total } = cartTotals(state.items, state.cartDiscount, settings.tax_rate)

  function addItem(product) {
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        product_id: product.id,
        name: product.name,
        price: product.price,
        sku: product.sku,
        quantity_available: product.quantity,
        unit_category: product.unit_category || 'COUNT',
        base_unit: product.base_unit || 'pcs',
        pricing_unit: product.pricing_unit || 'pcs',
      },
    })
  }
  function removeItem(product_id) { dispatch({ type: 'REMOVE_ITEM', payload: product_id }) }
  function updateQuantity(product_id, quantity) { dispatch({ type: 'UPDATE_QUANTITY', payload: { product_id, quantity } }) }
  function updateUnit(product_id, newUnit) { dispatch({ type: 'UPDATE_UNIT', payload: { product_id, newUnit } }) }
  function updateDiscount(product_id, discount) { dispatch({ type: 'UPDATE_DISCOUNT', payload: { product_id, discount } }) }
  function setCartDiscount(amount) { dispatch({ type: 'SET_CART_DISCOUNT', payload: amount }) }
  function setCustomer(customer) { dispatch({ type: 'SET_CUSTOMER', payload: customer }) }
  function clearCart() { dispatch({ type: 'CLEAR_CART' }) }

  return (
    <CartContext.Provider value={{ ...state, subtotal, tax, total, addItem, removeItem, updateQuantity, updateUnit, updateDiscount, setCartDiscount, setCustomer, clearCart }}>
      {children}
    </CartContext.Provider>
  )
}
