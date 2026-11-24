import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { AuthLayout } from '../layouts/AuthLayout'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    username: '',
    password: '',
    confirm_password: '',
    role: 'CASHIER',
  })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  function validate() {
    const errs = {}
    if (!form.full_name.trim()) errs.full_name = 'Full name is required'
    if (!form.email.trim()) {
      errs.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email address'
    }
    if (!form.username.trim()) errs.username = 'Username is required'
    if (!form.password) {
      errs.password = 'Password is required'
    } else if (form.password.length < 6) {
      errs.password = 'Password must be at least 6 characters'
    }
    if (form.password !== form.confirm_password) {
      errs.confirm_password = 'Passwords do not match'
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setApiError('')
    setIsLoading(true)
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      })
      toast.success('Registration successful! Please sign in with your credentials.')
      navigate('/login')
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Registration failed. Please try again.'
      setApiError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  return (
    <AuthLayout>
      {/* NexTill Logo & Header */}
      <div className="text-center mb-6">
        <Link to="/login" className="inline-block transition hover:opacity-90">
          <div className="inline-flex p-3 rounded-2xl bg-white/60 border border-white/80 shadow-2xs mb-2">
            <img
              src="/logo.png"
              alt="NexTill Logo"
              className="h-12 w-auto max-w-[180px] object-contain"
            />
          </div>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create an Account</h1>
        <p className="text-slate-500 text-xs mt-1 font-medium">Register new staff access for NexTill POS</p>
      </div>

      {/* API Error Message */}
      {apiError && (
        <div className="mb-4 p-3.5 bg-rose-50/90 border border-rose-200/80 rounded-xl text-rose-700 text-xs font-medium">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        {/* Full Name */}
        <div>
          <label htmlFor="full_name" className="block text-xs font-semibold text-slate-700 mb-1">
            Full Name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            value={form.full_name}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="e.g. John Doe"
            className={`w-full px-3.5 py-2 bg-white/90 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all duration-150 disabled:bg-slate-100 ${
              errors.full_name ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500' : 'border-slate-200/90 hover:border-slate-300'
            }`}
          />
          {errors.full_name && <p className="mt-1 text-xs font-medium text-rose-600">{errors.full_name}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="john@example.com"
            className={`w-full px-3.5 py-2 bg-white/90 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all duration-150 disabled:bg-slate-100 ${
              errors.email ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500' : 'border-slate-200/90 hover:border-slate-300'
            }`}
          />
          {errors.email && <p className="mt-1 text-xs font-medium text-rose-600">{errors.email}</p>}
        </div>

        {/* Username */}
        <div>
          <label htmlFor="username" className="block text-xs font-semibold text-slate-700 mb-1">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="Choose a username"
            className={`w-full px-3.5 py-2 bg-white/90 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all duration-150 disabled:bg-slate-100 ${
              errors.username ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500' : 'border-slate-200/90 hover:border-slate-300'
            }`}
          />
          {errors.username && <p className="mt-1 text-xs font-medium text-rose-600">{errors.username}</p>}
        </div>

        {/* Role Selection */}
        <div>
          <label htmlFor="role" className="block text-xs font-semibold text-slate-700 mb-1">
            Role
          </label>
          <select
            id="role"
            name="role"
            value={form.role}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full px-3.5 py-2 border border-slate-200/90 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all bg-white/90"
          >
            <option value="CASHIER">Cashier (Point of Sale access)</option>
            <option value="MANAGER">Manager (Inventory, Products & Sales)</option>
            <option value="ADMIN">Admin (Full System Control)</option>
          </select>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              disabled={isLoading}
              placeholder="Minimum 6 characters"
              className={`w-full px-3.5 py-2 pr-10 bg-white/90 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all duration-150 disabled:bg-slate-100 ${
                errors.password ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500' : 'border-slate-200/90 hover:border-slate-300'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs font-medium text-rose-600">{errors.password}</p>}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirm_password" className="block text-xs font-semibold text-slate-700 mb-1">
            Confirm Password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.confirm_password}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="Re-enter password"
            className={`w-full px-3.5 py-2 bg-white/90 border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all duration-150 disabled:bg-slate-100 ${
              errors.confirm_password ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500' : 'border-slate-200/90 hover:border-slate-300'
            }`}
          />
          {errors.confirm_password && (
            <p className="mt-1 text-xs font-medium text-rose-600">{errors.confirm_password}</p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-all shadow-xs hover:shadow-primary-glow flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating Account...
            </>
          ) : (
            'Register Account'
          )}
        </button>
      </form>

      {/* Back to Login */}
      <div className="mt-6 text-center border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-indigo-600 transition-colors">
            Sign In here
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
