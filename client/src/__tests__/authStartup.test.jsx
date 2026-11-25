import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import axios from 'axios'
import api from '../services/api'
import { AuthProvider } from '../context/AuthContext'
import AppSplashScreen from '../components/loading/AppSplashScreen'
import { useAuth } from '../hooks/useAuth'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}))

function AuthStateProbe() {
  const { isLoading, isAuthenticated, initializationError, retryInitialization, user } = useAuth()
  const state = isLoading
    ? 'checking session'
    : initializationError
    ? 'connection error'
    : isAuthenticated
    ? `signed in as ${user.role}`
    : 'signed out'

  return (
    <div>
      <p role="status">{state}</p>
      <button type="button" onClick={retryInitialization}>Retry</button>
    </div>
  )
}

function renderAuthState() {
  return render(
    <AuthProvider>
      <AuthStateProbe />
    </AuthProvider>
  )
}

describe('application session initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats an absent refresh session as a normal signed-out state', async () => {
    axios.post.mockRejectedValueOnce({ response: { status: 401 } })

    renderAuthState()

    expect(await screen.findByText('signed out')).toBeInTheDocument()
  })

  it('shows a connection error and retries session initialization on request', async () => {
    axios.post
      .mockRejectedValueOnce({ request: {} })
      .mockResolvedValueOnce({ data: { data: { accessToken: 'short-lived-test-token' } } })
    api.get.mockResolvedValueOnce({ data: { data: { id: 'user-1', role: 'MANAGER' } } })

    renderAuthState()

    expect(await screen.findByText('connection error')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('signed in as MANAGER')).toBeInTheDocument()
    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post.mock.calls[0][2]).toMatchObject({ withCredentials: true, timeout: 15000 })
    expect(api.get).toHaveBeenCalledWith('/auth/me', expect.objectContaining({ timeout: 15000 }))
  })

  it('turns an initialization timeout into a recoverable connection state', async () => {
    axios.post.mockRejectedValueOnce({ code: 'ECONNABORTED' })

    renderAuthState()

    expect(await screen.findByText('connection error')).toBeInTheDocument()
  })

  it('offers an accessible retry action while startup is slow', () => {
    const onRetry = vi.fn()

    render(<AppSplashScreen isSlow onRetry={onRetry} />)

    expect(screen.getByText('Taking longer than expected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
