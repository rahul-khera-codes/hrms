const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function getToken(): string | null {
  return localStorage.getItem('timetrack_token')
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token = getToken(), ...init } = options
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Request failed') as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data as T
}
