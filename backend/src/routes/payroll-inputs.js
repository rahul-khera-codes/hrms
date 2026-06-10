import { Router } from 'express'
import { query } from '../config/db.js'
import pool from '../config/db.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'

const router = Router()

// UUID format check — prevents 22P02 errors on bad path params
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Allowed enum values from client 14APR2026 email
const INPUT_TYPES = new Set([
  'Comisiones',
  'Horas Regulares',
  'Horas Nocturnas',
  'Horas al 35% Extra',
  'Horas al 100% Extra',
  'Horas Feriadas Trabajadas',
  'Bono Colaboración',
  'Bono Reclutamiento',
  'Bonificación de Ley',
  'Incentivo PA',
  'Incentivo KPI',
  'Descuento Dependiente TSS',
  'Descuento Préstamo',
  'Descuento Cafetería',
  'Descuento Gymnasio',
  'Descuento PayLater',
  'Descuento Seguro',
  'Descuento Admin',
  'Subsidio',
  'Reembolso No Gravable',
])

const CURRENCIES = new Set(['DOP', 'USD'])
const CALC_TYPES = new Set(['hourly', 'base_amount', 'both'])
const STATUSES = new Set(['pending', 'approved', 'rejected'])

/**
 * Compute input amount per client's PowerApps formula:
 *   ('Payable Hours' * 'Hourly Rate' * 'Hourly Multiplier')
 *   + If(IsBlank('Base Amount'), 0, 'Base Amount' * 'Exchange Rate')
 *
 * Both parts can be present in a single input.
 */
export function computeInputAmount({
  payableHours,
  hourlyRate,
  hourlyMultiplier,
  baseAmount,
  exchangeRate,
}) {
  const ph = Number(payableHours) || 0
  const hr = Number(hourlyRate) || 0
  const hm = Number(hourlyMultiplier) || 0
  const ba = Number(baseAmount)
  const er = Number(exchangeRate) || 0
  const hourlyPart = ph * hr * hm
  const basePart = Number.isFinite(ba) && !Number.isNaN(ba) && ba !== 0 ? ba * er : 0
  return Math.round((hourlyPart + basePart) * 100) / 100
}

function mapRow(r) {
  return {
    id: r.id,
    recordId: r.record_id || null,
    userId: r.user_id,
    employeeName: r.user_name || null,
    employeeCmid: r.employee_cmid != null ? Number(r.employee_cmid) : null,
    // 10JUN2026 client video Item 1 — for light-red row tinting on
    // terminated/pre-noticed employees across all tables.
    contractStatus: r.contract_status || null,
    accountName: r.account_name || null,
    reportsTo: r.reports_to_name || null,
    inputType: r.input_type,
    calculationType: r.calculation_type,
    payableHours: r.payable_hours != null ? Number(r.payable_hours) : null,
    hourlyRate: r.hourly_rate != null ? Number(r.hourly_rate) : null,
    hourlyMultiplier: r.hourly_multiplier != null ? Number(r.hourly_multiplier) : null,
    currency: r.currency || null,
    baseAmount: r.base_amount != null ? Number(r.base_amount) : null,
    exchangeRate: r.exchange_rate != null ? Number(r.exchange_rate) : null,
    inputAmount: Number(r.input_amount) || 0,
    payrollCycleCode: r.payroll_cycle_code || null,
    // 02JUN2026 — optional cycle range for RECURRENT inputs (null = unbounded)
    recurrentFromCycle: r.recurrent_from_cycle || null,
    recurrentToCycle: r.recurrent_to_cycle || null,
    approverId: r.approver_id || null,
    approverName: r.approver_name || null,
    status: r.status,
    reviewedBy: r.reviewed_by || null,
    reviewedByName: r.reviewed_by_name || null,
    reviewedAt: r.reviewed_at || null,
    reviewedNote: r.reviewed_note || '',
    notes: r.notes || '',
    isLocked: r.is_locked === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // 21MAY2026 audit trail rollout
    createdBy: r.created_by || null,
    createdByName: r.created_by_name || null,
    createdOn: r.created_on || r.created_at || null,
    modifiedBy: r.modified_by || null,
    modifiedByName: r.modified_by_name || null,
    modifiedOn: r.modified_on || null,
  }
}

// All endpoints require auth + admin role
router.use(authMiddleware)
router.use(requireAdmin)

// GET /api/admin/payroll-inputs?status=&type=&cycle=&userId=
router.get('/', async (req, res) => {
  try {
    const { status, type, cycle, userId } = req.query
    const params = []
    let sql = `
      SELECT pi.*, u.name AS user_name,
             e.cmid AS employee_cmid,
             e.contract_status AS contract_status,
             c.name AS account_name,
             mgr.name AS reports_to_name,
             app.name AS approver_name,
             rev.name AS reviewed_by_name,
             cu.name AS created_by_name,
             mu.name AS modified_by_name
      FROM payroll_inputs pi
      JOIN users u ON u.id = pi.user_id
      LEFT JOIN employees e ON e.user_id = pi.user_id
      LEFT JOIN users mgr ON mgr.id = e.reports_to
      LEFT JOIN clients c ON c.id = e.primary_client_id
      LEFT JOIN users app ON app.id = pi.approver_id
      LEFT JOIN users rev ON rev.id = pi.reviewed_by
       LEFT JOIN users cu ON cu.id = pi.created_by
       LEFT JOIN users mu ON mu.id = pi.modified_by
      WHERE 1=1
    `
    if (status && status !== 'all') {
      params.push(String(status))
      sql += ` AND pi.status = $${params.length}`
    }
    if (type && type !== 'all') {
      params.push(String(type))
      sql += ` AND pi.input_type = $${params.length}`
    }
    if (cycle) {
      params.push(String(cycle))
      sql += ` AND pi.payroll_cycle_code = $${params.length}`
    }
    if (userId) {
      if (!UUID_RE.test(String(userId))) {
        return res.status(400).json({ error: 'Bad request', message: 'userId must be UUID' })
      }
      params.push(userId)
      sql += ` AND pi.user_id = $${params.length}`
    }
    sql += " ORDER BY CASE WHEN pi.status = 'pending' THEN 0 ELSE 1 END, pi.created_at DESC"

    const result = await query(sql, params)
    res.json(result.rows.map(mapRow))
  } catch (err) {
    console.error('List payroll inputs error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/payroll-inputs/bulk-template
router.get('/bulk-template', async (_req, res) => {
  res.json({
    columns: [
      { key: 'employeeCmid', label: 'Employee CMID', required: true, type: 'number' },
      { key: 'inputType', label: 'Input Type', required: true, type: 'text', options: [...INPUT_TYPES] },
      { key: 'calculationType', label: 'Calculation', required: true, type: 'text', options: ['hourly', 'base_amount'] },
      { key: 'payableHours', label: 'Payable Hours', required: false, type: 'number' },
      { key: 'hourlyRate', label: 'Hourly Rate', required: false, type: 'number' },
      { key: 'hourlyMultiplier', label: 'Hourly Multiplier', required: false, type: 'number' },
      { key: 'currency', label: 'Currency', required: false, type: 'text', options: ['DOP', 'USD'] },
      { key: 'baseAmount', label: 'Base Amount', required: false, type: 'number' },
      { key: 'exchangeRate', label: 'Exchange Rate', required: false, type: 'number' },
      { key: 'payrollCycleCode', label: 'Payroll Cycle', required: true, type: 'text' },
      { key: 'approverName', label: 'Approver', required: false, type: 'text' },
      { key: 'status', label: 'Status', required: false, type: 'text', options: ['pending', 'approved'] },
      { key: 'notes', label: 'Notes', required: false, type: 'text' },
    ],
  })
})

// POST /api/admin/payroll-inputs/bulk-upload
router.post('/bulk-upload', async (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Bad request', message: 'rows must be a non-empty array' })
  }

  try {
    // --- Batch CMID lookups ---
    const uniqueCmids = [...new Set(rows.map((r) => r.employeeCmid).filter((c) => c != null))]
    const cmidMap = new Map() // cmid -> user_id
    if (uniqueCmids.length > 0) {
      const placeholders = uniqueCmids.map((_, i) => `$${i + 1}`).join(', ')
      const cmidResult = await query(
        `SELECT u.id, e.cmid FROM users u
         LEFT JOIN employees e ON e.user_id = u.id
         WHERE e.cmid IN (${placeholders})`,
        uniqueCmids
      )
      for (const row of cmidResult.rows) {
        cmidMap.set(Number(row.cmid), row.id)
      }
    }

    // --- Batch approver name lookups ---
    const uniqueApprovers = [...new Set(
      rows.map((r) => r.approverName).filter((n) => n != null && n.trim() !== '')
    )]
    const approverMap = new Map() // lowercase name -> user id
    if (uniqueApprovers.length > 0) {
      const placeholders = uniqueApprovers.map((_, i) => `$${i + 1}`).join(', ')
      const approverResult = await query(
        `SELECT DISTINCT ON (LOWER(name)) id, name FROM users
         WHERE role = 'admin' AND LOWER(name) IN (${placeholders})
         ORDER BY LOWER(name), created_at ASC`,
        uniqueApprovers.map((n) => n.toLowerCase())
      )
      for (const row of approverResult.rows) {
        approverMap.set(row.name.toLowerCase(), row.id)
      }
    }

    // --- Process rows inside a transaction ---
    const client = await pool.connect()
    const errors = []
    let created = 0
    let skipped = 0

    try {
      await client.query('BEGIN')

      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx]
        const rowLabel = `Row ${idx + 1}`

        // Resolve user_id from CMID
        const userId = cmidMap.get(Number(r.employeeCmid))
        if (!userId) {
          errors.push(`${rowLabel}: Employee CMID ${r.employeeCmid} not found`)
          skipped++
          continue
        }

        // Validate inputType
        if (!r.inputType || !INPUT_TYPES.has(r.inputType)) {
          errors.push(`${rowLabel}: Invalid inputType "${r.inputType}"`)
          skipped++
          continue
        }

        // Validate calculationType
        const calcType = r.calculationType || 'base_amount'
        if (!CALC_TYPES.has(calcType)) {
          errors.push(`${rowLabel}: Invalid calculationType "${r.calculationType}"`)
          skipped++
          continue
        }

        // Resolve approver
        let approverId = null
        if (r.approverName && r.approverName.trim() !== '') {
          approverId = approverMap.get(r.approverName.toLowerCase()) || null
          if (!approverId) {
            errors.push(`${rowLabel}: Approver "${r.approverName}" not found (row still created without approver)`)
          }
        }

        // Compute amount
        const inputAmount = computeInputAmount({
          payableHours: r.payableHours,
          hourlyRate: r.hourlyRate,
          hourlyMultiplier: r.hourlyMultiplier,
          baseAmount: r.baseAmount,
          exchangeRate: r.exchangeRate,
        })

        const status = r.status && STATUSES.has(r.status) ? r.status : 'pending'

        await client.query(
          `INSERT INTO payroll_inputs (
             user_id, input_type, calculation_type,
             payable_hours, hourly_rate, hourly_multiplier,
             currency, base_amount, exchange_rate,
             input_amount, payroll_cycle_code, approver_id,
             status, notes
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            userId, r.inputType, calcType,
            r.payableHours ?? null, r.hourlyRate ?? null, r.hourlyMultiplier ?? null,
            r.currency || null, r.baseAmount ?? null, r.exchangeRate ?? null,
            inputAmount, r.payrollCycleCode || null, approverId,
            status, r.notes || null,
          ]
        )
        created++
      }

      await client.query('COMMIT')
    } catch (txErr) {
      await client.query('ROLLBACK')
      throw txErr
    } finally {
      client.release()
    }

    res.status(201).json({ created, errors, skipped })
  } catch (err) {
    console.error('Bulk upload payroll inputs error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/payroll-inputs/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Bad request', message: 'id must be UUID' })
    }
    const result = await query(
      `SELECT pi.*, u.name AS user_name,
              e.cmid AS employee_cmid, c.name AS account_name,
              mgr.name AS reports_to_name,
              app.name AS approver_name, rev.name AS reviewed_by_name,
              cu.name AS created_by_name, mu.name AS modified_by_name
       FROM payroll_inputs pi
       JOIN users u ON u.id = pi.user_id
       LEFT JOIN employees e ON e.user_id = pi.user_id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN users app ON app.id = pi.approver_id
       LEFT JOIN users rev ON rev.id = pi.reviewed_by
       LEFT JOIN users cu ON cu.id = pi.created_by
       LEFT JOIN users mu ON mu.id = pi.modified_by
       WHERE pi.id = $1`,
      [id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(mapRow(result.rows[0]))
  } catch (err) {
    console.error('Get payroll input error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function validateBody(body, isCreate = true) {
  const errors = []
  if (isCreate) {
    if (!body.userId) errors.push('userId is required')
    if (!body.inputType) errors.push('inputType is required')
  }
  if (body.inputType && !INPUT_TYPES.has(body.inputType)) {
    errors.push(`inputType must be one of: ${[...INPUT_TYPES].join(', ')}`)
  }
  if (body.calculationType && !CALC_TYPES.has(body.calculationType)) {
    errors.push(`calculationType must be one of: ${[...CALC_TYPES].join(', ')}`)
  }
  if (body.currency && !CURRENCIES.has(body.currency)) {
    errors.push('currency must be DOP or USD')
  }
  if (body.status && !STATUSES.has(body.status)) {
    errors.push('status must be pending/approved/rejected')
  }
  if (body.userId && !UUID_RE.test(String(body.userId))) errors.push('userId must be UUID')
  if (body.approverId && !UUID_RE.test(String(body.approverId))) errors.push('approverId must be UUID')
  return errors
}

// POST /api/admin/payroll-inputs — create
router.post('/', async (req, res) => {
  try {
    const errors = validateBody(req.body, true)
    if (errors.length) return res.status(400).json({ error: 'Bad request', message: errors.join('; ') })

    const {
      userId, inputType, calculationType = 'base_amount',
      payableHours, hourlyRate, hourlyMultiplier,
      currency, baseAmount, exchangeRate,
      payrollCycleCode, approverId,
      status = 'pending', notes,
      recurrentFromCycle, recurrentToCycle,
    } = req.body

    const inputAmount = computeInputAmount({
      payableHours, hourlyRate, hourlyMultiplier, baseAmount, exchangeRate,
    })

    // 02JUN2026 — cycle bounds only meaningful when cycle is RECURRENT; ignore
    // them otherwise so a stray value can't poison a one-off input.
    const isRecurrent = payrollCycleCode === 'RECURRENT'
    const fromCycle = isRecurrent ? (recurrentFromCycle || null) : null
    const toCycle = isRecurrent ? (recurrentToCycle || null) : null

    const result = await query(
      `INSERT INTO payroll_inputs (
         user_id, input_type, calculation_type,
         payable_hours, hourly_rate, hourly_multiplier,
         currency, base_amount, exchange_rate,
         input_amount, payroll_cycle_code, approver_id,
         status, notes, created_by, created_on,
         recurrent_from_cycle, recurrent_to_cycle
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,$17)
       RETURNING id`,
      [
        userId, inputType, calculationType,
        payableHours ?? null, hourlyRate ?? null, hourlyMultiplier ?? null,
        currency || null, baseAmount ?? null, exchangeRate ?? null,
        inputAmount, payrollCycleCode || null, approverId || null,
        status, notes || null, req.user?.id || null,
        fromCycle, toCycle,
      ]
    )
    const newId = result.rows[0].id
    const full = await query(
      `SELECT pi.*, u.name AS user_name,
              e.cmid AS employee_cmid, c.name AS account_name,
              mgr.name AS reports_to_name,
              app.name AS approver_name, rev.name AS reviewed_by_name,
              cu.name AS created_by_name, mu.name AS modified_by_name
       FROM payroll_inputs pi
       JOIN users u ON u.id = pi.user_id
       LEFT JOIN employees e ON e.user_id = pi.user_id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN users app ON app.id = pi.approver_id
       LEFT JOIN users rev ON rev.id = pi.reviewed_by
       LEFT JOIN users cu ON cu.id = pi.created_by
       LEFT JOIN users mu ON mu.id = pi.modified_by
       WHERE pi.id = $1`,
      [newId]
    )
    res.status(201).json(mapRow(full.rows[0]))
  } catch (err) {
    console.error('Create payroll input error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/payroll-inputs/:id — update (supports lock-only + review)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Bad request', message: 'id must be UUID' })
    }
    const errors = validateBody(req.body, false)
    if (errors.length) return res.status(400).json({ error: 'Bad request', message: errors.join('; ') })

    const existing = await query('SELECT * FROM payroll_inputs WHERE id = $1', [id])
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' })
    const prev = existing.rows[0]

    // Lock-only path — works even on approved/rejected/locked records
    const bodyKeys = Object.keys(req.body)
    const lockOnly = bodyKeys.length === 1 && 'isLocked' in req.body
    if (!lockOnly && prev.is_locked && !req.body.force) {
      return res.status(409).json({ error: 'Locked', message: 'Record is locked. Unlock it first to edit.' })
    }

    const updates = []
    const params = []
    let i = 1
    const simpleFields = {
      inputType: 'input_type',
      calculationType: 'calculation_type',
      payableHours: 'payable_hours',
      hourlyRate: 'hourly_rate',
      hourlyMultiplier: 'hourly_multiplier',
      currency: 'currency',
      baseAmount: 'base_amount',
      exchangeRate: 'exchange_rate',
      payrollCycleCode: 'payroll_cycle_code',
      approverId: 'approver_id',
      notes: 'notes',
      recurrentFromCycle: 'recurrent_from_cycle',
      recurrentToCycle: 'recurrent_to_cycle',
    }
    for (const [k, col] of Object.entries(simpleFields)) {
      if (k in req.body) {
        updates.push(`${col} = $${i++}`)
        params.push(req.body[k] === '' ? null : req.body[k])
      }
    }
    // 02JUN2026 — if the cycle is being changed away from RECURRENT, clear the
    // bounds so they can't quietly survive on a non-recurrent input. The same
    // happens when the cycle is unset entirely.
    if ('payrollCycleCode' in req.body && req.body.payrollCycleCode !== 'RECURRENT') {
      if (!('recurrentFromCycle' in req.body)) {
        updates.push(`recurrent_from_cycle = NULL`)
      }
      if (!('recurrentToCycle' in req.body)) {
        updates.push(`recurrent_to_cycle = NULL`)
      }
    }
    // Status transitions — set reviewed_by/reviewed_at automatically
    if ('status' in req.body) {
      updates.push(`status = $${i++}`)
      params.push(req.body.status)
      if (req.body.status === 'approved' || req.body.status === 'rejected') {
        updates.push(`reviewed_by = $${i++}`)
        params.push(req.user.id)
        updates.push(`reviewed_at = NOW()`)
      }
    }
    if ('reviewedNote' in req.body) {
      updates.push(`reviewed_note = $${i++}`)
      params.push(req.body.reviewedNote || null)
    }
    if ('isLocked' in req.body) {
      updates.push(`is_locked = $${i++}`)
      params.push(!!req.body.isLocked)
    }

    // Recompute input_amount if any of the calc fields changed
    const calcFieldsChanged = ['payableHours', 'hourlyRate', 'hourlyMultiplier', 'baseAmount', 'exchangeRate']
      .some((k) => k in req.body)
    if (calcFieldsChanged) {
      const newAmount = computeInputAmount({
        payableHours: 'payableHours' in req.body ? req.body.payableHours : prev.payable_hours,
        hourlyRate: 'hourlyRate' in req.body ? req.body.hourlyRate : prev.hourly_rate,
        hourlyMultiplier: 'hourlyMultiplier' in req.body ? req.body.hourlyMultiplier : prev.hourly_multiplier,
        baseAmount: 'baseAmount' in req.body ? req.body.baseAmount : prev.base_amount,
        exchangeRate: 'exchangeRate' in req.body ? req.body.exchangeRate : prev.exchange_rate,
      })
      updates.push(`input_amount = $${i++}`)
      params.push(newAmount)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Bad request', message: 'No fields to update' })
    }
    // 21MAY2026 audit trail: stamp modifier on every update
    updates.push(`modified_by = $${i++}`)
    params.push(req.user?.id || null)
    updates.push(`modified_on = NOW()`)
    updates.push(`updated_at = NOW()`)
    params.push(id)
    await query(`UPDATE payroll_inputs SET ${updates.join(', ')} WHERE id = $${i}`, params)

    const full = await query(
      `SELECT pi.*, u.name AS user_name,
              e.cmid AS employee_cmid, c.name AS account_name,
              mgr.name AS reports_to_name,
              app.name AS approver_name, rev.name AS reviewed_by_name,
              cu.name AS created_by_name, mu.name AS modified_by_name
       FROM payroll_inputs pi
       JOIN users u ON u.id = pi.user_id
       LEFT JOIN employees e ON e.user_id = pi.user_id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN users app ON app.id = pi.approver_id
       LEFT JOIN users rev ON rev.id = pi.reviewed_by
       LEFT JOIN users cu ON cu.id = pi.created_by
       LEFT JOIN users mu ON mu.id = pi.modified_by
       WHERE pi.id = $1`,
      [id]
    )
    res.json(mapRow(full.rows[0]))
  } catch (err) {
    console.error('Update payroll input error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/payroll-inputs/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Bad request', message: 'id must be UUID' })
    }
    const existing = await query('SELECT is_locked FROM payroll_inputs WHERE id = $1', [id])
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' })
    if (existing.rows[0].is_locked) {
      return res.status(409).json({ error: 'Locked', message: 'Record is locked. Unlock it first to delete.' })
    }
    await query('DELETE FROM payroll_inputs WHERE id = $1', [id])
    res.status(204).end()
  } catch (err) {
    console.error('Delete payroll input error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
