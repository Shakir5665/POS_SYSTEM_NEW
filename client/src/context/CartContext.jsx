import { useReducer } from 'react'
import { CartContext } from './contexts'
import { useSettings } from '../hooks/useSettings'
import { cartTotals } from '../utils/money'

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.product_id === action.payload.product_id)
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.product_id === action.payload.product_id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return { ...state, items: [...state.items, { ...action.payload, quantity: 1, discount: 0 }] }
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.product_id !== action.payload) }
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items
          .map((i) =>
            i.product_id === action.payload.product_id ? { ...i, quantity: action.payload.quantity } : i
          )
          .filter((i) => i.quantity > 0),
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
  cartDiscount: 0,
  customer: null,
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState)

  const settings = useSettings()
  // Exact totals, including tax, matching what the server will charge
  const { subtotal, tax, total } = cartTotals(state.items, state.cartDiscount, settings.tax_rate)

  function addItem(product) {
    dispatch({ type: 'ADD_ITEM', payload: { product_id: product.id, name: product.name, price: product.price, sku: product.sku, quantity_available: product.quantity } })
  }
  function removeItem(product_id) { dispatch({ type: 'REMOVE_ITEM', payload: product_id }) }
  function updateQuantity(product_id, quantity) { dispatch({ type: 'UPDATE_QUANTITY', payload: { product_id, quantity } }) }
  function updateDiscount(product_id, discount) { dispatch({ type: 'UPDATE_DISCOUNT', payload: { product_id, discount } }) }
  function setCartDiscount(amount) { dispatch({ type: 'SET_CART_DISCOUNT', payload: amount }) }
  function setCustomer(customer) { dispatch({ type: 'SET_CUSTOMER', payload: customer }) }
  function clearCart() { dispatch({ type: 'CLEAR_CART' }) }

  return (
    <CartContext.Provider value={{ ...state, subtotal, tax, total, addItem, removeItem, updateQuantity, updateDiscount, setCartDiscount, setCustomer, clearCart }}>
      {children}
    </CartContext.Provider>
  )
}
