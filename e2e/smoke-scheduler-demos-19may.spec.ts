/**
 * Smoke test for the 19MAY2026 "SCHEDULER DEMOs" client video + meeting punch list.
 *
 * Covers:
 *  - Dark/light theme toggle persists across reloads
 *  - Audit fields (Created By/On, Modified By/On) flow through the attendance API
 *  - Reviewed/Normalized flag toggleable; "needs-review" endpoint reachable
 *  - Bulk-assign pre-populates attendance rows in `sessions` (is_scheduled=true)
 *
 * Run:
 *   BASE=http://116.202.210.102:5173 API=http://116.202.210.102:4000 \
 *   npx playwright test e2e/smoke-scheduler-demos-19may.spec.ts
 */
import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'

type LoginRes = { token: string; user: { id: string; email: string; role: string } }

async function registerAdmin(): Promise<LoginRes> {
  const ctx = await pwRequest.newContext()
  const r = await ctx.post(`${API}/api/auth/register`, {
    data: { email: `qa-demos-admin-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', name: 'Demos Admin', role: 'admin' },
  })
  expect(r.ok(), `register admin ${r.status()} ${await r.text()}`).toBeTruthy()
  const data = (await r.json()) as LoginRes
  await ctx.dispose()
  return data
}

async function registerEmployee(adminToken: string): Promise<{ id: string; email: string; pw: string }> {
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
  const email = `qa-demos-emp-${randomUUID().slice(0, 8)}@test.com`
  const pw = 'test1234'
  const r = await ctx.post(`${API}/api/admin/employees`, {
    data: { name: 'Demos Emp', email, password: pw, salaryType: 'hourly', baseSalary: 10 },
  })
  expect(r.ok(), `register employee ${r.status()} ${await r.text()}`).toBeTruthy()
  const j = await r.json()
  await ctx.dispose()
  return { id: j.id, email, pw }
}

async function loginVia(page: Page, login: LoginRes) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 90000 })
      break
    } catch (e) { if (attempt === 1) throw e }
  }
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token: login.token, user: login.user })
}

test.describe.configure({ timeout: 180000 })

test('Dark theme toggle persists across reloads', async ({ page }) => {
  test.setTimeout(180000)
  const admin = await registerAdmin()
  await loginVia(page, admin)
  await page.goto(`${APP}/admin/employees`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('aside', { timeout: 30000 })

  // Theme starts light by default for new sessions.
  let htmlIsDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(htmlIsDark).toBeFalsy()

  // Toggle to dark via the sidebar/header button.
  const toggle = page.locator('button[aria-label*="dark mode" i], button[aria-label*="light mode" i]').first()
  await expect(toggle).toBeVisible({ timeout: 15000 })
  await toggle.click()
  await page.waitForTimeout(200)
  htmlIsDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(htmlIsDark).toBeTruthy()
  const stored = await page.evaluate(() => localStorage.getItem('hrms.theme'))
  expect(stored).toBe('dark')

  // Reload — preference should stick (no flash).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('aside', { timeout: 30000 })
  htmlIsDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(htmlIsDark).toBeTruthy()
})

test('Attendance audit + reviewed toggle endpoints work', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  const emp = await registerEmployee(admin.token)

  // Create an attendance record manually via API (becomes a regular session).
  const create = await ctx.post(`${API}/api/admin/attendance`, {
    data: {
      employeeId: emp.id,
      clockIn: '2026-06-15T13:00:00Z',
      clockOut: '2026-06-15T21:00:00Z',
      stage: 'Production',
      payType: 'Regular',
      billType: 'Regular',
    },
  })
  expect(create.ok(), `create attendance ${create.status()} ${await create.text()}`).toBeTruthy()
  const rec = await create.json()
  expect(rec.createdByName).toBe('Demos Admin')
  expect(rec.createdOn).toBeTruthy()
  expect(rec.reviewed).toBe(false)

  // Toggle reviewed = true.
  const flip = await ctx.patch(`${API}/api/admin/attendance/${rec.id}/reviewed`, { data: { reviewed: true } })
  expect(flip.ok()).toBeTruthy()
  expect((await flip.json()).reviewed).toBe(true)

  // Modify another field — modified_by/on should populate.
  const upd = await ctx.patch(`${API}/api/admin/attendance/${rec.id}`, { data: { comments: 'audit-test' } })
  expect(upd.ok(), `update ${upd.status()} ${await upd.text()}`).toBeTruthy()
  const updated = await upd.json()
  expect(updated.modifiedByName).toBe('Demos Admin')
  expect(updated.modifiedOn).toBeTruthy()
  expect(updated.reviewed).toBe(true)

  // needs-review endpoint exists and returns a count.
  const need = await ctx.get(`${API}/api/admin/attendance/needs-review?from=2026-06-15&to=2026-06-15`)
  expect(need.ok()).toBeTruthy()
  const nr = await need.json()
  expect(typeof nr.needsReview).toBe('number')

  await ctx.dispose()
})

test('Bulk-assign pre-populates attendance rows with is_scheduled=true', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  // Set up client, shift, employee.
  const cl = await ctx.post(`${API}/api/admin/clients`, { data: { name: `Pre-pop ${randomUUID().slice(0, 6)}` } })
  const clientId = (await cl.json()).id
  const sh = await ctx.post(`${API}/api/admin/shifts`, { data: { name: 'Pre-pop Day', startTime: '09:00', endTime: '17:00', clientId } })
  const shiftId = (await sh.json()).id
  const emp = await registerEmployee(admin.token)

  const dateFrom = '2026-08-03' // Mon
  const dateTo = '2026-08-07'   // Fri
  const bulk = await ctx.post(`${API}/api/admin/schedule/bulk-assign`, {
    data: { clientId, shiftId, userIds: [emp.id], dateFrom, dateTo, daysOff: [] },
  })
  expect(bulk.ok()).toBeTruthy()
  const result = await bulk.json()
  expect(result.totalRows).toBe(5)
  // Brand-new field: pre-populated attendance rows.
  expect(result.attendanceCreated).toBe(5)

  // Verify those rows show up in the admin attendance feed as scheduled drafts.
  const att = await ctx.get(`${API}/api/admin/attendance?from=${dateFrom}&to=${dateTo}`)
  expect(att.ok()).toBeTruthy()
  const rows: Array<{ employeeId: string; isScheduled: boolean }> = await att.json()
  const ourRows = rows.filter((r) => r.employeeId === emp.id)
  expect(ourRows.length).toBe(5)
  expect(ourRows.every((r) => r.isScheduled === true)).toBe(true)

  await ctx.dispose()
})
