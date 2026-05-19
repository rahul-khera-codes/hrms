/**
 * Responsive design tests across mobile/tablet/desktop/wide viewports.
 * Run: BASE=http://116.202.210.102:5173 ADMIN_EMAIL=... ADMIN_PW=... \
 *      EMP_EMAIL=... EMP_PW=... npx playwright test e2e/responsive-design.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.BASE || 'http://116.202.210.102:5173'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''
const ADMIN_PW = process.env.ADMIN_PW || 'test1234'
const EMP_EMAIL = process.env.EMP_EMAIL || ''
const EMP_PW = process.env.EMP_PW || 'test1234'

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },    // iPhone SE
  tablet: { width: 768, height: 1024 },   // iPad portrait
  desktop: { width: 1280, height: 800 },  // small desktop
  wide: { width: 1920, height: 1080 },    // large desktop
}

const ADMIN_PAGES = [
  '/admin/employees',
  '/admin/attendance',
  '/admin/schedule',
  '/admin/leave-requests',
  '/admin/payroll-calendar',
  '/admin/payroll-inputs',
  '/admin/payroll',
  '/admin/clients',
  '/admin/shifts',
  '/admin/settings',
]

const EMP_PAGES = [
  '/dashboard/sessions',
  '/dashboard/schedule',
  '/dashboard/leave',
  '/dashboard/payroll',
  '/dashboard/payroll-calendar',
]

async function login(page: Page, email: string, password: string) {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  // Header "Log in" is hidden on mobile (hidden sm:block). Pick the FIRST visible one.
  const loginBtns = page.locator('button:has-text("Log in")')
  const count = await loginBtns.count()
  for (let i = 0; i < count; i++) {
    const btn = loginBtns.nth(i)
    if (await btn.isVisible()) { await btn.click(); break }
  }
  await page.waitForSelector('input[type="email"]', { timeout: 5000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('form button[type="submit"]')
  await page.waitForURL(/\/(admin|dashboard)/, { timeout: 10000 })
  await page.waitForTimeout(800)
}

// Issues we'll collect per page+viewport for a final summary
type Issue = { page: string; viewport: string; problem: string; details?: string }
const issues: Issue[] = []

async function auditPage(page: Page, url: string, viewport: string) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })

  // Navigate
  const resp = await page.goto(`${BASE}${url}`)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

  if (resp && resp.status() >= 400) {
    issues.push({ page: url, viewport, problem: `HTTP ${resp.status()} on navigate` })
    return
  }

  // 1. Horizontal scroll check — body should not be wider than viewport
  const overflow = await page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    return {
      viewport: window.innerWidth,
      docWidth: Math.max(html.scrollWidth, body.scrollWidth),
      // also check if anything specific overflows
      overflowingChildren: Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect()
          return r.right > window.innerWidth + 1 && r.width > 0 && r.height > 0
        })
        .slice(0, 3)
        .map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect()
          return `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ').slice(0,2).join('.') : ''}> right=${Math.round(r.right)}`
        }),
    }
  })
  // Tables intentionally overflow with their own scrollbars; only flag if document itself overflows beyond the viewport by a noticeable amount
  if (overflow.docWidth > overflow.viewport + 4) {
    // Some pages legitimately have wide tables with overflow-x-auto wrappers — those are fine.
    // Check if the body itself scrolls horizontally
    const bodyScroll = await page.evaluate(() => document.body.scrollWidth - window.innerWidth)
    if (bodyScroll > 4) {
      issues.push({
        page: url,
        viewport,
        problem: 'Body horizontal overflow',
        details: `viewport=${overflow.viewport}px docWidth=${overflow.docWidth}px overflow=${bodyScroll}px; examples: ${overflow.overflowingChildren.join(' | ')}`,
      })
    }
  }

  // 2. Console errors / page errors during render
  await page.waitForTimeout(500)
  if (errors.length > 0) {
    issues.push({ page: url, viewport, problem: 'JS errors', details: errors.slice(0, 2).join(' | ') })
  }

  // 3. On mobile/tablet, sidebar should not consume the whole screen if collapsed
  if (viewport === 'mobile' || viewport === 'tablet') {
    const sidebarInfo = await page.evaluate(() => {
      const aside = document.querySelector('aside')
      if (!aside) return null
      const r = aside.getBoundingClientRect()
      return {
        width: r.width,
        left: r.left,
        hidden: r.left + r.width <= 0,
        viewport: window.innerWidth,
      }
    })
    if (sidebarInfo && !sidebarInfo.hidden && sidebarInfo.width > sidebarInfo.viewport * 0.8) {
      issues.push({
        page: url,
        viewport,
        problem: 'Sidebar takes most of small screen',
        details: `sidebar=${sidebarInfo.width}px viewport=${sidebarInfo.viewport}px`,
      })
    }
  }

  // 4. Critical content visibility — page title (h1/h2) should be in viewport
  const titleVisible = await page.evaluate(() => {
    const h = document.querySelector('h1, h2')
    if (!h) return false
    const r = (h as HTMLElement).getBoundingClientRect()
    return r.top < window.innerHeight && r.bottom > 0
  })
  if (!titleVisible) {
    issues.push({ page: url, viewport, problem: 'Page title not in initial viewport' })
  }
}

test.describe('Admin pages — responsive design', () => {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    test.describe(`${vpName} (${vp.width}×${vp.height})`, () => {
      test.use({ viewport: vp })
      for (const url of ADMIN_PAGES) {
        test(`audit ${url}`, async ({ page }) => {
          await login(page, ADMIN_EMAIL, ADMIN_PW)
          await auditPage(page, url, vpName)
        })
      }
    })
  }
})

test.describe('Employee pages — responsive design', () => {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    test.describe(`${vpName} (${vp.width}×${vp.height})`, () => {
      test.use({ viewport: vp })
      for (const url of EMP_PAGES) {
        test(`audit ${url}`, async ({ page }) => {
          await login(page, EMP_EMAIL, EMP_PW)
          await auditPage(page, url, vpName)
        })
      }
    })
  }
})

test.afterAll(() => {
  if (issues.length === 0) {
    console.log('\n✅ Zero responsive issues found across all pages × viewports.')
    return
  }
  console.log(`\n❌ Responsive issues found: ${issues.length}\n`)
  // Group by problem
  const grouped: Record<string, Issue[]> = {}
  for (const issue of issues) {
    grouped[issue.problem] = grouped[issue.problem] || []
    grouped[issue.problem].push(issue)
  }
  for (const [problem, items] of Object.entries(grouped)) {
    console.log(`\n--- ${problem} (${items.length}) ---`)
    for (const i of items) {
      console.log(`  • ${i.viewport.padEnd(8)} ${i.page}${i.details ? '\n    ' + i.details : ''}`)
    }
  }
})
