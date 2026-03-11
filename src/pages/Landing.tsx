import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock,
  BarChart3,
  Shield,
  Zap,
  ChevronRight,
  LogIn,
  UserPlus,
  X,
  Check,
  Play,
  FileText,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import clsx from 'clsx'

const features = [
  {
    icon: Clock,
    title: 'Clock in & out',
    description: 'One-tap time tracking. Start and end your work sessions from any device.',
  },
  {
    icon: BarChart3,
    title: 'Payroll-ready reports',
    description: 'Automatic calculation of regular, overtime, and night hours for payroll.',
  },
  {
    icon: Shield,
    title: 'Secure & compliant',
    description: 'Centralized records and role-based access for employees and admins.',
  },
  {
    icon: Zap,
    title: 'Export & integrate',
    description: 'CSV and PDF exports. Ready to plug into your payroll or accounting system.',
  },
]

export default function Landing() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [role, setRole] = useState<'employee' | 'admin'>('employee')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true })
    }
  }, [user, navigate])

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email || 'demo@company.com', password, role)
      setAuthOpen(false)
      navigate(role === 'admin' ? '/admin' : '/dashboard', { replace: true })
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function openAuth(m: 'login' | 'signup') {
    setMode(m)
    setError('')
    setAuthOpen(true)
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-surface-200/80 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <a href="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-base sm:text-lg font-semibold text-surface-900 truncate">TimeTrack</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <a href="#features" className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap">
              How it works
            </a>
            <a href="#for-teams" className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap">
              For teams
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors hidden sm:block py-2 px-3 -my-2 -mx-3 rounded-lg hover:bg-surface-50"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => openAuth('signup')}
              className="btn-primary text-sm py-2 px-3 sm:py-2 sm:px-4 flex items-center gap-1.5 sm:gap-2 min-h-[2.5rem]"
            >
              Sign up
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-20 pb-12 sm:pt-24 sm:pb-16 lg:pt-28 lg:pb-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-brand-600 font-medium text-xs sm:text-sm uppercase tracking-wider">
            Time tracking & payroll
          </p>
          <h1 className="mt-2 sm:mt-3 text-2xl sm:text-4xl lg:text-5xl font-bold text-surface-900 tracking-tight leading-tight">
            One place to clock in, track hours, and run payroll.
          </h1>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg text-surface-600 px-0 sm:px-2">
            Employees punch in and out in seconds. Admins see attendance at a glance and export payroll-ready reports. No spreadsheets, no guesswork.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-surface-50/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-surface-900 tracking-tight">
              Everything you need
            </h2>
            <p className="mt-2 sm:mt-3 text-base sm:text-lg text-surface-600 max-w-xl mx-auto px-2">
              From clock-in to payroll export — one platform for your team.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group relative bg-white rounded-xl sm:rounded-2xl p-5 sm:p-6 lg:p-7 border border-surface-200/80 shadow-card hover:shadow-card-hover hover:border-brand-200/60 transition-all duration-300"
              >
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-105 transition-transform">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-surface-900">{title}</h3>
                <p className="mt-1.5 sm:mt-2 text-sm text-surface-600 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white border-t border-surface-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-surface-900 tracking-tight">
              How it works
            </h2>
            <p className="mt-2 sm:mt-3 text-base sm:text-lg text-surface-600 max-w-xl mx-auto px-2">
              Simple for everyone — whether you track time or manage the team.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 lg:gap-12">
            <div className="text-center px-2">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Play className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-brand-600">Step 1</span>
              <h3 className="mt-1.5 sm:mt-2 text-base sm:text-lg font-semibold text-surface-900">Clock in & out</h3>
              <p className="mt-1.5 sm:mt-2 text-surface-600 text-sm leading-relaxed">
                Employees start and end their work sessions with one tap. Times are stored instantly and shown on their dashboard.
              </p>
            </div>
            <div className="text-center px-2">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-surface-100 text-surface-600 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-surface-500">Step 2</span>
              <h3 className="mt-1.5 sm:mt-2 text-base sm:text-lg font-semibold text-surface-900">Hours are calculated</h3>
              <p className="mt-1.5 sm:mt-2 text-surface-600 text-sm leading-relaxed">
                The system splits time into regular, overtime, and night hours using your payroll rules. No manual math.
              </p>
            </div>
            <div className="text-center px-2">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-surface-100 text-surface-600 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <FileText className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-surface-500">Step 3</span>
              <h3 className="mt-1.5 sm:mt-2 text-base sm:text-lg font-semibold text-surface-900">Export & pay</h3>
              <p className="mt-1.5 sm:mt-2 text-surface-600 text-sm leading-relaxed">
                Admins review attendance, make adjustments if needed, and export CSV or PDF reports for payroll or accounting.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-10 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 bg-surface-900">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 text-center">
            <div>
              <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tabular-nums">500+</p>
              <p className="mt-1 text-xs sm:text-sm text-surface-400">Hours tracked weekly</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tabular-nums">50+</p>
              <p className="mt-1 text-xs sm:text-sm text-surface-400">Teams</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tabular-nums">99%</p>
              <p className="mt-1 text-xs sm:text-sm text-surface-400">Uptime</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tabular-nums">1 tap</p>
              <p className="mt-1 text-xs sm:text-sm text-surface-400">To clock in</p>
            </div>
          </div>
        </div>
      </section>

      {/* For employees / For admins */}
      <section id="for-teams" className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-surface-50/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-surface-900 tracking-tight px-2">
              Built for both sides of the team
            </h2>
            <p className="mt-2 sm:mt-3 text-base sm:text-lg text-surface-600 max-w-xl mx-auto px-2">
              One product, two experiences — so everyone gets what they need.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
            <div className="bg-white rounded-xl sm:rounded-2xl p-5 sm:p-6 lg:p-8 border border-surface-200/80 shadow-card">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 sm:mb-5">
                <UserPlus className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-surface-900">For employees</h3>
              <p className="mt-2 sm:mt-3 text-surface-600 text-sm leading-relaxed">
                Log in, open your dashboard, and tap to clock in or out. See your sessions and a summary of regular and overtime hours for the period. Everything in one place, no paperwork.
              </p>
              <ul className="mt-4 sm:mt-5 space-y-2 text-sm text-surface-700">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  One-tap clock in & out
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  View session history
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  See regular, overtime & night hours
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl p-5 sm:p-6 lg:p-8 border border-surface-200/80 shadow-card">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-surface-100 text-surface-600 flex items-center justify-center mb-4 sm:mb-5">
                <Users className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-surface-900">For admins</h3>
              <p className="mt-2 sm:mt-3 text-surface-600 text-sm leading-relaxed">
                Monitor attendance, filter by date and status, and make adjustments when needed. Run payroll for any period and export CSV or PDF reports ready for your payroll or accounting system.
              </p>
              <ul className="mt-4 sm:mt-5 space-y-2 text-sm text-surface-700">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-surface-500 shrink-0" />
                  Attendance overview & search
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-surface-500 shrink-0" />
                  Payroll calculation by period
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-surface-500 shrink-0" />
                  Export reports (CSV / PDF)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white border-t border-surface-100">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-surface-900 tracking-tight px-2">
            Ready to track time the simple way?
          </h2>
          <p className="mt-2 sm:mt-3 text-sm sm:text-base text-surface-600 px-2">
            Log in or sign up to get started. Choose your role and you’re in.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="btn-primary px-5 py-3 sm:px-6 sm:py-3 flex items-center justify-center gap-2 min-h-[2.75rem] w-full sm:w-auto"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              Log in
            </button>
            <button
              type="button"
              onClick={() => openAuth('signup')}
              className="btn-secondary px-5 py-3 sm:px-6 sm:py-3 flex items-center justify-center gap-2 min-h-[2.75rem] w-full sm:w-auto"
            >
              Sign up
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* Auth modal (Log in / Sign up via header buttons only) */}
      {authOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-surface-900/50 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setAuthOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div
              className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md my-auto overflow-hidden transition-all duration-200 scale-100 opacity-100 max-h-[calc(100vh-1.5rem)] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-6 border-b border-surface-100 flex items-center justify-between shrink-0">
                <h3 className="text-base sm:text-lg font-semibold text-surface-900">
                  {mode === 'login' ? 'Log in' : 'Sign up'}
                </h3>
                <button
                  type="button"
                  onClick={() => setAuthOpen(false)}
                  className="p-2 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors touch-manipulation"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-100 mb-4 sm:mb-5">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError('') }}
                    className={clsx(
                      'flex-1 py-2 rounded-lg text-sm font-medium transition-all min-h-[2.5rem]',
                      mode === 'login' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-600'
                    )}
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setError('') }}
                    className={clsx(
                      'flex-1 py-2 rounded-lg text-sm font-medium transition-all min-h-[2.5rem]',
                      mode === 'signup' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-600'
                    )}
                  >
                    Sign up
                  </button>
                </div>
                <form onSubmit={handleAuthSubmit} className="space-y-3 sm:space-y-4">
                  {mode === 'signup' && (
                    <div>
                      <label className="label">Name</label>
                      <input
                        type="text"
                        className="input min-h-[2.75rem]"
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      className="input min-h-[2.75rem]"
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
                      className="input min-h-[2.75rem]"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                  </div>
                  <div>
                    <label className="label">I am a</label>
                    <div className="flex gap-2 p-1 rounded-lg bg-surface-100">
                      <button
                        type="button"
                        onClick={() => setRole('employee')}
                        className={clsx(
                          'flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 sm:gap-2 min-h-[2.5rem]',
                          role === 'employee' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-600'
                        )}
                      >
                        <UserPlus className="w-4 h-4 shrink-0" />
                        <span className="truncate">Employee</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole('admin')}
                        className={clsx(
                          'flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 sm:gap-2 min-h-[2.5rem]',
                          role === 'admin' ? 'bg-white shadow-sm text-surface-900' : 'text-surface-600'
                        )}
                      >
                        <Shield className="w-4 h-4 shrink-0" />
                        <span className="truncate">Admin</span>
                      </button>
                    </div>
                  </div>
                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2 min-h-[2.75rem]"
                  >
                    {loading ? (
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : mode === 'login' ? (
                      'Log in'
                    ) : (
                      'Create account'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="border-t border-surface-200 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-surface-900 text-sm sm:text-base">TimeTrack</span>
          </div>
          <p className="text-xs sm:text-sm text-surface-500">
            © {new Date().getFullYear()} TimeTrack. Time tracking & payroll.
          </p>
        </div>
      </footer>
    </div>
  )
}
