import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import sessionsRoutes from './routes/sessions.js'
import adminRoutes from './routes/admin.js'
import pool from './config/db.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionsRoutes)
app.use('/api/admin', adminRoutes)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// Check DB on startup and create users table if missing
try {
  await pool.query('SELECT 1')
  console.log('Database connected')
  // Ensure users table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email      VARCHAR(255) NOT NULL UNIQUE,
      name       VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role       VARCHAR(20) NOT NULL CHECK (role IN ('employee', 'admin')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      clock_in         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      clock_out        TIMESTAMPTZ,
      regular_minutes  INTEGER DEFAULT 0,
      overtime_minutes INTEGER DEFAULT 0,
      night_minutes    INTEGER DEFAULT 0
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_clock_in ON sessions (clock_in)')
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_type VARCHAR(10) DEFAULT 'hourly'`)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary DECIMAL(12,2) DEFAULT 0`)
  } catch (_) { /* columns may already exist */ }

  // Employee database table (separate from auth users)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID UNIQUE REFERENCES users (id) ON DELETE CASCADE,
      salary_type VARCHAR(10) NOT NULL DEFAULT 'hourly' CHECK (salary_type IN ('hourly', 'monthly')),
      base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees (user_id)')

  // Backfill employee records from users (safe to run repeatedly)
  await pool.query(`
    INSERT INTO employees (user_id, salary_type, base_salary)
    SELECT u.id, COALESCE(u.salary_type, 'hourly'), COALESCE(u.base_salary, 0)
    FROM users u
    WHERE u.role = 'employee'
    ON CONFLICT (user_id) DO NOTHING
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id                      INT PRIMARY KEY DEFAULT 1,
      working_days_per_month   DECIMAL(5,2) NOT NULL DEFAULT 23.83,
      hours_per_day           DECIMAL(4,2) NOT NULL DEFAULT 8,
      ot_multiplier           DECIMAL(4,2) NOT NULL DEFAULT 1.35,
      night_multiplier        DECIMAL(4,2) NOT NULL DEFAULT 1.15,
      night_shift_start_hour  INT NOT NULL DEFAULT 21,
      night_shift_end_hour    INT NOT NULL DEFAULT 7,
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    INSERT INTO settings (id, working_days_per_month, hours_per_day, ot_multiplier, night_multiplier, night_shift_start_hour, night_shift_end_hour)
    VALUES (1, 23.83, 8, 1.35, 1.15, 21, 7)
    ON CONFLICT (id) DO NOTHING
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255) NOT NULL,
      code       VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255) NOT NULL,
      start_time TIME NOT NULL,
      end_time   TIME NOT NULL,
      client_id  UUID REFERENCES clients (id) ON DELETE SET NULL,
      timezone   VARCHAR(64) DEFAULT 'UTC',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  try {
    await pool.query(`ALTER TABLE shifts ADD COLUMN timezone VARCHAR(64) DEFAULT 'UTC'`)
  } catch (e) {
    if (e.code !== '42701') throw e
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_assignments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id  UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      shift_id   UUID NOT NULL REFERENCES shifts (id) ON DELETE CASCADE,
      date       DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (client_id, user_id, date)
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_schedule_assignments_client_date ON schedule_assignments (client_id, date)')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      leave_type    VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (leave_type IN ('paid', 'unpaid')),
      start_date    DATE NOT NULL,
      end_date      DATE NOT NULL,
      reason        TEXT,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by   UUID REFERENCES users (id) ON DELETE SET NULL,
      reviewed_note TEXT,
      reviewed_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      CHECK (end_date >= start_date)
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates ON leave_requests (user_id, start_date, end_date)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests (status)')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_line_items (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      period_from DATE NOT NULL,
      period_to   DATE NOT NULL,
      type       VARCHAR(32) NOT NULL,
      label      VARCHAR(255),
      amount     DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_line_items_user_period ON payroll_line_items (user_id, period_from, period_to)')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_government_deductions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      period_from  DATE NOT NULL,
      period_to    DATE NOT NULL,
      social_security DECIMAL(12,2) NOT NULL DEFAULT 0,
      tax          DECIMAL(12,2) NOT NULL DEFAULT 0,
      infotep      DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, period_from, period_to)
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_gov_deductions_user_period ON payroll_government_deductions (user_id, period_from, period_to)')
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_periods (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_from DATE NOT NULL,
        period_to   DATE NOT NULL,
        pay_date    DATE NOT NULL,
        cycle_code  VARCHAR(20) NOT NULL,
        year_cycle  INT NOT NULL,
        UNIQUE (period_from, period_to)
      )
    `)
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON payroll_periods (period_from, period_to)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_periods_year ON payroll_periods (year_cycle)')
    const seedPayrollPeriods = async () => {
      const periods = []
      let from = new Date('2025-11-30')
      for (let p = 26; p <= 26; p++) {
        const to = new Date(from)
        to.setDate(to.getDate() + 13)
        const payDate = new Date(to)
        payDate.setDate(payDate.getDate() + 6)
        periods.push({
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          pay: payDate.toISOString().slice(0, 10),
          code: `2025-P${String(p).padStart(2, '0')}`,
          year: 2025,
        })
        from = new Date(to)
        from.setDate(from.getDate() + 1)
      }
      from = new Date('2025-12-14')
      for (let p = 1; p <= 26; p++) {
        const to = new Date(from)
        to.setDate(to.getDate() + 13)
        const payDate = new Date(to)
        payDate.setDate(payDate.getDate() + 6)
        periods.push({
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          pay: payDate.toISOString().slice(0, 10),
          code: `2026-P${String(p).padStart(2, '0')}`,
          year: 2026,
        })
        from = new Date(to)
        from.setDate(from.getDate() + 1)
      }
      for (const { from: pf, to: pt, pay, code, year } of periods) {
        await pool.query(
          `INSERT INTO payroll_periods (period_from, period_to, pay_date, cycle_code, year_cycle)
           VALUES ($1::date, $2::date, $3::date, $4, $5)
           ON CONFLICT (period_from, period_to) DO NOTHING`,
          [pf, pt, pay, code, year]
        )
      }
    }
    await seedPayrollPeriods()
    console.log('Payroll periods table ready')
  } catch (e) {
    console.warn('Payroll periods init skipped (table may already exist):', e.message)
  }
  console.log('Clients, Shifts, Schedule tables ready')
  console.log('Payroll line items, government deductions tables ready')
  console.log('Settings table ready')
  console.log('Users table ready')
  console.log('Sessions table ready')
} catch (err) {
  console.error('Database connection failed:', err.message)
  process.exit(1)
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
