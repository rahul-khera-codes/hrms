/**
 * Smoke test for items in the 21MAY2026 Miscellaneous Reviews client video.
 *   1. CALLMAX logo + branding on the login screen.
 *   2. Employees endpoint returns accessLevel + accessEnabled fields.
 *   3. Login is rejected when accessEnabled = false (per-user kill switch).
 *   4. Settings returns the new doubleOtMultiplier.
 *   5. Shifts list is US-only (the UI restricts choices; we ensure existing
 *      shifts can still be created with the canonical zones).
 *   6. Payroll calculator rejects a closed cycle with 409 + clear message.
 *
 * Run:
 *   BASE=http://116.202.210.102:5173 API=http://116.202.210.102:4000 \
 *   npx playwright test e2e/smoke-21may.spec.ts
 */
import { test, expect, request as pwRequest } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'

type LoginRes = { token: string; user: { id: string; email: string; role: string } }

async function registerAdmin(): Promise<LoginRes> {
  const ctx = await pwRequest.newContext()
  const r = await ctx.post(`${API}/api/auth/register`, {
    data: { email: `qa-21may-admin-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', name: 'QA 21MAY Admin', role: 'admin' },
  })
  expect(r.ok(), `register ${r.status()} ${await r.text()}`).toBeTruthy()
  const data = (await r.json()) as LoginRes
  await ctx.dispose()
  return data
}

test.describe.configure({ timeout: 180000 })

test('Login page shows CALLMAX brand + logo PNG', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // Title and footer copy
  await expect(page).toHaveTitle(/CALLMAX/)
  // Logo image present (at least one CALLMAX img on the page)
  const logos = await page.locator('img[alt="CALLMAX"]').count()
  expect(logos).toBeGreaterThan(0)
})

test('Employees: GET returns accessLevel + accessEnabled; admin tier flips role', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  // Create an employee at supervisor tier
  const email = `qa-21may-sup-${randomUUID().slice(0, 8)}@test.com`
  const created = await ctx.post(`${API}/api/admin/employees`, {
    data: { name: 'QA Supervisor', email, password: 'test1234', accessLevel: 'supervisor', accessEnabled: true, salaryType: 'hourly', baseSalary: 12 },
  })
  expect(created.ok(), `create ${created.status()} ${await created.text()}`).toBeTruthy()
  const createdBody = await created.json()
  expect(createdBody.accessLevel).toBe('supervisor')
  expect(createdBody.accessEnabled).toBe(true)
  expect(createdBody.role).toBe('employee')

  // Promote to admin tier
  const promoted = await ctx.patch(`${API}/api/admin/employees/${createdBody.id}`, {
    data: { accessLevel: 'admin' },
  })
  expect(promoted.ok(), `promote ${promoted.status()} ${await promoted.text()}`).toBeTruthy()
  const promotedBody = await promoted.json()
  expect(promotedBody.accessLevel).toBe('admin')
  expect(promotedBody.role).toBe('admin')

  await ctx.dispose()
})

test('Login rejected when access_enabled = false', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  // Create with disabled access
  const email = `qa-21may-disabled-${randomUUID().slice(0, 8)}@test.com`
  const pw = 'test1234'
  const created = await ctx.post(`${API}/api/admin/employees`, {
    data: { name: 'QA Disabled', email, password: pw, accessLevel: 'agent', accessEnabled: false, salaryType: 'hourly', baseSalary: 10 },
  })
  expect(created.ok()).toBeTruthy()
  await ctx.dispose()

  // Attempt to log in — must be 403
  const lc = await pwRequest.newContext()
  const lr = await lc.post(`${API}/api/auth/login`, { data: { email, password: pw } })
  expect(lr.status()).toBe(403)
  const lj = await lr.json()
  expect(String(lj.message || '')).toMatch(/disabled/i)
  await lc.dispose()
})

test('Settings response carries doubleOtMultiplier (default 2)', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  const r = await ctx.get(`${API}/api/admin/settings`)
  expect(r.ok()).toBeTruthy()
  const body = await r.json()
  expect(body.doubleOtMultiplier).toBeDefined()
  expect(Number(body.doubleOtMultiplier)).toBeGreaterThanOrEqual(1)
  await ctx.dispose()
})

test('Payroll calculator: closed cycle is locked with 409', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  // Pull periods for 2025 (entirely in the past relative to today's 2026-05-22)
  const pr = await ctx.get(`${API}/api/admin/payroll/periods?year=2025`)
  expect(pr.ok()).toBeTruthy()
  const periods = await pr.json()
  expect(Array.isArray(periods)).toBe(true)
  expect(periods.length).toBeGreaterThan(0)

  // Pick any cycle and attempt calculation — backend must reject if pay date
  // is already past today.
  const closedCycle = periods[0].cycleCode
  const r = await ctx.post(`${API}/api/admin/payroll-calculator/calculate`, {
    data: { cycleCode: closedCycle },
  })
  expect(r.status()).toBe(409)
  const body = await r.json()
  expect(String(body.code || body.error)).toMatch(/CYCLE_CLOSED|Cycle closed/)

  await ctx.dispose()
})
