/**
 * Smoke test for 19MAY2026 Scheduler Module Part 1 (Orlando's bulk-assign request).
 * Runs against the deployed environment.
 *
 * What we verify:
 *  - POST /api/admin/schedule/bulk-assign — creates schedule_assignments rows in bulk.
 *  - GET /api/admin/schedule/stats — returns totals/filled/open/hours.
 *  - POST /api/admin/schedule/publish — flips published flag.
 *  - GET /api/admin/schedule/shift-groups — distinct list endpoint exists.
 *  - The Scheduler admin page renders the new "Assign Shifts" button.
 *
 * Run:
 *   BASE=http://116.202.210.102:5173 API=http://116.202.210.102:4000 \
 *   npx playwright test e2e/smoke-scheduler-19may.spec.ts
 */
import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'

type LoginRes = { token: string; user: { id: string; email: string; role: string } }

async function ensureAdmin(): Promise<LoginRes> {
  const ctx = await pwRequest.newContext()
  const email = `qa-sched-${randomUUID().slice(0, 8)}@test.com`
  const pw = 'test1234'
  const reg = await ctx.post(`${API}/api/auth/register`, {
    data: { email, password: pw, name: 'QA Scheduler Admin', role: 'admin' },
  })
  expect(reg.ok()).toBeTruthy()
  const data = (await reg.json()) as LoginRes
  await ctx.dispose()
  return data
}

async function ensureEmployee(adminToken: string, suffix: string): Promise<{ id: string; email: string }> {
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
  const email = `qa-emp-sched-${suffix}-${randomUUID().slice(0, 6)}@test.com`
  const r = await ctx.post(`${API}/api/admin/employees`, {
    data: {
      name: `QA Sched Emp ${suffix}`,
      email,
      password: 'test1234',
      salaryType: 'hourly',
      baseSalary: 5,
      shiftGroup: 'business-hours-qa',
    },
  })
  expect(r.ok(), `register employee should succeed (${r.status()} ${await r.text()})`).toBeTruthy()
  const j = await r.json()
  await ctx.dispose()
  return { id: j.id, email }
}

async function createClient(adminToken: string): Promise<string> {
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
  const r = await ctx.post(`${API}/api/admin/clients`, {
    data: { name: `QA Client Sched ${randomUUID().slice(0, 6)}` },
  })
  expect(r.ok()).toBeTruthy()
  const j = await r.json()
  await ctx.dispose()
  return j.id
}

async function createShift(adminToken: string, clientId: string): Promise<{ id: string; name: string }> {
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
  const r = await ctx.post(`${API}/api/admin/shifts`, {
    data: { name: 'QA Morning', startTime: '09:00', endTime: '17:00', clientId },
  })
  expect(r.ok(), `create shift (${r.status()} ${await r.text()})`).toBeTruthy()
  const j = await r.json()
  await ctx.dispose()
  return { id: j.id, name: j.name }
}

test('Bulk-assign endpoint creates schedule rows skipping days off', async () => {
  const { token } = await ensureAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })

  const clientId = await createClient(token)
  const shift = await createShift(token, clientId)
  const emp1 = await ensureEmployee(token, 'a')
  const emp2 = await ensureEmployee(token, 'b')

  // A 7-day range Mon..Sun (2026-05-25 is a Monday).
  const dateFrom = '2026-05-25'
  const dateTo = '2026-05-31'

  const bulkRes = await ctx.post(`${API}/api/admin/schedule/bulk-assign`, {
    data: {
      clientId,
      shiftId: shift.id,
      userIds: [emp1.id, emp2.id],
      dateFrom,
      dateTo,
      daysOff: [0, 6], // Sat, Sun
    },
  })
  expect(bulkRes.ok(), `bulk-assign ${bulkRes.status()} ${await bulkRes.text()}`).toBeTruthy()
  const bulkJson = await bulkRes.json()
  // 2 employees × 5 weekdays = 10 rows created
  expect(bulkJson.totalRows).toBe(10)
  expect(bulkJson.created).toBe(10)
  expect(bulkJson.employees).toBe(2)
  expect(bulkJson.dates).toBe(5)

  // Stats endpoint
  const statsRes = await ctx.get(`${API}/api/admin/schedule/stats?client_id=${clientId}&from=${dateFrom}&to=${dateTo}`)
  expect(statsRes.ok()).toBeTruthy()
  const stats = await statsRes.json()
  expect(stats.filledShifts).toBe(10)
  expect(stats.totalHours).toBeGreaterThan(0) // 5 days × 2 emp × 8h = 80h

  // Publish endpoint
  const pubRes = await ctx.post(`${API}/api/admin/schedule/publish`, {
    data: { clientId, from: dateFrom, to: dateTo },
  })
  expect(pubRes.ok()).toBeTruthy()
  const pub = await pubRes.json()
  expect(pub.published).toBe(10)

  // Shift-groups endpoint (must include the qa group we created)
  const sgRes = await ctx.get(`${API}/api/admin/schedule/shift-groups`)
  expect(sgRes.ok()).toBeTruthy()
  const groups: string[] = await sgRes.json()
  expect(groups).toContain('business-hours-qa')

  await ctx.dispose()
})

test('Scheduler UI renders Assign Shifts button and bulk pane', async ({ page }: { page: Page }) => {
  test.setTimeout(120000)
  const admin = await ensureAdmin()
  // Pre-create an account so the Assign button is enabled.
  const clientId = await createClient(admin.token)
  await createShift(admin.token, clientId)

  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token: admin.token, user: admin.user })
  await page.goto(`${APP}/admin/schedule`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await expect(page.locator('h1:has-text("Scheduler"), h2:has-text("Scheduler")').first()).toBeVisible({ timeout: 20000 })

  // "Assign Shifts" and "Publish" buttons are present.
  await expect(page.locator('button:has-text("Assign Shifts")').first()).toBeVisible()
  await expect(page.locator('button:has-text("Publish")').first()).toBeVisible()

  // Pick the account from the account dropdown to enable the bulk pane.
  // AdminSelect renders as a <button>; clicking opens options.
  const accountTrigger = page.locator('button:has-text("Select BPO account")').first()
  await accountTrigger.click()
  await page.locator('[role="option"], li, button').filter({ hasText: /QA Client Sched/ }).first().click()
  await page.waitForTimeout(500)

  await page.locator('button:has-text("Assign Shifts")').first().click()
  await expect(page.locator('text=Shift Template').first()).toBeVisible({ timeout: 5000 })
  await expect(page.locator('text=Days Off').first()).toBeVisible()
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    await expect(page.locator(`aside button:has-text("${d}")`).first()).toBeVisible()
  }
})
