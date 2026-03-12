import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import type { User } from '@/contexts/AuthContext'
import { validateLogin } from '@/lib/validation'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const validationError = validateLogin(email, password)
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    try {
      const user: User = await login(email, password)
      navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true })
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Invalid credentials'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-surface-800 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-semibold text-white">TimeTrack</span>
        </div>
        <div>
          <h2 className="text-3xl font-semibold text-white tracking-tight">
            Time tracking and payroll, simplified.
          </h2>
          <p className="text-surface-400 mt-4 max-w-md">
            Clock in and out, track sessions, and get payroll-ready reports — all in one place.
          </p>
        </div>
        <p className="text-surface-500 text-sm">© TimeTrack. Sign in with your account.</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 lg:hidden mb-8">
            <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-semibold text-surface-900">TimeTrack</span>
          </div>
          <h1 className="text-2xl font-semibold text-surface-900 mb-2">Sign in</h1>
          <p className="text-surface-500 text-sm mb-8">Enter your credentials to continue.</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                minLength={6}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
