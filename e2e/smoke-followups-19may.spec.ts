/**
 * Smoke for the three follow-ups requested after the 19MAY2026 SCHEDULER DEMOs
 * meeting:
 *   1. Master Week — per-weekday bulk assignment (HHAX-style).
 *   2. Leave end-date scope — only HR-controlled categories hide the field.
 *   3. Night differential overlap math — only night-window hours get N15.
 *
 * Run:
 *   BASE=http://116.202.210.102:5173 API=http://116.202.210.102:4000 \
 *   npx playwright test e2e/smoke-followups-19may.spec.ts
 */
import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'

type LoginRes = { token: string; user: { id: string; email: string; role: string } }

async function registerAdmin(): Promise<LoginRes> {
  const ctx = await pwRequest.newContext()
  const r = await ctx.post(`${API}/api/auth/register`, {
    data: { email: `qa-fu-admin-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', name: 'Follow-up Admin', role: 'admin' },
  })
  expect(r.ok(), `register ${r.status()} ${await r.text()}`).toBeTruthy()
  const data = (await r.json()) as LoginRes
  await ctx.dispose()
  return data
}

async function registerEmployee(adminToken: string): Promise<{ id: string; email: string; pw: string }> {
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` } })
  const email = `qa-fu-emp-${randomUUID().slice(0, 8)}@test.com`
  const pw = 'test1234'
  const r = await ctx.post(`${API}/api/admin/employees`, {
    data: { name: 'FU Emp', email, password: pw, salaryType: 'hourly', baseSalary: 10 },
  })
  expect(r.ok()).toBeTruthy()
  const j = await r.json()
  await ctx.dispose()
  return { id: j.id, email, pw }
}

test.describe.configure({ timeout: 180000 })

test('Master Week: different shift per weekday creates rows with correct shift_id per date', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  const clientId = (await (await ctx.post(`${API}/api/admin/clients`, { data: { name: `MW ${randomUUID().slice(0, 6)}` } })).json()).id
  // Two named shifts so we can assert which one was applied to each weekday.
  const morningId = (await (await ctx.post(`${API}/api/admin/shifts`, { data: { name: 'MW-Morning', startTime: '09:00', endTime: '17:00', clientId } })).json()).id
  const nightId = (await (await ctx.post(`${API}/api/admin/shifts`, { data: { name: 'MW-Night', startTime: '21:00', endTime: '05:00', clientId } })).json()).id
  const emp = await registerEmployee(admin.token)

  // Mon..Fri = Morning, Tue = Night, Sat/Sun = off, Wed = custom 13:00-21:00.
  // Index: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const pattern = [
    { off: true },                                              // Sun
    { shiftId: morningId },                                     // Mon
    { shiftId: nightId },                                       // Tue
    { startTime: '13:00', endTime: '21:00' },                   // Wed (custom)
    { shiftId: morningId },                                     // Thu
    { shiftId: morningId },                                     // Fri
    { off: true },                                              // Sat
  ]

  const dateFrom = '2026-09-07' // Monday
  const dateTo = '2026-09-13'   // Sunday — full week
  const bulk = await ctx.post(`${API}/api/admin/schedule/bulk-assign`, {
    data: { clientId, userIds: [emp.id], dateFrom, dateTo, weeklyPattern: pattern },
  })
  expect(bulk.ok(), `bulk-assign ${bulk.status()} ${await bulk.text()}`).toBeTruthy()
  const result = await bulk.json()
  expect(result.mode).toBe('per-weekday')
  expect(result.totalRows).toBe(5) // Mon..Fri (Sat/Sun off)
  expect(result.dates).toBe(5)

  // Fetch back the schedule and assert each weekday got the right shift.
  const sch = await ctx.get(`${API}/api/admin/schedule?client_id=${clientId}&from=${dateFrom}&to=${dateTo}`)
  expect(sch.ok()).toBeTruthy()
  const rows: Array<{ date: string; shiftId: string; shiftName: string; overrideStart: string | null; overrideEnd: string | null }> = await sch.json()
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]))

  expect(byDate['2026-09-07'].shiftId).toBe(morningId) // Mon
  expect(byDate['2026-09-08'].shiftId).toBe(nightId)   // Tue
  // Wed used custom times — a synthesized shift, not morningId/nightId.
  expect(byDate['2026-09-09'].shiftId).not.toBe(morningId)
  expect(byDate['2026-09-09'].shiftId).not.toBe(nightId)
  expect(String(byDate['2026-09-09'].overrideStart).slice(0, 5)).toBe('13:00')
  expect(String(byDate['2026-09-09'].overrideEnd).slice(0, 5)).toBe('21:00')
  expect(byDate['2026-09-10'].shiftId).toBe(morningId) // Thu
  expect(byDate['2026-09-11'].shiftId).toBe(morningId) // Fri
  // Sat + Sun should not be in the result.
  expect(byDate['2026-09-12']).toBeUndefined()
  expect(byDate['2026-09-13']).toBeUndefined()

  await ctx.dispose()
})

test('Leave form: vacation shows End Date, paternity hides it', async ({ page }: { page: Page }) => {
  test.setTimeout(180000)
  const admin = await registerAdmin()
  const emp = await registerEmployee(admin.token)
  const ctx = await pwRequest.newContext()
  const lr = await ctx.post(`${API}/api/auth/login`, { data: { email: emp.email, password: emp.pw } })
  expect(lr.ok()).toBeTruthy()
  const empLogin = (await lr.json()) as LoginRes
  await ctx.dispose()

  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token: empLogin.token, user: empLogin.user })
  await page.goto(`${APP}/dashboard/leave`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.click('button:has-text("New Leave")')
  await page.waitForSelector('text=Request a leave', { timeout: 5000 })

  // Default leave type is "Tiempo Libre" (time_off) — self-service category,
  // End Date should be visible.
  await expect(page.locator('label:has-text("End Date")').first()).toBeVisible()

  // Switch to Maternidad — End Date should disappear.
  await page.locator('button:has-text("Tiempo Libre")').first().click()
  await page.locator('[role="option"], li, button').filter({ hasText: 'Maternidad' }).first().click()
  await page.waitForTimeout(300)
  await expect(page.locator('label:has-text("End Date")')).toHaveCount(0)

  // Switch back to Vacaciones — End Date returns.
  await page.locator('button:has-text("Maternidad")').first().click()
  await page.locator('[role="option"], li, button').filter({ hasText: 'Vacaciones' }).first().click()
  await page.waitForTimeout(300)
  await expect(page.locator('label:has-text("End Date")').first()).toBeVisible()
})

test('Night differential: only night-window hours count, not the whole shift', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  const emp = await registerEmployee(admin.token)

  // Shift: 18:00 → 02:00 next day (8h total). Night window 21:00-07:00 →
  // raw overlap = 21:00→02:00 = 5h. Old buggy logic would treat the whole 8h
  // as night differential. The fix should yield 5h (well below the ADBT cap).
  const r = await ctx.post(`${API}/api/admin/attendance`, {
    data: {
      employeeId: emp.id,
      clockIn:  '2026-10-12T18:00:00Z',
      clockOut: '2026-10-13T02:00:00Z',
      stage: 'Production',
      payType: 'Regular',
      billType: 'Regular',
    },
  })
  expect(r.ok(), `create attendance ${r.status()} ${await r.text()}`).toBeTruthy()
  const rec = await r.json()
  expect(Math.round((rec.n15Hours ?? 0) * 100) / 100).toBe(5)

  // Shift that doesn't enter the night window at all: 08:00 → 16:00 = 0 night.
  const r2 = await ctx.post(`${API}/api/admin/attendance`, {
    data: {
      employeeId: emp.id,
      clockIn:  '2026-10-13T08:00:00Z',
      clockOut: '2026-10-13T16:00:00Z',
      stage: 'Production',
      payType: 'Regular',
      billType: 'Regular',
    },
  })
  expect(r2.ok()).toBeTruthy()
  expect((await r2.json()).n15Hours ?? 0).toBe(0)

  // Pure overnight 22:00 → 06:00 = 8h clock-window. All 8h overlap with the
  // night window — but ADBT (deductible break) for ACT≥8 is 1h, so payable
  // hours = 7 and N15 is capped to that. The Excel reference does the same
  // (n15 ≤ actual - adbt). The OLD bug would have returned 8 (or sometimes
  // even more) because the "≥3h night → entire shift" rule kicked in.
  const r3 = await ctx.post(`${API}/api/admin/attendance`, {
    data: {
      employeeId: emp.id,
      clockIn:  '2026-10-14T22:00:00Z',
      clockOut: '2026-10-15T06:00:00Z',
      stage: 'Production',
      payType: 'Regular',
      billType: 'Regular',
    },
  })
  expect(r3.ok()).toBeTruthy()
  expect(Math.round(((await r3.json()).n15Hours ?? 0) * 100) / 100).toBe(7)

  await ctx.dispose()
})
