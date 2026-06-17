import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, Lock, Unlock, Plus, Calendar, Clock3, Download, LayoutGrid, Table2, Search, ArrowUp, ArrowDown, Filter, Pencil, XCircle, CheckCircle2, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import {
  getAdminLeaveRequests,
  getLeaveReviewContext,
  reviewAdminLeaveRequest,
  createAdminLeaveRequest,
  setLeaveRequestLocked,
  deleteAdminLeaveRequest,
  uploadDocument,
  getEmployees,
  getPayrollPeriods,
  type AdminLeaveRequest,
  type LeaveReviewContext,
  type EmployeeRecord,
  type PayrollPeriod,
} from '@/lib/apiAdmin'
// 03JUN2026 — audit-column timestamps in AST 12-hour format
import { fmtFullDateTime, fmtShiftTimeStr } from '@/lib/timeFormat'
import { activeForLookup } from '@/lib/sortByName'
import { inactiveRowClass } from '@/lib/inactiveEmployeeRow'
import { cycleStateFor, cycleStateLabel, cycleStateBadgeClass } from '@/lib/cycleStatus'
import AdminSelect from '@/components/AdminSelect'
import DocumentUpload from '@/components/DocumentUpload'
import StagedDocumentUpload, { uploadStagedDocuments } from '@/components/StagedDocumentUpload'
import { DetailModalHeader } from '@/components/DetailModalHeader'
import { SkeletonTableRows } from '@/components/Skeleton'
import { BulkActionBar } from '@/components/BulkActionBar'
import { useToast } from '@/components/Toast'

// Background+text pair for status pills assembled with inline-flex wrappers below.
// Prefer `statusBadgeClass(status)` from @/lib/badges for new code.
const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

type LeaveCalcType = 'non_payable' | 'hourly_salary' | 'monthly_salary'

const CATEGORY_LABELS: Record<string, string> = {
  marriage: 'Matrimonio',
  bereavement: 'Duelo',
  time_off: 'Tiempo Libre',
  maternity: 'Maternidad',
  paternity: 'Paternidad',
  medical_license: 'Licencia Médica',
  vacation: 'Vacaciones',
}

const leaveCategoryOptions = [
  { value: 'marriage', label: 'Matrimonio' },
  { value: 'bereavement', label: 'Duelo' },
  { value: 'time_off', label: 'Tiempo Libre' },
  { value: 'maternity', label: 'Maternidad' },
  { value: 'paternity', label: 'Paternidad' },
  { value: 'medical_license', label: 'Licencia Médica' },
  { value: 'vacation', label: 'Vacaciones' },
]

const assetOptions = ['Access Card', 'Uber', 'O-365', 'G-Suite', 'HHAX', 'Phone Ext.', 'Cafeteria']
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Return today's payroll cycle code, if any */
function currentCycleCode(periods: PayrollPeriod[]): string | null {
  const today = new Date().toISOString().slice(0, 10)
  const hit = periods.find((p) => p.periodFrom <= today && today <= p.periodTo)
  return hit ? hit.cycleCode : null
}

/** Build cycle dropdown options with current cycle visually marked */
function buildCycleOptions(periods: PayrollPeriod[]) {
  const cur = currentCycleCode(periods)
  return periods.map((p) => {
    const isCurrent = cur === p.cycleCode
    return {
      value: p.cycleCode,
      label: isCurrent ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>{p.cycleCode}</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-700">current</span>
        </span>
      ) : (
        <span>{p.cycleCode}</span>
      ),
    }
  })
}

function hourlyRateFromEmployee(
  salaryType: 'hourly' | 'monthly',
  baseSalary: number,
  wd: number,
  hd: number
) {
  const n = Number(baseSalary) || 0
  if (salaryType === 'monthly') return n / wd / hd
  return n
}

/** Mirrors backend `leavePayComputation.js` for live preview. */
function previewLeavePay(
  salaryType: 'hourly' | 'monthly',
  baseSalary: number,
  workingDaysPerMonth: number,
  hoursPerDay: number,
  calculationType: LeaveCalcType,
  payableDays: number
) {
  const wd = Number(workingDaysPerMonth) || 23.83
  const hd = Number(hoursPerDay) || 8
  const base = Number(baseSalary) || 0
  if (calculationType === 'non_payable') {
    const hr = hourlyRateFromEmployee(salaryType, base, wd, hd)
    return {
      hourlyRate: Math.round(hr * 10000) / 10000,
      dailyHours: hd,
      dailySalary: 0,
      payableAmount: 0,
    }
  }
  let dailySalary = 0
  if (calculationType === 'hourly_salary') {
    dailySalary = hourlyRateFromEmployee(salaryType, base, wd, hd) * hd
  } else {
    dailySalary = salaryType === 'monthly' ? base / wd : base * hd
  }
  const pd = Math.max(0, payableDays || 0)
  return {
    hourlyRate: Math.round(hourlyRateFromEmployee(salaryType, base, wd, hd) * 10000) / 10000,
    dailyHours: hd,
    dailySalary: Math.round(dailySalary * 10000) / 10000,
    payableAmount: Math.round(dailySalary * pd * 100) / 100,
  }
}

export default function AdminLeaveRequests() {
  const [rows, setRows] = useState<AdminLeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [filterLeaveType, setFilterLeaveType] = useState<string>('all')
  const [filterCycle, setFilterCycle] = useState<string>('all')
  const [search, setSearch] = useState('')
  // Per-column sort/filter (standard from 14APR2026 — "every table")
  // 25MAY client: default sort by Record ID desc (latest LOA-#### on top)
  const [sortCol, setSortCol] = useState<string | null>('Record ID')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  const leaveColAccessor = (r: AdminLeaveRequest, col: string): string | number => {
    switch (col) {
      case 'Record ID': return r.recordId ?? ''
      case 'CMID': return r.employeeCmid ?? 0
      case 'Employee Name': return r.employeeName.toLowerCase()
      case 'Account': return (r.accountName ?? '').toLowerCase()
      case 'Leave Type': return (CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '').toLowerCase()
      case 'Approval Status': return r.status
      case 'Calculation': return (r.leaveCalculationType ?? '').toLowerCase()
      case 'Start Date': return r.startDate ?? ''
      case 'End Date': return r.endDate ?? ''
      case 'Days Off': return (r.leaveAssociateDaysOff ?? '').toLowerCase()
      case 'Return Date': return r.returnDate ?? ''
      case 'Payable Days': return r.leavePayableDays ?? 0
      case 'Daily Salary': return r.dailySalary ?? 0
      case 'Payable Amount': return r.leavePayableAmount ?? 0
      case 'Payroll Cycle': return (r.payrollCycleCode ?? '').toLowerCase()
      default: return ''
    }
  }

  function handleLeaveSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }
  function handleLeaveColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }
  const toast = useToast()
  // Keep `setNotice` API for minimal migration churn — auto-detect error vs success
  // by message content. Any string starting with "Could not", "Failed", contains "must",
  // or "No eligible" is treated as an error/warning.
  const setNotice = (msg: string) => {
    const m = String(msg ?? '').trim()
    if (!m) return
    const lower = m.toLowerCase()
    if (lower.startsWith('could not') || lower.startsWith('failed') || lower.includes(' failed') || lower.includes('error')) {
      toast.error(m)
    } else if (lower.includes('must ') || lower.includes('no eligible') || lower.includes('missing ')) {
      toast.warning(m)
    } else {
      toast.success(m)
    }
  }
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewContext, setReviewContext] = useState<LeaveReviewContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  // Kept only so the Approval Status pill can preserve a "last decision" intent —
  // submitReview now reads reviewPayrollStatus directly. setter is the public API.
  const [, setReviewStatus] = useState<'approved' | 'rejected'>('approved')
  const [reviewNote, setReviewNote] = useState('')
  const [calculationType, setCalculationType] = useState<LeaveCalcType>('hourly_salary')
  const [payableDaysInput, setPayableDaysInput] = useState('0')
  const [saving, setSaving] = useState(false)
  const [reviewLocked, setReviewLocked] = useState(false)

  // Editable leave-info fields in review modal
  const [reviewLeaveCategory, setReviewLeaveCategory] = useState('')
  const [reviewStartDate, setReviewStartDate] = useState('')
  const [reviewStartTime, setReviewStartTime] = useState('')
  const [reviewEndDate, setReviewEndDate] = useState('')
  const [reviewEndTime, setReviewEndTime] = useState('')
  const [reviewReturnDate, setReviewReturnDate] = useState('')
  const [reviewReturnTime, setReviewReturnTime] = useState('')
  const [reviewPayrollCycle, setReviewPayrollCycle] = useState('')
  const [reviewDailyHours, setReviewDailyHours] = useState('')
  const [reviewHourlyRate, setReviewHourlyRate] = useState('')
  // 25MAY client: monthly_salary edit needs a Monthly Rate input (was missing)
  const [reviewMonthlyRate, setReviewMonthlyRate] = useState('')
  // Parity-with-new-leave fields (added per 18MAY2026 client video)
  const [reviewDaysOff, setReviewDaysOff] = useState<string[]>([])
  const [reviewAssetDeactivation, setReviewAssetDeactivation] = useState<string[]>([])
  const [reviewApproverName, setReviewApproverName] = useState('')
  const [reviewPayrollStatus, setReviewPayrollStatus] = useState('Pending')

  // View mode and detail modal
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [detailRow, setDetailRow] = useState<AdminLeaveRequest | null>(null)

  // Bulk selection (table view only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  function clearSelection() { setSelectedIds(new Set()) }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // New leave creation states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [createEmployeeId, setCreateEmployeeId] = useState('')
  const [createLeaveCategory, setCreateLeaveCategory] = useState('time_off')
  const [createCalcType, setCreateCalcType] = useState<'non_payable' | 'hourly_salary' | 'monthly_salary'>('non_payable')
  const [createPayableDays, setCreatePayableDays] = useState('')
  const [createHourlyRate, setCreateHourlyRate] = useState('')
  const [createDailyHours, setCreateDailyHours] = useState('')
  const [createMonthlyRate, setCreateMonthlyRate] = useState('')
  const [createDaysOff, setCreateDaysOff] = useState<string[]>(['Sun', 'Sat'])
  const [createStartDate, setCreateStartDate] = useState('')
  const [createStartTime, setCreateStartTime] = useState('08:00')
  const [createEndDate, setCreateEndDate] = useState('')
  const [createEndTime, setCreateEndTime] = useState('17:00')
  const [createReturnDate, setCreateReturnDate] = useState('')
  const [createReturnTime, setCreateReturnTime] = useState('08:00')
  const [createAssetDeactivation, setCreateAssetDeactivation] = useState<string[]>([])
  const [createPayrollCycleCode, setCreatePayrollCycleCode] = useState('')
  const [createReason, setCreateReason] = useState('')
  const [createStagedDocs, setCreateStagedDocs] = useState<File[]>([])
  const [createApproverName, setCreateApproverName] = useState('')
  const [createPayrollStatus, setCreatePayrollStatus] = useState('Pending')
  const [createSaving, setCreateSaving] = useState(false)

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const filteredData = await getAdminLeaveRequests(filterStatus)
      setRows(filteredData)
    } catch {
      setRows([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
    getEmployees().then(setEmployees).catch(() => {})
    getPayrollPeriods().then(setPayrollPeriods).catch(() => {})

    const handleVisibilityChange = () => {
      if (document.hidden) return
      load(false)
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        load(false)
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [filterStatus])

  // Apply client-side search + leave-type filter + per-column filters + sort
  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = rows.filter((r) => {
      if (filterLeaveType !== 'all' && r.leaveCategory !== filterLeaveType) return false
      if (filterCycle !== 'all' && r.payrollCycleCode !== filterCycle) return false
      if (!q) return true
      return (
        r.employeeName.toLowerCase().includes(q) ||
        (r.employeeCmid != null && String(r.employeeCmid).includes(q)) ||
        (r.accountName ?? '').toLowerCase().includes(q)
      )
    })
    // Per-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      result = result.filter((r) => String(leaveColAccessor(r, col)).toLowerCase().includes(lower))
    }
    // Sort
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = leaveColAccessor(a, sortCol)
        const bv = leaveColAccessor(b, sortCol)
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av
        }
        const cmp = String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, filterLeaveType, filterCycle, columnFilters, sortCol, sortDir])

  const summary = useMemo(() => {
    return {
      total: displayedRows.length,
      pending: displayedRows.filter((r) => r.status === 'pending').length,
      approved: displayedRows.filter((r) => r.status === 'approved').length,
      rejected: displayedRows.filter((r) => r.status === 'rejected').length,
      payableAmount: displayedRows
        .filter((r) => r.status === 'approved')
        .reduce((a, r) => a + (r.leavePayableAmount ?? 0), 0),
      payableDays: displayedRows
        .filter((r) => r.status === 'approved')
        .reduce((a, r) => a + (r.leavePayableDays ?? 0), 0),
    }
  }, [displayedRows])

  const preview = useMemo(() => {
    if (!reviewContext) return null
    const { employee, settings } = reviewContext
    const isUnpaid = reviewContext.leave.leaveType === 'unpaid'
    const ct: LeaveCalcType = isUnpaid ? 'non_payable' : calculationType
    const pd = parseFloat(payableDaysInput)
    return previewLeavePay(
      employee.salaryType,
      employee.baseSalary,
      settings.workingDaysPerMonth,
      settings.hoursPerDay,
      ct,
      Number.isFinite(pd) ? pd : 0
    )
  }, [reviewContext, calculationType, payableDaysInput])

  const createPreview = useMemo(() => {
    if (createCalcType === 'non_payable') return { dailySalary: 0, payableAmount: 0 }
    const pd = parseFloat(createPayableDays) || 0
    let dailySalary = 0
    if (createCalcType === 'hourly_salary') {
      dailySalary = (parseFloat(createHourlyRate) || 0) * (parseFloat(createDailyHours) || 0)
    } else if (createCalcType === 'monthly_salary') {
      dailySalary = (parseFloat(createMonthlyRate) || 0) / 23.83
    }
    return {
      dailySalary: Math.round(dailySalary * 100) / 100,
      payableAmount: Math.round(dailySalary * pd * 100) / 100,
    }
  }, [createCalcType, createPayableDays, createHourlyRate, createDailyHours, createMonthlyRate])

  const calendarDays = useMemo(() => {
    if (!createStartDate || !createEndDate) return 0
    const start = new Date(createStartDate + 'T12:00:00')
    const end = new Date(createEndDate + 'T12:00:00')
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0
    let count = 0
    const d = new Date(start)
    while (d <= end) { count++; d.setDate(d.getDate() + 1) }
    return count
  }, [createStartDate, createEndDate])

  async function handleCreateLeave() {
    if (!createEmployeeId || !createStartDate || !createEndDate) {
      setNotice('Employee, start date, and end date are required.')
      return
    }
    if (createEndDate < createStartDate) {
      toast.error('End date cannot be earlier than start date')
      return
    }
    if (createReturnDate && (createReturnDate < createStartDate || createReturnDate < createEndDate)) {
      toast.error('Return date cannot be earlier than start or end date')
      return
    }
    setCreateSaving(true)
    try {
      const leaveType = createLeaveCategory === 'time_off' ? 'unpaid' : 'paid'
      const docsToUpload = createStagedDocs
      const created = await createAdminLeaveRequest({
        employeeId: createEmployeeId,
        leaveType,
        leaveCategory: createLeaveCategory,
        calculationType: createCalcType,
        payableDays: createCalcType !== 'non_payable' ? parseFloat(createPayableDays) || 0 : 0,
        hourlyRate: createCalcType === 'hourly_salary' ? parseFloat(createHourlyRate) || 0 : undefined,
        dailyHours: createCalcType === 'hourly_salary' ? parseFloat(createDailyHours) || 0 : undefined,
        monthlyRate: createCalcType === 'monthly_salary' ? parseFloat(createMonthlyRate) || 0 : undefined,
        associateDaysOff: createDaysOff,
        startDate: createStartDate,
        endDate: createEndDate,
        returnDate: createReturnDate || undefined,
        startTime: createStartTime || undefined,
        endTime: createEndTime || undefined,
        returnTime: createReturnTime || undefined,
        assetDeactivation: createAssetDeactivation.length > 0 ? createAssetDeactivation : undefined,
        payrollCycleCode: createCalcType !== 'non_payable' && createPayrollCycleCode ? createPayrollCycleCode : undefined,
        reason: createReason.trim() || undefined,
        approverName: createApproverName || undefined,
        payrollStatus: createPayrollStatus === 'N/A' ? 'Pending' : (createPayrollStatus || 'Pending'),
      })
      // 22MAY2026: flush staged docs to the new leave
      if (docsToUpload.length > 0 && created?.id) {
        const r = await uploadStagedDocuments(docsToUpload, 'leave', created.id, uploadDocument)
        if (r.failed > 0) setNotice(`Leave created. ${r.uploaded} document(s) uploaded, ${r.failed} failed${r.firstError ? ` (${r.firstError})` : ''}.`)
      }
      setNotice('Leave created successfully.')
      setShowCreateModal(false)
      // Reset form
      setCreateEmployeeId('')
      setCreateLeaveCategory('time_off')
      setCreateCalcType('non_payable')
      setCreatePayableDays('')
      setCreateHourlyRate('')
      setCreateDailyHours('')
      setCreateMonthlyRate('')
      setCreateDaysOff(['Sun', 'Sat'])
      setCreateStartDate('')
      setCreateStartTime('08:00')
      setCreateEndDate('')
      setCreateEndTime('17:00')
      setCreateReturnDate('')
      setCreateReturnTime('08:00')
      setCreateAssetDeactivation([])
      setCreatePayrollCycleCode('')
      setCreateReason('')
      setCreateApproverName('')
      setCreatePayrollStatus('Pending')
      setCreateStagedDocs([])
      await load(false)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to create leave.'
      setNotice(msg)
    } finally {
      setCreateSaving(false)
    }
  }

  function openReview(row: AdminLeaveRequest) {
    setReviewingId(row.id)
    setReviewLocked(row.isLocked ?? false)
    // Default to the row's existing decision so re-review is a diff, not a reset.
    setReviewStatus(row.status === 'rejected' ? 'rejected' : 'approved')
    setReviewNote(row.reviewedNote ?? '')
    // Initialize editable leave-info fields from the row snapshot
    setReviewLeaveCategory(row.leaveCategory ?? '')
    setReviewStartDate(row.startDate ?? '')
    setReviewStartTime(row.startTime ?? '')
    setReviewEndDate(row.endDate ?? '')
    setReviewEndTime(row.endTime ?? '')
    setReviewReturnDate(row.returnDate ?? '')
    setReviewReturnTime(row.returnTime ?? '')
    setReviewPayrollCycle(row.payrollCycleCode ?? '')
    setReviewDailyHours('')
    setReviewHourlyRate('')
    setReviewMonthlyRate('')
    // Parity-with-new-leave fields: parse comma-separated strings into arrays
    setReviewDaysOff(row.leaveAssociateDaysOff ? row.leaveAssociateDaysOff.split(',').map((s) => s.trim()).filter(Boolean) : ['Sun', 'Sat'])
    setReviewAssetDeactivation(row.assetDeactivation ? row.assetDeactivation.split(',').map((s) => s.trim()).filter(Boolean) : [])
    setReviewApproverName(row.approverName ?? '')
    setReviewPayrollStatus(row.payrollStatus ?? 'Pending')
    setReviewContext(null)
    setContextLoading(true)
    void getLeaveReviewContext(row.id)
      .then((ctx) => {
        setReviewContext(ctx)
        if (ctx.leave.leaveType === 'unpaid') {
          setCalculationType('non_payable')
        } else if (ctx.leave.calculationType && ['non_payable', 'hourly_salary', 'monthly_salary'].includes(ctx.leave.calculationType)) {
          setCalculationType(ctx.leave.calculationType as LeaveCalcType)
        } else {
          setCalculationType(
            ctx.defaultCalculationType === 'monthly_salary' ? 'monthly_salary' : 'hourly_salary'
          )
        }
        // Prefer the previously-saved payable days when re-reviewing; fall back to suggested.
        const existingPD = ctx.leave.payableDays
        setPayableDaysInput(
          existingPD != null && Number.isFinite(existingPD)
            ? String(existingPD)
            : String(ctx.suggestedPayableDays)
        )
        // Also pick up saved note if row snapshot didn't have it.
        if (!row.reviewedNote && ctx.leave.reviewedNote) {
          setReviewNote(ctx.leave.reviewedNote)
        }
        // Refine editable fields from context (more accurate than row snapshot)
        if (ctx.leave.leaveCategory) setReviewLeaveCategory(ctx.leave.leaveCategory)
        if (ctx.leave.startDate) setReviewStartDate(ctx.leave.startDate)
        if (ctx.leave.endDate) setReviewEndDate(ctx.leave.endDate)
        if (ctx.leave.returnDate) setReviewReturnDate(ctx.leave.returnDate)
        if (ctx.leave.startTime) setReviewStartTime(ctx.leave.startTime)
        if (ctx.leave.endTime) setReviewEndTime(ctx.leave.endTime)
        if (ctx.leave.returnTime) setReviewReturnTime(ctx.leave.returnTime)
        // Initialize daily hours and hourly rate from settings / existing row
        setReviewDailyHours(String(ctx.settings.hoursPerDay ?? 8))
        const hrRate = hourlyRateFromEmployee(
          ctx.employee.salaryType,
          ctx.employee.baseSalary,
          ctx.settings.workingDaysPerMonth,
          ctx.settings.hoursPerDay
        )
        setReviewHourlyRate(String(Math.round(hrRate * 10000) / 10000))
        // 25MAY client fix: monthly rate input — seed from employee base salary
        // when monthly salary type
        setReviewMonthlyRate(
          ctx.employee.salaryType === 'monthly' && ctx.employee.baseSalary
            ? String(ctx.employee.baseSalary)
            : ''
        )
      })
      .catch(() => {
        setNotice('Could not load review details.')
        setReviewingId(null)
      })
      .finally(() => setContextLoading(false))
  }

  async function bulkSetLocked(locked: boolean) {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    let ok = 0
    let failed = 0
    for (const id of Array.from(selectedIds)) {
      try {
        await setLeaveRequestLocked(id, locked)
        ok++
      } catch {
        failed++
      }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} request${ok === 1 ? '' : 's'} ${locked ? 'locked' : 'unlocked'}.`
      : `${ok} updated, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  async function bulkApprove() {
    if (selectedIds.size === 0) return
    const eligibleIds = Array.from(selectedIds).filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && !row.isLocked && row.status !== 'approved'
    })
    if (eligibleIds.length === 0) {
      setNotice('No eligible requests selected (locked or already approved).')
      return
    }
    setBulkSaving(true)
    let ok = 0
    let failed = 0
    for (const id of eligibleIds) {
      try {
        await reviewAdminLeaveRequest(id, { status: 'approved', reviewedNote: 'Bulk approved' })
        ok++
      } catch {
        failed++
      }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} request${ok === 1 ? '' : 's'} approved.`
      : `${ok} approved, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  async function bulkReject() {
    if (selectedIds.size === 0) return
    const eligibleIds = Array.from(selectedIds).filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && !row.isLocked && row.status !== 'rejected'
    })
    if (eligibleIds.length === 0) {
      setNotice('No eligible requests selected (locked or already rejected).')
      return
    }
    setBulkSaving(true)
    let ok = 0
    let failed = 0
    for (const id of eligibleIds) {
      try {
        await reviewAdminLeaveRequest(id, { status: 'rejected', reviewedNote: 'Bulk rejected' })
        ok++
      } catch {
        failed++
      }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} request${ok === 1 ? '' : 's'} rejected.`
      : `${ok} rejected, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  // 10JUN2026 client video Item 9 — Orlando: "in leaves, I don't have
  // the option to delete and I should be able to delete a leave". Bulk
  // Delete added alongside Lock/Unlock/Approve/Reject. Skips locked rows.
  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Permanently delete ${selectedIds.size} leave request(s)? This cannot be undone.`)) return
    const eligibleIds = Array.from(selectedIds).filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && !row.isLocked
    })
    if (eligibleIds.length === 0) {
      setNotice('No eligible requests selected (all locked).')
      return
    }
    setBulkSaving(true)
    let ok = 0
    let failed = 0
    for (const id of eligibleIds) {
      try {
        await deleteAdminLeaveRequest(id)
        ok++
      } catch {
        failed++
      }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} request${ok === 1 ? '' : 's'} deleted.`
      : `${ok} deleted, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  // 21MAY2026 client video: leave form deletion (modal footer).
  async function handleDeleteReview(id: string) {
    if (!window.confirm('Permanently delete this leave request? This cannot be undone.')) return
    setSaving(true)
    try {
      await deleteAdminLeaveRequest(id)
      setNotice('Leave request deleted.')
      setReviewingId(null)
      setReviewContext(null)
      await load(false)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to delete leave request.'
      setNotice(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleLock(id: string, currentlyLocked: boolean) {
    try {
      await setLeaveRequestLocked(id, !currentlyLocked)
      setNotice(currentlyLocked ? 'Leave unlocked.' : 'Leave locked.')
      await load(false)
      if (detailRow && detailRow.id === id) {
        setDetailRow((prev) => (prev ? { ...prev, isLocked: !currentlyLocked } : prev))
      }
      // Update the review modal's lock state in real-time
      if (reviewingId === id) {
        setReviewLocked(!currentlyLocked)
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to toggle lock.'
      setNotice(msg)
    }
  }

  async function submitReview() {
    if (!reviewingId) return
    setSaving(true)
    // Common editable leave-info fields sent with every save
    const parsedDailyHours = parseFloat(reviewDailyHours)
    const parsedHourlyRate = parseFloat(reviewHourlyRate)
    const parsedMonthlyRate = parseFloat(reviewMonthlyRate)
    const editableFields = {
      leaveCategory: reviewLeaveCategory || undefined,
      startDate: reviewStartDate || undefined,
      endDate: reviewEndDate || undefined,
      returnDate: reviewReturnDate || undefined,
      startTime: reviewStartTime || undefined,
      endTime: reviewEndTime || undefined,
      returnTime: reviewReturnTime || undefined,
      payrollCycleCode: reviewPayrollCycle || undefined,
      dailyHoursInput: Number.isFinite(parsedDailyHours) ? parsedDailyHours : undefined,
      hourlyRateInput: Number.isFinite(parsedHourlyRate) ? parsedHourlyRate : undefined,
      // 25MAY client fix: surface monthly rate when monthly_salary calc
      monthlyRateInput: Number.isFinite(parsedMonthlyRate) && parsedMonthlyRate > 0 ? parsedMonthlyRate : undefined,
      // Parity-with-new-leave additions (18MAY2026 client feedback)
      associateDaysOff: reviewDaysOff.length > 0 ? reviewDaysOff : undefined,
      assetDeactivation: reviewAssetDeactivation.length > 0 ? reviewAssetDeactivation : undefined,
      approverName: reviewApproverName || undefined,
      payrollStatus: reviewPayrollStatus || undefined,
    }
    try {
      // 25MAY client bug fix: persist whatever Approval Status the user picked.
      // Approval Status drives the leave's status field on the row.
      //   Pending  → no status change, only edit fields (edit-only PATCH path)
      //   Approved → status='approved' (triggers calc snapshot)
      //   Rejected → status='rejected'
      const approval = reviewPayrollStatus === 'N/A' ? 'Pending' : reviewPayrollStatus
      if (approval === 'Rejected') {
        await reviewAdminLeaveRequest(reviewingId, {
          status: 'rejected',
          reviewedNote: reviewNote.trim() || undefined,
          ...editableFields,
        })
      } else if (approval === 'Approved') {
        if (!reviewContext) {
          setNotice('Missing review context.')
          setSaving(false)
          return
        }
        // 10JUN2026 client video Item 3 — Orlando demonstrated converting a
        // non-payable "Tiempo Libre" leave to Hourly/Monthly Salary silently
        // failed. The old code gated on source `leaveType === 'paid'`,
        // dropping `calculationType` when source was unpaid. Now we always
        // send the chosen calc; backend derives the new leave_type from it.
        const pd = calculationType === 'non_payable' ? 0 : parseFloat(payableDaysInput)
        if (calculationType !== 'non_payable') {
          if (!Number.isFinite(pd) || pd < 0 || pd > 366) {
            setNotice('Payable days must be between 0 and 366.')
            setSaving(false)
            return
          }
        }
        await reviewAdminLeaveRequest(reviewingId, {
          status: 'approved',
          reviewedNote: reviewNote.trim() || undefined,
          calculationType,
          payableDays: pd,
          ...editableFields,
        })
      } else {
        // Pending — edit-only PATCH (no status change). Backend takes the
        // edit-only path when `status` is undefined. Still send calc so
        // admin can change calculation type without re-approving.
        await reviewAdminLeaveRequest(reviewingId, {
          reviewedNote: reviewNote.trim() || undefined,
          calculationType,
          payableDays: calculationType === 'non_payable' ? 0 : (parseFloat(payableDaysInput) || 0),
          ...editableFields,
        })
      }
      setNotice('Leave request updated.')
      setReviewingId(null)
      setReviewContext(null)
      await load(false)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to update leave request.'
      setNotice(msg)
    } finally {
      setSaving(false)
    }
  }

  function exportCSV() {
    if (!displayedRows.length) return
    const headers = [
      'CMID',
      'Employee Name',
      'Account',
      'Leave Type',
      'Approval Status',
      'Calculation',
      'Start Date',
      'End Date',
      'Days Off',
      'Return Date',
      'Payable Days',
      'Daily Salary',
      'Payable Amount',
      'Payroll Cycle',
    ]
    const csvRows = displayedRows.map((r) => [
      r.employeeCmid != null ? String(r.employeeCmid) : '',
      r.employeeName,
      r.accountName ?? '',
      CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '',
      r.status,
      r.leaveCalculationType === 'non_payable' ? 'Non Payable' : r.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : r.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '',
      r.startDate ?? '',
      r.endDate ?? '',
      r.leaveAssociateDaysOff ?? '',
      r.returnDate ?? '',
      r.leavePayableDays != null ? String(r.leavePayableDays) : '',
      r.dailySalary != null ? r.dailySalary.toFixed(2) : '',
      r.leavePayableAmount != null ? r.leavePayableAmount.toFixed(2) : '',
      r.payrollCycleCode ?? '',
    ])
    const csv = [
      headers.join(','),
      ...csvRows.map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leave-requests-${filterStatus}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isPaidLeave = reviewContext?.leave.leaveType === 'paid'

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Leaves"
        subtitle="Review and approve employee leaves."
        icon={<CalendarCheck2 className="w-5 h-5" />}
        actions={
          <>
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading || displayedRows.length === 0}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              New Leave
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="stat-card">
          <p className="stat-label">Total</p>
          <p className="stat-value">{summary.total}</p>
        </div>
        <div className="stat-card border-amber-200/70 bg-amber-50/40">
          <p className="stat-label text-amber-700">Pending</p>
          <p className="stat-value">{summary.pending}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/40">
          <p className="stat-label text-emerald-700">Approved</p>
          <p className="stat-value">{summary.approved}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/40">
          <p className="stat-label text-red-700">Rejected</p>
          <p className="stat-value">{summary.rejected}</p>
        </div>
        <div className="stat-card border-brand-200/70 bg-brand-50/40">
          <p className="stat-label text-brand-700">Payable Amount</p>
          <p className="stat-value">${summary.payableAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
          <input
            type="text"
            placeholder="Search by employee, CMID, or account"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <AdminSelect
            value={filterLeaveType}
            onChange={(val) => setFilterLeaveType(val)}
            options={[
              { value: 'all', label: 'All leave types' },
              ...leaveCategoryOptions.map((opt) => ({ value: opt.value, label: opt.label })),
            ]}
          />
        </div>
        <div className="w-full sm:w-44">
          <AdminSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as 'all' | 'pending' | 'approved' | 'rejected')}
            options={[
              { value: 'all', label: 'All status' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>
        <div className="w-full sm:w-52">
          <AdminSelect
            value={filterCycle}
            onChange={(val) => setFilterCycle(val)}
            options={[
              { value: 'all', label: 'All cycles' },
              ...buildCycleOptions(payrollPeriods),
            ]}
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="segmented">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`segmented-item ${viewMode === 'card' ? 'segmented-item-active' : ''}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Card
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`segmented-item ${viewMode === 'table' ? 'segmented-item-active' : ''}`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white dark:bg-surface-900 shadow-sm overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <tbody>
                <SkeletonTableRows rows={6} cols={6} />
              </tbody>
            </table>
          </div>
        ) : viewMode === 'card' && displayedRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Search className="w-5 h-5" /></div>
            <p className="empty-state-title">No matches</p>
            <p className="empty-state-description">{search ? 'No matches for your search.' : 'Try adjusting your filters.'}</p>
            {Object.values(columnFilters).some(Boolean) && (
              <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setColumnFilters({}); setFilterOpen(null) }}>
                Clear column filters
              </button>
            )}
          </div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {displayedRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white dark:bg-surface-900 transition-all hover:shadow-md hover:border-brand-200/80 cursor-pointer"
                onClick={() => (r.isLocked ? setDetailRow(r) : openReview(r))}
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <CalendarCheck2 className="w-5 h-5 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-surface-50">{r.employeeName}</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
                    {r.startDate} - {r.endDate} · {r.leaveType === 'paid' ? 'Paid leave' : 'Unpaid leave'}
                    {r.leaveCategory ? ` · ${CATEGORY_LABELS[r.leaveCategory] || r.leaveCategory}` : ''}
                  </p>
                  {r.reason ? <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Reason: {r.reason}</p> : null}
                  {r.reviewedNote ? <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Note: {r.reviewedNote}</p> : null}
                  {r.status === 'approved' &&
                  r.leavePayableAmount != null &&
                  r.leavePayableAmount > 0 ? (
                    <p className="text-xs font-medium text-brand-700 mt-0.5 tabular-nums">
                      Approved leave pay: ${r.leavePayableAmount.toFixed(2)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  {r.isLocked && (
                    <span className="badge-neutral" title="Locked"><Lock className="w-3 h-3" /> Locked</span>
                  )}
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300'}`}
                  >
                    {r.status}
                  </span>
                  {r.status === 'pending' && !r.isLocked && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); openReview(r) }} className="btn-secondary rounded-xl px-3 py-2 text-xs">
                      Review
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto scroll-fade-x">
            <table className="min-w-[1600px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700">
                <tr>
                  <th className="px-2 py-1 w-10 border-b border-surface-200 dark:border-surface-700">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      className="w-3.5 h-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      checked={displayedRows.length > 0 && displayedRows.every((r) => selectedIds.has(r.id))}
                      ref={(el) => {
                        if (!el) return
                        const total = displayedRows.length
                        const sel = displayedRows.filter((r) => selectedIds.has(r.id)).length
                        el.indeterminate = sel > 0 && sel < total
                      }}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(displayedRows.map((r) => r.id)))
                        else clearSelection()
                      }}
                    />
                  </th>
                  {[
                    'Record ID',
                    'CMID',
                    'Employee Name',
                    'Account',
                    'Leave Type',
                    'Approval Status',
                    'Calculation',
                    'Start Date',
                    'End Date',
                    'Days Off',
                    'Return Date',
                    'Payable Days',
                    'Daily Salary',
                    'Payable Amount',
                    'Payroll Cycle',
                    'Actions',
                    // 22MAY2026 client video: audit columns at the END of list view.
                    'Created By',
                    'Created On',
                    'Modified By',
                    'Modified On',
                  ].map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 ${['Payable Days', 'Daily Salary', 'Payable Amount'].includes(col) ? 'text-right' : col === 'Actions' ? 'text-right' : ''}`}
                    >
                      {col === 'Actions' ? col : (
                        <>
                          <div className="flex items-center gap-0.5">
                            <button type="button" className="flex items-center gap-0.5 hover:text-surface-700 dark:text-surface-200 transition-colors" onClick={() => handleLeaveSort(col)}>
                              {col}
                              {sortCol === col && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                            </button>
                            <button type="button" className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400 dark:text-surface-500'}`} onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}>
                              <Filter className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {filterOpen === col && (
                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                              <input type="text" value={columnFilters[col] ?? ''} onChange={(e) => handleLeaveColumnFilter(col, e.target.value)} placeholder={`Filter ${col}...`} className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 dark:border-surface-700 rounded px-1.5 py-1 bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none" autoFocus />
                            </div>
                          )}
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={22} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400 dark:text-surface-500 mb-3">
                          <Search className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium text-surface-700 dark:text-surface-200">No matches</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-1">Try adjusting your search or column filters.</p>
                        {Object.values(columnFilters).some(Boolean) && (
                          <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setColumnFilters({}); setFilterOpen(null) }}>
                            Clear column filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {displayedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-surface-100 dark:border-surface-800 hover:bg-brand-50/40 transition-colors cursor-pointer group ${selectedIds.has(r.id) ? 'bg-brand-50/30' : ''} ${inactiveRowClass(r.contractStatus)}`}
                    onClick={() => (r.isLocked ? setDetailRow(r) : openReview(r))}
                  >
                    <td className="px-2 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.employeeName}`}
                        className="w-3.5 h-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.recordId ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.employeeCmid ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs font-medium text-surface-900 dark:text-surface-50 whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">{r.accountName ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">{CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '-'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[r.status] || 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">
                      {r.leaveCalculationType === 'non_payable' ? 'Non Payable' : r.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : r.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '-'}
                    </td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.startDate ?? ''}{r.startTime ? ` ${fmtShiftTimeStr(r.startTime)}` : ''}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.endDate ?? ''}{r.endTime ? ` ${fmtShiftTimeStr(r.endTime)}` : ''}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">{r.leaveAssociateDaysOff ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.returnDate ?? ''}{r.returnTime ? ` ${fmtShiftTimeStr(r.returnTime)}` : ''}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap text-right">{r.leavePayableDays != null ? r.leavePayableDays : '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap text-right font-medium">{r.dailySalary != null ? `$${r.dailySalary.toFixed(2)}` : '-'}</td>
                    <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-semibold ${r.leavePayableAmount != null && r.leavePayableAmount > 0 ? 'text-brand-700' : 'text-surface-400 dark:text-surface-500'}`}>
                      {r.leavePayableAmount != null ? `$${r.leavePayableAmount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-surface-700 dark:text-surface-200 tabular-nums">{r.payrollCycleCode ?? '-'}</span>
                        {/* 10JUN2026 — cycle status badge (Upcoming/Current/
                            In Process/Closed) so admins can see at a glance
                            whether the leave is tied to the active cycle. */}
                        {r.payrollCycleCode && (() => {
                          const st = cycleStateFor(r.payrollCycleCode, payrollPeriods)
                          if (st === 'unknown') return null
                          return (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${cycleStateBadgeClass(st)}`}>
                              {cycleStateLabel(st)}
                            </span>
                          )
                        })()}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => (r.isLocked ? setDetailRow(r) : openReview(r))}
                        className="p-1.5 rounded-lg text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
                        title={r.isLocked ? 'View (locked)' : 'Edit / review'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    {/* 22MAY2026 audit columns at end */}
                    <td className="px-2 py-1.5 text-xs text-surface-600 dark:text-surface-300 whitespace-nowrap">{r.createdByName ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-600 dark:text-surface-300 whitespace-nowrap tabular-nums">{r.createdOn ? fmtFullDateTime(r.createdOn) : r.createdAt ? fmtFullDateTime(r.createdAt) : '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-600 dark:text-surface-300 whitespace-nowrap">{r.modifiedByName ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-600 dark:text-surface-300 whitespace-nowrap tabular-nums">{r.modifiedOn ? fmtFullDateTime(r.modifiedOn) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setShowCreateModal(false)} aria-label="Close" />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 shadow-xl">
            <h2 className="text-base font-semibold text-surface-900 dark:text-surface-50">New Leave</h2>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">Create a leave on behalf of an employee.</p>

            <div className="mt-4 space-y-4">
              {/* Employee + Leave Type side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Employee</label>
                  <AdminSelect
                    value={createEmployeeId}
                    onChange={(val) => setCreateEmployeeId(val)}
                    options={[
                      { value: '', label: 'Select employee' },
                      // 17JUN2026 (Jose 16JUN Issue 2) — terminated /
                      // pre-noticed hidden from New Leave employee picker.
                      ...activeForLookup(employees).map((e) => ({ value: e.id, label: e.name })),
                    ]}
                  />
                </div>
                <div>
                  <label className="label">Leave Type</label>
                  <AdminSelect
                    value={createLeaveCategory}
                    onChange={(val) => setCreateLeaveCategory(val)}
                    options={leaveCategoryOptions}
                  />
                </div>
              </div>

              {/* Calculation Type - toggle buttons */}
              <div>
                <label className="label">Calculation</label>
                <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
                  {([
                    { value: 'non_payable' as const, label: 'Non Payable' },
                    { value: 'hourly_salary' as const, label: 'Hourly Salary' },
                    { value: 'monthly_salary' as const, label: 'Monthly Salary' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setCreateCalcType(opt.value); if (createPayrollStatus === 'N/A') setCreatePayrollStatus('Pending') }}
                      className={`flex-1 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                        createCalcType === opt.value
                          ? 'bg-brand-600 text-white'
                          : 'bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional: Payable Days + rate fields in single row */}
              {createCalcType === 'hourly_salary' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Payable Days</label>
                    <input
                      type="number" min={0} max={366} step={0.5}
                      className="input w-full rounded-xl"
                      value={createPayableDays}
                      onChange={(e) => setCreatePayableDays(e.target.value)}
                      placeholder="Days"
                    />
                  </div>
                  <div>
                    <label className="label">Hourly Rate</label>
                    <input
                      type="number" min={0} step={0.01}
                      className="input w-full rounded-xl"
                      value={createHourlyRate}
                      onChange={(e) => setCreateHourlyRate(e.target.value)}
                      placeholder="e.g. 150"
                    />
                  </div>
                  <div>
                    <label className="label">Daily Hours</label>
                    <input
                      type="number" min={0} max={24} step={0.5}
                      className="input w-full rounded-xl"
                      value={createDailyHours}
                      onChange={(e) => setCreateDailyHours(e.target.value)}
                      placeholder="e.g. 8"
                    />
                  </div>
                </div>
              )}

              {createCalcType === 'monthly_salary' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Payable Days</label>
                    <input
                      type="number" min={0} max={366} step={0.5}
                      className="input w-full rounded-xl"
                      value={createPayableDays}
                      onChange={(e) => setCreatePayableDays(e.target.value)}
                      placeholder="Days"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Monthly Rate</label>
                    <input
                      type="number" min={0} step={100}
                      className="input w-full rounded-xl"
                      value={createMonthlyRate}
                      onChange={(e) => setCreateMonthlyRate(e.target.value)}
                      placeholder="e.g. 50000"
                    />
                  </div>
                </div>
              )}

              {/* Days Off */}
              <div>
                <label className="label">Days Off</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day} type="button"
                      onClick={() => setCreateDaysOff((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        createDaysOff.includes(day) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date & Time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="date" value={createStartDate} onChange={(e) => setCreateStartDate(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                    <div className="relative">
                      <Clock3 className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="time" value={createStartTime} onChange={(e) => setCreateStartTime(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label">End Date & Time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="date" value={createEndDate} onChange={(e) => setCreateEndDate(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                    <div className="relative">
                      <Clock3 className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="time" value={createEndTime} onChange={(e) => setCreateEndTime(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Calendar Days (auto-calc) */}
              <div>
                <label className="label">Calendar Days</label>
                <input type="text" className="input w-full rounded-xl bg-surface-50 dark:bg-surface-900 text-surface-500 dark:text-surface-400 dark:text-surface-500" value={calendarDays > 0 ? calendarDays : ''} readOnly disabled placeholder="Auto-calculated" />
              </div>

              {/* Return Date */}
              <div>
                <label className="label">Return Date & Time</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="date" value={createReturnDate} onChange={(e) => setCreateReturnDate(e.target.value)} className="input w-full rounded-xl pl-9" />
                  </div>
                  <div className="relative">
                    <Clock3 className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="time" value={createReturnTime} onChange={(e) => setCreateReturnTime(e.target.value)} className="input w-full rounded-xl pl-9" />
                  </div>
                </div>
              </div>

              {/* Asset Deactivation */}
              <div>
                <label className="label">Asset Deactivation</label>
                <div className="flex flex-wrap gap-2">
                  {assetOptions.map((asset) => (
                    <button
                      key={asset} type="button"
                      onClick={() => setCreateAssetDeactivation((prev) => prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        createAssetDeactivation.includes(asset) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800'
                      }`}
                    >
                      {asset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional: Payable Amount Preview + Payroll Cycle (shown when payable) */}
              {createCalcType !== 'non_payable' && (
                <>
                  <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Payable Amount (preview)</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Daily salary: ${createPreview.dailySalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-brand-700">
                      ${createPreview.payableAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* 21MAY follow-up: same overlap fix as the edit form.
                      Payroll Cycle on its own row; Approver + Approval Status
                      get a 2-col sub-grid so the 3-button pill has breathing
                      room and doesn't visually overlap the Approver dropdown. */}
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="label">Payroll Cycle</label>
                      <AdminSelect
                        value={createPayrollCycleCode}
                        onChange={(val) => setCreatePayrollCycleCode(val)}
                        options={[
                          { value: '', label: 'Select payroll cycle' },
                          ...buildCycleOptions(payrollPeriods),
                        ]}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Approver</label>
                        <AdminSelect
                          value={createApproverName}
                          onChange={(val) => setCreateApproverName(val)}
                          options={[
                            { value: '', label: 'Select approver' },
                            ...['Orlando Santana', 'Jamel Rodriguez', 'Luis Peña', 'Other'].map((name) => ({ value: name, label: name })),
                          ]}
                        />
                      </div>
                      <div>
                        <label className="label">Approval Status</label>
                        <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
                          {([
                            { value: 'Pending' as const, label: 'Pending' },
                            { value: 'Approved' as const, label: 'Approved' },
                            { value: 'Rejected' as const, label: 'Rejected' },
                          ]).map((opt) => {
                            const current = createPayrollStatus === 'N/A' ? 'Pending' : createPayrollStatus
                            const isActive = current === opt.value
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setCreatePayrollStatus(opt.value)}
                                className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                                  isActive ? 'bg-brand-600 text-white' : 'bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'
                                }`}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="label">Notes</label>
                <textarea value={createReason} onChange={(e) => setCreateReason(e.target.value)} rows={2} className="input w-full rounded-xl" placeholder="Optional notes for this leave" />
              </div>

              {/* 22MAY2026: staged docs on new entries — was previously a placeholder */}
              <StagedDocumentUpload files={createStagedDocs} onFilesChange={setCreateStagedDocs} disabled={createSaving} />
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary rounded-xl px-4 py-2" disabled={createSaving}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateLeave()}
                className="btn-primary rounded-xl px-4 py-2"
                disabled={createSaving || !createEmployeeId || !createStartDate || !createEndDate}
              >
                {createSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewingId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setReviewingId(null)
              setReviewContext(null)
            }}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl">
            {/* Employee header — matches attendance modal layout */}
            {(() => {
              const reviewRow = rows.find((r) => r.id === reviewingId)
              return (
                <div className="sticky top-0 z-10 bg-white dark:bg-surface-900 rounded-t-2xl">
                  <DetailModalHeader
                    employeeName={reviewContext?.leave.employeeName ?? reviewRow?.employeeName ?? ''}
                    cmid={reviewRow?.employeeCmid}
                    reportsTo={reviewRow?.reportsTo}
                    accountName={reviewRow?.accountName}
                    recordId={reviewRow?.recordId}
                    onClose={() => { setReviewingId(null); setReviewContext(null) }}
                    extra={
                      <>
                        {reviewRow?.leaveCategory && (
                          <span className="badge-neutral">{CATEGORY_LABELS[reviewRow.leaveCategory] || reviewRow.leaveCategory}</span>
                        )}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColors[reviewRow?.status ?? 'pending'] || 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300'}`}>
                          {reviewRow?.status ?? 'pending'}
                        </span>
                      </>
                    }
                  />
                </div>
              )
            })()}

            {contextLoading || !reviewContext ? (
              <div className="py-10 text-center text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">Loading details…</div>
            ) : (
              <>
                {reviewLocked && (
                  <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 flex items-center gap-2 text-amber-800">
                    <Lock className="w-4 h-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">This record is locked</p>
                      <p className="text-[11px] opacity-80">Unlock it from the bottom to make changes.</p>
                    </div>
                  </div>
                )}
                {reviewContext.leave.status !== 'pending' && !reviewLocked ? (
                  <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
                    Re-reviewing an already <strong className="capitalize">{reviewContext.leave.status}</strong> request. Saving will overwrite the existing decision.
                  </div>
                ) : null}
                <div className="mx-5 mt-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/80 p-3 text-sm">
                  <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Leave Info</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                    {/* 22MAY2026 client video (10th request): Edit form layout
                        now mirrors the New-leave form — Calculation segmented
                        control + Payable Days + rate fields up top, then dates,
                        then approver/status, then pay preview. The old layout
                        hid Calculation behind "Decision = Approved" at the
                        bottom of the modal. */}
                    <div>
                      <label className="label">Leave Type</label>
                      <AdminSelect
                        value={reviewLeaveCategory}
                        onChange={(val) => setReviewLeaveCategory(val)}
                        disabled={reviewLocked}
                        options={leaveCategoryOptions}
                      />
                    </div>
                    <div>
                      <p className="label">Type</p>
                      <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">{reviewContext.leave.leaveType === 'paid' ? 'Paid' : 'Unpaid'}</p>
                    </div>
                    <div>
                      <p className="label">Salary</p>
                      <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">{reviewContext.employee.salaryType} · base ${reviewContext.employee.baseSalary.toFixed(2)}</p>
                    </div>

                    {/* Calculation — segmented control at the top, like new-leave form */}
                    <div className="col-span-2 sm:col-span-3">
                      <label className="label">Calculation</label>
                      <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
                        {([
                          { value: 'non_payable' as const, label: 'Non Payable' },
                          { value: 'hourly_salary' as const, label: 'Hourly Salary' },
                          { value: 'monthly_salary' as const, label: 'Monthly Salary' },
                        ]).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={reviewLocked}
                            onClick={() => setCalculationType(opt.value as LeaveCalcType)}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                              calculationType === opt.value
                                ? 'bg-brand-600 text-white'
                                : 'bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'
                            } disabled:opacity-60`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Payable Days + rate fields — visible at top, like new-leave form */}
                    {calculationType === 'hourly_salary' && (
                      <>
                        <div>
                          <label className="label">Payable Days</label>
                          <input
                            type="number" min={0} max={366} step={0.5}
                            value={payableDaysInput}
                            onChange={(e) => setPayableDaysInput(e.target.value)}
                            disabled={reviewLocked}
                            className="input w-full rounded-xl"
                          />
                          <p className="text-[10px] text-surface-500 dark:text-surface-400 mt-0.5">Suggested: {reviewContext.suggestedPayableDays}</p>
                        </div>
                        <div>
                          <label className="label">Hourly Rate</label>
                          <input
                            type="number" min={0} step={0.0001}
                            value={reviewHourlyRate}
                            onChange={(e) => setReviewHourlyRate(e.target.value)}
                            disabled={reviewLocked}
                            className="input w-full rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="label">Daily Hours</label>
                          <input
                            type="number" min={0} max={24} step={0.5}
                            value={reviewDailyHours}
                            onChange={(e) => setReviewDailyHours(e.target.value)}
                            disabled={reviewLocked}
                            className="input w-full rounded-xl"
                          />
                        </div>
                      </>
                    )}
                    {calculationType === 'monthly_salary' && (
                      <div className="col-span-2 sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Payable Days</label>
                          <input
                            type="number" min={0} max={366} step={0.5}
                            value={payableDaysInput}
                            onChange={(e) => setPayableDaysInput(e.target.value)}
                            disabled={reviewLocked}
                            className="input w-full rounded-xl"
                          />
                          <p className="text-[10px] text-surface-500 dark:text-surface-400 mt-0.5">Suggested: {reviewContext.suggestedPayableDays}</p>
                        </div>
                        {/* 25MAY client: Monthly Rate input was missing for monthly_salary calc */}
                        <div>
                          <label className="label">Monthly Rate</label>
                          <input
                            type="number" min={0} step={100}
                            value={reviewMonthlyRate}
                            onChange={(e) => setReviewMonthlyRate(e.target.value)}
                            disabled={reviewLocked}
                            className="input w-full rounded-xl"
                          />
                        </div>
                      </div>
                    )}

                    <div className="col-span-2 sm:col-span-3">
                      <label className="label">Start Date & Time</label>
                      <div className="grid grid-cols-2 gap-2 mt-0.5">
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input type="date" value={reviewStartDate} onChange={(e) => setReviewStartDate(e.target.value)} disabled={reviewLocked} className="input w-full rounded-xl pl-9" />
                        </div>
                        <div className="relative">
                          <Clock3 className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input type="time" value={reviewStartTime} onChange={(e) => setReviewStartTime(e.target.value)} disabled={reviewLocked} className="input w-full rounded-xl pl-9" />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <label className="label">End Date & Time</label>
                      <div className="grid grid-cols-2 gap-2 mt-0.5">
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input type="date" value={reviewEndDate} onChange={(e) => setReviewEndDate(e.target.value)} disabled={reviewLocked} className="input w-full rounded-xl pl-9" />
                        </div>
                        <div className="relative">
                          <Clock3 className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input type="time" value={reviewEndTime} onChange={(e) => setReviewEndTime(e.target.value)} disabled={reviewLocked} className="input w-full rounded-xl pl-9" />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <label className="label">Return Date & Time</label>
                      <div className="grid grid-cols-2 gap-2 mt-0.5">
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input type="date" value={reviewReturnDate} onChange={(e) => setReviewReturnDate(e.target.value)} disabled={reviewLocked} className="input w-full rounded-xl pl-9" />
                        </div>
                        <div className="relative">
                          <Clock3 className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input type="time" value={reviewReturnTime} onChange={(e) => setReviewReturnTime(e.target.value)} disabled={reviewLocked} className="input w-full rounded-xl pl-9" />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <label className="label">Payroll Cycle</label>
                      <AdminSelect
                        value={reviewPayrollCycle}
                        onChange={(val) => setReviewPayrollCycle(val)}
                        disabled={reviewLocked}
                        options={[
                          { value: '', label: 'Select payroll cycle' },
                          ...buildCycleOptions(payrollPeriods),
                        ]}
                      />
                    </div>
                    {/* Days Off (parity with new-leave form) */}
                    <div className="col-span-2 sm:col-span-3">
                      <label className="label">Days Off</label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <button
                            key={day} type="button"
                            disabled={reviewLocked}
                            onClick={() => setReviewDaysOff((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 ${
                              reviewDaysOff.includes(day) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Asset Deactivation (parity with new-leave form) */}
                    <div className="col-span-2 sm:col-span-3">
                      <label className="label">Asset Deactivation</label>
                      <div className="flex flex-wrap gap-2">
                        {assetOptions.map((asset) => (
                          <button
                            key={asset} type="button"
                            disabled={reviewLocked}
                            onClick={() => setReviewAssetDeactivation((prev) => prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset])}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 ${
                              reviewAssetDeactivation.includes(asset) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-surface-900 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800'
                            }`}
                          >
                            {asset}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 21MAY2026 + 21MAY WhatsApp follow-up:
                        Approver + Approval Status share their own full-row
                        2-column sub-grid so the segmented pill has room and
                        doesn't visually overlap with the Approver dropdown.
                        (Was previously two narrow 1/3 cells in the parent grid.) */}
                    <div className="col-span-2 sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <label className="label">Approver</label>
                        <AdminSelect
                          value={reviewApproverName}
                          onChange={(val) => setReviewApproverName(val)}
                          disabled={reviewLocked}
                          options={[
                            { value: '', label: 'Select approver' },
                            ...['Orlando Santana', 'Jamel Rodriguez', 'Luis Peña', 'Other'].map((name) => ({ value: name, label: name })),
                          ]}
                        />
                      </div>
                      <div>
                        <label className="label">Approval Status</label>
                        <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
                          {([
                            { value: 'Pending' as const, label: 'Pending' },
                            { value: 'Approved' as const, label: 'Approved' },
                            { value: 'Rejected' as const, label: 'Rejected' },
                          ]).map((opt) => {
                            const current = reviewPayrollStatus === 'N/A' ? 'Pending' : reviewPayrollStatus
                            const isActive = current === opt.value
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={reviewLocked}
                                onClick={() => {
                                  setReviewPayrollStatus(opt.value)
                                  if (opt.value === 'Approved') setReviewStatus('approved')
                                  else if (opt.value === 'Rejected') setReviewStatus('rejected')
                                }}
                                className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                                  isActive ? 'bg-brand-600 text-white' : 'bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'
                                } disabled:opacity-60`}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  {reviewContext.leave.reason ? (
                    <p className="text-xs text-surface-600 dark:text-surface-300 pt-2 mt-3 border-t border-surface-200/80">{reviewContext.leave.reason}</p>
                  ) : null}
                </div>

                <div className={`mx-5 mt-4 space-y-3 ${reviewLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                  {/* 22MAY2026 client video: pay preview promoted out of the
                      approval-only block — it's always visible for paid leaves,
                      same as the new-leave form. */}
                  {isPaidLeave && preview && calculationType !== 'non_payable' && (
                    <div className="rounded-xl border border-surface-200 dark:border-surface-700 p-3 space-y-2 text-sm">
                      <p className="text-xs font-semibold text-surface-700 dark:text-surface-200 uppercase tracking-wide">Pay Preview</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Hourly rate</span>
                        <span className="tabular-nums text-right flex items-center justify-end gap-1"><Lock className="w-3 h-3 text-surface-400 dark:text-surface-500" />${preview.hourlyRate.toFixed(4)}</span>
                        <span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Daily hours</span>
                        <span className="tabular-nums text-right flex items-center justify-end gap-1"><Lock className="w-3 h-3 text-surface-400 dark:text-surface-500" />{preview.dailyHours}</span>
                        <span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Daily salary</span>
                        <span className="tabular-nums text-right flex items-center justify-end gap-1"><Lock className="w-3 h-3 text-surface-400 dark:text-surface-500" />${preview.dailySalary.toFixed(2)}</span>
                        <span className="text-surface-500 dark:text-surface-400 dark:text-surface-500 font-medium">Payable amount</span>
                        <span className="tabular-nums text-right font-semibold text-surface-900 dark:text-surface-50 flex items-center justify-end gap-1"><Lock className="w-3 h-3 text-surface-400 dark:text-surface-500" />${preview.payableAmount.toFixed(2)}</span>
                      </div>
                      <p className="text-[10px] text-surface-500 dark:text-surface-400">Payable amount = daily salary × payable days (computed on save).</p>
                    </div>
                  )}

                  <div>
                    <label className="label">Notes</label>
                    <textarea
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      rows={3}
                      disabled={reviewLocked}
                      className="input w-full rounded-xl"
                      placeholder="Optional note"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Documents */}
            {reviewingId && (
              <div className="mx-5 mt-4">
                <DocumentUpload entityType="leave" entityId={reviewingId} />
              </div>
            )}

            {/* Lock toggle — same pattern as attendance modal */}
            {reviewingId && (
              <div className="mx-5 mt-4 flex items-center justify-between rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 flex items-center gap-2">
                    {reviewLocked ? <Lock className="w-4 h-4 text-amber-600" /> : <Unlock className="w-4 h-4 text-surface-400 dark:text-surface-500" />}
                    {reviewLocked ? 'Record is locked' : 'Record is editable'}
                  </p>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
                    Locking prevents further changes until an admin unlocks it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleLock(reviewingId, reviewLocked)}
                  className={reviewLocked ? 'btn-secondary btn-sm' : 'btn-danger btn-sm'}
                  disabled={saving}
                >
                  {reviewLocked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                </button>
              </div>
            )}

            {/* 21MAY2026 client video: audit trail on every form — mirror the
                attendance modal layout. */}
            {(() => {
              const reviewRow = rows.find((r) => r.id === reviewingId)
              if (!reviewRow) return null
              return (
                <div className="mx-5 mt-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-surface-600 dark:text-surface-300">
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created By</p>
                    <p className="text-surface-800 dark:text-surface-100">{reviewRow.createdByName || '—'}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created On</p>
                    <p className="text-surface-800 dark:text-surface-100 tabular-nums">{reviewRow.createdOn ? fmtFullDateTime(reviewRow.createdOn) : reviewRow.createdAt ? fmtFullDateTime(reviewRow.createdAt) : '—'}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified By</p>
                    <p className="text-surface-800 dark:text-surface-100">{reviewRow.modifiedByName || '—'}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified On</p>
                    <p className="text-surface-800 dark:text-surface-100 tabular-nums">{reviewRow.modifiedOn ? fmtFullDateTime(reviewRow.modifiedOn) : '—'}</p>
                  </div>
                </div>
              )
            })()}

            {/* 21MAY2026 client video: Save + Lock + Delete on the leave form
                (parity with payroll inputs). Lock lives in its own row above —
                Delete sits on the left of the footer so it doesn't crowd Save. */}
            <div className="mx-5 mt-4 mb-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
              <button
                type="button"
                onClick={() => reviewingId && void handleDeleteReview(reviewingId)}
                className="btn-danger rounded-xl px-4 py-2 sm:mr-auto"
                disabled={saving || reviewLocked}
                title={reviewLocked ? 'Unlock the record before deleting.' : 'Permanently delete this leave request'}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReviewingId(null)
                    setReviewContext(null)
                  }}
                  className="btn-secondary rounded-xl px-4 py-2"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitReview()}
                  className="btn-primary rounded-xl px-4 py-2"
                  disabled={saving || contextLoading || !reviewContext || reviewLocked}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal (for locked records — shows info + Unlock button) */}
      {detailRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailRow(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl">
            {/* Client standard header (14APR2026): Name + CMID + Reports To */}
            <div className="sticky top-0 z-10 bg-white dark:bg-surface-900 rounded-t-2xl">
              <DetailModalHeader
                employeeName={detailRow.employeeName}
                cmid={detailRow.employeeCmid}
                reportsTo={detailRow.reportsTo}
                accountName={detailRow.accountName}
                onClose={() => setDetailRow(null)}
                extra={
                  <>
                    {detailRow.leaveCategory && (
                      <span className="badge-neutral">{CATEGORY_LABELS[detailRow.leaveCategory] || detailRow.leaveCategory}</span>
                    )}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColors[detailRow.status] || 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300'}`}>
                      {detailRow.status}
                    </span>
                  </>
                }
              />
            </div>

            <div className="p-5 space-y-4">
              {/* Leave Info */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Leave Info</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="label">Leave Type</p>
                    <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">{CATEGORY_LABELS[detailRow.leaveCategory ?? ''] || detailRow.leaveCategory || '-'}</p>
                  </div>
                  <div>
                    <p className="label">Calculation</p>
                    <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">
                      {detailRow.leaveCalculationType === 'non_payable' ? 'Non Payable' : detailRow.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : detailRow.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="label">Days Off</p>
                    <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">{detailRow.leaveAssociateDaysOff ?? '-'}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <p className="label">Period</p>
                    <p className="font-medium text-surface-900 dark:text-surface-50 tabular-nums mt-0.5">
                      {detailRow.startDate ?? '-'}{detailRow.startTime ? ` ${fmtShiftTimeStr(detailRow.startTime)}` : ''}
                      <span className="text-surface-400 dark:text-surface-500 mx-1.5">&rarr;</span>
                      {detailRow.endDate ?? '-'}{detailRow.endTime ? ` ${fmtShiftTimeStr(detailRow.endTime)}` : ''}
                    </p>
                  </div>
                  {detailRow.returnDate && (
                    <div>
                      <p className="label">Return Date</p>
                      <p className="font-medium text-surface-900 dark:text-surface-50 tabular-nums mt-0.5">{detailRow.returnDate}{detailRow.returnTime ? ` ${detailRow.returnTime}` : ''}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pay Details - highlighted card for payable leaves */}
              {detailRow.leaveCalculationType !== 'non_payable' && detailRow.leavePayableAmount != null && detailRow.leavePayableAmount > 0 ? (
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                  <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-wider mb-3">Pay Details</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="label">Calculation</p>
                      <p className="text-xs font-semibold text-surface-900 dark:text-surface-50 mt-1">
                        {detailRow.leaveCalculationType === 'hourly_salary' ? 'Hourly' : detailRow.leaveCalculationType === 'monthly_salary' ? 'Monthly' : '-'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="label">Payable Days</p>
                      <p className="text-xs font-semibold text-surface-900 dark:text-surface-50 tabular-nums mt-1">{detailRow.leavePayableDays ?? '-'}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="label">Daily Salary</p>
                      <p className="text-xs font-semibold text-surface-900 dark:text-surface-50 tabular-nums mt-1">{detailRow.dailySalary != null ? `$${detailRow.dailySalary.toFixed(2)}` : '-'}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="label">Payable Amount</p>
                      <p className="text-sm font-bold text-brand-700 tabular-nums mt-1">{detailRow.leavePayableAmount != null ? `$${detailRow.leavePayableAmount.toFixed(2)}` : '-'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                  <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Pay Details</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">
                    {detailRow.leaveCalculationType === 'non_payable' ? 'Non Payable' : 'No pay amount recorded'}
                  </p>
                </div>
              )}

              {/* Additional */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Additional</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-sm">
                  <div>
                    <p className="label">Asset Deactivation</p>
                    <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">{detailRow.assetDeactivation ?? '-'}</p>
                  </div>
                  <div>
                    <p className="label">Payroll Cycle</p>
                    <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">{detailRow.payrollCycleCode ?? '-'}</p>
                  </div>
                  {detailRow.reason && (
                    <div className="col-span-2 sm:col-span-3">
                      <p className="label">Reason</p>
                      <p className="text-surface-700 dark:text-surface-200 mt-0.5 leading-relaxed">{detailRow.reason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Review */}
              <div className={`rounded-xl border p-4 ${detailRow.status === 'approved' ? 'border-emerald-200 bg-emerald-50/50' : detailRow.status === 'rejected' ? 'border-red-200 bg-red-50/50' : 'border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${detailRow.status === 'approved' ? 'text-emerald-500' : detailRow.status === 'rejected' ? 'text-red-500' : 'text-surface-400 dark:text-surface-500'}`}>Review</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <div>
                    <p className="label">Reviewed By</p>
                    <p className="font-medium text-surface-900 dark:text-surface-50 mt-0.5">{detailRow.reviewedByName ?? '-'}</p>
                  </div>
                  <div>
                    <p className="label">Review Note</p>
                    <p className="text-surface-700 dark:text-surface-200 mt-0.5">{detailRow.reviewedNote ?? '-'}</p>
                  </div>
                </div>
              </div>

              {/* Locked banner + Unlock action */}
              {detailRow.isLocked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <Lock className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Record locked</p>
                      <p className="text-xs opacity-80">No further changes can be made until unlocked.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleLock(detailRow.id, true)}
                    className="btn-secondary btn-sm shrink-0"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unlock
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BulkActionBar count={selectedIds.size} onClear={clearSelection}>
        <button
          type="button"
          onClick={() => void bulkSetLocked(true)}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Lock selected"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lock</span>
        </button>
        <button
          type="button"
          onClick={() => void bulkSetLocked(false)}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Unlock selected"
        >
          <Unlock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Unlock</span>
        </button>
        <button
          type="button"
          onClick={() => void bulkApprove()}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Approve selected (skips locked / already-approved)"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Approve</span>
        </button>
        <button
          type="button"
          onClick={() => void bulkReject()}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Reject selected (skips locked / already-rejected)"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reject</span>
        </button>
        {/* 10JUN2026 client video Item 9 — Delete bulk action. Sits in
            the Danger slot at the right so it matches Employees /
            Payroll Inputs / Accounts. */}
        <button
          type="button"
          onClick={() => void bulkDelete()}
          disabled={bulkSaving}
          className="btn-danger btn-sm"
          title="Delete selected (skips locked)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </BulkActionBar>
    </div>
  )
}
