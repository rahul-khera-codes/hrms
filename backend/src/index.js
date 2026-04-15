import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import sessionsRoutes from './routes/sessions.js'
import adminRoutes from './routes/admin.js'
import payrollInputsRoutes from './routes/payroll-inputs.js'
import notificationsRoutes from './routes/notifications.js'
import pool from './config/db.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/admin/payroll-inputs', payrollInputsRoutes)
app.use('/api/notifications', notificationsRoutes)

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
  // Attendance module columns on sessions table
  try {
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shift_start TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shift_end TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location VARCHAR(20)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stage VARCHAR(20)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS task VARCHAR(50)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status_override VARCHAR(30)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pay_type VARCHAR(20) DEFAULT 'Regular'`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bill_type VARCHAR(20) DEFAULT 'Regular'`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS comments TEXT`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scheduled_minutes INTEGER DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS actual_minutes INTEGER DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS dbt_minutes INTEGER DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS holiday_name VARCHAR(100)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reg_hours DECIMAL(8,2) DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS n15_hours DECIMAL(8,2) DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS x35_hours DECIMAL(8,2) DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS x100_hours DECIMAL(8,2) DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hol_hours DECIMAL(8,2) DEFAULT 0`)
    // 14APR2026 feedback: make attendance records fully editable + lockable
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shift_start_override TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS shift_end_override TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS clock_in_override TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS clock_out_override TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reports_to_override UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS account_override UUID REFERENCES clients(id)`)
    // Supports manually-created attendance records (Add Record feature)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE`)
  } catch (e) {
    if (e.code !== '42701') console.warn('sessions attendance columns migration:', e.message)
  }
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
  try {
    await pool.query(
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_base_salary DECIMAL(12,2) NOT NULL DEFAULT 0`
    )
  } catch (e) {
    if (e.code !== '42701') console.warn('settings.default_base_salary migration:', e.message)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255) NOT NULL,
      code       VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  // Engagement details columns on employees table (must be after clients table exists)
  try {
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cmid INTEGER`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS harmony_id VARCHAR(20)`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_type VARCHAR(20) DEFAULT 'employee'`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS location VARCHAR(20)`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(50)`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS primary_client_id UUID REFERENCES clients(id) ON DELETE SET NULL`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title VARCHAR(50)`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES users(id) ON DELETE SET NULL`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_status VARCHAR(20) DEFAULT 'active'`)
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS termination_date DATE`)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_cmid ON employees (cmid) WHERE cmid IS NOT NULL`)
  } catch (e) {
    if (e.code !== '42701') console.warn('employees engagement columns migration:', e.message)
  }
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
  try {
    await pool.query('ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS override_start_time TIME')
    await pool.query('ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS override_end_time TIME')
  } catch (e) {
    if (e.code !== '42701') throw e
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS holidays (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      holiday_date DATE NOT NULL UNIQUE,
      name        VARCHAR(255) NOT NULL,
      is_paid     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays (holiday_date)')
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
  try {
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_calculation_type VARCHAR(32)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_associate_days_off VARCHAR(128)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_payable_days DECIMAL(10,2)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_hourly_rate DECIMAL(14,4)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_daily_hours DECIMAL(8,2)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_daily_salary DECIMAL(14,4)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_payable_amount DECIMAL(14,2)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_category VARCHAR(32)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS return_date DATE`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_time TIME`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_time TIME`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS return_time TIME`)
  } catch (e) {
    if (e.code !== '42701') console.warn('leave_requests pay columns migration:', e.message)
  }
  try {
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS hourly_rate_input DECIMAL(14,4)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS daily_hours_input DECIMAL(8,2)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS monthly_rate_input DECIMAL(14,2)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS asset_deactivation VARCHAR(255)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS payroll_cycle_code VARCHAR(20)`)
    // 14APR2026 feedback: lock toggle on leave requests
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE`)
  } catch (e) {
    if (e.code !== '42701') console.warn('leave_requests admin create columns migration:', e.message)
  }

  // 14APR2026 Payroll Inputs module
  // Captures payroll-affecting items not tied to timesheet / salary:
  //   - Incomes: bonuses, commissions, retroactive hour claims
  //   - Deductions: loans, cafeteria, gym, insurance, TSS dependents, admin fees
  // Input amount formula (from client):
  //   (payable_hours * hourly_rate * hourly_multiplier) + COALESCE(base_amount * exchange_rate, 0)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_inputs (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      input_type        VARCHAR(48) NOT NULL,
      calculation_type  VARCHAR(16) NOT NULL DEFAULT 'base_amount'
        CHECK (calculation_type IN ('hourly', 'base_amount', 'both')),
      -- Hourly-side fields
      payable_hours     DECIMAL(8,2),
      hourly_rate       DECIMAL(14,4),
      hourly_multiplier DECIMAL(6,4),
      -- Base-amount-side fields
      currency          VARCHAR(3) CHECK (currency IS NULL OR currency IN ('DOP', 'USD')),
      base_amount       DECIMAL(14,2),
      exchange_rate     DECIMAL(10,4),
      -- Calculated result
      input_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
      -- Workflow
      payroll_cycle_code VARCHAR(20),
      approver_id       UUID REFERENCES users (id) ON DELETE SET NULL,
      status            VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by       UUID REFERENCES users (id) ON DELETE SET NULL,
      reviewed_at       TIMESTAMPTZ,
      reviewed_note     TEXT,
      notes             TEXT,
      is_locked         BOOLEAN NOT NULL DEFAULT FALSE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_inputs_user ON payroll_inputs (user_id)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_inputs_cycle ON payroll_inputs (payroll_cycle_code)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_inputs_status ON payroll_inputs (status)')
  console.log('Payroll inputs table ready')
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_payslip_snapshots (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      period_from  DATE NOT NULL,
      period_to    DATE NOT NULL,
      pdf_data     BYTEA NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, period_from, period_to)
    )
  `)
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_employee_payslip_snapshots_user_created ON employee_payslip_snapshots (user_id, created_at DESC)'
  )

  // Notifications table for employee alerts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      type       VARCHAR(50) NOT NULL,
      title      VARCHAR(255) NOT NULL,
      message    TEXT NOT NULL,
      data       JSONB DEFAULT NULL,
      is_read    BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT NULL')
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE')
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC)')
  
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
