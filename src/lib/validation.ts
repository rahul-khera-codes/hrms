const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 255

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && EMAIL_REGEX.test(trimmed)
}

export function validateLogin(email: string, password: string): string | null {
  if (!email.trim()) return 'Email is required'
  if (!isValidEmail(email)) return 'Please enter a valid email address'
  if (!password) return 'Password is required'
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  return null
}

export function validateSignup(
  name: string,
  email: string,
  password: string
): string | null {
  const nameTrimmed = name.trim()
  if (!nameTrimmed) return 'Name is required'
  if (nameTrimmed.length > MAX_NAME_LENGTH) return `Name must be at most ${MAX_NAME_LENGTH} characters`
  if (!email.trim()) return 'Email is required'
  if (!isValidEmail(email)) return 'Please enter a valid email address'
  if (!password) return 'Password is required'
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  return null
}
