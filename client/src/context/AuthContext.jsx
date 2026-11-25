import { useReducer, useEffect, useRef } from 'react'
import { AuthContext } from './contexts'
import axios from 'axios'
import api, { setAccessToken, clearAccessToken } from '../services/api'

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  initializationError: false,
  initializationAttempt: 0,
  systemLocked: false,
}

function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        initializationError: false,
        initializationAttempt: state.initializationAttempt,
        systemLocked: false,
      }
    case 'LOGOUT':
      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        initializationError: false,
        initializationAttempt: state.initializationAttempt,
        systemLocked: false,
      }
    case 'AUTH_CHECKED':
      return {
        ...state,
        isLoading: false,
        initializationError: false,
        systemLocked: false,
      }
    case 'SYSTEM_LOCKED':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        initializationError: false,
        systemLocked: true,
      }
    case 'AUTH_INIT_FAILED':
      return {
        ...state,
        isLoading: false,
        initializationError: true,
        systemLocked: false,
      }
    case 'AUTH_RETRY':
      return {
        ...state,
        isLoading: true,
        initializationError: false,
        initializationAttempt: state.initializationAttempt + 1,
        systemLocked: false,
      }
    default:
      return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const requestControllerRef = useRef(null)

  useEffect(() => {
    function handleSystemPaused() {
      clearAccessToken()
      dispatch({ type: 'SYSTEM_LOCKED' })
    }

    window.addEventListener('system-access-paused', handleSystemPaused)
    return () => window.removeEventListener('system-access-paused', handleSystemPaused)
  }, [])

  // On app load: try silent refresh using the httpOnly cookie.
  useEffect(() => {
    const controller = new AbortController()
    let isActive = true
    requestControllerRef.current = controller

    async function checkAuth() {
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true,
          timeout: 15000,
          signal: controller.signal,
        })
        if (!isActive) return
        const newToken = data.data.accessToken
        setAccessToken(newToken)

        const meRes = await api.get('/auth/me', { timeout: 15000, signal: controller.signal })
        if (!isActive) return
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: meRes.data.data } })
      } catch (error) {
        if (!isActive || controller.signal.aborted) return

        const status = error.response?.status
        if (status === 423) {
          clearAccessToken()
          dispatch({ type: 'SYSTEM_LOCKED' })
          return
        }
        const connectionFailed =
          !error.response ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT' ||
          status === 408 ||
          status === 429 ||
          status >= 500

        if (connectionFailed) {
          dispatch({ type: 'AUTH_INIT_FAILED' })
        } else {
          // An expired or absent refresh session is an expected signed-out state.
          dispatch({ type: 'AUTH_CHECKED' })
        }
      }
    }
    checkAuth()
    return () => {
      isActive = false
      controller.abort()
      if (requestControllerRef.current === controller) requestControllerRef.current = null
    }
  }, [state.initializationAttempt])

  function retryInitialization() {
    requestControllerRef.current?.abort()
    dispatch({ type: 'AUTH_RETRY' })
  }

  async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password })
    const { accessToken, user } = data.data
    setAccessToken(accessToken)
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
    return user
  }

  function updateSession(user, accessToken) {
    setAccessToken(accessToken)
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
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
    <AuthContext.Provider value={{ ...state, login, logout, updateSession, retryInitialization }}>
      {children}
    </AuthContext.Provider>
  )
}
