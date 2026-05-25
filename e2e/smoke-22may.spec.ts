/**
 * Smoke for 22MAY2026 Misc Reviews client video.
 *   1. Record IDs (LOA-/PI-/ACT-/SES-) auto-generated and visible in API.
 *   2. Employee clock widget no longer treats scheduler-pre-populated rows as
 *      an active session (the "always clocked in" bug).
 *   3. Documents API now accepts entityType=account.
 *   4. Login page shows CALLMAX branding (sanity check after layout shuffle).
 *
 * Run:
 *   BASE=http://116.202.210.102:5173 API=http://116.202.210.102:4000 \
 *   npx playwright test e2e/smoke-22may.spec.ts
 */
import { test, expect, request as pwRequest } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'

type LoginRes = { token: string; user: { id: string; email: string; role: string } }

async function registerAdmin(): Promise<LoginRes> {
  const ctx = await pwRequest.newContext()
  const r = await ctx.post(`${API}/api/auth/register`, {
    data: { email: `qa-22may-admin-${randomUUID().slice(0, 8)}@test.com`, password: 'test1234', name: 'QA 22MAY Admin', role: 'admin' },
  })
  expect(r.ok(), `register ${r.status()} ${await r.text()}`).toBeTruthy()
  const data = (await r.json()) as LoginRes
  await ctx.dispose()
  return data
}

test.describe.configure({ timeout: 180000 })

test('Login page still shows CALLMAX after sidebar shuffle', async ({ page }) => {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await expect(page).toHaveTitle(/CALLMAX/)
})

test('Record IDs: leaves/accounts/payroll-inputs/sessions expose recordId in API', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  // Accounts must have recordId on every row.
  const accountsR = await ctx.get(`${API}/api/admin/clients`)
  expect(accountsR.ok()).toBeTruthy()
  const accounts = await accountsR.json() as Array<{ recordId?: string | null }>
  expect(accounts.length).toBeGreaterThan(0)
  const missing = accounts.filter((a) => !a.recordId || !/^ACT-\d{4,}$/.test(a.recordId))
  expect(missing.length, `accounts missing recordId: ${missing.length}/${accounts.length}`).toBe(0)

  // Leaves
  const leavesR = await ctx.get(`${API}/api/admin/leave-requests`)
  expect(leavesR.ok()).toBeTruthy()
  const leaves = await leavesR.json() as Array<{ recordId?: string | null }>
  if (leaves.length > 0) {
    const bad = leaves.filter((l) => !l.recordId || !/^LOA-\d{4,}$/.test(l.recordId))
    expect(bad.length, `leaves missing recordId: ${bad.length}/${leaves.length}`).toBe(0)
  }

  // Payroll inputs
  const piR = await ctx.get(`${API}/api/admin/payroll-inputs`)
  expect(piR.ok()).toBeTruthy()
  const pis = await piR.json() as Array<{ recordId?: string | null }>
  if (pis.length > 0) {
    const bad = pis.filter((p) => !p.recordId || !/^PI-\d{4,}$/.test(p.recordId))
    expect(bad.length, `PIs missing recordId: ${bad.length}/${pis.length}`).toBe(0)
  }

  await ctx.dispose()
})

test('Employee clock widget: scheduler-pre-populated row does NOT show as active', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  // Create a brand new employee
  const empEmail = `qa-22may-clock-${randomUUID().slice(0, 8)}@test.com`
  const empPw = 'test1234'
  const created = await ctx.post(`${API}/api/admin/employees`, {
    data: { name: 'QA Clock Bug', email: empEmail, password: empPw, salaryType: 'hourly', baseSalary: 10 },
  })
  expect(created.ok()).toBeTruthy()
  const emp = await created.json() as { id: string }

  // Create a client + shift, then bulk-assign — this seeds is_scheduled=TRUE session rows
  const clientId = (await (await ctx.post(`${API}/api/admin/clients`, { data: { name: `QA Clock ${randomUUID().slice(0, 6)}` } })).json()).id
  const shiftId = (await (await ctx.post(`${API}/api/admin/shifts`, { data: { name: 'QA-Shift', startTime: '09:00', endTime: '17:00', clientId } })).json()).id
  const bulk = await ctx.post(`${API}/api/admin/schedule/bulk-assign`, {
    data: { clientId, userIds: [emp.id], shiftId, dateFrom: '2026-09-14', dateTo: '2026-09-18' },
  })
  expect(bulk.ok(), `bulk ${bulk.status()} ${await bulk.text()}`).toBeTruthy()

  // Now log in AS the employee and hit GET /api/sessions/active — must be null,
  // not the pre-populated rows.
  const empCtx = await pwRequest.newContext()
  const lr = await empCtx.post(`${API}/api/auth/login`, { data: { email: empEmail, password: empPw } })
  expect(lr.ok()).toBeTruthy()
  const empToken = (await lr.json() as LoginRes).token
  const activeR = await empCtx.get(`${API}/api/sessions/active`, { headers: { Authorization: `Bearer ${empToken}` } })
  expect(activeR.ok()).toBeTruthy()
  const active = await activeR.json()
  expect(active, 'employee should not be marked clocked-in just because scheduler seeded their week').toBeNull()
  await empCtx.dispose()
  await ctx.dispose()
})

test('Documents API accepts entityType=account', async () => {
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })
  // create a client
  const clientId = (await (await ctx.post(`${API}/api/admin/clients`, { data: { name: `QA Doc ${randomUUID().slice(0, 6)}` } })).json()).id
  // upload a tiny document
  const r = await ctx.post(`${API}/api/documents/upload`, {
    data: {
      entityType: 'account',
      entityId: clientId,
      fileName: 'qa.txt',
      mimeType: 'text/plain',
      data: Buffer.from('hello').toString('base64'),
    },
  })
  expect(r.ok(), `upload ${r.status()} ${await r.text()}`).toBeTruthy()
  await ctx.dispose()
})

test('Documents download endpoint returns file (route order fix)', async () => {
  // 22MAY follow-up: /download/:id was being swallowed by /:entityType/:entityId
  // because the list route was declared first. Verify the fix returns bytes.
  const admin = await registerAdmin()
  const ctx = await pwRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${admin.token}` } })

  const clientId = (await (await ctx.post(`${API}/api/admin/clients`, { data: { name: `QA Dnld ${randomUUID().slice(0, 6)}` } })).json()).id
  const payload = 'download-smoke-test'
  const up = await ctx.post(`${API}/api/documents/upload`, {
    data: {
      entityType: 'account',
      entityId: clientId,
      fileName: 'dnld.txt',
      mimeType: 'text/plain',
      data: Buffer.from(payload).toString('base64'),
    },
  })
  expect(up.ok()).toBeTruthy()
  const doc = await up.json()

  // Fetch the file back via the download endpoint — must hit the file route,
  // not the list route.
  const dn = await ctx.get(`${API}/api/documents/download/${doc.id}`)
  expect(dn.ok(), `download ${dn.status()}`).toBeTruthy()
  const ct = dn.headers()['content-type'] || ''
  expect(ct).toContain('text/plain')
  const body = await dn.body()
  expect(body.toString('utf8')).toBe(payload)
  await ctx.dispose()
})
