import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import sessionsRoutes from './routes/sessions.js'
import adminRoutes from './routes/admin.js'
import payrollInputsRoutes from './routes/payroll-inputs.js'
import payrollCalculatorRoutes from './routes/payroll-calculator.js'
import notificationsRoutes from './routes/notifications.js'
import documentsRoutes from './routes/documents.js'
import pool from './config/db.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '30mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/admin/payroll-inputs', payrollInputsRoutes)
app.use('/api/admin/payroll-calculator', payrollCalculatorRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/documents', documentsRoutes)

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
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS billable_reg_hours DECIMAL(8,2) DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS billable_prm_hours DECIMAL(8,2) DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS billable_rvw_hours DECIMAL(8,2) DEFAULT 0`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payable_rvw_hours DECIMAL(8,2) DEFAULT 0`)
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
    // 19MAY2026 Scheduler Demos meeting: audit fields + reviewed flag.
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_on TIMESTAMPTZ DEFAULT NOW()`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS modified_on TIMESTAMPTZ`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT FALSE`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`)
    // Pre-populated from scheduler bulk-assign (no clock in/out yet). Lets the
    // attendance module surface upcoming shifts that need normalization.
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN NOT NULL DEFAULT FALSE`)
    // 03JUN2026 client video feedback: admin must be able to clear clock_in
    // on a pre-populated scheduled row (so the agent clocks in manually).
    // clock_in NOT NULL was making the PATCH silently fail. Drop the constraint
    // and keep the column nullable; the schema is otherwise unchanged.
    await pool.query(`ALTER TABLE sessions ALTER COLUMN clock_in DROP NOT NULL`).catch(() => {/* already nullable */})
  } catch (e) {
    if (e.code !== '42701') console.warn('sessions attendance columns migration:', e.message)
  }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_type VARCHAR(10) DEFAULT 'hourly'`)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary DECIMAL(12,2) DEFAULT 0`)
    // 21MAY2026 client feedback: three-tier access level and an access on/off toggle
    // shown on the employee form. role stays the auth-level discriminator
    // (admin vs employee); access_level adds supervisor between agent and admin.
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_level VARCHAR(16) DEFAULT 'agent'`)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_enabled BOOLEAN NOT NULL DEFAULT TRUE`)
    // Backfill: admins → admin, everyone else → agent on first run
    await pool.query(`UPDATE users SET access_level = 'admin' WHERE role = 'admin' AND (access_level IS NULL OR access_level = 'agent')`)
    // 25MAY2026 client WhatsApp: EMP-#### record ID for employees alongside
    // the existing CMID + Callmax ID. Sequence + DEFAULT + backfill.
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS users_record_seq START 1001`)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS record_id VARCHAR(20) UNIQUE`)
    await pool.query(`UPDATE users SET record_id = 'EMP-' || LPAD(NEXTVAL('users_record_seq')::text, 4, '0') WHERE record_id IS NULL`)
    await pool.query(`ALTER TABLE users ALTER COLUMN record_id SET DEFAULT 'EMP-' || LPAD(NEXTVAL('users_record_seq')::text, 4, '0')`)
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
    // 21MAY2026 client video: separate multiplier for X100% / double overtime
    // (typically 2.00). Was previously implicit in the X100 path code.
    await pool.query(
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS double_ot_multiplier DECIMAL(4,2) NOT NULL DEFAULT 2.00`
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
  // New columns for clients table
  try {
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS vertical VARCHAR(100)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS sales_owner_id UUID REFERENCES users(id) ON DELETE SET NULL`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ops_owner_id UUID REFERENCES users(id) ON DELETE SET NULL`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS registered_address TEXT`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS website VARCHAR(255)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS main_phone VARCHAR(30)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ops_poc VARCHAR(255)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ops_poc_email VARCHAR(255)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ops_phone VARCHAR(30)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_poc VARCHAR(255)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_poc_email VARCHAR(255)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_poc_phone VARCHAR(30)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS billable_headcount DECIMAL(10,2)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS billable_type VARCHAR(30)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_rate DECIMAL(14,2)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ot_premium DECIMAL(10,2)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_status VARCHAR(20) DEFAULT 'active'`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS termination_date DATE`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS termination_reason VARCHAR(100)`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`)
  } catch (e) {
    if (e.code !== '42701') console.warn('clients new columns migration:', e.message)
  }
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
  // Bank/payment fields on employees
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank VARCHAR(100)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_method VARCHAR(20) DEFAULT 'Deposito'`)
  // New personal/contact fields (Employee Punchlist 29APR2026)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS government_id VARCHAR(20)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(15)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth DATE`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_email VARCHAR(255)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS home_phone VARCHAR(30)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_phone VARCHAR(30)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS termination_reason VARCHAR(100)`)
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE`)
  // Shift group — per 19MAY2026 Scheduler Module Part 1 video: bulk-assign by group
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_group VARCHAR(50)`)
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
    // Published state (manager presses Publish to release the week)
    await pool.query('ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE')
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
    // 29APR2026 leaves punchlist: payroll status + approver
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS payroll_status VARCHAR(20) DEFAULT 'Pending'`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approver_name VARCHAR(255)`)
    // 21MAY2026 client feedback: audit trail on every form (mirrors sessions)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS created_on TIMESTAMPTZ DEFAULT NOW()`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS modified_on TIMESTAMPTZ`)
    // 22MAY2026 client video: short reference ID per record (LOA-#### for leaves).
    // Auto-generated, sequential, used for traceability/e-discovery.
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS leave_requests_record_seq START 1001`)
    await pool.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS record_id VARCHAR(20) UNIQUE`)
    await pool.query(`UPDATE leave_requests SET record_id = 'LOA-' || LPAD(NEXTVAL('leave_requests_record_seq')::text, 4, '0') WHERE record_id IS NULL`)
    await pool.query(`ALTER TABLE leave_requests ALTER COLUMN record_id SET DEFAULT 'LOA-' || LPAD(NEXTVAL('leave_requests_record_seq')::text, 4, '0')`)
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
  // 21MAY2026 client feedback: audit trail on payroll inputs (mirrors sessions/leaves)
  try {
    await pool.query(`ALTER TABLE payroll_inputs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE payroll_inputs ADD COLUMN IF NOT EXISTS created_on TIMESTAMPTZ DEFAULT NOW()`)
    await pool.query(`ALTER TABLE payroll_inputs ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES users(id)`)
    await pool.query(`ALTER TABLE payroll_inputs ADD COLUMN IF NOT EXISTS modified_on TIMESTAMPTZ`)
    // 22MAY2026 client video: PI-#### record ID for payroll inputs.
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS payroll_inputs_record_seq START 1001`)
    await pool.query(`ALTER TABLE payroll_inputs ADD COLUMN IF NOT EXISTS record_id VARCHAR(20) UNIQUE`)
    await pool.query(`UPDATE payroll_inputs SET record_id = 'PI-' || LPAD(NEXTVAL('payroll_inputs_record_seq')::text, 4, '0') WHERE record_id IS NULL`)
    await pool.query(`ALTER TABLE payroll_inputs ALTER COLUMN record_id SET DEFAULT 'PI-' || LPAD(NEXTVAL('payroll_inputs_record_seq')::text, 4, '0')`)
    // 02JUN2026 client follow-up to the recurring-input feature: optional bounds
    // so a recurrent input can be "from cycle X to cycle Y" instead of forever.
    // Both NULL = unbounded (current "every cycle" behavior).
    await pool.query(`ALTER TABLE payroll_inputs ADD COLUMN IF NOT EXISTS recurrent_from_cycle VARCHAR(20)`)
    await pool.query(`ALTER TABLE payroll_inputs ADD COLUMN IF NOT EXISTS recurrent_to_cycle VARCHAR(20)`)
  } catch (e) {
    if (e.code !== '42701') console.warn('payroll_inputs audit columns migration:', e.message)
  }

  // 22MAY2026 client video: ACT-#### record ID for client/account records.
  try {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS clients_record_seq START 1001`)
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS record_id VARCHAR(20) UNIQUE`)
    await pool.query(`UPDATE clients SET record_id = 'ACT-' || LPAD(NEXTVAL('clients_record_seq')::text, 4, '0') WHERE record_id IS NULL`)
    await pool.query(`ALTER TABLE clients ALTER COLUMN record_id SET DEFAULT 'ACT-' || LPAD(NEXTVAL('clients_record_seq')::text, 4, '0')`)
  } catch (e) {
    if (e.code !== '42701') console.warn('clients record_id migration:', e.message)
  }

  // 22MAY2026 client video: SES-#### record ID for attendance/session records.
  // (Per the video — short ID for traceability of normalized timesheets.)
  try {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS sessions_record_seq START 1001`)
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS record_id VARCHAR(20) UNIQUE`)
    await pool.query(`UPDATE sessions SET record_id = 'SES-' || LPAD(NEXTVAL('sessions_record_seq')::text, 4, '0') WHERE record_id IS NULL`)
    await pool.query(`ALTER TABLE sessions ALTER COLUMN record_id SET DEFAULT 'SES-' || LPAD(NEXTVAL('sessions_record_seq')::text, 4, '0')`)
  } catch (e) {
    if (e.code !== '42701') console.warn('sessions record_id migration:', e.message)
  }
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

  // Documents table for file uploads (employee, leave, payroll_input attachments)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type VARCHAR(20) NOT NULL,
      entity_id UUID NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100),
      file_size INTEGER,
      uploaded_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents (entity_type, entity_id)')
  console.log('Documents table ready')

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
    await pool.query('ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS bs INT DEFAULT 1')
    await pool.query('ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT FALSE')
    const seedPayrollPeriods = async () => {
      // Exact periods sourced from PayrollCalendar-Callmax DR.xlsx (Producción sheet)
      const PERIODS = [
        ['2025-P01','2024-12-15','2024-12-28','2025-01-03'],
        ['2025-P02','2024-12-29','2025-01-11','2025-01-17'],
        ['2025-P03','2025-01-12','2025-01-25','2025-01-31'],
        ['2025-P04','2025-01-26','2025-02-08','2025-02-14'],
        ['2025-P05','2025-02-09','2025-02-22','2025-02-28'],
        ['2025-P06','2025-02-23','2025-03-08','2025-03-14'],
        ['2025-P07','2025-03-09','2025-03-22','2025-03-28'],
        ['2025-P08','2025-03-23','2025-04-05','2025-04-11'],
        ['2025-P09','2025-04-06','2025-04-19','2025-04-25'],
        ['2025-P10','2025-04-20','2025-05-03','2025-05-09'],
        ['2025-P11','2025-05-04','2025-05-17','2025-05-23'],
        ['2025-P12','2025-05-18','2025-05-31','2025-06-06'],
        ['2025-P13','2025-06-01','2025-06-14','2025-06-20'],
        ['2025-P14','2025-06-15','2025-06-28','2025-07-04'],
        ['2025-P15','2025-06-29','2025-07-12','2025-07-18'],
        ['2025-P16','2025-07-13','2025-07-26','2025-08-01'],
        ['2025-P17','2025-07-27','2025-08-09','2025-08-15'],
        ['2025-P18','2025-08-10','2025-08-23','2025-08-29'],
        ['2025-P19','2025-08-24','2025-09-06','2025-09-12'],
        ['2025-P20','2025-09-07','2025-09-20','2025-09-26'],
        ['2025-P21','2025-09-21','2025-10-04','2025-10-10'],
        ['2025-P22','2025-10-05','2025-10-18','2025-10-24'],
        ['2025-P23','2025-10-19','2025-11-01','2025-11-07'],
        ['2025-P24','2025-11-02','2025-11-15','2025-11-21'],
        ['2025-P25','2025-11-16','2025-11-29','2025-12-05'],
        ['2025-P26','2025-11-30','2025-12-13','2025-12-19'],
        ['2026-P01','2025-12-14','2025-12-27','2026-01-02'],
        ['2026-P02','2025-12-28','2026-01-10','2026-01-16'],
        ['2026-P03','2026-01-11','2026-01-24','2026-01-30'],
        ['2026-P04','2026-01-25','2026-02-07','2026-02-13'],
        ['2026-P05','2026-02-08','2026-02-21','2026-02-27'],
        ['2026-P06','2026-02-22','2026-03-07','2026-03-13'],
        ['2026-P07','2026-03-08','2026-03-21','2026-03-27'],
        ['2026-P08','2026-03-22','2026-04-04','2026-04-10'],
        ['2026-P09','2026-04-05','2026-04-18','2026-04-24'],
        ['2026-P10','2026-04-19','2026-05-02','2026-05-08'],
        ['2026-P11','2026-05-03','2026-05-16','2026-05-22'],
        ['2026-P12','2026-05-17','2026-05-30','2026-06-05'],
        ['2026-P13','2026-05-31','2026-06-13','2026-06-19'],
        ['2026-P14','2026-06-14','2026-06-27','2026-07-03'],
        ['2026-P15','2026-06-28','2026-07-11','2026-07-17'],
        ['2026-P16','2026-07-12','2026-07-25','2026-07-31'],
        ['2026-P17','2026-07-26','2026-08-08','2026-08-14'],
        ['2026-P18','2026-08-09','2026-08-22','2026-08-28'],
        ['2026-P19','2026-08-23','2026-09-05','2026-09-11'],
        ['2026-P20','2026-09-06','2026-09-19','2026-09-25'],
        ['2026-P21','2026-09-20','2026-10-03','2026-10-09'],
        ['2026-P22','2026-10-04','2026-10-17','2026-10-23'],
        ['2026-P23','2026-10-18','2026-10-31','2026-11-06'],
        ['2026-P24','2026-11-01','2026-11-14','2026-11-20'],
        ['2026-P25','2026-11-15','2026-11-28','2026-12-04'],
        ['2026-P26','2026-11-29','2026-12-12','2026-12-18'],
        ['2027-P01','2026-12-13','2026-12-26','2027-01-01'],
        ['2027-P02','2026-12-27','2027-01-09','2027-01-15'],
        ['2027-P03','2027-01-10','2027-01-23','2027-01-29'],
        ['2027-P04','2027-01-24','2027-02-06','2027-02-12'],
        ['2027-P05','2027-02-07','2027-02-20','2027-02-26'],
        ['2027-P06','2027-02-21','2027-03-06','2027-03-12'],
        ['2027-P07','2027-03-07','2027-03-20','2027-03-26'],
        ['2027-P08','2027-03-21','2027-04-03','2027-04-09'],
        ['2027-P09','2027-04-04','2027-04-17','2027-04-23'],
        ['2027-P10','2027-04-18','2027-05-01','2027-05-07'],
        ['2027-P11','2027-05-02','2027-05-15','2027-05-21'],
        ['2027-P12','2027-05-16','2027-05-29','2027-06-04'],
        ['2027-P13','2027-05-30','2027-06-12','2027-06-18'],
        ['2027-P14','2027-06-13','2027-06-26','2027-07-02'],
        ['2027-P15','2027-06-27','2027-07-10','2027-07-16'],
        ['2027-P16','2027-07-11','2027-07-24','2027-07-30'],
        ['2027-P17','2027-07-25','2027-08-07','2027-08-13'],
        ['2027-P18','2027-08-08','2027-08-21','2027-08-27'],
        ['2027-P19','2027-08-22','2027-09-04','2027-09-10'],
        ['2027-P20','2027-09-05','2027-09-18','2027-09-24'],
        ['2027-P21','2027-09-19','2027-10-02','2027-10-08'],
        ['2027-P22','2027-10-03','2027-10-16','2027-10-22'],
        ['2027-P23','2027-10-17','2027-10-30','2027-11-05'],
        ['2027-P24','2027-10-31','2027-11-13','2027-11-19'],
        ['2027-P25','2027-11-14','2027-11-27','2027-12-03'],
        ['2027-P26','2027-11-28','2027-12-11','2027-12-17'],
        ['2027-P27','2027-12-12','2027-12-25','2027-12-31'],
        ['2028-P01','2027-12-26','2028-01-08','2028-01-14'],
        ['2028-P02','2028-01-09','2028-01-22','2028-01-28'],
        ['2028-P03','2028-01-23','2028-02-05','2028-02-11'],
        ['2028-P04','2028-02-06','2028-02-19','2028-02-25'],
        ['2028-P05','2028-02-20','2028-03-04','2028-03-10'],
        ['2028-P06','2028-03-05','2028-03-18','2028-03-24'],
        ['2028-P07','2028-03-19','2028-04-01','2028-04-07'],
        ['2028-P08','2028-04-02','2028-04-15','2028-04-21'],
        ['2028-P09','2028-04-16','2028-04-29','2028-05-05'],
        ['2028-P10','2028-04-30','2028-05-13','2028-05-19'],
        ['2028-P11','2028-05-14','2028-05-27','2028-06-02'],
        ['2028-P12','2028-05-28','2028-06-10','2028-06-16'],
        ['2028-P13','2028-06-11','2028-06-24','2028-06-30'],
        ['2028-P14','2028-06-25','2028-07-08','2028-07-14'],
        ['2028-P15','2028-07-09','2028-07-22','2028-07-28'],
        ['2028-P16','2028-07-23','2028-08-05','2028-08-11'],
        ['2028-P17','2028-08-06','2028-08-19','2028-08-25'],
        ['2028-P18','2028-08-20','2028-09-02','2028-09-08'],
        ['2028-P19','2028-09-03','2028-09-16','2028-09-22'],
        ['2028-P20','2028-09-17','2028-09-30','2028-10-06'],
        ['2028-P21','2028-10-01','2028-10-14','2028-10-20'],
        ['2028-P22','2028-10-15','2028-10-28','2028-11-03'],
        ['2028-P23','2028-10-29','2028-11-11','2028-11-17'],
        ['2028-P24','2028-11-12','2028-11-25','2028-12-01'],
        ['2028-P25','2028-11-26','2028-12-09','2028-12-15'],
        ['2028-P26','2028-12-10','2028-12-23','2028-12-29'],
        ['2029-P01','2028-12-24','2029-01-06','2029-01-12'],
        ['2029-P02','2029-01-07','2029-01-20','2029-01-26'],
        ['2029-P03','2029-01-21','2029-02-03','2029-02-09'],
        ['2029-P04','2029-02-04','2029-02-17','2029-02-23'],
        ['2029-P05','2029-02-18','2029-03-03','2029-03-09'],
        ['2029-P06','2029-03-04','2029-03-17','2029-03-23'],
        ['2029-P07','2029-03-18','2029-03-31','2029-04-06'],
        ['2029-P08','2029-04-01','2029-04-14','2029-04-20'],
        ['2029-P09','2029-04-15','2029-04-28','2029-05-04'],
        ['2029-P10','2029-04-29','2029-05-12','2029-05-18'],
        ['2029-P11','2029-05-13','2029-05-26','2029-06-01'],
        ['2029-P12','2029-05-27','2029-06-09','2029-06-15'],
        ['2029-P13','2029-06-10','2029-06-23','2029-06-29'],
        ['2029-P14','2029-06-24','2029-07-07','2029-07-13'],
        ['2029-P15','2029-07-08','2029-07-21','2029-07-27'],
        ['2029-P16','2029-07-22','2029-08-04','2029-08-10'],
        ['2029-P17','2029-08-05','2029-08-18','2029-08-24'],
        ['2029-P18','2029-08-19','2029-09-01','2029-09-07'],
        ['2029-P19','2029-09-02','2029-09-15','2029-09-21'],
        ['2029-P20','2029-09-16','2029-09-29','2029-10-05'],
        ['2029-P21','2029-09-30','2029-10-13','2029-10-19'],
        ['2029-P22','2029-10-14','2029-10-27','2029-11-02'],
        ['2029-P23','2029-10-28','2029-11-10','2029-11-16'],
        ['2029-P24','2029-11-11','2029-11-24','2029-11-30'],
        ['2029-P25','2029-11-25','2029-12-08','2029-12-14'],
        ['2029-P26','2029-12-09','2029-12-22','2029-12-28'],
        ['2030-P01','2029-12-23','2030-01-05','2030-01-11'],
        ['2030-P02','2030-01-06','2030-01-19','2030-01-25'],
        ['2030-P03','2030-01-20','2030-02-02','2030-02-08'],
        ['2030-P04','2030-02-03','2030-02-16','2030-02-22'],
        ['2030-P05','2030-02-17','2030-03-02','2030-03-08'],
        ['2030-P06','2030-03-03','2030-03-16','2030-03-22'],
        ['2030-P07','2030-03-17','2030-03-30','2030-04-05'],
        ['2030-P08','2030-03-31','2030-04-13','2030-04-19'],
        ['2030-P09','2030-04-14','2030-04-27','2030-05-03'],
        ['2030-P10','2030-04-28','2030-05-11','2030-05-17'],
        ['2030-P11','2030-05-12','2030-05-25','2030-05-31'],
        ['2030-P12','2030-05-26','2030-06-08','2030-06-14'],
        ['2030-P13','2030-06-09','2030-06-22','2030-06-28'],
        ['2030-P14','2030-06-23','2030-07-06','2030-07-12'],
        ['2030-P15','2030-07-07','2030-07-20','2030-07-26'],
        ['2030-P16','2030-07-21','2030-08-03','2030-08-09'],
        ['2030-P17','2030-08-04','2030-08-17','2030-08-23'],
        ['2030-P18','2030-08-18','2030-08-31','2030-09-06'],
        ['2030-P19','2030-09-01','2030-09-14','2030-09-20'],
        ['2030-P20','2030-09-15','2030-09-28','2030-10-04'],
        ['2030-P21','2030-09-29','2030-10-12','2030-10-18'],
        ['2030-P22','2030-10-13','2030-10-26','2030-11-01'],
        ['2030-P23','2030-10-27','2030-11-09','2030-11-15'],
        ['2030-P24','2030-11-10','2030-11-23','2030-11-29'],
        ['2030-P25','2030-11-24','2030-12-07','2030-12-13'],
        ['2030-P26','2030-12-08','2030-12-21','2030-12-27'],
      ]
      await pool.query('DELETE FROM payroll_periods')
      for (const [code, pf, pt, pay] of PERIODS) {
        const year = parseInt(code.slice(0, 4), 10)
        const isSpecial = code === '2027-P27'
        await pool.query(
          `INSERT INTO payroll_periods (period_from, period_to, pay_date, cycle_code, year_cycle, bs, is_special)
           VALUES ($1::date, $2::date, $3::date, $4, $5, 1, $6)`,
          [pf, pt, pay, code, year, isSpecial]
        )
      }
    }
    await seedPayrollPeriods()
    await pool.query(`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'upcoming'`)
    // 21MAY2026 client video: three cycle states — closed (pay date passed),
    // current (today is between period_from and period_to), upcoming (future).
    // Recomputed on each server boot so the column stays in sync without a cron.
    await pool.query(`UPDATE payroll_periods SET status = 'closed' WHERE pay_date < CURRENT_DATE`)
    await pool.query(`UPDATE payroll_periods SET status = 'current' WHERE pay_date >= CURRENT_DATE AND period_from <= CURRENT_DATE AND period_to >= CURRENT_DATE`)
    await pool.query(`UPDATE payroll_periods SET status = 'upcoming' WHERE pay_date >= CURRENT_DATE AND (period_from > CURRENT_DATE OR (period_from <= CURRENT_DATE AND period_to < CURRENT_DATE))`)
    // Compute BS (payment number within month) based on pay_date
    await pool.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY EXTRACT(YEAR FROM pay_date), EXTRACT(MONTH FROM pay_date) ORDER BY pay_date
        ) AS pnum FROM payroll_periods
      )
      UPDATE payroll_periods pp SET bs = n.pnum FROM numbered n WHERE pp.id = n.id
    `)
    console.log('Payroll periods table ready (157 periods 2025–2030, Sun–Sat, Friday pay day)')
  } catch (e) {
    console.warn('Payroll periods init skipped (table may already exist):', e.message)
  }
  // Payroll Calculator Results — wide 63-column table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_calculator_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_cycle_code VARCHAR(20) NOT NULL,
      period_from DATE NOT NULL, period_to DATE NOT NULL, pay_date DATE, bi_week INT,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_name VARCHAR(255), account VARCHAR(255), salary_type VARCHAR(10),
      salary DECIMAL(14,2) DEFAULT 0, hourly_salary DECIMAL(14,4) DEFAULT 0,
      contract_status VARCHAR(20), bank VARCHAR(100), bank_account VARCHAR(50), pay_method VARCHAR(20),
      hreg1 DECIMAL(10,2) DEFAULT 0, hreg2 DECIMAL(10,2) DEFAULT 0, hreg DECIMAL(10,2) DEFAULT 0,
      ordinary_salary DECIMAL(14,2) DEFAULT 0,
      vacation DECIMAL(14,2) DEFAULT 0, matrimony DECIMAL(14,2) DEFAULT 0,
      maternity DECIMAL(14,2) DEFAULT 0, paternity DECIMAL(14,2) DEFAULT 0,
      bereavement DECIMAL(14,2) DEFAULT 0, medical DECIMAL(14,2) DEFAULT 0, vpl DECIMAL(14,2) DEFAULT 0,
      commissions DECIMAL(14,2) DEFAULT 0,
      hn15_hours DECIMAL(10,2) DEFAULT 0, hn15_amount DECIMAL(14,2) DEFAULT 0,
      hx35_hours DECIMAL(10,2) DEFAULT 0, hx35_amount DECIMAL(14,2) DEFAULT 0,
      hx100_hours DECIMAL(10,2) DEFAULT 0, hx100_amount DECIMAL(14,2) DEFAULT 0,
      hhol_hours DECIMAL(10,2) DEFAULT 0, hhol_amount DECIMAL(14,2) DEFAULT 0,
      overtime_total DECIMAL(14,2) DEFAULT 0,
      collaboration DECIMAL(14,2) DEFAULT 0, recruiting DECIMAL(14,2) DEFAULT 0,
      profit_sharing DECIMAL(14,2) DEFAULT 0, bonuses_total DECIMAL(14,2) DEFAULT 0,
      attendance_incentive DECIMAL(14,2) DEFAULT 0, kpi_incentive DECIMAL(14,2) DEFAULT 0,
      incentives_total DECIMAL(14,2) DEFAULT 0,
      gross_salary DECIMAL(14,2) DEFAULT 0, tss_salary DECIMAL(14,2) DEFAULT 0, isr_salary DECIMAL(14,2) DEFAULT 0,
      afp DECIMAL(14,2) DEFAULT 0, sfs DECIMAL(14,2) DEFAULT 0,
      tss_dependents DECIMAL(14,2) DEFAULT 0, infotep DECIMAL(14,2) DEFAULT 0,
      isr_retention DECIMAL(14,2) DEFAULT 0, gov_deductions_total DECIMAL(14,2) DEFAULT 0,
      pay_later DECIMAL(14,2) DEFAULT 0, gym DECIMAL(14,2) DEFAULT 0,
      insurance_ded DECIMAL(14,2) DEFAULT 0, cafeteria DECIMAL(14,2) DEFAULT 0,
      admin_deduction DECIMAL(14,2) DEFAULT 0, deduccion_x DECIMAL(14,2) DEFAULT 0,
      other_deductions_spare DECIMAL(14,2) DEFAULT 0, other_deductions_total DECIMAL(14,2) DEFAULT 0,
      deduction_validation BOOLEAN DEFAULT FALSE,
      total_deductions DECIMAL(14,2) DEFAULT 0, net_salary DECIMAL(14,2) DEFAULT 0, notes TEXT,
      afp_employer DECIMAL(14,2) DEFAULT 0, sfs_employer DECIMAL(14,2) DEFAULT 0,
      arl DECIMAL(14,2) DEFAULT 0, infotep_employer DECIMAL(14,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (payroll_cycle_code, user_id)
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pcr_cycle ON payroll_calculator_results (payroll_cycle_code)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pcr_user ON payroll_calculator_results (user_id)')
  await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS subsidio DECIMAL(14,2) DEFAULT 0`)
  await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS reembolso DECIMAL(14,2) DEFAULT 0`)
  await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS total_other_income DECIMAL(14,2) DEFAULT 0`)
  await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS infotep_salary DECIMAL(14,2) DEFAULT 0`)
  await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS employee_cmid INTEGER`)
  await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS government_id VARCHAR(20)`)
  await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS cc_email VARCHAR(500)`)
  // 22MAY2026 client video: PRC-#### record ID for payroll calculator rows
  // (client explicitly named "payroll calculation" as one of the tables that
  // needs its own short ID for traceability/e-discovery).
  try {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS payroll_calculator_results_record_seq START 1001`)
    await pool.query(`ALTER TABLE payroll_calculator_results ADD COLUMN IF NOT EXISTS record_id VARCHAR(20) UNIQUE`)
    await pool.query(`UPDATE payroll_calculator_results SET record_id = 'PRC-' || LPAD(NEXTVAL('payroll_calculator_results_record_seq')::text, 4, '0') WHERE record_id IS NULL`)
    await pool.query(`ALTER TABLE payroll_calculator_results ALTER COLUMN record_id SET DEFAULT 'PRC-' || LPAD(NEXTVAL('payroll_calculator_results_record_seq')::text, 4, '0')`)
  } catch (e) {
    if (e.code !== '42701') console.warn('payroll_calculator_results record_id migration:', e.message)
  }
  console.log('Payroll calculator results table ready')
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
