/**
 * Verification sweep — single test, stays in one page so auth survives.
 * Captures the pages I just fixed so we can confirm the UI changes landed.
 */
import { test, expect, request as pwRequest, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'

const APP = process.env.BASE || 'http://116.202.210.102:5173'
const API = process.env.API || 'http://116.202.210.102:4000'
const OUT = '/tmp/ui-verify'
mkdirSync(OUT, { recursive: true })

async function loginViaApi() {
  const ctx = await pwRequest.newContext()
  const email = `ui-verify-${randomUUID().slice(0, 8)}@test.com`
  const r = await ctx.post(`${API}/api/auth/register`, {
    data: { email, password: 'test1234', name: 'UI Verify Admin', role: 'admin' },
  })
  expect(r.ok()).toBeTruthy()
  const data = await r.json() as { token: string; user: { id: string; email: string; role: string; name: string } }
  await ctx.dispose()
  return data
}

async function snap(page: Page, slug: string, route: string) {
  await page.goto(`${APP}${route}`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true })
}

test.describe.configure({ timeout: 600000 })

test('Verify UI fixes', async ({ page }) => {
  // Hit the home page first so localStorage has the right origin
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  const { token, user } = await loginViaApi()
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('timetrack_token', token)
    localStorage.setItem('timetrack_user', JSON.stringify(user))
  }, { token, user })

  // Sweep — staying on the same page so localStorage persists across navigations
  await snap(page, 'employees-light', '/admin/employees')
  await snap(page, 'payroll-calculator-light', '/admin/payroll?cycle=2026-P12')
  await snap(page, 'payroll-inputs-light', '/admin/payroll-inputs')
  await snap(page, 'attendance-light', '/admin/attendance')
  await snap(page, 'leaves-light', '/admin/leave-requests')

  // Dark mode
  await page.evaluate(() => {
    localStorage.setItem('hrms.theme', 'dark')
    document.documentElement.classList.add('dark')
    document.documentElement.style.colorScheme = 'dark'
  })
  await snap(page, 'employees-dark', '/admin/employees')
  await snap(page, 'payroll-inputs-dark', '/admin/payroll-inputs')
  await snap(page, 'leaves-dark', '/admin/leave-requests')
})
