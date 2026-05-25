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
    recordId: r.record_id || null,
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
    governmentId: r.government_id || null,
    ccEmail: r.cc_email || null,
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
      // 25MAY client: latest record_id on top by default
      'SELECT * FROM payroll_calculator_results WHERE payroll_cycle_code = $1 ORDER BY record_id DESC NULLS LAST, employee_name',
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

    // 21MAY2026 client video: block re-calculation of closed cycles. A cycle is
    // closed once today is past its pay date. The optional `force` flag lets a
    // future "Re-open cycle" workflow override this.
    if (!req.body.force) {
      const todayRes = await query(`SELECT CURRENT_DATE > $1::date AS closed`, [payDate])
      if (todayRes.rows[0]?.closed) {
        return res.status(409).json({
          error: 'Cycle closed',
          message: `Payroll cycle ${cycleCode} is closed (pay date ${payDate}). Closed cycles cannot be calculated or re-calculated.`,
          code: 'CYCLE_CLOSED',
        })
      }
    }

    // 2. Determine bi_week (BS) from period record, and P number for previous cycle lookup
    const pMatch = cycleCode.match(/P(\d+)$/)
    const pNum = pMatch ? parseInt(pMatch[1], 10) : 1
    const biWeek = Number(period.bs) || (pNum % 2 === 1 ? 1 : 2)

    // 3. Get all employees
    const empRes = await query(`
      SELECT u.id, u.name, e.cmid, e.salary_type, e.base_salary, e.contract_status,
             e.bank, e.bank_account, e.pay_method, e.government_id,
             e.hire_date, e.job_title, e.location, e.company_email, e.personal_email,
             c.name AS account_name,
             sup.name AS supervisor_name
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN clients c ON c.id = e.primary_client_id
      LEFT JOIN users sup ON sup.id = e.reports_to
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
          government_id,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
          $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
          $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
          $71,$72,$73,$74, NOW()
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
          deduction_validation=$66, total_deductions=$67, net_salary=$68,
          afp_employer=$70, sfs_employer=$71, arl=$72, infotep_employer=$73,
          government_id=$74,
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
        emp.government_id || null,
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
      // 25MAY client: latest record_id on top by default
      'SELECT * FROM payroll_calculator_results WHERE payroll_cycle_code = $1 ORDER BY record_id DESC NULLS LAST, employee_name',
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
    const { bank, bankAccount, payMethod, notes, ccEmail } = req.body

    const updates = []
    const params = []
    let i = 1
    if (bank !== undefined) { updates.push(`bank = $${i++}`); params.push(bank || null) }
    if (bankAccount !== undefined) { updates.push(`bank_account = $${i++}`); params.push(bankAccount || null) }
    if (payMethod !== undefined) { updates.push(`pay_method = $${i++}`); params.push(payMethod || null) }
    if (notes !== undefined) { updates.push(`notes = $${i++}`); params.push(notes || null) }
    if (ccEmail !== undefined) { updates.push(`cc_email = $${i++}`); params.push(ccEmail || null) }

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

// ---------------------------------------------------------------------------
// Paystub HTML generation helper — Spanish template matching client DOCX
// ---------------------------------------------------------------------------

const fmtRD = (n) => {
  const val = Number(n) || 0
  return 'RD$ ' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtH = (n) => {
  const val = Number(n) || 0
  return val.toFixed(2) + ' H'
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtDate = (d) => {
  if (!d) return ''
  let y, mo, day
  if (d instanceof Date) {
    y = d.getFullYear(); mo = d.getMonth(); day = d.getDate()
  } else {
    const s = String(d).slice(0, 10).split('-')
    if (s.length < 3) return ''
    y = parseInt(s[0], 10); mo = parseInt(s[1], 10) - 1; day = parseInt(s[2], 10)
  }
  if (!y || isNaN(y)) return ''
  return `${MONTHS[mo]}-${String(day).padStart(2,'0')}-${y}`
}
const fmtDateTime = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${MONTHS[now.getMonth()]}-${pad(now.getDate())}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}
const calcLengthOfService = (hireDate, termDate) => {
  if (!hireDate) return ''
  const start = new Date(hireDate)
  const end = termDate ? new Date(termDate) : new Date()
  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  let days = end.getDate() - start.getDate()
  if (days < 0) { months--; days += 30 }
  if (months < 0) { years--; months += 12 }
  return `${years}A ${months}M ${days}D`
}
const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildPaystubHTML(r, employeeExtra) {
  const cmid = r.employee_cmid != null ? Number(r.employee_cmid) : ''
  const paystubId = `${r.payroll_cycle_code}-${cmid || r.user_id.slice(0, 8)}`
  const generatedDate = fmtDateTime()
  const ex = employeeExtra || {}
  const lengthOfService = calcLengthOfService(ex.hire_date, ex.termination_date)

  // Row helpers — only show if non-zero unless forceShow
  const row3 = (label, hours, amount, forceShow) => {
    if (!forceShow && !Number(amount) && !Number(hours)) return ''
    return `<tr><td class="lbl">${label}</td><td class="hrs">${hours != null ? fmtH(hours) : ''}</td><td class="amt">${fmtRD(amount)}</td></tr>`
  }
  const row2 = (label, amount, forceShow) => {
    if (!forceShow && !Number(amount)) return ''
    return `<tr><td class="lbl">${label}</td><td class="amt">${fmtRD(amount)}</td></tr>`
  }
  // For 3-col layout: item with hours+amount on one line
  const incLine = (label, hours, amount) => {
    if (!Number(amount) && !Number(hours)) return ''
    const h = hours != null ? `${fmtH(hours)}, ` : ''
    return `<div class="il">${label}: ${h}${fmtRD(amount)}</div>`
  }
  const incItem = (label, amount) => {
    if (!Number(amount)) return ''
    return `<div class="il">${label}: ${fmtRD(amount)}</div>`
  }
  const dedItem = (label, amount) => {
    if (!Number(amount)) return ''
    return `<div class="dl">${label}: ${fmtRD(amount)}</div>`
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PayStub - ${escapeHtml(r.employee_name)} - ${r.payroll_cycle_code}</title>
<style>
/* Callmax brand palette per 19MAY2026 client video:
   "we need to keep everything with the call max colors, which are blue, dark blue and lighter blue" */
@media print { body{margin:0;background:#fff;padding:0} .no-print{display:none!important} @page{margin:0.4in;size:letter} }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:10.5px;color:#1e293b;background:#e2e8f0;padding:16px}
.stub{max-width:800px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.hdr{text-align:center;padding:12px 20px 8px;border-bottom:2px solid #1e40af}
.hdr .logo-wrap{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:4px}
.hdr .logo-mark{width:36px;height:36px;flex-shrink:0}
.hdr h1{font-size:20px;letter-spacing:1.5px;font-weight:800;color:#1e40af}
.hdr .sub{font-size:9px;color:#64748b;margin-top:2px}
.emp-bar{background:#eff6ff;border:2px solid #1e40af;border-radius:6px;margin:12px 20px 8px;padding:8px 14px;text-align:center}
.emp-bar b{font-size:13px;color:#1e40af}
.info-row{display:flex;justify-content:space-between;padding:0 20px;margin-bottom:8px;gap:12px}
.info-left,.info-right{font-size:10px;line-height:1.7}
.info-left b,.info-right b{font-weight:700;color:#1e3a8a}
.info-right{text-align:right}
.notes-line{padding:2px 20px;font-size:10px;margin-bottom:4px}
.notes-line b{font-weight:700;color:#1e3a8a}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #cbd5e1;margin:0 20px 10px}
.grid3 .col{padding:8px 10px;font-size:9.5px;line-height:1.6;border-right:1px solid #e2e8f0}
.grid3 .col:last-child{border-right:none}
.grid3 .col-hdr{background:#1e40af;color:#fff;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.5px;padding:4px 10px;text-align:center}
.grid3 .col-hdr.ded{grid-column:3;background:#991b1b}
.grid3 .sec-lbl{font-weight:700;color:#1e3a8a;margin-top:6px;margin-bottom:2px;font-size:9.5px}
.il{color:#334155;padding:1px 0}
.il:before{content:'';display:inline}
.dl{color:#334155;padding:1px 0}
.tss-box{background:#eff6ff;border:1px solid #93c5fd;border-radius:3px;padding:3px 8px;margin:4px 0;font-size:9px;color:#1e40af;font-weight:600}
.rare{color:#94a3b8}
.rare:before{content:'*'}
.summary-bar{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;text-align:center;margin:8px 20px;padding:10px 0;border-top:2px solid #1e40af;border-bottom:2px solid #1e40af;background:#eff6ff}
.summary-bar .s-lbl{font-size:9px;font-weight:700;color:#1e3a8a;text-transform:uppercase}
.summary-bar .s-val{font-size:14px;font-weight:800;color:#1e40af;font-family:monospace;margin-top:2px}
.summary-bar .s-val.ded{color:#dc2626}
.summary-bar .s-val.net{color:#1e40af;font-size:16px}
.employer-sec{padding:4px 20px;margin-bottom:4px}
.employer-sec .sec-lbl{font-size:9px;font-weight:700;color:#1e3a8a;margin-bottom:3px}
.employer-row{display:flex;gap:16px;font-size:9.5px;color:#64748b}
.ftr{padding:8px 20px;font-size:8px;color:#94a3b8;text-align:center;line-height:1.5;border-top:1px solid #e2e8f0}
.ftr a{color:#1e40af}
.print-btn{display:block;margin:16px auto;padding:10px 40px;background:#1e40af;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600}
.print-btn:hover{background:#1e3a8a}
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar como PDF</button>
<div class="stub">

  <div class="hdr">
    <div class="logo-wrap">
      <svg class="logo-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="cmaxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e40af"/>
            <stop offset="100%" stop-color="#1e3a8a"/>
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="12" fill="url(#cmaxGrad)"/>
        <path d="M22 32 Q22 22 32 22 Q42 22 42 32" stroke="#dbeafe" stroke-width="4" fill="none" stroke-linecap="round"/>
        <circle cx="32" cy="38" r="4" fill="#dbeafe"/>
        <path d="M32 38 L32 28" stroke="#dbeafe" stroke-width="3" stroke-linecap="round"/>
        <text x="32" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="800" fill="#dbeafe">CMAX</text>
      </svg>
      <h1>CMAX SOLUTIONS</h1>
    </div>
    <div class="sub">Volante de Pago No. ${escapeHtml(paystubId)}, emitido el ${generatedDate}</div>
  </div>

  <div class="emp-bar">
    <b>${escapeHtml(r.employee_name)} | C&eacute;dula ${escapeHtml(r.government_id)} | CMID ${cmid} | ${escapeHtml(r.contract_status)}</b>
  </div>

  <div class="info-row">
    <div class="info-left">
      <b>Puesto:</b> ${escapeHtml(ex.job_title)} <b>Cuenta:</b> ${escapeHtml(r.account)}<br>
      <b>Inicio:</b> ${fmtDate(ex.hire_date)} <b>En Servicio:</b> ${lengthOfService}<br>
      <b>Sup:</b> ${escapeHtml(ex.supervisor_name)} <b>Site:</b> ${escapeHtml(ex.location)}<br>
      <b>Email CMAX:</b> ${escapeHtml(ex.company_email)}<br>
      <b>Email Personal:</b> ${escapeHtml(ex.personal_email)}
    </div>
    <div class="info-right">
      <b>Catorcena:</b> ${escapeHtml(r.payroll_cycle_code)}<br>
      <b>Ciclo:</b> ${fmtDate(r.period_from)} al ${fmtDate(r.period_to)}<br>
      <b>Fecha de Pago:</b> ${fmtDate(r.pay_date)}<br>
      <b>Banco:</b> ${escapeHtml(r.bank)} | ${escapeHtml(r.bank_account)}<br>
      <b>Salario:</b> ${fmtRD(r.salary)} | ${escapeHtml(r.salary_type)}
    </div>
  </div>

  <div class="notes-line"><b>Notas:</b> ${escapeHtml(r.notes)}</div>

  <div class="grid3">
    <div class="col-hdr" style="grid-column:1/3">INGRESOS</div>
    <div class="col-hdr ded">DEDUCCIONES</div>

    <div class="col">
      <div class="sec-lbl">Salario Ordinario</div>
      ${incLine('Horas Regulares', r.hreg, r.ordinary_salary)}
      <div class="il" style="padding-left:10px;font-size:9px;color:#64748b">&bull; Horas Regulares Trabajadas: ${fmtH(r.hreg1)}</div>
      <div class="il" style="padding-left:10px;font-size:9px;color:#64748b">&bull; Horas Regulares Pendientes: ${fmtH(r.hreg2)}</div>

      <div class="sec-lbl">Vacaciones y Licencias Pagadas</div>
      ${incItem('Vacaciones', r.vacation)}
      ${incItem('Lic. Matrimonio', r.matrimony)}
      ${incItem('Lic. Duelo', r.bereavement)}
      ${incItem('Lic. Paternidad', r.paternity)}
      ${incItem('Lic. Maternidad', r.maternity)}
      <div class="il rare">${Number(r.medical) ? `Lic. M&eacute;dica: ${fmtRD(r.medical)}` : ''}</div>

      <div class="sec-lbl">Comisiones</div>
      ${incItem('Por Ventas', r.commissions)}
    </div>

    <div class="col">
      <div class="sec-lbl">Horas Extraordinarias</div>
      ${incLine('Nocturnas', r.hn15_hours, r.hn15_amount)}
      ${incLine('Al 35% Extra', r.hx35_hours, r.hx35_amount)}
      ${incLine('Al 100% Extra', r.hx100_hours, r.hx100_amount)}
      ${incLine('Feriadas', r.hhol_hours, r.hhol_amount)}

      <div class="sec-lbl">Bonos</div>
      ${incItem('Colaboraci&oacute;n', r.collaboration)}
      ${incItem('Reclutamiento', r.recruiting)}
      <div class="il rare">${Number(r.profit_sharing) ? `Repartici&oacute;n Utilidades: ${fmtRD(r.profit_sharing)}` : ''}</div>

      <div class="sec-lbl">Incentivos por Cump. de Metas</div>
      ${incItem('Asistencia Perfecta', r.attendance_incentive)}
      ${incItem('Desempe&ntilde;o M&eacute;tricas', r.kpi_incentive)}

      <div class="sec-lbl">Otros Ingresos</div>
      ${incItem('Reimbursement', r.reembolso)}
      ${incItem('Subsidy', r.subsidio)}
    </div>

    <div class="col">
      <div class="sec-lbl">Deducciones de Ley</div>
      ${dedItem('AFP', r.afp)}
      ${dedItem('SFS', r.sfs)}
      ${dedItem('ISR', r.isr_retention)}
      <div class="dl rare">${Number(r.infotep) ? `INFOTEP: ${fmtRD(r.infotep)}` : ''}</div>

      <div class="sec-lbl" style="margin-top:10px">Otras Deducciones</div>
      ${dedItem('Dep. TSS', r.tss_dependents)}
      ${dedItem('PayLater', r.pay_later)}
      ${dedItem('Gimnasio', r.gym)}
      ${dedItem('Seguro', r.insurance_ded)}
      ${dedItem('Cafeter&iacute;a', r.cafeteria)}
      <div class="dl rare">${Number(r.admin_deduction) ? `Admin: ${fmtRD(r.admin_deduction)}` : ''}</div>
      <div class="dl rare">${Number(r.deduccion_x) ? `Deducci&oacute;nX: ${fmtRD(r.deduccion_x)}` : ''}</div>
      <div class="dl rare">${Number(r.other_deductions_spare) ? `Deducci&oacute;nY: ${fmtRD(r.other_deductions_spare)}` : ''}</div>
    </div>
  </div>

  <div style="padding:2px 20px 4px;text-align:right">
    <span class="tss-box" style="display:inline-block">Salario cotizable para la TSS: ${fmtRD(r.tss_salary)}</span>
  </div>

  <div class="summary-bar">
    <div><div class="s-lbl">Total Ingresos</div><div class="s-val">${fmtRD(r.gross_salary)}</div></div>
    <div><div class="s-lbl">Total Deducciones</div><div class="s-val ded">${fmtRD(r.total_deductions)}</div></div>
    <div><div class="s-lbl">Neto a Cobrar</div><div class="s-val net">${fmtRD(r.net_salary)}</div></div>
    <div><div class="s-lbl">M&eacute;todo de Pago</div><div class="s-val" style="font-size:12px">${escapeHtml(r.pay_method)}</div></div>
  </div>

  <div class="employer-sec">
    <div class="sec-lbl">COSTO PATRONAL (REFERENCIA)</div>
    <div class="employer-row">
      <span>AFP: ${fmtRD(r.afp_employer)}</span>
      <span>SFS: ${fmtRD(r.sfs_employer)}</span>
      <span>ARL: ${fmtRD(r.arl)}</span>
      <span>INFOTEP: ${fmtRD(r.infotep_employer)}</span>
    </div>
  </div>

  <div class="ftr">
    <p>&copy; 2026 OPES SRL, RNC 1-31-96035-9 | TODOS LOS DERECHOS RESERVADOS</p>
    <p>Este documento es confidencial. Su contenido est&aacute; reservado exclusivamente para OPES SRL, sus socios autorizados y el destinatario indicado. Cualquier uso no autorizado est&aacute; prohibido sin el consentimiento previo de OPES SRL. Enviado el ${generatedDate} a: <a href="mailto:${escapeHtml(ex.company_email || '')}">${escapeHtml(ex.company_email || '')}</a>${ex.personal_email ? ` y <a href="mailto:${escapeHtml(ex.personal_email)}">${escapeHtml(ex.personal_email)}</a>` : ''}${r.cc_email ? ` y Cc: ${escapeHtml(r.cc_email)}` : ''}</p>
  </div>

</div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// GET /paystub/:id — Render HTML pay stub (printable to PDF)
// ---------------------------------------------------------------------------
router.get('/paystub/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('SELECT * FROM payroll_calculator_results WHERE id = $1', [id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    const r = result.rows[0]

    // Fetch extra employee info for the stub
    const empRes = await query(`
      SELECT e.hire_date, e.job_title, e.location, e.company_email, e.personal_email,
             e.termination_date, sup.name AS supervisor_name
      FROM employees e
      LEFT JOIN users sup ON sup.id = e.reports_to
      WHERE e.user_id = $1
    `, [r.user_id])
    const employeeExtra = empRes.rows[0] || {}

    const html = buildPaystubHTML(r, employeeExtra)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    console.error('Paystub render error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /generate-paystub/:id — Generate PDF pay stub using pdfkit
// Returns the PDF as a downloadable file
// ---------------------------------------------------------------------------
router.post('/generate-paystub/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('SELECT * FROM payroll_calculator_results WHERE id = $1', [id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    const r = result.rows[0]

    // For now, redirect to the HTML paystub viewer
    // Full PDF generation can be done by the client printing the HTML to PDF
    // or by adding puppeteer/headless-chrome later
    const empRes = await query(`
      SELECT e.hire_date, e.job_title, e.location, e.company_email, e.personal_email,
             e.termination_date, sup.name AS supervisor_name
      FROM employees e
      LEFT JOIN users sup ON sup.id = e.reports_to
      WHERE e.user_id = $1
    `, [r.user_id])
    const employeeExtra = empRes.rows[0] || {}

    const html = buildPaystubHTML(r, employeeExtra)
    const cmid = r.employee_cmid != null ? Number(r.employee_cmid) : r.user_id.slice(0, 8)
    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
    const fileName = `VDP-${(r.employee_name||'').replace(/\s+/g,'_')}-${r.payroll_cycle_code}-${cmid}-${ts}.html`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(html)
  } catch (err) {
    console.error('Generate paystub error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /generate-paystubs — Bulk paystub generation for a cycle
// Body: { cycleCode: string, ids?: string[] }
// Returns: array of { id, fileName, url }
// ---------------------------------------------------------------------------
router.post('/generate-paystubs', async (req, res) => {
  try {
    const { cycleCode, ids } = req.body
    if (!cycleCode) {
      return res.status(400).json({ error: 'Bad request', message: 'cycleCode is required' })
    }

    let rows
    if (ids && ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(',')
      const result = await query(
        `SELECT id, employee_cmid, employee_name, user_id, net_salary, payroll_cycle_code
         FROM payroll_calculator_results
         WHERE payroll_cycle_code = $1 AND id IN (${placeholders})
         ORDER BY employee_name`,
        [cycleCode, ...ids]
      )
      rows = result.rows
    } else {
      const result = await query(
        `SELECT id, employee_cmid, employee_name, user_id, net_salary, payroll_cycle_code
         FROM payroll_calculator_results
         WHERE payroll_cycle_code = $1 AND net_salary > 0
         ORDER BY employee_name`,
        [cycleCode]
      )
      rows = result.rows
    }

    const stubs = rows.map(r => {
      const cmid = r.employee_cmid != null ? Number(r.employee_cmid) : r.user_id.slice(0, 8)
      const fileName = `paystub-${r.payroll_cycle_code}-${cmid}.html`
      return {
        id: r.id,
        employeeName: r.employee_name,
        fileName,
        url: `/api/admin/payroll-calculator/paystub/${r.id}`,
      }
    })

    res.json({ count: stubs.length, stubs })
  } catch (err) {
    console.error('Bulk generate paystubs error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /send-paystub — Send paystub via email (placeholder)
// Body: { ids: string[], ccEmail?: string }
// TODO: Requires SMTP configuration (nodemailer) — placeholder for now
// ---------------------------------------------------------------------------
router.post('/send-paystub', async (req, res) => {
  try {
    const { ids, ccEmail } = req.body
    if (!ids || !ids.length) {
      return res.status(400).json({ error: 'Bad request', message: 'ids array is required' })
    }

    // Save CC email to each record if provided
    if (ccEmail) {
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(',')
      await query(
        `UPDATE payroll_calculator_results SET cc_email = $1 WHERE id IN (${placeholders})`,
        [ccEmail, ...ids]
      )
    }

    // Fetch records
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const result = await query(
      `SELECT pcr.id, pcr.employee_name, pcr.employee_cmid, pcr.user_id, pcr.payroll_cycle_code,
              e.company_email, e.personal_email
       FROM payroll_calculator_results pcr
       LEFT JOIN employees e ON e.user_id = pcr.user_id
       WHERE pcr.id IN (${placeholders})`,
      [...ids]
    )

    const emailResults = result.rows.map(r => ({
      id: r.id,
      employeeName: r.employee_name,
      companyEmail: r.company_email || null,
      personalEmail: r.personal_email || null,
      ccEmail: ccEmail || null,
      status: 'pending',
      message: 'Email sending requires SMTP configuration. Paystub HTML is available via GET /paystub/:id',
    }))

    res.json({
      message: 'Email sending is not yet configured. SMTP settings are required. Paystubs are available for download.',
      results: emailResults,
    })
  } catch (err) {
    console.error('Send paystub error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
