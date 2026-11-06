import { useReducer, useEffect } from 'react'
import { AuthContext } from './contexts'
import axios from 'axios'
import api, { setAccessToken, clearAccessToken } from '../services/api'

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
}

function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
      }
    case 'LOGOUT':
      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }
    case 'AUTH_CHECKED':
      return {
        ...state,
        isLoading: false,
      }
    default:
      return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // On app load: try silent refresh using the httpOnly cookie
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
        const newToken = data.data.accessToken
        setAccessToken(newToken)

        const meRes = await api.get('/auth/me')
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: meRes.data.data } })
      } catch {
        // No valid session — user must log in
        dispatch({ type: 'AUTH_CHECKED' })
      }
    }
    checkAuth()
  }, [])

  async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password })
    const { accessToken, user } = data.data
    setAccessToken(accessToken)
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
    return user
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      clearAccessToken()
      dispatch({ type: 'LOGOUT' })
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
