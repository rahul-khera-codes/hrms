import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type Role = 'employee' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  avatar?: string
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string, role?: Role) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const MOCK_USERS: Record<string, User> = {
  employee: {
    id: 'emp-1',
    email: 'jane@company.com',
    name: 'Jane Doe',
    role: 'employee',
  },
  admin: {
    id: 'admin-1',
    email: 'admin@company.com',
    name: 'Admin User',
    role: 'admin',
  },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('timetrack_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (email: string, _password: string, role?: Role) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 600))
    const key = role === 'admin' ? 'admin' : 'employee'
    const u = MOCK_USERS[key]
    setUser({ ...u, email: email || u.email })
    localStorage.setItem('timetrack_user', JSON.stringify({ ...u, email: email || u.email }))
    setLoading(false)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('timetrack_user')
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
