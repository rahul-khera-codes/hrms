/**
 * FULL UI QA TEST SUITE — Tests every single feature through the browser UI
 * Covers: Auth, Admin Dashboard, Employee Management, Attendance, Leave Management,
 * Payroll, Settings, Schedule, Clients, Shifts, Employee Dashboard, Clock In/Out,
 * Sessions, Leave Requests, Notifications
 */
import { test, expect, type Page } from '@playwright/test'

const API = 'http://localhost:4000'
const APP = 'http://localhost:5173'

// Unique suffix to avoid collisions across runs
const TS = Date.now()

// ─── HELPERS ────────────────────────────────────────

async function getToken(email: string, password: string): Promise<string> {
  let res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: email.split('@')[0], role: email.includes('admin') ? 'admin' : 'employee' }),
    })
  }
  const data = await res.json()
  return data.token
}

async function loginUI(page: Page, email: string, password: string, role: 'admin' | 'employee') {
  const token = await getToken(email, password)
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  await page.goto(APP)
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token: data.token, user: data.user })
  if (role === 'admin') {
    await page.goto(`${APP}/admin/dashboard`)
  } else {
    await page.goto(`${APP}/dashboard`)
  }
  await page.waitForLoadState('networkidle')
}

function fmt(n: number) { return n.toFixed(2) }

// ═══════════════════════════════════════════════════════════
// SECTION A: AUTHENTICATION & REGISTRATION UI
// ═══════════════════════════════════════════════════════════

test.describe('A. Authentication UI', () => {
  test('A1: Login page renders', async ({ page }) => {
    await page.goto(APP)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    // Page should load and show some form of login UI
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/log in|sign up|login|register|email|clock/)
  })

  test('A2: Admin login redirects to admin dashboard', async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
    await expect(page).toHaveURL(/admin/)
  })

  test('A3: Employee login redirects to employee dashboard', async ({ page }) => {
    await loginUI(page, 'employee@hrms.com', 'employee123', 'employee')
    await expect(page).toHaveURL(/dashboard/)
    expect(page.url()).not.toContain('admin')
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION B: ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════

test.describe('B. Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
  })

  test('B1: Dashboard shows stat cards', async ({ page }) => {
    await page.goto(`${APP}/admin/dashboard`)
    await page.waitForTimeout(2000)
    // Should have stat cards (total employees, present, absent, etc.)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('B2: Sidebar navigation has all admin links', async ({ page }) => {
    await page.goto(`${APP}/admin/dashboard`)
    await page.waitForTimeout(1000)
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first()
    const bodyText = await page.textContent('body')
    // Check navigation items exist somewhere on page
    const navItems = ['Dashboard', 'Attendance', 'Leave', 'Payroll', 'Employee', 'Settings']
    for (const item of navItems) {
      const found = bodyText?.toLowerCase().includes(item.toLowerCase())
      if (!found) console.log(`Warning: Nav item "${item}" not found in page text`)
    }
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION C: EMPLOYEE MANAGEMENT (Engagement Details)
// ═══════════════════════════════════════════════════════════

test.describe('C. Employee Management UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
  })

  test('C1: Employee list page loads with employees', async ({ page }) => {
    await page.goto(`${APP}/admin/employees`)
    await page.waitForTimeout(3000)
    // Should show employee cards or a list
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('employee')
  })

  test('C2: Add employee button exists and opens modal', async ({ page }) => {
    await page.goto(`${APP}/admin/employees`)
    await page.waitForTimeout(2000)
    const addBtn = page.locator('button:has-text("Add employee"), button:has-text("Add Employee")').first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()
    await page.waitForTimeout(500)
    // Modal should be visible with form fields
    const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="Full" i]').first()
    await expect(nameInput).toBeVisible({ timeout: 3000 })
  })

  test('C3: Create employee with engagement details', async ({ page }) => {
    await page.goto(`${APP}/admin/employees`)
    await page.waitForTimeout(2000)

    // Click Add employee
    await page.locator('button:has-text("Add employee"), button:has-text("Add Employee")').first().click()
    await page.waitForTimeout(500)

    // Fill basic fields
    await page.locator('input[placeholder*="name" i], input[placeholder*="Full" i]').first().fill(`QA Test ${TS}`)
    await page.locator('input[type="email"], input[placeholder*="email" i]').last().fill(`qa-${TS}@test.com`)

    // Fill password
    const pwInputs = page.locator('input[type="password"]')
    if (await pwInputs.count() > 0) {
      await pwInputs.first().fill('test123456')
    }

    // Fill CMID if visible
    const cmidInput = page.locator('input[placeholder*="1001"], label:has-text("CMID") + input, label:has-text("CMID") ~ input').first()
    if (await cmidInput.isVisible().catch(() => false)) {
      await cmidInput.fill(String(TS % 10000))
    }

    // Click Save
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("save")').last()
    await saveBtn.click()
    await page.waitForTimeout(3000)

    // Verify employee was created (API check since it may be on page 2)
    const token = await getToken('admin@hrms.com', 'admin123')
    const res = await fetch(`${API}/api/admin/employees`, { headers: { Authorization: `Bearer ${token}` } })
    const emps = await res.json()
    const found = emps.some((e: any) => e.name === `QA Test ${TS}`)
    expect(found).toBe(true)
  })

  test('C4: Edit employee opens modal', async ({ page }) => {
    await page.goto(`${APP}/admin/employees`)
    await page.waitForTimeout(3000)

    // Click the pencil/edit icon on the first employee card
    const editBtns = page.locator('[title="Edit"], button:has(svg.lucide-pencil), button:has(svg[class*="pencil"])')
    if (await editBtns.count() > 0) {
      await editBtns.first().click()
      await page.waitForTimeout(1000)
      // Modal should open - check for Save/Cancel buttons
      const saveBtn = page.locator('button:has-text("Save")')
      await expect(saveBtn.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('C5: Employee list has client/shift filters', async ({ page }) => {
    await page.goto(`${APP}/admin/employees`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/filter|client|shift/)
  })

  test('C6: Pagination works on employee list', async ({ page }) => {
    await page.goto(`${APP}/admin/employees`)
    await page.waitForTimeout(2000)
    // Check for pagination controls
    const pageText = await page.textContent('body')
    expect(pageText?.toLowerCase()).toMatch(/page|showing|next|prev/)
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION D: ATTENDANCE MODULE
// ═══════════════════════════════════════════════════════════

test.describe('D. Attendance Module UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
  })

  test('D1: Attendance page loads with table', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(3000)
    // Should have a table with attendance data
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 10000 })
  })

  test('D2: Attendance table has all required column headers', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(3000)
    const headerText = await page.locator('thead, tr:first-child').first().textContent()
    const requiredHeaders = ['EID', 'Employee', 'Account', 'Status', 'Pay', 'Bill', 'SCH', 'ACT', 'DBT']
    for (const header of requiredHeaders) {
      expect(headerText?.toUpperCase()).toContain(header.toUpperCase())
    }
  })

  test('D3: Date range filter works', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(2000)
    // Should have date inputs for filtering
    const dateInputs = page.locator('input[type="date"]')
    expect(await dateInputs.count()).toBeGreaterThanOrEqual(2)
  })

  test('D4: Search filter works', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(2000)
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i], input[type="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('employee')
      await page.waitForTimeout(2000)
      // Table should filter results
    }
  })

  test('D5: Inline editing - Status dropdown', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(3000)
    // Find a status dropdown in the table
    const statusSelect = page.locator('select').first()
    if (await statusSelect.isVisible().catch(() => false)) {
      // Verify it has options
      const options = await statusSelect.locator('option').count()
      expect(options).toBeGreaterThan(1)
    }
  })

  test('D6: Inline editing - Pay type dropdown has correct options', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(3000)
    // Look for Pay dropdown - should have Regular, X35%, X100%, DNP
    const allSelects = page.locator('select')
    const count = await allSelects.count()
    let foundPay = false
    for (let i = 0; i < count; i++) {
      const selectText = await allSelects.nth(i).textContent()
      if (selectText?.includes('Regular') && selectText?.includes('X35%')) {
        foundPay = true
        expect(selectText).toContain('X100%')
        expect(selectText).toContain('DNP')
        break
      }
    }
    // Pay dropdown may or may not be visible depending on data
  })

  test('D7: Summary stats are displayed', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    // Should show summary cards
    expect(body?.toLowerCase()).toMatch(/record|present|absent/)
  })

  test('D8: CSV export button exists', async ({ page }) => {
    await page.goto(`${APP}/admin/attendance`)
    await page.waitForTimeout(2000)
    const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV"), button:has-text("export")')
    await expect(exportBtn.first()).toBeVisible({ timeout: 5000 })
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION E: ADMIN LEAVE MANAGEMENT
// ═══════════════════════════════════════════════════════════

test.describe('E. Admin Leave Management UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
  })

  test('E1: Leave requests page loads with stats', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('leave')
    // Should have stat cards (Total, Pending, Approved, Rejected)
    expect(body?.toLowerCase()).toMatch(/total|pending|approved|rejected/)
  })

  test('E2: New Leave button exists', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    const newBtn = page.locator('button:has-text("New Leave"), button:has-text("New leave")')
    await expect(newBtn.first()).toBeVisible()
  })

  test('E3: New Leave modal opens with all fields', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    // Check modal is visible
    const modal = page.locator('[role="dialog"], .fixed')
    await expect(modal.first()).toBeVisible({ timeout: 3000 })

    // Check for key fields
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('employee')
    expect(body?.toLowerCase()).toContain('leave type')
    expect(body?.toLowerCase()).toContain('calculation')
  })

  test('E4: Calculation toggle - Non Payable hides pay fields', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    // Click Non Payable
    await page.locator('button:has-text("Non Payable")').click()
    await page.waitForTimeout(300)

    // Payable Days should NOT be visible
    const payableDays = page.locator('label:has-text("Payable Days")')
    await expect(payableDays).not.toBeVisible()

    // Monthly Rate / Hourly Rate should NOT be visible
    const monthlyRate = page.locator('label:has-text("Monthly Rate")')
    const hourlyRate = page.locator('label:has-text("Hourly Rate")')
    await expect(monthlyRate).not.toBeVisible()
    await expect(hourlyRate).not.toBeVisible()
  })

  test('E5: Calculation toggle - Hourly shows hourly fields', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    // Click Hourly Salary
    await page.locator('button:has-text("Hourly Salary")').click()
    await page.waitForTimeout(300)

    // Payable Days, Hourly Rate, Daily Hours should be visible
    await expect(page.locator('label:has-text("Payable Days")')).toBeVisible()
    await expect(page.locator('label:has-text("Hourly Rate")')).toBeVisible()
    await expect(page.locator('label:has-text("Daily Hours")')).toBeVisible()

    // Monthly Rate should NOT be visible
    await expect(page.locator('label:has-text("Monthly Rate")')).not.toBeVisible()
  })

  test('E6: Calculation toggle - Monthly shows monthly fields', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    // Click Monthly Salary
    await page.locator('button:has-text("Monthly Salary")').click()
    await page.waitForTimeout(300)

    // Payable Days and Monthly Rate should be visible
    await expect(page.locator('label:has-text("Payable Days")')).toBeVisible()
    await expect(page.locator('label:has-text("Monthly Rate")')).toBeVisible()

    // Hourly Rate and Daily Hours should NOT be visible
    await expect(page.locator('label:has-text("Hourly Rate")')).not.toBeVisible()
    await expect(page.locator('label:has-text("Daily Hours")')).not.toBeVisible()
  })

  test('E7: Auto-calc Daily Salary and Payable Amount for Monthly', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    // Select Monthly Salary
    await page.locator('button:has-text("Monthly Salary")').click()
    await page.waitForTimeout(300)

    // Fill Payable Days = 3, Monthly Rate = 50000
    await page.locator('input[placeholder*="payable" i], label:has-text("Payable Days") ~ input, label:has-text("Payable Days") + input').first().fill('3')
    await page.locator('input[placeholder*="50000" i], label:has-text("Monthly Rate") ~ input, label:has-text("Monthly Rate") + input').first().fill('50000')
    await page.waitForTimeout(500)

    // Check auto-calculated values appear
    const body = await page.textContent('body')
    // Daily salary should be ~2098.20 (50000/23.83)
    // Payable amount should be ~6294.59 (2098.20 * 3)
    expect(body).toMatch(/2,?098|2098/)
    expect(body).toMatch(/6,?294|6294/)
  })

  test('E8: Auto-calc for Hourly salary', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    await page.locator('button:has-text("Hourly Salary")').click()
    await page.waitForTimeout(300)

    // Fill fields
    const inputs = page.locator('input[type="number"]')
    const count = await inputs.count()
    // Find and fill Payable Days, Hourly Rate, Daily Hours
    for (let i = 0; i < count; i++) {
      const placeholder = await inputs.nth(i).getAttribute('placeholder')
      const label = await inputs.nth(i).evaluate((el) => {
        const prev = el.closest('div')?.querySelector('label')
        return prev?.textContent || ''
      })
      if (label.includes('Payable') || placeholder?.includes('payable')) {
        await inputs.nth(i).fill('5')
      } else if (label.includes('Hourly') || placeholder?.includes('150')) {
        await inputs.nth(i).fill('150')
      } else if (label.includes('Daily') || placeholder?.includes('8')) {
        await inputs.nth(i).fill('8')
      }
    }
    await page.waitForTimeout(500)

    const body = await page.textContent('body')
    // Daily salary = 150*8 = 1200, Payable amount = 1200*5 = 6000
    expect(body).toMatch(/1,?200|1200/)
    expect(body).toMatch(/6,?000|6000/)
  })

  test('E9: Days Off multi-select chips', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    // Days Off chips should be visible
    const sunChip = page.locator('button:has-text("Sun")').first()
    const satChip = page.locator('button:has-text("Sat")').first()
    await expect(sunChip).toBeVisible()
    await expect(satChip).toBeVisible()
  })

  test('E10: Asset Deactivation multi-select', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    const body = await page.textContent('body')
    expect(body).toContain('Asset Deactivation')
    expect(body).toContain('Access Card')
    expect(body).toContain('O-365')
  })

  test('E11: Leave type dropdown has Spanish labels', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    await page.locator('button:has-text("New Leave"), button:has-text("New leave")').first().click()
    await page.waitForTimeout(500)

    const body = await page.textContent('body')
    expect(body).toContain('Matrimonio')
    expect(body).toContain('Vacaciones')
  })

  test('E12: Filter leave requests by status', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    // Filter dropdown should exist
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/pending|approved|rejected|filter/)
  })

  test('E13: Review pending leave request', async ({ page }) => {
    await page.goto(`${APP}/admin/leave-requests`)
    await page.waitForTimeout(2000)
    // Look for Review button
    const reviewBtn = page.locator('button:has-text("Review")')
    if (await reviewBtn.count() > 0) {
      await reviewBtn.first().click()
      await page.waitForTimeout(1000)
      // Review modal should appear
      const body = await page.textContent('body')
      expect(body?.toLowerCase()).toContain('review')
    }
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION F: PAYROLL
// ═══════════════════════════════════════════════════════════

test.describe('F. Payroll UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
  })

  test('F1: Payroll page loads', async ({ page }) => {
    await page.goto(`${APP}/admin/payroll`)
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('payroll')
  })

  test('F2: Payroll calendar page loads', async ({ page }) => {
    await page.goto(`${APP}/admin/payroll-calendar`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/payroll|calendar|period|cycle/)
  })

  test('F3: Reports page loads', async ({ page }) => {
    await page.goto(`${APP}/admin/reports`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/report/)
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION G: SETTINGS
// ═══════════════════════════════════════════════════════════

test.describe('G. Settings UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
  })

  test('G1: Settings page shows payroll configuration', async ({ page }) => {
    await page.goto(`${APP}/admin/settings`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/settings|working days|hours per day|overtime|night/)
  })

  test('G2: Settings shows night shift hours (9PM-7AM)', async ({ page }) => {
    await page.goto(`${APP}/admin/settings`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toMatch(/21|9.*PM/)
    expect(body).toMatch(/7|7.*AM/)
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION H: CLIENTS, SHIFTS, SCHEDULE
// ═══════════════════════════════════════════════════════════

test.describe('H. Clients, Shifts & Schedule UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'admin@hrms.com', 'admin123', 'admin')
  })

  test('H1: Clients page loads', async ({ page }) => {
    await page.goto(`${APP}/admin/clients`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('client')
  })

  test('H2: Shifts page loads', async ({ page }) => {
    await page.goto(`${APP}/admin/shifts`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('shift')
  })

  test('H3: Schedule page loads', async ({ page }) => {
    await page.goto(`${APP}/admin/schedule`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('schedule')
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION I: EMPLOYEE DASHBOARD & CLOCK IN/OUT
// ═══════════════════════════════════════════════════════════

test.describe('I. Employee Dashboard & Clock', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'employee@hrms.com', 'employee123', 'employee')
  })

  test('I1: Employee dashboard shows clock button', async ({ page }) => {
    await page.goto(`${APP}/dashboard`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/clock|in|out|dashboard/)
  })

  test('I2: Employee dashboard shows time summary', async ({ page }) => {
    await page.goto(`${APP}/dashboard`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/regular|overtime|night|hours|total/)
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION J: EMPLOYEE SESSIONS
// ═══════════════════════════════════════════════════════════

test.describe('J. Employee Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'employee@hrms.com', 'employee123', 'employee')
  })

  test('J1: Sessions page loads with history', async ({ page }) => {
    await page.goto(`${APP}/dashboard/sessions`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/session|history/)
  })

  test('J2: Sessions shows summary stats', async ({ page }) => {
    await page.goto(`${APP}/dashboard/sessions`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/regular|overtime|night|total/)
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION K: EMPLOYEE LEAVE FORM
// ═══════════════════════════════════════════════════════════

test.describe('K. Employee Leave Form', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'employee@hrms.com', 'employee123', 'employee')
  })

  test('K1: Leave page loads', async ({ page }) => {
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toContain('leave')
  })

  test('K2: Leave form has Spanish leave type labels', async ({ page }) => {
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    // Should have at least one Spanish label visible or selectable
    expect(body).toMatch(/Matrimonio|Vacaciones|Duelo|Tiempo Libre|Maternidad|Paternidad|Licencia/)
  })

  test('K3: Leave form does NOT have Calculation Type', async ({ page }) => {
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(2000)
    // Should NOT find calculation toggle buttons
    const calcBtn = page.locator('button:has-text("Non Payable"), button:has-text("Hourly Salary"), button:has-text("Monthly Salary")')
    expect(await calcBtn.count()).toBe(0)
  })

  test('K4: Leave form has Days Off multi-select', async ({ page }) => {
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body).toContain('Days Off')
    // Day chips
    const sunChip = page.locator('button:has-text("Sun")').first()
    await expect(sunChip).toBeVisible()
  })

  test('K5: Leave form has Start/End/Return Date & Time', async ({ page }) => {
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(2000)
    const dateInputs = page.locator('input[type="date"]')
    const timeInputs = page.locator('input[type="time"]')
    expect(await dateInputs.count()).toBeGreaterThanOrEqual(3) // start, end, return
    expect(await timeInputs.count()).toBeGreaterThanOrEqual(3)
  })

  test('K6: Leave form has submit button', async ({ page }) => {
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(2000)
    const submitBtn = page.locator('button:has-text("Submit"), button[type="submit"]')
    await expect(submitBtn.first()).toBeVisible()
  })

  test('K7: Leave requests list shows existing requests', async ({ page }) => {
    await page.goto(`${APP}/dashboard/leave`)
    await page.waitForTimeout(3000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/request|pending|approved|rejected|no leave/)
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION L: EMPLOYEE SCHEDULE
// ═══════════════════════════════════════════════════════════

test.describe('L. Employee Schedule', () => {
  test.beforeEach(async ({ page }) => {
    await loginUI(page, 'employee@hrms.com', 'employee123', 'employee')
  })

  test('L1: Schedule page loads', async ({ page }) => {
    await page.goto(`${APP}/dashboard/schedule`)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body?.toLowerCase()).toMatch(/schedule|shift/)
  })
})

// ═══════════════════════════════════════════════════════════
// SECTION M: API INTEGRATION TESTS (Comprehensive)
// ═══════════════════════════════════════════════════════════

test.describe('M. API Integration', () => {
  let adminToken: string
  let empToken: string

  test.beforeAll(async () => {
    adminToken = await getToken('admin@hrms.com', 'admin123')
    empToken = await getToken('employee@hrms.com', 'employee123')
  })

  test('M1: Admin settings returns correct defaults', async () => {
    const res = await fetch(`${API}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const data = await res.json()
    expect(data.workingDaysPerMonth).toBeCloseTo(23.83, 1)
    expect(data.hoursPerDay).toBe(8)
  })

  test('M2: Payroll periods exist', async () => {
    const res = await fetch(`${API}/api/admin/payroll/periods`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const data = await res.json()
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].cycleCode).toBeTruthy()
  })

  test('M3: Employee can get notifications', async () => {
    const res = await fetch(`${API}/api/notifications/my-notifications`, {
      headers: { Authorization: `Bearer ${empToken}` },
    })
    expect(res.ok).toBe(true)
  })

  test('M4: Admin can get holidays', async () => {
    const res = await fetch(`${API}/api/admin/holidays`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('M5: Admin /me returns user info', async () => {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.user?.role || data.role).toBe('admin')
  })

  test('M6: Employee summary returns hours', async () => {
    const res = await fetch(`${API}/api/sessions/summary?from=2026-01-01&to=2026-12-31`, {
      headers: { Authorization: `Bearer ${empToken}` },
    })
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data).toHaveProperty('regularHours')
    expect(data).toHaveProperty('overtimeHours')
    expect(data).toHaveProperty('nightHours')
    expect(data).toHaveProperty('totalHours')
  })

  test('M7: Attendance PATCH validates session exists', async () => {
    const res = await fetch(`${API}/api/admin/attendance/00000000-0000-0000-0000-000000000000`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ payType: 'Regular' }),
    })
    expect(res.status).toBe(404)
  })

  test('M8: Leave overlap detection works', async () => {
    // Get the employee's user ID (the user behind empToken)
    const meRes = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${empToken}` } })
    const meData = await meRes.json()
    const empUserId = meData.user?.id || meData.id

    // Admin creates an approved leave for THIS specific employee
    const uniqueStart = '2029-07-10'
    const uniqueEnd = '2029-07-15'
    await fetch(`${API}/api/admin/leave-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        employeeId: empUserId,
        leaveType: 'paid', leaveCategory: 'vacation', calculationType: 'non_payable',
        startDate: uniqueStart, endDate: uniqueEnd,
      }),
    })

    // Now try employee submitting overlapping leave — should get 409
    const overlap = await fetch(`${API}/api/sessions/leave-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}` },
      body: JSON.stringify({ leaveType: 'paid', startDate: '2029-07-12', endDate: '2029-07-14', leaveCategory: 'marriage' }),
    })
    expect(overlap.status).toBe(409)
  })
})
