import { Router } from 'express'
import { query } from '../config/db.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'
import {
  TSS_BIWEEKLY_CAPS, TSS_CONFIG,
  computeAFPEmployee, computeSFSEmployee, computeINFOTEPEmployee,
  computeEmployerCosts, computeISRMonthly,
} from '../lib/drPayrollRules.js'

const router = Router()

const round2 = (n) => Math.round(n * 100) / 100
const round4 = (n) => Math.round(n * 10000) / 10000

/**
 * Map a snake_case DB row to camelCase for the API response.
 */
function mapRow(r) {
  return {
    id: r.id,
    payrollCycleCode: r.payroll_cycle_code,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    payDate: r.pay_date,
    biWeek: r.bi_week != null ? Number(r.bi_week) : null,
    userId: r.user_id,
    employeeCmid: r.employee_cmid != null ? Number(r.employee_cmid) : null,
    employeeName: r.employee_name,
    account: r.account,
    salaryType: r.salary_type,
    salary: Number(r.salary) || 0,
    hourlySalary: Number(r.hourly_salary) || 0,
    contractStatus: r.contract_status,
    bank: r.bank,
    bankAccount: r.bank_account,
    payMethod: r.pay_method,
    hreg1: Number(r.hreg1) || 0,
    hreg2: Number(r.hreg2) || 0,
    hreg: Number(r.hreg) || 0,
    ordinarySalary: Number(r.ordinary_salary) || 0,
    vacation: Number(r.vacation) || 0,
    matrimony: Number(r.matrimony) || 0,
    maternity: Number(r.maternity) || 0,
    paternity: Number(r.paternity) || 0,
    bereavement: Number(r.bereavement) || 0,
    medical: Number(r.medical) || 0,
    vpl: Number(r.vpl) || 0,
    commissions: Number(r.commissions) || 0,
    hn15Hours: Number(r.hn15_hours) || 0,
    hn15Amount: Number(r.hn15_amount) || 0,
    hx35Hours: Number(r.hx35_hours) || 0,
    hx35Amount: Number(r.hx35_amount) || 0,
    hx100Hours: Number(r.hx100_hours) || 0,
    hx100Amount: Number(r.hx100_amount) || 0,
    hholHours: Number(r.hhol_hours) || 0,
    hholAmount: Number(r.hhol_amount) || 0,
    overtimeTotal: Number(r.overtime_total) || 0,
    collaboration: Number(r.collaboration) || 0,
    recruiting: Number(r.recruiting) || 0,
    profitSharing: Number(r.profit_sharing) || 0,
    bonusesTotal: Number(r.bonuses_total) || 0,
    attendanceIncentive: Number(r.attendance_incentive) || 0,
    kpiIncentive: Number(r.kpi_incentive) || 0,
    incentivesTotal: Number(r.incentives_total) || 0,
    subsidio: Number(r.subsidio) || 0,
    reembolso: Number(r.reembolso) || 0,
    totalOtherIncome: Number(r.total_other_income) || 0,
    grossSalary: Number(r.gross_salary) || 0,
    tssSalary: Number(r.tss_salary) || 0,
    infotepSalary: Number(r.infotep_salary) || 0,
    isrSalary: Number(r.isr_salary) || 0,
    afp: Number(r.afp) || 0,
    sfs: Number(r.sfs) || 0,
    tssDependents: Number(r.tss_dependents) || 0,
    infotep: Number(r.infotep) || 0,
    isrRetention: Number(r.isr_retention) || 0,
    govDeductionsTotal: Number(r.gov_deductions_total) || 0,
    payLater: Number(r.pay_later) || 0,
    gym: Number(r.gym) || 0,
    insuranceDed: Number(r.insurance_ded) || 0,
    cafeteria: Number(r.cafeteria) || 0,
    adminDeduction: Number(r.admin_deduction) || 0,
    deduccionX: Number(r.deduccion_x) || 0,
    otherDeductionsSpare: Number(r.other_deductions_spare) || 0,
    otherDeductionsTotal: Number(r.other_deductions_total) || 0,
    deductionValidation: r.deduction_validation === true,
    totalDeductions: Number(r.total_deductions) || 0,
    netSalary: Number(r.net_salary) || 0,
    notes: r.notes || '',
    afpEmployer: Number(r.afp_employer) || 0,
    sfsEmployer: Number(r.sfs_employer) || 0,
    arl: Number(r.arl) || 0,
    infotepEmployer: Number(r.infotep_employer) || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// All endpoints require auth + admin role
router.use(authMiddleware)
router.use(requireAdmin)

// ---------------------------------------------------------------------------
// GET / — List results for a cycle
// Query param: cycle (required)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { cycle } = req.query
    if (!cycle) {
      return res.status(400).json({ error: 'Bad request', message: 'cycle query param is required' })
    }
    const result = await query(
      'SELECT * FROM payroll_calculator_results WHERE payroll_cycle_code = $1 ORDER BY employee_name',
      [cycle]
    )
    res.json(result.rows.map(mapRow))
  } catch (err) {
    console.error('List payroll calculator results error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /calculate — Generate payroll for a cycle
// Body: { cycleCode: string }
// ---------------------------------------------------------------------------
router.post('/calculate', async (req, res) => {
  try {
    const { cycleCode } = req.body
    if (!cycleCode) {
      return res.status(400).json({ error: 'Bad request', message: 'cycleCode is required' })
    }

    // 1. Look up the payroll period
    const periodRes = await query(
      'SELECT period_from, period_to, pay_date, cycle_code, COALESCE(bs, 1) as bs FROM payroll_periods WHERE cycle_code = $1',
      [cycleCode]
    )
    if (!periodRes.rows.length) {
      return res.status(404).json({ error: 'Not found', message: `No payroll period found for cycle ${cycleCode}` })
    }
    const period = periodRes.rows[0]
    const periodFrom = period.period_from
    const periodTo = period.period_to
    const payDate = period.pay_date

    // 2. Determine bi_week (BS) from period record, and P number for previous cycle lookup
    const pMatch = cycleCode.match(/P(\d+)$/)
    const pNum = pMatch ? parseInt(pMatch[1], 10) : 1
    const biWeek = Number(period.bs) || (pNum % 2 === 1 ? 1 : 2)

    // 3. Get all employees
    const empRes = await query(`
      SELECT u.id, u.name, e.cmid, e.salary_type, e.base_salary, e.contract_status,
             e.bank, e.bank_account, e.pay_method, c.name AS account_name
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN clients c ON c.id = e.primary_client_id
      WHERE u.role = 'employee'
    `)

    const results = []

    for (const emp of empRes.rows) {
      const salary = Number(emp.base_salary) || 0
      const salaryType = emp.salary_type || 'hourly'

      // Hourly salary
      const hourlySalary = salaryType === 'hourly'
        ? round4(salary)
        : round4((salary * 12) / 26 / 88)

      // 4a. Attendance hours from sessions — grouped by week for reconciliation
      // We group by the Sunday-start week so we can apply weekly caps.
      // date_trunc('week', ...) uses Monday by default in PostgreSQL,
      // so we shift by +1 day before truncating, then shift back to get Sunday-start weeks.
      const sessRes = await query(`
        SELECT
          date_trunc('week', (clock_in AT TIME ZONE 'UTC')::date + 1)::date - 1 AS week_start,
          COALESCE(SUM(reg_hours),0) as reg,
          COALESCE(SUM(n15_hours),0) as n15,
          COALESCE(SUM(x35_hours),0) as x35,
          COALESCE(SUM(x100_hours),0) as x100,
          COALESCE(SUM(hol_hours),0) as hol
        FROM sessions WHERE user_id=$1 AND clock_in IS NOT NULL
          AND (clock_in AT TIME ZONE 'UTC')::date >= $2 AND (clock_in AT TIME ZONE 'UTC')::date <= $3
        GROUP BY week_start
        ORDER BY week_start
      `, [emp.id, periodFrom, periodTo])

      // Weekly reconciliation constants (Dominican Republic labor law)
      const WEEKLY_REG_CAP = 44
      const WEEKLY_X35_CAP = 24

      // Accumulate reconciled hours across all weeks in the period
      let hreg1 = 0
      let hn15Hours = 0
      let hx35Hours = 0
      let hx100Hours = 0
      let hholHours = 0

      for (const week of sessRes.rows) {
        const rawReg = Number(week.reg) || 0
        const rawN15 = Number(week.n15) || 0
        const rawX35 = Number(week.x35) || 0
        const rawX100 = Number(week.x100) || 0
        const rawHol = Number(week.hol) || 0

        // Step 1: Cap regular at 44, overflow goes to X35
        const reconciledReg = Math.min(rawReg, WEEKLY_REG_CAP)
        const regOverflow = Math.max(0, rawReg - WEEKLY_REG_CAP)

        // Step 2: Total X35 pool = raw X35 + overflow from regular. Cap at 24, overflow goes to X100
        const totalX35Pool = rawX35 + regOverflow
        const reconciledX35 = Math.min(totalX35Pool, WEEKLY_X35_CAP)
        const x35Overflow = Math.max(0, totalX35Pool - WEEKLY_X35_CAP)

        // Step 3: X100 = raw X100 + overflow from X35 (no cap)
        const reconciledX100 = rawX100 + x35Overflow

        // N15 and Holiday pass through unchanged (no caps)
        const reconciledN15 = rawN15
        const reconciledHol = rawHol

        // Accumulate reconciled totals
        hreg1 = round2(hreg1 + reconciledReg)
        hn15Hours = round2(hn15Hours + reconciledN15)
        hx35Hours = round2(hx35Hours + reconciledX35)
        hx100Hours = round2(hx100Hours + reconciledX100)
        hholHours = round2(hholHours + reconciledHol)
      }

      // 4b. Payroll inputs (approved, matching cycle)
      const inputsRes = await query(`
        SELECT input_type, SUM(input_amount) as total, SUM(COALESCE(payable_hours,0)) as hours
        FROM payroll_inputs WHERE user_id=$1 AND payroll_cycle_code=$2 AND status='approved'
        GROUP BY input_type
      `, [emp.id, cycleCode])

      let hreg2 = 0
      let commissions = 0
      let collaboration = 0
      let recruiting = 0
      let profitSharing = 0
      let attendanceIncentive = 0
      let kpiIncentive = 0
      let tssDependents = 0
      let payLater = 0
      let cafeteria = 0
      let gym = 0
      let insuranceDed = 0
      let adminDeduction = 0
      let subsidio = 0, reembolso = 0

      for (const inp of inputsRes.rows) {
        const total = Number(inp.total) || 0
        const hours = Number(inp.hours) || 0
        switch (inp.input_type) {
          case 'Horas Regulares':
            hreg2 = round2(hours)
            break
          case 'Comisiones':
            commissions = round2(total)
            break
          case 'Horas Nocturnas':
            hn15Hours = round2(hn15Hours + hours)
            break
          case 'Horas al 35% Extra':
            hx35Hours = round2(hx35Hours + hours)
            break
          case 'Horas al 100% Extra':
            hx100Hours = round2(hx100Hours + hours)
            break
          case 'Horas Feriadas Trabajadas':
            hholHours = round2(hholHours + hours)
            break
          case 'Bono Colaboración':
            collaboration = round2(total)
            break
          case 'Bono Reclutamiento':
            recruiting = round2(total)
            break
          case 'Bonificación de Ley':
            profitSharing = round2(total)
            break
          case 'Incentivo PA':
            attendanceIncentive = round2(total)
            break
          case 'Incentivo KPI':
            kpiIncentive = round2(total)
            break
          case 'Descuento Dependiente TSS':
            tssDependents = round2(total)
            break
          case 'Descuento Préstamo':
          case 'Descuento PayLater':
            payLater = round2(payLater + total)
            break
          case 'Descuento Cafetería':
            cafeteria = round2(total)
            break
          case 'Descuento Gymnasio':
            gym = round2(total)
            break
          case 'Descuento Seguro':
            insuranceDed = round2(total)
            break
          case 'Descuento Admin':
            adminDeduction = round2(total)
            break
          case 'Subsidio':
            subsidio = round2(total)
            break
          case 'Reembolso No Gravable':
            reembolso = round2(total)
            break
        }
      }

      // 4c. Leave pay (approved, matching cycle)
      const leaveRes = await query(`
        SELECT leave_category, COALESCE(SUM(leave_payable_amount),0) as total
        FROM leave_requests WHERE user_id=$1 AND status='approved' AND leave_payable_amount > 0
          AND payroll_cycle_code = $2
        GROUP BY leave_category
      `, [emp.id, cycleCode])

      let vacation = 0, matrimony = 0, maternity = 0, paternity = 0, bereavement = 0, medical = 0
      for (const lv of leaveRes.rows) {
        const total = round2(Number(lv.total) || 0)
        switch (lv.leave_category) {
          case 'vacation':    vacation = total; break
          case 'marriage':    matrimony = total; break
          case 'maternity':   maternity = total; break
          case 'paternity':   paternity = total; break
          case 'bereavement': bereavement = total; break
          case 'medical_license': medical = total; break
        }
      }

      // 5. Compute derived values
      const hreg = round2(hreg1 + hreg2)
      const ordinarySalary = round2(hreg * hourlySalary)
      const vpl = round2(vacation + matrimony + maternity + paternity + bereavement + medical)

      // N15% is just the night differential premium (0.15), not full rate
      // Night hours are already counted in regular hours — this is the extra 15% only
      const hn15Amount = round2(hn15Hours * hourlySalary * 0.15)
      const hx35Amount = round2(hx35Hours * hourlySalary * 1.35)
      const hx100Amount = round2(hx100Hours * hourlySalary * 2.00)
      const hholAmount = round2(hholHours * hourlySalary * 1.00)
      const overtimeTotal = round2(hn15Amount + hx35Amount + hx100Amount + hholAmount)

      const bonusesTotal = round2(collaboration + recruiting + profitSharing)
      const incentivesTotal = round2(attendanceIncentive + kpiIncentive)
      const totalOtherIncome = round2(subsidio + reembolso)

      const grossSalary = round2(ordinarySalary + vpl + commissions + overtimeTotal + bonusesTotal + incentivesTotal + totalOtherIncome)
      const tssSalary = round2(ordinarySalary + vpl + commissions)
      // INFOTEP Salary = Ordinary + Commissions (NO VPL per client video 2 at 13:33)
      const infotepSalary = round2(ordinarySalary + commissions)

      // ── Government deductions ──
      // AFP & SFS: employee portions with bi-weekly caps (monthly cap / 2)
      const afp = computeAFPEmployee(tssSalary)
      const sfs = computeSFSEmployee(tssSalary)
      // INFOTEP employee = 0.5% of Profit Sharing bonus (Bonificación de Ley)
      const infotep = computeINFOTEPEmployee(profitSharing)

      // ── ISR (Tax) with monthly projection/reconciliation ──
      // ISR Salary = Gross - AFP - SFS - TSS Dep - Reembolso (non-taxable)
      const isrSalary = round2(grossSalary - afp - sfs - tssDependents - reembolso)

      // Monthly ISR projection:
      // BS=1 (1st pay of month): project monthly = ISR salary + ordinary salary
      // BS=2 (2nd pay of month): actual monthly = ISR salary + previous period ISR salary
      let monthlyISRProjection = 0
      let prevISRRetention = 0

      if (biWeek === 1) {
        // 1st payout: project monthly income = current ISR salary + ordinary salary (conservative estimate)
        monthlyISRProjection = isrSalary + ordinarySalary
      } else {
        // 2nd payout: look up previous cycle's ISR salary and retention for this employee
        const prevCycleNum = pNum - 1
        const prevCycleCode = prevCycleNum > 0
          ? cycleCode.replace(/P\d+$/, `P${String(prevCycleNum).padStart(2, '0')}`)
          : null
        if (prevCycleCode) {
          const prevRes = await query(
            'SELECT isr_salary, isr_retention FROM payroll_calculator_results WHERE payroll_cycle_code = $1 AND user_id = $2',
            [prevCycleCode, emp.id]
          )
          if (prevRes.rows.length > 0) {
            const prevRow = prevRes.rows[0]
            monthlyISRProjection = isrSalary + (Number(prevRow.isr_salary) || 0)
            prevISRRetention = Number(prevRow.isr_retention) || 0
          } else {
            // No previous data — treat as 1st pay projection
            monthlyISRProjection = isrSalary + ordinarySalary
          }
        } else {
          monthlyISRProjection = isrSalary + ordinarySalary
        }
      }

      // Calculate monthly ISR using brackets, then determine this period's retention
      // Excel: IF(BS<2, ISRMes/Pagos_Este_Mes, ISRMes-ISR1)
      const monthlyISR = computeISRMonthly(monthlyISRProjection)
      const paymentsThisMonth = 2  // Bi-weekly = 2 payments per month
      let isrRetention = 0
      if (biWeek === 1) {
        // 1st payout: divide monthly ISR by payments this month
        isrRetention = round2(monthlyISR / paymentsThisMonth)
      } else {
        // 2nd payout: monthly ISR minus what was already deducted in 1st payout
        isrRetention = round2(Math.max(0, monthlyISR - prevISRRetention))
      }

      const govDeductionsTotal = round2(afp + sfs + tssDependents + infotep + isrRetention)

      // ── Other deductions (employee-agreed, from payroll inputs) ──
      const deduccionX = 0
      const otherDeductionsSpare = 0
      const otherDeductionsTotal = round2(payLater + gym + insuranceDed + cafeteria + adminDeduction + deduccionX + otherDeductionsSpare)
      const totalDeductions = round2(govDeductionsTotal + otherDeductionsTotal)
      const netSalary = round2(Math.max(0, grossSalary - totalDeductions))
      const deductionValidation = otherDeductionsTotal > grossSalary * 0.1666

      // ── Employer costs ──
      const employerCosts = computeEmployerCosts(tssSalary, infotepSalary)
      const afpEmployer = employerCosts.afp
      const sfsEmployer = employerCosts.sfs
      const arl = employerCosts.arl
      const infotepEmployer = employerCosts.infotep

      // 6. Upsert
      await query(`
        INSERT INTO payroll_calculator_results (
          payroll_cycle_code, period_from, period_to, pay_date, bi_week,
          user_id, employee_cmid, employee_name, account, salary_type,
          salary, hourly_salary, contract_status, bank, bank_account, pay_method,
          hreg1, hreg2, hreg, ordinary_salary,
          vacation, matrimony, maternity, paternity, bereavement, medical, vpl,
          commissions,
          hn15_hours, hn15_amount, hx35_hours, hx35_amount,
          hx100_hours, hx100_amount, hhol_hours, hhol_amount,
          overtime_total,
          collaboration, recruiting, profit_sharing, bonuses_total,
          attendance_incentive, kpi_incentive, incentives_total,
          subsidio, reembolso, total_other_income,
          gross_salary, tss_salary, infotep_salary, isr_salary,
          afp, sfs, tss_dependents, infotep, isr_retention, gov_deductions_total,
          pay_later, gym, insurance_ded, cafeteria, admin_deduction,
          deduccion_x, other_deductions_spare, other_deductions_total,
          deduction_validation, total_deductions, net_salary, notes,
          afp_employer, sfs_employer, arl, infotep_employer,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
          $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
          $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
          $71,$72,$73, NOW()
        )
        ON CONFLICT (payroll_cycle_code, user_id) DO UPDATE SET
          period_from=$2, period_to=$3, pay_date=$4, bi_week=$5,
          employee_cmid=$7, employee_name=$8, account=$9, salary_type=$10,
          salary=$11, hourly_salary=$12, contract_status=$13, bank=$14, bank_account=$15, pay_method=$16,
          hreg1=$17, hreg2=$18, hreg=$19, ordinary_salary=$20,
          vacation=$21, matrimony=$22, maternity=$23, paternity=$24, bereavement=$25, medical=$26, vpl=$27,
          commissions=$28,
          hn15_hours=$29, hn15_amount=$30, hx35_hours=$31, hx35_amount=$32,
          hx100_hours=$33, hx100_amount=$34, hhol_hours=$35, hhol_amount=$36,
          overtime_total=$37,
          collaboration=$38, recruiting=$39, profit_sharing=$40, bonuses_total=$41,
          attendance_incentive=$42, kpi_incentive=$43, incentives_total=$44,
          subsidio=$45, reembolso=$46, total_other_income=$47,
          gross_salary=$48, tss_salary=$49, infotep_salary=$50, isr_salary=$51,
          afp=$52, sfs=$53, tss_dependents=$54, infotep=$55, isr_retention=$56, gov_deductions_total=$57,
          pay_later=$58, gym=$59, insurance_ded=$60, cafeteria=$61, admin_deduction=$62,
          deduccion_x=$63, other_deductions_spare=$64, other_deductions_total=$65,
          deduction_validation=$66, total_deductions=$67, net_salary=$68, notes=$69,
          afp_employer=$70, sfs_employer=$71, arl=$72, infotep_employer=$73,
          updated_at=NOW()
      `, [
        cycleCode, periodFrom, periodTo, payDate, biWeek,
        emp.id, emp.cmid != null ? Number(emp.cmid) : null, emp.name, emp.account_name || null, salaryType,
        salary, hourlySalary, emp.contract_status || null, emp.bank || null, emp.bank_account || null, emp.pay_method || null,
        hreg1, hreg2, hreg, ordinarySalary,
        vacation, matrimony, maternity, paternity, bereavement, medical, vpl,
        commissions,
        hn15Hours, hn15Amount, hx35Hours, hx35Amount,
        hx100Hours, hx100Amount, hholHours, hholAmount,
        overtimeTotal,
        collaboration, recruiting, profitSharing, bonusesTotal,
        attendanceIncentive, kpiIncentive, incentivesTotal,
        subsidio, reembolso, totalOtherIncome,
        grossSalary, tssSalary, infotepSalary, isrSalary,
        afp, sfs, tssDependents, infotep, isrRetention, govDeductionsTotal,
        payLater, gym, insuranceDed, cafeteria, adminDeduction,
        deduccionX, otherDeductionsSpare, otherDeductionsTotal,
        deductionValidation, totalDeductions, netSalary, null,
        afpEmployer, sfsEmployer, arl, infotepEmployer,
      ])

      results.push({
        userId: emp.id,
        employeeName: emp.name,
        grossSalary,
        netSalary,
      })
    }

    // 7. Return full result set
    const finalRes = await query(
      'SELECT * FROM payroll_calculator_results WHERE payroll_cycle_code = $1 ORDER BY employee_name',
      [cycleCode]
    )
    res.json(finalRes.rows.map(mapRow))
  } catch (err) {
    console.error('Payroll calculator error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// PATCH /:id — Update individual payroll result fields
// Only allow updating: bank, bank_account, pay_method, notes
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { bank, bankAccount, payMethod, notes } = req.body

    const updates = []
    const params = []
    let i = 1
    if (bank !== undefined) { updates.push(`bank = $${i++}`); params.push(bank || null) }
    if (bankAccount !== undefined) { updates.push(`bank_account = $${i++}`); params.push(bankAccount || null) }
    if (payMethod !== undefined) { updates.push(`pay_method = $${i++}`); params.push(payMethod || null) }
    if (notes !== undefined) { updates.push(`notes = $${i++}`); params.push(notes || null) }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' })

    params.push(id)
    await query(`UPDATE payroll_calculator_results SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i}`, params)

    const result = await query('SELECT * FROM payroll_calculator_results WHERE id = $1', [id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(mapRow(result.rows[0]))
  } catch (err) {
    console.error('Patch payroll calculator result error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
