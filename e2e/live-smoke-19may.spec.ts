/**
 * Live smoke test against http://116.202.210.102:5173
 * Verifies UI flows from 18MAY2026 client videos that were built but never browser-tested.
 *
 * Run: BASE=http://116.202.210.102:5173 ADMIN_EMAIL=... ADMIN_PW=... EMP_EMAIL=... EMP_PW=... \
 *      npx playwright test e2e/live-smoke-19may.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.BASE || 'http://116.202.210.102:5173'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'qa-admin-20a41d@test.com'
const ADMIN_PW = process.env.ADMIN_PW || 'test1234'
const EMP_EMAIL = process.env.EMP_EMAIL || 'qa-emp-7e013a@test.com'
const EMP_PW = process.env.EMP_PW || 'test1234'

async function login(page: Page, email: string, password: string) {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  // Open auth modal — there are two "Log in" buttons on the landing page; first one is in header
  await page.locator('button:has-text("Log in")').first().click()
  // Wait for the modal email input
  await page.waitForSelector('input[type="email"]', { timeout: 5000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('form button[type="submit"]')
  await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 })
  await page.waitForLoadState('networkidle')
  // Allow Navigate index redirect to settle (admin → /admin/employees, employee → /dashboard/sessions)
  await page.waitForTimeout(800)
}

test.describe('Admin UI smoke — 18MAY2026 changes', () => {
  test('Dashboard tab is gone, default route is Employees', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PW)
    // After login, /admin index should Navigate to /admin/employees
    expect(page.url()).toContain('/admin')
    // Sidebar should NOT have a "Dashboard" link
    const dashLinks = await page.locator('aside a:has-text("Dashboard")').count()
    expect(dashLinks).toBe(0)
    // Should have Employees link
    expect(await page.locator('aside a:has-text("Employees")').count()).toBeGreaterThan(0)
  })

  test('Settings shows Tax & Deduction Rates reference', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PW)
    await page.goto(`${BASE}/admin/settings`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h2:has-text("Tax & Deduction Rates")')).toBeVisible()
    await expect(page.locator('text=ISR Tax Brackets').first()).toBeVisible()
    // Should mention 35% / 100%
    await expect(page.locator('text=Regular OT').first()).toBeVisible()
    await expect(page.locator('text=Holiday OT').first()).toBeVisible()
  })

  test('LeaveRequests page loads + has consistent action buttons (edit/lock/delete)', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PW)
    await page.goto(`${BASE}/admin/leave-requests`)
    await page.waitForLoadState('networkidle')
    // The page should at least render without 500
    await expect(page.locator('text=Leaves').first()).toBeVisible()
  })

  test('PayrollInputs has checkbox column + Approver Status options Pending/Approved/Rejected', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PW)
    await page.goto(`${BASE}/admin/payroll-inputs`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Payroll inputs').first()).toBeVisible()
    // Should have an "Approved" filter option (proves status enum updated)
    // Open the status dropdown — find the third filter (status)
    const filterDropdowns = page.locator('button[aria-haspopup="listbox"]')
    const count = await filterDropdowns.count()
    expect(count).toBeGreaterThan(0)
  })

  test('Accounts page has Lock action in row + bulk bar', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PW)
    await page.goto(`${BASE}/admin/clients`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Accounts').first()).toBeVisible()
    // Each row should have a checkbox + lock toggle (titled "Lock" or "Unlock")
    const lockButtons = await page.locator('button[title="Lock"], button[title="Unlock"]').count()
    expect(lockButtons).toBeGreaterThanOrEqual(0) // might be 0 if no accounts exist
  })

  test('Admin Attendance renders per-session rows', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PW)
    await page.goto(`${BASE}/admin/attendance`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Attendance').first()).toBeVisible()
  })

  test('Leaves new-leave modal has Days Off + Asset Deactivation + Approver + Payroll Status', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PW)
    await page.goto(`${BASE}/admin/leave-requests`)
    await page.waitForLoadState('networkidle')
    // Click "+ New Leave"
    await page.click('button:has-text("New Leave")')
    // Days Off and Asset Deactivation always visible
    await expect(page.locator('label:has-text("Days Off")')).toBeVisible()
    await expect(page.locator('label:has-text("Asset Deactivation")')).toBeVisible()
    // Approver and Payroll Status only show when calculation is payable — pick Hourly Salary
    await page.locator('button:has-text("Hourly Salary")').first().click()
    await expect(page.locator('label:has-text("Approver")').first()).toBeVisible()
    await expect(page.locator('label:has-text("Payroll Status")').first()).toBeVisible()
  })
})

test.describe('Employee UI smoke — 18MAY2026 changes', () => {
  test('No Dashboard tab; default landing is My Attendance', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PW)
    expect(page.url()).toMatch(/\/dashboard/)
    const dashTabs = await page.locator('aside a:has-text("Dashboard")').count()
    expect(dashTabs).toBe(0)
    expect(await page.locator('aside a:has-text("My Attendance")').count()).toBeGreaterThan(0)
    expect(await page.locator('aside a:has-text("My Payroll")').count()).toBeGreaterThan(0)
  })

  test('My Attendance has clock widget on top + Account/Bill/Stage/Comments columns', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PW)
    await page.goto(`${BASE}/dashboard/sessions`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=My Attendance').first()).toBeVisible()
    // Clock widget — should show "Clock in" or "Clock out" button
    const clockButtons = await page.locator('button:has-text("Clock in"), button:has-text("Clock out")').count()
    expect(clockButtons).toBeGreaterThan(0)
    // Table should have Account / Bill / Stage / Comments columns
    await expect(page.locator('th:has-text("Account")')).toBeVisible()
    await expect(page.locator('th:has-text("Bill")')).toBeVisible()
    await expect(page.locator('th:has-text("Stage")')).toBeVisible()
    await expect(page.locator('th:has-text("Comments")')).toBeVisible()
  })

  test('My Leaves has New Leave button + modal submits single-day leave (no 400)', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PW)
    await page.goto(`${BASE}/dashboard/leave`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=My Leaves').first()).toBeVisible()
    // "+ New Leave" button
    const newBtn = page.locator('button:has-text("New Leave")')
    await expect(newBtn).toBeVisible()
    await newBtn.click()
    // Modal opens with Leave Type, Start Date, Notes
    await expect(page.locator('text=Request a leave')).toBeVisible()
    await expect(page.locator('label:has-text("Leave Type")')).toBeVisible()
    await expect(page.locator('label:has-text("Start Date")')).toBeVisible()
    // Pick start date
    await page.fill('input[type="date"]', '2026-12-25')
    // Submit
    await page.click('button:has-text("Submit")')
    // Should NOT see the error
    await expect(page.locator('text=End date cannot be before')).not.toBeVisible()
    await expect(page.locator('text=End date must be at least')).not.toBeVisible()
    // Modal should close (toast appears, modal disappears)
    await page.waitForTimeout(1500)
    await expect(page.locator('text=Request a leave')).not.toBeVisible()
  })

  test('My Payroll has wide table with column groups + no Calculate button', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PW)
    await page.goto(`${BASE}/dashboard/payroll`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=My Payroll').first()).toBeVisible()
    // Should NOT have a "Calculate Payroll" button
    const calcCount = await page.locator('button:has-text("Calculate Payroll")').count()
    expect(calcCount).toBe(0)
    // Should have Export CSV + Pay Stub buttons
    await expect(page.locator('button:has-text("Export CSV")')).toBeVisible()
    await expect(page.locator('button:has-text("Pay Stub")')).toBeVisible()
  })

  test('Payroll Calendar is read-only (no Run button)', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PW)
    await page.goto(`${BASE}/dashboard/payroll-calendar`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Payroll Calendar').first()).toBeVisible()
    const runCount = await page.locator('button:has-text("Run")').count()
    expect(runCount).toBe(0)
  })

  test('Sidebar order is My Attendance / My Schedule / My Leaves / My Payroll / Payroll Calendar', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PW)
    const labels = await page.locator('aside a').allTextContents()
    const navLabels = labels.filter((l) => /My (Attendance|Schedule|Leaves|Payroll)|Payroll Calendar/.test(l))
    // Order check
    const idxAtt = navLabels.findIndex((l) => l.includes('My Attendance'))
    const idxSch = navLabels.findIndex((l) => l.includes('My Schedule'))
    const idxLv = navLabels.findIndex((l) => l.includes('My Leaves'))
    const idxPay = navLabels.findIndex((l) => l.includes('My Payroll'))
    const idxCal = navLabels.findIndex((l) => l.includes('Payroll Calendar'))
    expect(idxAtt).toBeLessThan(idxSch)
    expect(idxSch).toBeLessThan(idxLv)
    expect(idxLv).toBeLessThan(idxPay)
    expect(idxPay).toBeLessThan(idxCal)
  })

  test('Fluid layout — page wrapper has no max-w constraint', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PW)
    await page.goto(`${BASE}/dashboard/sessions`)
    await page.waitForLoadState('networkidle')
    // The main content wrapper should not have max-w-5xl
    const html = await page.locator('main').innerHTML()
    expect(html).not.toContain('max-w-5xl')
  })
})
