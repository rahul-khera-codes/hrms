import { useEffect, useMemo, useState } from 'react'
import {
  Receipt, Plus, Download, LayoutGrid, Table2, Search, ArrowUp, ArrowDown, Filter,
  Lock, Unlock, X, Trash2, Pencil,
} from 'lucide-react'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'
import { DetailModalHeader } from '@/components/DetailModalHeader'
import { SkeletonTableRows } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  getPayrollInputs,
  createPayrollInput,
  updatePayrollInput,
  setPayrollInputLocked,
  deletePayrollInput,
  computePayrollInputAmount,
  isDeductionInputType,
  getEmployees,
  getPayrollPeriods,
  PAYROLL_INPUT_TYPES,
  PAYROLL_CURRENCIES,
  type PayrollInput,
  type PayrollInputCreate,
  type PayrollCalcType,
  type PayrollCurrency,
  type EmployeeRecord,
  type PayrollPeriod,
} from '@/lib/apiAdmin'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const statusColors: Record<string, string> = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
}

export default function AdminPayrollInputs() {
  const [rows, setRows] = useState<PayrollInput[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()
  const setNotice = (msg: string) => {
    const m = String(msg ?? '').trim()
    if (!m) return
    const lower = m.toLowerCase()
    if (lower.startsWith('failed') || lower.includes(' failed') || lower.includes('error')) toast.error(m)
    else toast.success(m)
  }

  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  // Create/edit modal
  const [editingId, setEditingId] = useState<string | null>(null) // null when closed, '' when creating
  const [modalOpen, setModalOpen] = useState(false)

  // Lookup data
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [admins, setAdmins] = useState<EmployeeRecord[]>([])

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const data = await getPayrollInputs({ status: filterStatus, type: filterType === 'all' ? undefined : filterType })
      setRows(data)
    } catch {
      setRows([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
    getEmployees().then((all) => {
      setEmployees(all)
      // admins are employees whose role is admin — but getEmployees only returns role=employee
      // For approver, use all employees for now (client said this is flexible)
      setAdmins(all)
    }).catch(() => {})
    getPayrollPeriods().then(setPayrollPeriods).catch(() => {})
  }, [])

  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterType])


  // summary is defined after displayedRows below

  const colAccessor = (r: PayrollInput, col: string): string | number => {
    switch (col) {
      case 'CMID': return r.employeeCmid ?? 0
      case 'Employee Name': return (r.employeeName ?? '').toLowerCase()
      case 'Account': return (r.accountName ?? '').toLowerCase()
      case 'Input Type': return r.inputType.toLowerCase()
      case 'Calculation': return r.calculationType
      case 'Input Amount': return r.inputAmount
      case 'Payroll Cycle': return (r.payrollCycleCode ?? '').toLowerCase()
      case 'Approver': return (r.approverName ?? '').toLowerCase()
      case 'Status': return r.status
      default: return ''
    }
  }

  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = rows.filter((r) => {
      if (!q) return true
      return (
        (r.employeeName ?? '').toLowerCase().includes(q) ||
        (r.employeeCmid != null && String(r.employeeCmid).includes(q)) ||
        (r.accountName ?? '').toLowerCase().includes(q) ||
        r.inputType.toLowerCase().includes(q)
      )
    })
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      result = result.filter((r) => String(colAccessor(r, col)).toLowerCase().includes(lower))
    }
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = colAccessor(a, sortCol)
        const bv = colAccessor(b, sortCol)
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        const cmp = String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, columnFilters, sortCol, sortDir])

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  const summary = useMemo(() => {
    const total = displayedRows.length
    const pending = displayedRows.filter((r) => r.status === 'pending').length
    const approved = displayedRows.filter((r) => r.status === 'approved').length
    const rejected = displayedRows.filter((r) => r.status === 'rejected').length
    const income = displayedRows.filter((r) => !isDeductionInputType(r.inputType) && r.status === 'approved').reduce((a, r) => a + r.inputAmount, 0)
    const deductions = displayedRows.filter((r) => isDeductionInputType(r.inputType) && r.status === 'approved').reduce((a, r) => a + r.inputAmount, 0)
    return { total, pending, approved, rejected, income, deductions }
  }, [displayedRows])

  function exportCSV() {
    if (!displayedRows.length) return
    const headers = ['CMID', 'Employee', 'Account', 'Input Type', 'Calculation', 'Payable Hours', 'Hourly Rate', 'Multiplier', 'Currency', 'Base Amount', 'Exchange Rate', 'Input Amount', 'Payroll Cycle', 'Approver', 'Status']
    const rowsCsv = displayedRows.map((r) => [
      r.employeeCmid ?? '',
      r.employeeName ?? '',
      r.accountName ?? '',
      r.inputType,
      r.calculationType,
      r.payableHours ?? '',
      r.hourlyRate ?? '',
      r.hourlyMultiplier ?? '',
      r.currency ?? '',
      r.baseAmount ?? '',
      r.exchangeRate ?? '',
      r.inputAmount,
      r.payrollCycleCode ?? '',
      r.approverName ?? '',
      r.status,
    ])
    const csv = [
      headers.join(','),
      ...rowsCsv.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-inputs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openCreate() {
    setEditingId('')
    setModalOpen(true)
  }
  function openEdit(row: PayrollInput) {
    setEditingId(row.id)
    setModalOpen(true)
  }
  function closeModal() {
    setEditingId(null)
    setModalOpen(false)
  }

  async function handleToggleLock(id: string, locked: boolean) {
    try {
      await setPayrollInputLocked(id, !locked)
      setNotice(locked ? 'Unlocked.' : 'Locked.')
      await load(false)
    } catch (err: unknown) {
      setNotice(err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to toggle lock.')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this payroll input? This cannot be undone.')) return
    try {
      await deletePayrollInput(id)
      setNotice('Deleted.')
      await load(false)
    } catch (err: unknown) {
      setNotice(err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to delete.')
    }
  }

  const editingRow = editingId ? rows.find((r) => r.id === editingId) : undefined

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Payroll inputs"
        subtitle="Bonuses, incentives, claims, and deductions that are not paid through the timesheet."
        icon={<Receipt className="w-5 h-5" />}
        actions={
          <>
            <button type="button" onClick={exportCSV} disabled={loading || displayedRows.length === 0} className="btn-secondary">
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button type="button" onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" />
              New input
            </button>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
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
          <p className="stat-label text-brand-700">Income (approved)</p>
          <p className="stat-value">${summary.income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/40">
          <p className="stat-label text-red-700">Deductions (approved)</p>
          <p className="stat-value">${summary.deductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by employee, CMID, account, or input type"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <AdminSelect
            value={filterType}
            onChange={(val) => setFilterType(val)}
            options={[
              { value: 'all', label: 'All input types' },
              ...PAYROLL_INPUT_TYPES.map((t) => ({ value: t, label: t })),
            ]}
          />
        </div>
        <div className="w-full sm:w-40">
          <AdminSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as StatusFilter)}
            options={[
              { value: 'all', label: 'All status' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>
        <div className="segmented self-start sm:self-auto">
          <button type="button" onClick={() => setViewMode('card')} className={`segmented-item ${viewMode === 'card' ? 'segmented-item-active' : ''}`}>
            <LayoutGrid className="w-3.5 h-3.5" /> Card
          </button>
          <button type="button" onClick={() => setViewMode('table')} className={`segmented-item ${viewMode === 'table' ? 'segmented-item-active' : ''}`}>
            <Table2 className="w-3.5 h-3.5" /> Table
          </button>
        </div>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <tbody>
                <SkeletonTableRows rows={5} cols={6} />
              </tbody>
            </table>
          </div>
        ) : displayedRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Receipt className="w-5 h-5" /></div>
            <p className="empty-state-title">{search || filterStatus !== 'all' || filterType !== 'all' ? 'No matches' : 'No payroll inputs yet'}</p>
            <p className="empty-state-description">{search || filterStatus !== 'all' || filterType !== 'all' ? 'Try a different filter.' : 'Add your first bonus, commission, or deduction.'}</p>
          </div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedRows.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-3 p-3 sm:p-4 rounded-xl border border-surface-200/70 bg-white hover:shadow-card-hover hover:border-brand-200/70 transition-all cursor-pointer"
                onClick={() => (r.isLocked ? null : openEdit(r))}
              >
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${isDeductionInputType(r.inputType) ? 'bg-red-50 border-red-100 text-red-600' : 'bg-brand-50 border-brand-100 text-brand-600'}`}>
                  <Receipt className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-surface-900 truncate">{r.employeeName ?? '—'}</p>
                    {r.employeeCmid != null && <span className="text-[11px] font-mono text-surface-500">CMID {r.employeeCmid}</span>}
                  </div>
                  <p className="text-xs text-surface-700 mt-1">{r.inputType}</p>
                  <p className={`text-sm font-bold mt-1 tabular-nums ${isDeductionInputType(r.inputType) ? 'text-red-600' : 'text-brand-700'}`}>
                    {isDeductionInputType(r.inputType) ? '−' : '+'}${r.inputAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {r.payrollCycleCode && <p className="text-[11px] text-surface-500 mt-0.5">Cycle {r.payrollCycleCode}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`${statusColors[r.status] || 'badge-neutral'} capitalize`}>{r.status}</span>
                  {r.isLocked && <span className="badge-neutral"><Lock className="w-3 h-3" /> Locked</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50 shadow-[0_1px_0_0_theme(colors.surface.200)]">
                <tr>
                  {['CMID', 'Employee Name', 'Account', 'Input Type', 'Calculation', 'Input Amount', 'Payroll Cycle', 'Approver', 'Status', 'Actions'].map((col) => (
                    <th key={col} className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${col === 'Actions' ? 'text-right' : col === 'Input Amount' ? 'text-right' : ''}`}>
                      {col === 'Actions' ? col : (
                        <>
                          <div className="flex items-center gap-0.5">
                            <button type="button" className="flex items-center gap-0.5 hover:text-surface-700 transition-colors" onClick={() => handleSort(col)}>
                              {col}
                              {sortCol === col && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                            </button>
                            <button type="button" className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400'}`} onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}>
                              <Filter className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {filterOpen === col && (
                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                              <input type="text" value={columnFilters[col] ?? ''} onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))} placeholder={`Filter ${col}...`} className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-brand-300 outline-none" autoFocus />
                            </div>
                          )}
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((r) => {
                  const isDed = isDeductionInputType(r.inputType)
                  return (
                    <tr key={r.id} className="border-b border-surface-100 hover:bg-brand-50/30 transition-colors cursor-pointer" onClick={() => (r.isLocked ? null : openEdit(r))}>
                      <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.employeeCmid ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap">{r.employeeName ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs text-surface-700 whitespace-nowrap">{r.accountName ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs text-surface-900 whitespace-nowrap">
                        <span className={isDed ? 'badge-danger' : 'badge-brand'}>{r.inputType}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap capitalize">{r.calculationType.replace('_', ' ')}</td>
                      <td className={`px-3 py-2.5 text-xs tabular-nums whitespace-nowrap text-right font-bold ${isDed ? 'text-red-600' : 'text-brand-700'}`}>
                        {isDed ? '−' : '+'}${r.inputAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.payrollCycleCode ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs text-surface-700 whitespace-nowrap">{r.approverName ?? '-'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className={`${statusColors[r.status] || 'badge-neutral'} capitalize`}>{r.status}</span>
                          {r.isLocked && <span className="badge-neutral" title="Locked"><Lock className="w-3 h-3" /></span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit" disabled={r.isLocked}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => handleToggleLock(r.id, r.isLocked)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" title={r.isLocked ? 'Unlock' : 'Lock'}>
                            {r.isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" onClick={() => handleDelete(r.id)} disabled={r.isLocked} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <PayrollInputModal
          existing={editingRow}
          employees={employees}
          admins={admins}
          payrollPeriods={payrollPeriods}
          onClose={closeModal}
          onSaved={async () => {
            closeModal()
            setNotice('Saved.')
            await load(false)
          }}
        />
      )}
    </div>
  )
}

function PayrollInputModal({
  existing,
  employees,
  admins,
  payrollPeriods,
  onClose,
  onSaved,
}: {
  existing?: PayrollInput
  employees: EmployeeRecord[]
  admins: EmployeeRecord[]
  payrollPeriods: PayrollPeriod[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const isEdit = !!existing
  const locked = existing?.isLocked ?? false

  const [userId, setUserId] = useState(existing?.userId ?? '')
  const [inputType, setInputType] = useState<string>(existing?.inputType ?? 'Bono Colaboración')

  // When employee changes, clear approver if it was the same person
  function handleUserIdChange(id: string) {
    setUserId(id)
    if (approverId === id) setApproverId('')
  }
  const [calcType, setCalcType] = useState<PayrollCalcType>(existing?.calculationType === 'both' ? 'hourly' : (existing?.calculationType ?? 'base_amount'))
  const [payableHours, setPayableHours] = useState(existing?.payableHours != null ? String(existing.payableHours) : '')
  const [hourlyRate, setHourlyRate] = useState(existing?.hourlyRate != null ? String(existing.hourlyRate) : '')
  const [hourlyMultiplier, setHourlyMultiplier] = useState(existing?.hourlyMultiplier != null ? String(existing.hourlyMultiplier) : '1.0')
  const [currency, setCurrency] = useState<PayrollCurrency>(existing?.currency ?? 'DOP')
  const [baseAmount, setBaseAmount] = useState(existing?.baseAmount != null ? String(existing.baseAmount) : '')
  const [exchangeRate, setExchangeRate] = useState(existing?.exchangeRate != null ? String(existing.exchangeRate) : '1')
  const [payrollCycleCode, setPayrollCycleCode] = useState(existing?.payrollCycleCode ?? '')
  const [approverId, setApproverId] = useState(existing?.approverId ?? '')
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>(existing?.status ?? 'pending')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [reviewedNote, setReviewedNote] = useState(existing?.reviewedNote ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live input amount preview — mirrors backend formula
  const liveAmount = computePayrollInputAmount({
    payableHours: Number(payableHours) || 0,
    hourlyRate: Number(hourlyRate) || 0,
    hourlyMultiplier: Number(hourlyMultiplier) || 0,
    baseAmount: baseAmount ? Number(baseAmount) : null,
    exchangeRate: Number(exchangeRate) || 0,
  })

  const showHourlyFields = calcType === 'hourly'
  const showBaseFields = calcType === 'base_amount'

  async function handleSave() {
    if (!userId) { setError('Please select an employee.'); return }
    if (!inputType) { setError('Please select an input type.'); return }
    if (!payrollCycleCode) { setError('Please select a payroll cycle.'); return }
    if (!approverId) { setError('Please select an approver.'); return }
    setError(null)
    setSaving(true)
    try {
      const payload: PayrollInputCreate = {
        userId,
        inputType,
        calculationType: calcType,
        payableHours: showHourlyFields && payableHours ? Number(payableHours) : null,
        hourlyRate: showHourlyFields && hourlyRate ? Number(hourlyRate) : null,
        hourlyMultiplier: showHourlyFields && hourlyMultiplier ? Number(hourlyMultiplier) : null,
        currency: showBaseFields ? currency : null,
        baseAmount: showBaseFields && baseAmount ? Number(baseAmount) : null,
        exchangeRate: showBaseFields && exchangeRate ? Number(exchangeRate) : null,
        payrollCycleCode: payrollCycleCode || null,
        approverId: approverId || null,
        status,
        notes: notes || null,
      }
      if (isEdit && existing) {
        await updatePayrollInput(existing.id, { ...payload, reviewedNote: reviewedNote || undefined })
      } else {
        await createPayrollInput(payload)
      }
      await onSaved()
    } catch (err: unknown) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const employee = employees.find((e) => e.id === userId)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <div className="modal-frame-xl">
        {isEdit && employee ? (
          <DetailModalHeader
            employeeName={employee.name}
            cmid={employee.cmid}
            reportsTo={employee.reportsToName}
            accountName={employee.primaryClientName}
            onClose={onClose}
            extra={
              <>
                <span className="badge-neutral">{inputType}</span>
                {locked && <span className="badge-neutral"><Lock className="w-3 h-3" /> Locked</span>}
              </>
            }
          />
        ) : (
          <div className="modal-header">
            <div>
              <h2 className="modal-title">{isEdit ? 'Edit' : 'New'} payroll input</h2>
              <p className="text-[11px] text-surface-500 mt-0.5">Bonus, commission, claim, or deduction</p>
            </div>
            <button type="button" onClick={onClose} className="btn-icon text-surface-400 hover:text-surface-900 hover:bg-surface-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="modal-body">
          {locked && (
            <div className="alert-warn"><Lock className="w-4 h-4 shrink-0" /><span>This record is locked. Unlock it from the list to edit.</span></div>
          )}
          {error && <div className="alert-error"><span>{error}</span></div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Employee *</label>
              <AdminSelect
                value={userId}
                onChange={handleUserIdChange}
                disabled={locked || isEdit}
                options={[
                  { value: '', label: 'Select employee' },
                  ...employees.map((e) => ({ value: e.id, label: `${e.name}${e.cmid != null ? ` · CMID ${e.cmid}` : ''}` })),
                ]}
              />
            </div>
            <div>
              <label className="label">Input Type *</label>
              <AdminSelect
                value={inputType}
                onChange={setInputType}
                disabled={locked}
                options={PAYROLL_INPUT_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
          </div>

          <div>
            <label className="label">Calculation</label>
            <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200">
              {([
                { value: 'hourly' as const, label: 'Hourly' },
                { value: 'base_amount' as const, label: 'Base amount' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={locked}
                  onClick={() => setCalcType(opt.value)}
                  className={`flex-1 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                    calcType === opt.value ? 'bg-brand-600 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'
                  } disabled:opacity-60`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="hint">Hourly = payable hours × hourly rate × multiplier. Base = amount × exchange rate.</p>
          </div>

          {showHourlyFields && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-3">
              <p className="text-[10px] font-semibold text-brand-700 uppercase tracking-wider mb-2">Hourly calculation</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Payable Hours</label>
                  <input type="number" min="0" step="0.01" className="input" value={payableHours} onChange={(e) => setPayableHours(e.target.value)} disabled={locked} placeholder="e.g. 8" />
                </div>
                <div>
                  <label className="label">Hourly Rate</label>
                  <input type="number" min="0" step="0.01" className="input" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} disabled={locked} placeholder="e.g. 180" />
                </div>
                <div>
                  <label className="label">Hourly Multiplier</label>
                  <input type="number" min="0" step="0.01" className="input" value={hourlyMultiplier} onChange={(e) => setHourlyMultiplier(e.target.value)} disabled={locked} placeholder="e.g. 0.20, 1.0, 1.2" />
                </div>
              </div>
            </div>
          )}

          {showBaseFields && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/30 p-3">
              <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wider mb-2">Base amount calculation</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Currency</label>
                  <AdminSelect
                    value={currency}
                    onChange={(v) => setCurrency(v as PayrollCurrency)}
                    disabled={locked}
                    options={PAYROLL_CURRENCIES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div>
                  <label className="label">Base Amount</label>
                  <input type="number" min="0" step="0.01" className="input" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} disabled={locked} placeholder="e.g. 2000" />
                </div>
                <div>
                  <label className="label">Exchange Rate</label>
                  <input type="number" min="0" step="0.0001" className="input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} disabled={locked} placeholder={currency === 'USD' ? 'e.g. 60' : '1'} />
                </div>
              </div>
            </div>
          )}

          {/* Live Input Amount */}
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Input Amount (preview)</p>
              <p className="text-xs text-surface-500 mt-0.5">Calculated automatically on save</p>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${isDeductionInputType(inputType) ? 'text-red-600' : 'text-brand-700'}`}>
              {isDeductionInputType(inputType) ? '−' : '+'}${liveAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Payroll Cycle *</label>
              <AdminSelect
                value={payrollCycleCode}
                onChange={setPayrollCycleCode}
                disabled={locked}
                options={[
                  { value: '', label: 'Select payroll cycle' },
                  ...payrollPeriods.map((p) => ({ value: p.cycleCode, label: `${p.cycleCode} (${p.periodFrom} → ${p.periodTo})` })),
                ]}
              />
            </div>
            <div>
              <label className="label">Approver *</label>
              <AdminSelect
                value={approverId}
                onChange={setApproverId}
                disabled={locked}
                options={[
                  { value: '', label: 'Select approver' },
                  ...['Cristopher Mojica', 'Orlando Santana', 'Jamel Rodriguez']
                    .map((name) => {
                      const match = admins.find((a) => a.name.toLowerCase() === name.toLowerCase())
                      return match ? { value: match.id, label: name } : null
                    })
                    .filter((o): o is { value: string; label: string } => o !== null),
                  // Fallback: if the fixed names aren't found, show all employees
                  ...(!admins.some((a) => ['cristopher mojica', 'orlando santana', 'jamel rodriguez'].includes(a.name.toLowerCase()))
                    ? admins.filter((a) => a.id !== userId).map((a) => ({ value: a.id, label: a.name }))
                    : []),
                ]}
              />
            </div>
          </div>

          <div>
            <label className="label">Status</label>
            <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200">
              {([
                { value: 'pending' as const, label: 'Pending' },
                { value: 'approved' as const, label: 'Approved' },
                { value: 'rejected' as const, label: 'Rejected' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={locked}
                  onClick={() => setStatus(opt.value)}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                    status === opt.value ? 'bg-brand-600 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'
                  } disabled:opacity-60`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={locked}
              rows={2}
              className="input"
              placeholder="Optional notes for this input"
            />
          </div>

          {isEdit && (status === 'approved' || status === 'rejected') && (
            <div>
              <label className="label">Review note</label>
              <textarea
                value={reviewedNote}
                onChange={(e) => setReviewedNote(e.target.value)}
                disabled={locked}
                rows={2}
                className="input"
                placeholder="Optional note for approval/rejection"
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || locked || !userId || !inputType} className="btn-primary">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create input'}
          </button>
        </div>
      </div>
    </div>
  )
}
