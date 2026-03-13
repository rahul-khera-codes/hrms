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
  console.log('Clients, Shifts, Schedule tables ready')
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
