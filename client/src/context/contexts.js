import { createContext } from 'react'

// Context objects live here, apart from their provider components, so each
// *Context.jsx file exports only a component and Vite fast refresh works.

export const DEFAULT_SETTINGS = {
  store_name: 'GhanaShop POS',
  store_address: '14 Liberation Road, Accra, Ghana',
  store_phone: '030-200-0000',
  tax_rate: '0',
  loyalty_points_rate: '10',
  currency_symbol: 'GH₵',
  receipt_footer: 'Thank you for your business!',
}

export const AuthContext = createContext(null)
export const CartContext = createContext(null)
export const SettingsContext = createContext(DEFAULT_SETTINGS)
