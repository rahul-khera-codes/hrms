/**
 * 26MAY save-persistence repro: drive the actual edit modals via the UI,
 * change a value, click Save, close, re-open, and read back what's shown.
 * If the displayed value doesn't match what we typed, we've reproduced the
 * client's bug.
 */
import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'

type LoginRes = { token: string; user: { id: string; email: string; role: string; name: string } }

async function registerAdmin(): Promise<LoginRes> {
  const ctx = await pwRequest.newContext()
  const r = await ctx.post(`${API}/api/auth/register`, {
    data: { email: `qa-rt-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', name: 'QA RT', role: 'admin' },
  })
  expect(r.ok()).toBeTruthy()
  const data = (await r.json()) as LoginRes
  await ctx.dispose()
  return data
}

async function seedPI(adminToken: string): Promise<{ piId: string; recordId: string }> {
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
  const emp = await (await ctx.post(`${API}/api/admin/employees`, {
    data: { name: `RT-Emp-${randomUUID().slice(0, 6)}`, email: `rt-emp-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', salaryType: 'hourly', baseSalary: 10 },
  })).json()
  const pi = await (await ctx.post(`${API}/api/admin/payroll-inputs`, {
    data: {
      userId: emp.id,
      inputType: 'Bono Colaboración',
      calculationType: 'base_amount',
      currency: 'DOP',
      baseAmount: 1000,
      exchangeRate: 1,
      payrollCycleCode: '2026-P12',
      approverId: emp.id,
      status: 'pending',
      notes: 'original-note',
    },
  })).json()
  await ctx.dispose()
  return { piId: pi.id, recordId: pi.recordId }
}

async function setStorage(page: Page, token: string, user: LoginRes['user']) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token, user })
}

test.describe.configure({ timeout: 300000 })

test('Payroll Input edit: type → Save → reopen shows new value', async ({ page }) => {
  const admin = await registerAdmin()
  const { recordId } = await seedPI(admin.token)
  await setStorage(page, admin.token, admin.user)

  await page.goto(`${APP}/admin/payroll-inputs`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // Click the row by its Record ID
  await page.locator(`tr:has-text("${recordId}")`).first().click()
  await page.waitForTimeout(1200)
  await expect(page.locator(`text=${recordId}`).first()).toBeVisible({ timeout: 5000 })

  // Find the Notes textarea. The form has 2 textareas (notes + review note).
  // Notes is the first textarea.
  const notesArea = page.locator('textarea').first()
  await notesArea.click()
  await notesArea.fill('edited-via-ui-test')
  await page.waitForTimeout(200)

  // Also change Base Amount so we have a second field to verify
  const baseAmountInput = page.locator('input[placeholder="e.g. 2000"]')
  await baseAmountInput.click()
  await baseAmountInput.fill('1500')
  await page.waitForTimeout(200)

  // Click "Save changes"
  await page.click('button:has-text("Save changes")')
  await page.waitForTimeout(2500)

  // Reload page to be sure nothing's cached
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // Re-open the same row
  await page.locator(`tr:has-text("${recordId}")`).first().click()
  await page.waitForTimeout(1500)

  // Re-read notes
  const notesAfter = await page.locator('textarea').first().inputValue()
  const baseAmountAfter = await page.locator('input[placeholder="e.g. 2000"]').inputValue()
  console.log('[step] AFTER reopen: notes =', JSON.stringify(notesAfter), ' baseAmount =', JSON.stringify(baseAmountAfter))

  expect(notesAfter, 'Notes should reflect the edit after save + reopen').toBe('edited-via-ui-test')
  expect(baseAmountAfter, 'Base Amount should reflect the edit after save + reopen').toBe('1500')
})

test('Leaves edit: edit Days Off + Notes → Save → reopen shows new values', async ({ page }) => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  // seed an employee
  const empEmail = `rt-leave-${randomUUID().slice(0, 8)}@test.com`
  const emp = await (await ctx.post(`${API}/api/admin/employees`, {
    data: { name: `RT-Leave-${randomUUID().slice(0, 6)}`, email: empEmail, password: 'test1234', salaryType: 'monthly', baseSalary: 60000 },
  })).json()
  // seed a leave (admin POST creates approved-status leave with status defaulting to approved)
  const leave = await (await ctx.post(`${API}/api/admin/leave-requests`, {
    data: {
      employeeId: emp.id,
      leaveType: 'paid',
      leaveCategory: 'vacation',
      calculationType: 'hourly_salary',
      payableDays: 5,
      dailyHours: 8,
      hourlyRate: 50,
      associateDaysOff: ['Sun', 'Sat'],
      startDate: '2026-08-10',
      endDate: '2026-08-14',
      returnDate: '2026-08-17',
      startTime: '08:00',
      endTime: '17:00',
      returnTime: '08:00',
      payrollCycleCode: '2026-P12',
      approverName: 'Orlando Santana',
      payrollStatus: 'Approved',
      reason: 'original-leave-reason',
    },
  })).json()
  // Fetch the list to discover the LOA-#### that was just assigned
  const ctx2 = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  const list = await (await ctx2.get(`${API}/api/admin/leave-requests`)).json() as Array<{ id: string; recordId: string }>
  await ctx2.dispose()
  const found = list.find((l) => l.id === leave.id)
  await ctx.dispose()
  const recordId = found?.recordId as string
  console.log('[seed] leave recordId =', recordId, ' id =', leave.id)

  await setStorage(page, admin.token, admin.user)
  await page.goto(`${APP}/admin/leave-requests`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // Open the leave's row
  await page.locator(`tr:has-text("${recordId}")`).first().click()
  await page.waitForTimeout(1500)
  await expect(page.locator(`text=${recordId}`).first()).toBeVisible({ timeout: 5000 })

  // Toggle "Wed" in Days Off (was [Sun, Sat]; add Wed)
  await page.locator('button:has-text("Wed")').first().click()
  await page.waitForTimeout(200)

  // Change Notes textarea (first textarea in the review modal)
  const notesArea = page.locator('textarea').first()
  await notesArea.click()
  await notesArea.fill('edited-leave-note')
  await page.waitForTimeout(200)

  // Click "Save"
  await page.click('button:has-text("Save"):not(:has-text("Save changes"))')
  await page.waitForTimeout(3000)

  // Reload + reopen
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.locator(`tr:has-text("${recordId}")`).first().click()
  await page.waitForTimeout(2500)

  // Read Days Off state — Wed should be active (highlighted)
  const wedBtn = page.locator('button:has-text("Wed")').first()
  const wedClass = (await wedBtn.getAttribute('class')) || ''
  console.log('[step] AFTER Wed class:', wedClass)

  const notesAfter = await page.locator('textarea').first().inputValue()
  console.log('[step] AFTER notes:', JSON.stringify(notesAfter))

  expect(wedClass, 'Wed should be selected (bg-brand-600) after reopen').toContain('bg-brand-600')
  expect(notesAfter, 'Notes textarea should hold the edited note after reopen').toBe('edited-leave-note')
})

test('Leaves edit: change Approval Status Approved→Pending persists', async ({ page }) => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  const emp = await (await ctx.post(`${API}/api/admin/employees`, {
    data: { name: `RT-AS-${randomUUID().slice(0, 6)}`, email: `rt-as-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', salaryType: 'hourly', baseSalary: 10 },
  })).json()
  const leave = await (await ctx.post(`${API}/api/admin/leave-requests`, {
    data: {
      employeeId: emp.id, leaveType: 'paid', leaveCategory: 'vacation', calculationType: 'hourly_salary',
      payableDays: 3, dailyHours: 8, hourlyRate: 10, associateDaysOff: ['Sun', 'Sat'],
      startDate: '2026-08-10', endDate: '2026-08-12', returnDate: '2026-08-13',
      startTime: '08:00', endTime: '17:00', returnTime: '08:00',
      payrollCycleCode: '2026-P12', approverName: 'Orlando Santana',
      payrollStatus: 'Approved', reason: 'as-test',
    },
  })).json()
  const list = await (await ctx.get(`${API}/api/admin/leave-requests`)).json() as Array<{ id: string; recordId: string }>
  const recordId = list.find((l) => l.id === leave.id)?.recordId as string
  await ctx.dispose()
  console.log('[seed] LOA =', recordId)

  await setStorage(page, admin.token, admin.user)
  await page.goto(`${APP}/admin/leave-requests`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.locator(`tr:has-text("${recordId}")`).first().click()
  await page.waitForTimeout(1500)

  // Approval Status: click Pending (currently Approved)
  await page.locator('button:has-text("Pending"):not(:has-text("Rejected"))').first().click()
  await page.waitForTimeout(300)

  await page.click('button:has-text("Save"):not(:has-text("Save changes"))')
  await page.waitForTimeout(3000)

  // Reload + verify via API too (most direct)
  const verifyCtx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  const refreshed = await (await verifyCtx.get(`${API}/api/admin/leave-requests`)).json() as Array<{ recordId: string; payrollStatus: string; status: string }>
  await verifyCtx.dispose()
  const row = refreshed.find((r) => r.recordId === recordId)
  console.log('[verify] status =', row?.status, ' payrollStatus =', row?.payrollStatus)

  expect(row?.payrollStatus, 'payrollStatus should now be Pending after edit').toBe('Pending')
})
