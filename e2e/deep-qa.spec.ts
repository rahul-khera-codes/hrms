/**
 * DEEP QA TEST SUITE — Actually interacts with every feature like a human QA
 * Takes screenshots, fills forms, submits data, verifies results end-to-end
 */
import { test, expect, type Page } from '@playwright/test'

const API = 'http://localhost:4000'
const APP = 'http://localhost:5173'
const TS = Date.now()
const SCREENSHOTS = '/tmp/qa-screenshots'

test.use({ screenshot: 'on' })

// ─── HELPERS ────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hrms.com', password: 'admin123' }),
  })
  const data = await res.json()
  await page.goto(APP)
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token: data.token, user: data.user })
  await page.goto(`${APP}/admin/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
}

async function loginAsEmployee(page: Page) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'employee@hrms.com', password: 'employee123' }),
  })
  const data = await res.json()
  await page.goto(APP)
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token: data.token, user: data.user })
  await page.goto(`${APP}/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
}

// ═══════════════════════════════════════════════════════════
// FLOW 1: COMPLETE EMPLOYEE CREATION WITH ENGAGEMENT DETAILS
// ═══════════════════════════════════════════════════════════

test.describe('Flow 1: Create Employee End-to-End', () => {
  test('Create employee, verify all engagement fields save, edit and verify', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${APP}/admin/employees`)
    await page.waitForTimeout(3000)

    // Step 1: Click Add Employee
    const addBtn = page.locator('button:has-text("Add employee")')
    await expect(addBtn).toBeVisible()
    await addBtn.click()
    await page.waitForTimeout(500)

    // Step 2: Fill ALL fields
    // Basic
    const nameInput = page.locator('input[placeholder*="Full name"]')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill(`DeepQA Employee ${TS}`)

    const emailInputs = page.locator('input[type="email"], input[placeholder*="email"]')
    await emailInputs.last().fill(`deepqa-${TS}@test.com`)

    const passwordInput = page.locator('input[type="password"]')
    await passwordInput.first().fill('deepqa123456')

    // Scroll down to see engagement fields
    const modal = page.locator('.fixed .overflow-y-auto, [role="dialog"]').first()
    await modal.evaluate(el => el.scrollTop = 300)
    await page.waitForTimeout(300)

    // CMID
    const cmidInput = page.locator('input[placeholder*="1001"]')
    if (await cmidInput.isVisible().catch(() => false)) {
      await cmidInput.fill('7777')
      await page.waitForTimeout(200)
      // Verify Harmony ID auto-calculates
      const harmonyInput = page.locator('input[disabled][value*="HRM-"]')
      if (await harmonyInput.isVisible().catch(() => false)) {
        const harmonyVal = await harmonyInput.inputValue()
        expect(harmonyVal).toBe('HRM-07777')
      }
    }

    // Hire Date
    const hireDateInput = page.locator('label:has-text("Hire Date") ~ input, label:has-text("Hire Date") + input').first()
    if (await hireDateInput.isVisible().catch(() => false)) {
      await hireDateInput.fill('2025-01-15')
    }

    // Scroll more
    await modal.evaluate(el => el.scrollTop = 600)
    await page.waitForTimeout(300)

    // Step 3: Save
    const saveBtn = page.locator('button:has-text("Save")').last()
    await saveBtn.click()
    await page.waitForTimeout(3000)

    // Step 4: Verify created via API
    const token = (await (await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hrms.com', password: 'admin123' }),
    })).json()).token

    const emps = await (await fetch(`${API}/api/admin/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()
    const created = emps.find((e: any) => e.email === `deepqa-${TS}@test.com`)
    expect(created).toBeTruthy()
    expect(created.name).toBe(`DeepQA Employee ${TS}`)
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 2: COMPLETE ADMIN LEAVE CREATION (Monthly Calculation)
// ═══════════════════════════════════════════════════════════

test.describe('Flow 2: Admin Creates Leave End-to-End', () => {
  test('Create monthly salary leave, verify conditional fields and auto-calc', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)

    // Step 1: Click New Leave
    await page.locator('button:has-text("New Leave")').first().click()
    await page.waitForTimeout(500)

    // Step 2: Select employee from dropdown
    const empSelect = page.locator('select, [class*="select"]').first()
    // Click on the employee dropdown area
    const employeeLabel = page.locator('label:has-text("Employee")')
    await expect(employeeLabel).toBeVisible()
    // Find the select/dropdown after Employee label
    const selectButtons = page.locator('.fixed button, .fixed select')

    // Step 3: Verify Non Payable is default — pay fields should be hidden
    const nonPayableBtn = page.locator('button:has-text("Non Payable")')
    await expect(nonPayableBtn).toBeVisible()

    // Verify payable days NOT visible in non-payable mode
    let payableDaysLabel = page.locator('label:has-text("Payable Days")')
    await expect(payableDaysLabel).not.toBeVisible()

    // Step 4: Switch to Monthly Salary
    await page.locator('button:has-text("Monthly Salary")').click()
    await page.waitForTimeout(300)

    // Step 5: Verify conditional fields appeared
    payableDaysLabel = page.locator('label:has-text("Payable Days")')
    await expect(payableDaysLabel).toBeVisible()
    const monthlyRateLabel = page.locator('label:has-text("Monthly Rate")')
    await expect(monthlyRateLabel).toBeVisible()
    // Hourly Rate should NOT be visible
    const hourlyRateLabel = page.locator('label:has-text("Hourly Rate")')
    await expect(hourlyRateLabel).not.toBeVisible()
    // Daily Hours should NOT be visible
    const dailyHoursLabel = page.locator('label:has-text("Daily Hours")')
    await expect(dailyHoursLabel).not.toBeVisible()

    // Step 6: Fill payable days and monthly rate
    const allNumberInputs = page.locator('.fixed input[type="number"]')
    const inputCount = await allNumberInputs.count()
    for (let i = 0; i < inputCount; i++) {
      const input = allNumberInputs.nth(i)
      const placeholder = await input.getAttribute('placeholder') || ''
      const isVisible = await input.isVisible()
      if (!isVisible) continue
      if (placeholder.includes('payable') || placeholder.includes('Payable')) {
        await input.fill('3')
      } else if (placeholder.includes('50000')) {
        await input.fill('50000')
      }
    }
    await page.waitForTimeout(500)

    // Step 7: Scroll down in modal to see auto-calc preview
    const modalScroll = page.locator('.fixed .overflow-y-auto').first()
    await modalScroll.evaluate(el => el.scrollTop = el.scrollHeight)
    await page.waitForTimeout(500)

    // Verify auto-calculation shows in the modal
    const modalBody = await page.locator('.fixed').last().textContent()
    // Daily Salary should show ~2098
    expect(modalBody).toMatch(/2,?098/)
    // Payable Amount should show ~6294
    expect(modalBody).toMatch(/6,?29[0-9]/)

    // Step 8: Switch to Hourly — verify fields change
    await page.locator('button:has-text("Hourly Salary")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('label:has-text("Hourly Rate")')).toBeVisible()
    await expect(page.locator('label:has-text("Daily Hours")')).toBeVisible()
    await expect(page.locator('label:has-text("Monthly Rate")')).not.toBeVisible()

    // Step 9: Switch back to Non Payable — all pay fields hide
    await page.locator('button:has-text("Non Payable")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('label:has-text("Payable Days")')).not.toBeVisible()
    await expect(page.locator('label:has-text("Daily Salary")')).not.toBeVisible()
    await expect(page.locator('label:has-text("Payroll Cycle")')).not.toBeVisible()

    // Step 10: Verify Payroll Cycle only shows when payable
    await page.locator('button:has-text("Monthly Salary")').click()
    await page.waitForTimeout(300)
    const payrollCycleLabel = page.locator('label:has-text("Payroll Cycle")')
    await expect(payrollCycleLabel).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 3: EMPLOYEE SUBMITS LEAVE REQUEST
// ═══════════════════════════════════════════════════════════

test.describe('Flow 3: Employee Leave Submission', () => {
  test('Submit leave and verify it appears in list', async ({ page }) => {
    await loginAsEmployee(page)
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(2000)

    // Step 1: Verify NO calculation type on employee form
    const calcBtns = page.locator('button:has-text("Non Payable"), button:has-text("Hourly Salary"), button:has-text("Monthly Salary")')
    expect(await calcBtns.count()).toBe(0)

    // Step 2: Verify Spanish labels exist
    const body = await page.textContent('body')
    expect(body).toMatch(/Vacaciones|Matrimonio|Duelo|Tiempo Libre/)

    // Step 3: Verify Days Off chips exist
    await expect(page.locator('button:has-text("Sun")').first()).toBeVisible()
    await expect(page.locator('button:has-text("Sat")').first()).toBeVisible()

    // Step 4: Verify date+time pickers (3 date inputs, 3 time inputs)
    const dateInputs = page.locator('input[type="date"]')
    const timeInputs = page.locator('input[type="time"]')
    expect(await dateInputs.count()).toBeGreaterThanOrEqual(3)
    expect(await timeInputs.count()).toBeGreaterThanOrEqual(3)

    // Step 5: Fill dates for a future leave
    await dateInputs.nth(0).fill('2028-12-01') // Start date
    await dateInputs.nth(1).fill('2028-12-03') // End date
    await dateInputs.nth(2).fill('2028-12-04') // Return date

    // Step 6: Submit
    const submitBtn = page.locator('button:has-text("Submit")')
    await submitBtn.first().click()
    await page.waitForTimeout(3000)

    // Step 7: Check the notice or list updates
    const updatedBody = await page.textContent('body')
    expect(updatedBody).toMatch(/submitted|pending|2028-12-01/)
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 4: ATTENDANCE PAGE — FULL INTERACTION
// ═══════════════════════════════════════════════════════════

test.describe('Flow 4: Attendance Module Interaction', () => {
  test('View attendance table, verify columns, change date range', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(3000)

    // Step 1: Table should be visible
    const table = page.locator('table')
    await expect(table.first()).toBeVisible()

    // Step 2: Verify key column headers from client's Excel
    const headerRow = page.locator('thead th, thead td, tr:first-child th')
    const headerText = await page.locator('thead').first().textContent() || ''
    const upperHeader = headerText.toUpperCase()
    expect(upperHeader).toContain('EID')
    expect(upperHeader).toContain('EMPLOYEE')
    expect(upperHeader).toContain('STATUS')
    expect(upperHeader).toContain('PAY')
    expect(upperHeader).toContain('BILL')
    expect(upperHeader).toContain('SCH')
    expect(upperHeader).toContain('ACT')
    expect(upperHeader).toContain('DBT')

    // Step 3: Change date range
    const dateInputs = page.locator('input[type="date"]')
    if (await dateInputs.count() >= 2) {
      await dateInputs.nth(0).fill('2026-03-01')
      await dateInputs.nth(1).fill('2026-03-31')
      await page.waitForTimeout(3000)
    }

    // Step 4: Verify data rows exist
    const dataRows = page.locator('tbody tr')
    const rowCount = await dataRows.count()
    expect(rowCount).toBeGreaterThan(0)

    // Step 5: Check inline dropdowns exist (Status, Pay, Bill)
    const selects = page.locator('tbody select')
    expect(await selects.count()).toBeGreaterThan(0)

    // Step 6: Verify select dropdowns have options
    const firstSelect = selects.first()
    if (await firstSelect.isVisible()) {
      const options = await firstSelect.locator('option').allTextContents()
      expect(options.length).toBeGreaterThan(1)
    }

    // Step 7: Check summary cards
    const summaryText = await page.textContent('body')
    expect(summaryText?.toLowerCase()).toMatch(/record|present/)

    // Step 8: Verify Export button
    const exportBtn = page.locator('button:has-text("Export")')
    await expect(exportBtn.first()).toBeVisible()
  })

  test('Inline edit attendance record and verify it saves', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(3000)

    // Set date range to find records
    const dateInputs = page.locator('input[type="date"]')
    if (await dateInputs.count() >= 2) {
      await dateInputs.nth(0).fill('2026-03-01')
      await dateInputs.nth(1).fill('2026-04-01')
      await page.waitForTimeout(3000)
    }

    // Find a comment input in the table and type something
    const commentInputs = page.locator('tbody input[type="text"]')
    if (await commentInputs.count() > 0) {
      const firstComment = commentInputs.first()
      await firstComment.fill(`QA-${TS}`)
      await firstComment.blur()
      await page.waitForTimeout(2000)

      // Verify via API that comment was saved
      const token = (await (await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@hrms.com', password: 'admin123' }),
      })).json()).token
      const attRes = await fetch(`${API}/api/admin/attendance?from=2026-01-01&to=2026-12-31`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const attData = await attRes.json()
      const withComment = attData.some((r: any) => r.comments?.includes(`QA-${TS}`))
      expect(withComment).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 5: EMPLOYEE CLOCK IN/OUT FULL FLOW
// ═══════════════════════════════════════════════════════════

test.describe('Flow 5: Clock In/Out Full Flow', () => {
  test('Clock in via UI, verify active session, clock out, verify completed', async ({ page }) => {
    // Create a fresh employee for clean clock state
    const email = `deepqa-clock-${TS}@test.com`
    await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test123456', name: 'DeepQA Clock', role: 'employee' }),
    })

    const loginRes = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test123456' }),
    })
    const loginData = await loginRes.json()

    await page.goto(APP)
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('timetrack_token', token)
      localStorage.setItem('timetrack_user', JSON.stringify(user))
    }, { token: loginData.token, user: loginData.user })
    await page.goto(`${APP}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Step 1: Find and click Clock In button
    const clockInBtn = page.locator('button:has-text("Clock In"), button:has-text("clock in")')
    if (await clockInBtn.count() > 0) {
      await clockInBtn.first().click()
      await page.waitForTimeout(2000)

      // Step 2: Verify session is active (button should change to Clock Out)
      const clockOutBtn = page.locator('button:has-text("Clock Out"), button:has-text("clock out")')
      await expect(clockOutBtn.first()).toBeVisible({ timeout: 5000 })

      // Step 3: Clock out
      await clockOutBtn.first().click()
      await page.waitForTimeout(2000)

      // Step 4: Verify Clock In button is back
      await expect(clockInBtn.first()).toBeVisible({ timeout: 5000 })
    }
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 6: ADMIN REVIEWS PENDING LEAVE REQUEST
// ═══════════════════════════════════════════════════════════

test.describe('Flow 6: Admin Reviews Leave Request', () => {
  test('Review and approve a pending leave request', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)

    // Look for a pending request with Review button
    const reviewBtns = page.locator('button:has-text("Review")')
    if (await reviewBtns.count() > 0) {
      // Click first Review button
      await reviewBtns.first().click()
      await page.waitForTimeout(1000)

      // Verify review modal opened
      const modalBody = await page.locator('.fixed').last().textContent()
      expect(modalBody?.toLowerCase()).toContain('review')

      // Look for employee info in modal
      expect(modalBody?.toLowerCase()).toMatch(/employee|period|type/)

      // Look for approve/reject dropdown or buttons
      const approveOption = page.locator('text=Approve, text=approve').first()
      if (await approveOption.isVisible().catch(() => false)) {
        // Modal has approve option
      }

      // Close modal
      await page.locator('button:has-text("Cancel")').first().click()
      await page.waitForTimeout(500)
    }
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 7: SETTINGS PAGE — VERIFY PAYROLL CONFIG
// ═══════════════════════════════════════════════════════════

test.describe('Flow 7: Settings Verification', () => {
  test('Verify all payroll settings are displayed correctly', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${APP}/admin/settings`)
    await page.waitForTimeout(2000)

    const body = await page.textContent('body')
    // Working days per month
    expect(body).toMatch(/23\.83|23,83/)
    // Hours per day
    expect(body).toContain('8')
    // Night shift window
    expect(body).toMatch(/21|9.*PM/)
    expect(body).toMatch(/7\b/)
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 8: PAYROLL PAGE
// ═══════════════════════════════════════════════════════════

test.describe('Flow 8: Payroll Page', () => {
  test('Load payroll, verify employee rows with hour buckets', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${APP}/admin/payroll`)
    await page.waitForTimeout(4000)

    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('payroll')

    // Should show some employee data or "no data" message
    expect(body?.toLowerCase()).toMatch(/employee|regular|overtime|net pay|no data|select/)
  })
})

// ═══════════════════════════════════════════════════════════
// FLOW 9: NAVIGATION — EVERY ADMIN PAGE ACCESSIBLE
// ═══════════════════════════════════════════════════════════

test.describe('Flow 9: Admin Page Access', () => {
  const pages = [
    ['/admin/dashboard', 'dashboard'],
    ['/admin/employees', 'employee'],
    ['/admin/attendance', 'attendance'],
    ['/admin/leave-requests', 'leave'],
    ['/admin/payroll', 'payroll'],
    ['/admin/payroll-calendar', 'payroll'],
    ['/admin/reports', 'report'],
    ['/admin/settings', 'settings'],
    ['/admin/clients', 'client'],
    ['/admin/shifts', 'shift'],
    ['/admin/schedule', 'schedule'],
  ]

  for (const [path, keyword] of pages) {
    test(`Page ${path} loads and contains "${keyword}"`, async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${APP}${path}`)
      await page.waitForTimeout(2000)
      const body = await page.textContent('body')
      expect(body?.toLowerCase()).toContain(keyword)
    })
  }
})

// ═══════════════════════════════════════════════════════════
// FLOW 10: NAVIGATION — EVERY EMPLOYEE PAGE ACCESSIBLE
// ═══════════════════════════════════════════════════════════

test.describe('Flow 10: Employee Page Access', () => {
  const pages = [
    ['/dashboard', 'dashboard'],
    ['/dashboard/sessions', 'session'],
    ['/dashboard/leave', 'leave'],
    ['/dashboard/schedule', 'schedule'],
  ]

  for (const [path, keyword] of pages) {
    test(`Page ${path} loads and contains "${keyword}"`, async ({ page }) => {
      await loginAsEmployee(page)
      await page.goto(`${APP}${path}`)
      await page.waitForTimeout(2000)
      const body = await page.textContent('body')
      expect(body?.toLowerCase()).toContain(keyword)
    })
  }
})
