/**
 * Visual sweep across every admin + employee route, plus the most important
 * detail/edit modals. Captures full-page screenshots into /tmp/ui-sweep/ for
 * offline review. Not a smoke test — failures here only stop the recording.
 *
 * Run:
 *   BASE=http://116.202.210.102:5173 API=http://116.202.210.102:4000 \
 *   npx playwright test e2e/ui-screenshot-sweep.spec.ts --reporter=line --workers=1
 */
import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'
const OUT = '/tmp/ui-sweep'

mkdirSync(OUT, { recursive: true })

type LoginRes = { token: string; user: { id: string; email: string; role: string; name: string } }

async function registerAndSeed(): Promise<{ admin: LoginRes; empEmail: string; empPw: string; empToken: string }> {
  const ctx = await pwRequest.newContext()
  const r = await ctx.post(`${API}/api/auth/register`, {
    data: { email: `ui-sweep-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', name: 'UI Sweep Admin', role: 'admin' },
  })
  expect(r.ok()).toBeTruthy()
  const admin = (await r.json()) as LoginRes

  // Create an employee + seed a few records so screenshots have content
  const adminCtx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  const empEmail = `ui-emp-${randomUUID().slice(0, 8)}@test.com`
  const empPw = 'test1234'
  const emp = await (await adminCtx.post(`${API}/api/admin/employees`, {
    data: { name: 'UI Sweep Employee', email: empEmail, password: empPw, salaryType: 'hourly', baseSalary: 12 },
  })).json()
  const clientId = (await (await adminCtx.post(`${API}/api/admin/clients`, { data: { name: `UI Sweep Co ${randomUUID().slice(0, 6)}` } })).json()).id
  const shiftId = (await (await adminCtx.post(`${API}/api/admin/shifts`, { data: { name: 'UI-Shift', startTime: '09:00', endTime: '17:00', clientId } })).json()).id
  await adminCtx.post(`${API}/api/admin/schedule/bulk-assign`, {
    data: { clientId, userIds: [emp.id], shiftId, dateFrom: '2026-05-26', dateTo: '2026-05-30' },
  })
  // Publish the week so employee can see shifts
  await adminCtx.post(`${API}/api/admin/schedule/publish`, {
    data: { clientId, dateFrom: '2026-05-26', dateTo: '2026-05-30' },
  })
  await adminCtx.dispose()
  await ctx.dispose()

  // Get an employee token for the employee routes
  const lc = await pwRequest.newContext()
  const lr = await lc.post(`${API}/api/auth/login`, { data: { email: empEmail, password: empPw } })
  const empToken = (await lr.json() as LoginRes).token
  await lc.dispose()

  return { admin, empEmail, empPw, empToken }
}

async function setStorage(page: Page, token: string, user: { id: string; email: string; role: string; name?: string }) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token, user })
}

async function snap(page: Page, slug: string, route: string) {
  await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true })
}

test.describe.configure({ timeout: 600000 })

test('Admin routes sweep', async ({ page }) => {
  const { admin } = await registerAndSeed()
  await setStorage(page, admin.token, admin.user)

  // Light mode
  await snap(page, '01-admin-employees', '/admin/employees')
  await snap(page, '02-admin-accounts', '/admin/clients')
  await snap(page, '03-admin-attendance', '/admin/attendance')
  await snap(page, '04-admin-leaves', '/admin/leave-requests')
  await snap(page, '05-admin-payroll-calendar', '/admin/payroll-calendar')
  await snap(page, '06-admin-payroll-inputs', '/admin/payroll-inputs')
  await snap(page, '07-admin-payroll-calculator', '/admin/payroll?cycle=2026-P12')
  await snap(page, '08-admin-billables', '/admin/billables')
  await snap(page, '09-admin-shifts', '/admin/shifts')
  await snap(page, '10-admin-scheduler', '/admin/schedule')
  await snap(page, '11-admin-settings', '/admin/settings')

  // Toggle dark mode and snap a couple of key pages
  await page.evaluate(() => { localStorage.setItem('hrms.theme', 'dark'); document.documentElement.classList.add('dark') })
  await snap(page, '12-admin-employees-dark', '/admin/employees')
  await snap(page, '13-admin-leaves-dark', '/admin/leave-requests')
  await snap(page, '14-admin-payroll-inputs-dark', '/admin/payroll-inputs')
  await snap(page, '15-admin-settings-dark', '/admin/settings')

  // Flip back
  await page.evaluate(() => { localStorage.setItem('hrms.theme', 'light'); document.documentElement.classList.remove('dark') })
})

test('Admin modals sweep', async ({ page }) => {
  const { admin } = await registerAndSeed()
  await setStorage(page, admin.token, admin.user)

  // Employees → Add modal
  await page.goto(`${APP}/admin/employees`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.click('button:has-text("Add employee")')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/20-modal-employee-add.png`, fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // Accounts → Add modal
  await page.goto(`${APP}/admin/clients`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.click('button:has-text("Add account"), button:has-text("New account"), button:has-text("Add client")').catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/21-modal-account-add.png`, fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // Leaves → New leave modal
  await page.goto(`${APP}/admin/leave-requests`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.click('button:has-text("New Leave"), button:has-text("New leave")').catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/22-modal-leave-new.png`, fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // Payroll Inputs → New input modal
  await page.goto(`${APP}/admin/payroll-inputs`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.click('button:has-text("New input"), button:has-text("Add input"), button:has-text("Add")').catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/23-modal-pi-new.png`, fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // Shifts → Add shift modal
  await page.goto(`${APP}/admin/shifts`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.click('button:has-text("Add shift"), button:has-text("New shift")').catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/24-modal-shift-add.png`, fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
})

test('Employee routes sweep', async ({ page }) => {
  const { empToken, empEmail } = await registerAndSeed()
  await setStorage(page, empToken, { id: '', email: empEmail, role: 'employee', name: 'UI Sweep Employee' })

  await snap(page, '30-emp-attendance', '/dashboard/sessions')
  await snap(page, '31-emp-schedule', '/dashboard/schedule')
  await snap(page, '32-emp-leaves', '/dashboard/leave')
  await snap(page, '33-emp-payroll', '/dashboard/payroll')
  await snap(page, '34-emp-payroll-calendar', '/dashboard/payroll-calendar')
})

test('Login page sweep', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/40-landing.png`, fullPage: true })
  // Try login modal if present
  await page.click('button:has-text("Log in"), a:has-text("Log in")').catch(() => {})
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/41-login.png`, fullPage: true })
})
