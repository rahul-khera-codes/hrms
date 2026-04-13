import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Lock, Sparkles, BarChart3, CheckCircle2 } from 'lucide-react'
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
    <div className="min-h-screen flex bg-surface-50">
      {/* Left: Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-surface-900 via-surface-800 to-brand-900 relative overflow-hidden flex-col justify-between p-12">
        {/* Background decorations */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-brand-500 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-brand-400 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold text-white tracking-tight">TimeTrack</span>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-4xl font-bold text-white tracking-tight leading-tight text-balance">
              Time tracking and payroll, <span className="text-brand-300">simplified.</span>
            </h2>
            <p className="text-surface-300 mt-4 max-w-md leading-relaxed">
              Clock in and out, track sessions, manage leaves, and get payroll-ready reports — all in one professional platform.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: Sparkles, text: 'Automated attendance & overtime calculation' },
              { icon: BarChart3, text: 'Payroll-ready reports with one click' },
              { icon: CheckCircle2, text: 'Leave management built-in' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-surface-200">
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-brand-300">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-surface-500 text-xs">© TimeTrack. Sign in with your account.</p>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 lg:hidden mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-surface-900 tracking-tight">TimeTrack</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-surface-900 tracking-tight">Welcome back</h1>
            <p className="text-surface-500 text-sm mt-1.5">Enter your credentials to access your dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                minLength={6}
              />
            </div>
            {error && (
              <div className="alert-error">
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 min-h-[2.75rem]"
            >
              {loading ? (
                <span className="spinner border-white/30 border-t-white" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-[11px] text-surface-400 text-center mt-6">
            Need help? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
