import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Receipt, Plus, Download, Upload, LayoutGrid, Table2, Search, ArrowUp, ArrowDown, Filter,
  Lock, Unlock, X, Trash2, Pencil, FileSpreadsheet, CheckCircle2, AlertCircle, XCircle,
} from 'lucide-react'
import { BulkActionBar } from '@/components/BulkActionBar'
import * as XLSX from 'xlsx'
import AdminSelect from '@/components/AdminSelect'
import DocumentUpload from '@/components/DocumentUpload'
import StagedDocumentUpload, { uploadStagedDocuments } from '@/components/StagedDocumentUpload'
import { PageHeader } from '@/components/PageHeader'
import { DetailModalHeader } from '@/components/DetailModalHeader'
import { SkeletonTableRows } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { buildCycleOptions } from '@/lib/cycleOptions'
import {
  getPayrollInputs,
  createPayrollInput,
  updatePayrollInput,
  setPayrollInputLocked,
  deletePayrollInput,
  uploadDocument,
  computePayrollInputAmount,
  isDeductionInputType,
  getEmployees,
  getPayrollPeriods,
  getAdminUsers,
  bulkUploadPayrollInputs,
  PAYROLL_INPUT_TYPES,
  PAYROLL_CURRENCIES,
  type PayrollInput,
  type PayrollInputCreate,
  type PayrollCalcType,
  type PayrollCurrency,
  type EmployeeRecord,
  type PayrollPeriod,
  type BulkUploadResult,
  type AdminUser,
} from '@/lib/apiAdmin'

type ApproverStatus = 'pending' | 'approved' | 'rejected'
type StatusFilter = 'all' | ApproverStatus

/** Map display approver status to backend status value (identity — same enum) */
function payrollStatusToBackend(ps: ApproverStatus): ApproverStatus {
  return ps
}

/** Map backend status to display label (title case) */
function backendToPayrollStatus(bs: string): 'Pending' | 'Approved' | 'Rejected' {
  if (bs === 'approved') return 'Approved'
  if (bs === 'rejected') return 'Rejected'
  return 'Pending'
}

/** Tailwind badge class for a given status */
function statusBadgeClass(bs: string): string {
  if (bs === 'approved') return 'badge-success'
  if (bs === 'rejected') return 'badge-danger'
  return 'badge-warning'
}

// Cycle dropdown options come from the shared helper so the green-highlight
// behavior is consistent everywhere — per 19MAY2026 client meeting.

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
  const [filterCycle, setFilterCycle] = useState<string>('all')
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

  // Bulk import modal
  const [bulkImportOpen, setBulkImportOpen] = useState(false)

  // Multi-select for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }

  // Lookup data
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])

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
    getEmployees().then(setEmployees).catch(() => {})
    getPayrollPeriods().then(setPayrollPeriods).catch(() => {})
    getAdminUsers().then(setAdminUsers).catch(() => {})
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
      case 'Payroll Status': return backendToPayrollStatus(r.status)
      default: return ''
    }
  }

  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = rows.filter((r) => {
      if (filterCycle !== 'all' && r.payrollCycleCode !== filterCycle) return false
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
  }, [rows, search, filterCycle, columnFilters, sortCol, sortDir])

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
    const headers = ['CMID', 'Employee', 'Account', 'Input Type', 'Calculation', 'Payable Hours', 'Hourly Rate', 'Multiplier', 'Currency', 'Base Amount', 'Exchange Rate', 'Input Amount', 'Payroll Cycle', 'Approver', 'Payroll Status']
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
      backendToPayrollStatus(r.status),
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

  async function bulkSetLocked(locked: boolean) {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    let ok = 0, failed = 0
    for (const id of Array.from(selectedIds)) {
      try { await setPayrollInputLocked(id, locked); ok++ } catch { failed++ }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} input${ok === 1 ? '' : 's'} ${locked ? 'locked' : 'unlocked'}.`
      : `${ok} updated, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  async function bulkSetStatus(target: 'approved' | 'rejected') {
    if (selectedIds.size === 0) return
    const eligible = Array.from(selectedIds).filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && !row.isLocked && row.status !== target
    })
    if (eligible.length === 0) {
      setNotice(`No eligible inputs selected (locked or already ${target}).`)
      return
    }
    setBulkSaving(true)
    let ok = 0, failed = 0
    for (const id of eligible) {
      const row = rows.find((r) => r.id === id)
      if (!row) { failed++; continue }
      try {
        await updatePayrollInput(id, {
          userId: row.userId,
          inputType: row.inputType,
          calculationType: row.calculationType,
          payableHours: row.payableHours ?? null,
          hourlyRate: row.hourlyRate ?? null,
          hourlyMultiplier: row.hourlyMultiplier ?? null,
          currency: row.currency ?? null,
          baseAmount: row.baseAmount ?? null,
          exchangeRate: row.exchangeRate ?? null,
          payrollCycleCode: row.payrollCycleCode ?? null,
          approverId: row.approverId ?? null,
          status: target,
          notes: row.notes ?? null,
          reviewedNote: `Bulk ${target}`,
        })
        ok++
      } catch { failed++ }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} input${ok === 1 ? '' : 's'} ${target}.`
      : `${ok} ${target}, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} payroll input(s)? This cannot be undone.`)) return
    const eligible = Array.from(selectedIds).filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && !row.isLocked
    })
    if (eligible.length === 0) {
      setNotice('No eligible inputs selected (all locked).')
      return
    }
    setBulkSaving(true)
    let ok = 0, failed = 0
    for (const id of eligible) {
      try { await deletePayrollInput(id); ok++ } catch { failed++ }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} input${ok === 1 ? '' : 's'} deleted.`
      : `${ok} deleted, ${failed} failed.`)
    clearSelection()
    await load(false)
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
            <button type="button" onClick={() => setBulkImportOpen(true)} className="btn-secondary">
              <Upload className="w-4 h-4 shrink-0" />
              Import Excel
            </button>
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

      {/* 21MAY2026 client video: tighten the summary row so single-digit count
          cards don't waste space and labels stay on one line. 6 cards across on
          large screens with shorter labels. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <div className="stat-card">
          <p className="stat-label text-[10px]">Total</p>
          <p className="stat-value text-base">{summary.total}</p>
        </div>
        <div className="stat-card border-amber-200/70 bg-amber-50/40">
          <p className="stat-label text-amber-700 text-[10px]">Pending</p>
          <p className="stat-value text-base">{summary.pending}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/40">
          <p className="stat-label text-emerald-700 text-[10px]">Approved</p>
          <p className="stat-value text-base">{summary.approved}</p>
        </div>
        <div className="stat-card border-rose-200/70 bg-rose-50/40">
          <p className="stat-label text-rose-700 text-[10px]">Rejected</p>
          <p className="stat-value text-base">{summary.rejected}</p>
        </div>
        <div className="stat-card border-brand-200/70 bg-brand-50/40">
          <p className="stat-label text-brand-700 text-[10px]">Income</p>
          <p className="stat-value text-base">${summary.income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/40">
          <p className="stat-label text-red-700 text-[10px]">Deductions</p>
          <p className="stat-value text-base">${summary.deductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
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
                <SkeletonTableRows rows={5} cols={11} />
              </tbody>
            </table>
          </div>
        ) : displayedRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Receipt className="w-5 h-5" /></div>
            <p className="empty-state-title">{search || filterStatus !== 'all' || filterType !== 'all' || filterCycle !== 'all' ? 'No matches' : 'No payroll inputs yet'}</p>
            <p className="empty-state-description">{search || filterStatus !== 'all' || filterType !== 'all' || filterCycle !== 'all' ? 'Try a different filter.' : 'Add your first bonus, commission, or deduction.'}</p>
          </div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedRows.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-3 p-3 sm:p-4 rounded-xl border border-surface-200/70 bg-white dark:bg-surface-900 hover:shadow-card-hover hover:border-brand-200/70 transition-all cursor-pointer"
                onClick={() => (r.isLocked ? null : openEdit(r))}
              >
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${isDeductionInputType(r.inputType) ? 'bg-red-50 border-red-100 text-red-600' : 'bg-brand-50 border-brand-100 text-brand-600'}`}>
                  <Receipt className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 truncate">{r.employeeName ?? '—'}</p>
                    {r.employeeCmid != null && <span className="text-[11px] font-mono text-surface-500 dark:text-surface-400 dark:text-surface-500">CMID {r.employeeCmid}</span>}
                  </div>
                  <p className="text-xs text-surface-700 dark:text-surface-200 mt-1">{r.inputType}</p>
                  <p className={`text-sm font-bold mt-1 tabular-nums ${isDeductionInputType(r.inputType) ? 'text-red-600' : 'text-brand-700'}`}>
                    {isDeductionInputType(r.inputType) ? '−' : '+'}${r.inputAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {r.payrollCycleCode && <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Cycle {r.payrollCycleCode}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`${r.status === 'approved' ? 'badge-success' : 'badge-warning'}`}>{backendToPayrollStatus(r.status)}</span>
                  {r.isLocked && <span className="badge-neutral"><Lock className="w-3 h-3" /> Locked</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50 dark:bg-surface-900 shadow-[0_1px_0_0_theme(colors.surface.200)]">
                <tr>
                  <th className="px-2 py-1 w-8 border-b border-surface-200 dark:border-surface-700">
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      aria-label="Select all rows on this page"
                      checked={displayedRows.length > 0 && displayedRows.every((r) => selectedIds.has(r.id))}
                      ref={(el) => {
                        if (el) el.indeterminate = displayedRows.some((r) => selectedIds.has(r.id)) && !displayedRows.every((r) => selectedIds.has(r.id))
                      }}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(displayedRows.map((r) => r.id)))
                        else clearSelection()
                      }}
                    />
                  </th>
                  {['Record ID', 'CMID', 'Employee Name', 'Account', 'Input Type', 'Calculation', 'Input Amount', 'Payroll Cycle', 'Approver', 'Approval Status', 'Actions'].map((col) => (
                    <th key={col} className={`px-2 py-1 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 ${col === 'Actions' ? 'text-right' : col === 'Input Amount' ? 'text-right' : ''}`}>
                      {col === 'Actions' ? col : (
                        <>
                          <div className="flex items-center gap-0.5">
                            <button type="button" className="flex items-center gap-0.5 hover:text-surface-700 dark:text-surface-200 transition-colors" onClick={() => handleSort(col)}>
                              {col}
                              {sortCol === col && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                            </button>
                            <button type="button" className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400 dark:text-surface-500'}`} onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}>
                              <Filter className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {filterOpen === col && (
                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                              <input type="text" value={columnFilters[col] ?? ''} onChange={(e) => setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))} placeholder={`Filter ${col}...`} className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 dark:border-surface-700 rounded px-1.5 py-1 bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none" autoFocus />
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
                    <tr key={r.id} className="border-b border-surface-100 dark:border-surface-800 hover:bg-brand-50/30 transition-colors cursor-pointer" onClick={() => (r.isLocked ? null : openEdit(r))}>
                      <td className="px-2 py-1.5 w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="cursor-pointer"
                          aria-label={`Select row ${r.employeeName ?? ''}`}
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-xs font-mono font-semibold text-violet-700 dark:text-violet-300 tabular-nums whitespace-nowrap">{r.recordId ?? '-'}</td>
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.employeeCmid ?? '-'}</td>
                      <td className="px-2 py-1.5 text-xs font-medium text-surface-900 dark:text-surface-50 whitespace-nowrap">{r.employeeName ?? '-'}</td>
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">{r.accountName ?? '-'}</td>
                      <td className="px-2 py-1.5 text-xs text-surface-900 dark:text-surface-50 whitespace-nowrap">
                        <span className={isDed ? 'badge-danger' : 'badge-brand'}>{r.inputType}</span>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-surface-600 dark:text-surface-300 whitespace-nowrap capitalize">{r.calculationType.replace('_', ' ')}</td>
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-bold ${isDed ? 'text-red-600' : 'text-brand-700'}`}>
                        {isDed ? '−' : '+'}${r.inputAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.payrollCycleCode ?? '-'}</td>
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">{r.approverName ?? '-'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className={statusBadgeClass(r.status)}>{backendToPayrollStatus(r.status)}</span>
                          {r.isLocked && <span className="badge-neutral" title="Locked"><Lock className="w-3 h-3" /></span>}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800" title="Edit" disabled={r.isLocked}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => handleToggleLock(r.id, r.isLocked)} className="p-1.5 rounded-lg text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800" title={r.isLocked ? 'Unlock' : 'Lock'}>
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
          admins={adminUsers}
          payrollPeriods={payrollPeriods}
          onClose={closeModal}
          onSaved={async () => {
            closeModal()
            setNotice('Saved.')
            await load(false)
          }}
          onToggleLock={async (id: string, locked: boolean) => {
            await handleToggleLock(id, locked)
          }}
          onDelete={async (id: string) => {
            await handleDelete(id)
            closeModal()
          }}
        />
      )}

      {/* Bulk Import Modal */}
      {bulkImportOpen && (
        <BulkImportModal
          onClose={() => setBulkImportOpen(false)}
          onComplete={async (result) => {
            setBulkImportOpen(false)
            setNotice(`Bulk upload: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} errors.`)
            await load(false)
          }}
        />
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
          onClick={() => void bulkSetStatus('approved')}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Approve selected (skips locked / already-approved)"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Approve</span>
        </button>
        <button
          type="button"
          onClick={() => void bulkSetStatus('rejected')}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Reject selected (skips locked / already-rejected)"
        >
          <XCircle className="w-3.5 h-3.5 text-rose-600" />
          <span className="hidden sm:inline">Reject</span>
        </button>
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

function PayrollInputModal({
  existing,
  employees,
  admins,
  payrollPeriods,
  onClose,
  onSaved,
  onDelete,
  onToggleLock,
}: {
  existing?: PayrollInput
  employees: EmployeeRecord[]
  admins: AdminUser[]
  payrollPeriods: PayrollPeriod[]
  onClose: () => void
  onSaved: () => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onToggleLock: (id: string, locked: boolean) => Promise<void>
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
  const [payrollStatus, setPayrollStatus] = useState<ApproverStatus>(
    (existing?.status === 'approved' || existing?.status === 'rejected') ? existing.status : 'pending'
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [reviewedNote, setReviewedNote] = useState(existing?.reviewedNote ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stagedDocs, setStagedDocs] = useState<File[]>([])

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
        status: payrollStatusToBackend(payrollStatus),
        notes: notes || null,
      }
      if (isEdit && existing) {
        await updatePayrollInput(existing.id, { ...payload, reviewedNote: reviewedNote || undefined })
      } else {
        const created = await createPayrollInput(payload)
        // 22MAY2026: flush staged docs to the new payroll input
        if (stagedDocs.length > 0 && created?.id) {
          await uploadStagedDocuments(stagedDocs, 'payroll_input', created.id, uploadDocument)
        }
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
            recordId={existing?.recordId}
            onClose={onClose}
            extra={
              <>
                <span className="badge-neutral">{inputType}</span>
                <span className={statusBadgeClass(payrollStatus)}>
                  {backendToPayrollStatus(payrollStatus)}
                </span>
              </>
            }
          />
        ) : (
          <div className="modal-header">
            <div>
              <h2 className="modal-title">{isEdit ? 'Edit' : 'New'} payroll input</h2>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Bonus, commission, claim, or deduction</p>
            </div>
            <button type="button" onClick={onClose} className="btn-icon text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800">
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
            <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
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
                    calcType === opt.value ? 'bg-brand-600 text-white' : 'bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800'
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
                  <label className="label">Base Amount</label>
                  <input type="number" min="0" step="0.01" className="input" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} disabled={locked} placeholder="e.g. 2000" />
                </div>
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
                  <label className="label">Exchange Rate</label>
                  <input type="number" min="0" step="0.0001" className="input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} disabled={locked} placeholder={currency === 'USD' ? 'e.g. 60' : '1'} />
                </div>
              </div>
            </div>
          )}

          {/* Live Input Amount */}
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Input Amount (preview)</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Calculated automatically on save</p>
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
                  ...buildCycleOptions(payrollPeriods),
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
                  ...admins.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            </div>
          </div>

          <div>
            <label className="label">Approval Status</label>
            <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
              {([
                { value: 'pending' as const, label: 'Pending' },
                { value: 'approved' as const, label: 'Approved' },
                { value: 'rejected' as const, label: 'Rejected' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={locked}
                  onClick={() => setPayrollStatus(opt.value)}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                    payrollStatus === opt.value ? 'bg-brand-600 text-white' : 'bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800'
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

          {isEdit && (payrollStatus === 'approved' || payrollStatus === 'rejected') && (
            <div>
              <label className="label">Review note</label>
              <textarea
                value={reviewedNote}
                onChange={(e) => setReviewedNote(e.target.value)}
                disabled={locked}
                rows={2}
                className="input"
                placeholder="Optional note when approving or rejecting"
              />
            </div>
          )}

          {/* Documents — 22MAY2026: staged on new entries */}
          {isEdit && existing ? (
            <DocumentUpload entityType="payroll_input" entityId={existing.id} />
          ) : (
            <StagedDocumentUpload files={stagedDocs} onFilesChange={setStagedDocs} disabled={saving} />
          )}

          {/* Lock toggle */}
          {isEdit && existing && (
            <div className="flex items-center justify-between rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
              <div>
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 flex items-center gap-2">
                  {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  {locked ? 'Record is locked' : 'Record is editable'}
                </p>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Locking prevents further changes.</p>
              </div>
              <button
                type="button"
                onClick={() => onToggleLock(existing.id, locked)}
                className={locked ? 'btn-secondary btn-sm' : 'btn-danger btn-sm'}
              >
                {locked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
              </button>
            </div>
          )}

          {/* 21MAY2026 client video: audit trail on every form — same layout as
              attendance + leaves modals. */}
          {isEdit && existing && (
            <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-surface-600 dark:text-surface-300">
              <div>
                <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created By</p>
                <p className="text-surface-800 dark:text-surface-100">{existing.createdByName || '—'}</p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created On</p>
                <p className="text-surface-800 dark:text-surface-100 tabular-nums">{existing.createdOn ? new Date(existing.createdOn).toLocaleString() : existing.createdAt ? new Date(existing.createdAt).toLocaleString() : '—'}</p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified By</p>
                <p className="text-surface-800 dark:text-surface-100">{existing.modifiedByName || '—'}</p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified On</p>
                <p className="text-surface-800 dark:text-surface-100 tabular-nums">{existing.modifiedOn ? new Date(existing.modifiedOn).toLocaleString() : '—'}</p>
              </div>
            </div>
          )}
        </div>

        {/* 22MAY2026 client video: Delete option on the edit form. Guarded by
            isEdit (no delete in create flow), disabled when the record is
            locked, with a confirmation prompt. */}
        <div className="modal-footer flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          {isEdit && existing && onDelete ? (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm('Permanently delete this payroll input? This cannot be undone.')) return
                setSaving(true)
                try { await onDelete(existing.id) } finally { setSaving(false) }
              }}
              disabled={saving || locked}
              title={locked ? 'Unlock the record before deleting.' : 'Permanently delete this payroll input'}
              className="btn-danger sm:mr-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          ) : <span className="sm:mr-auto" aria-hidden />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving || locked || !userId || !inputType} className="btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create input'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * BULK IMPORT MODAL
 * ============================================================ */

const TEMPLATE_COLUMNS = [
  'Employee CMID',
  'Input Type',
  'Calculation',
  'Payable Hours',
  'Hourly Rate',
  'Hourly Multiplier',
  'Currency',
  'Base Amount',
  'Exchange Rate',
  'Payroll Cycle',
  'Approver',
  'Status',
  'Notes',
] as const

const COLUMN_MAP: Record<string, string> = {
  'employee cmid': 'employeeCmid',
  'input type': 'inputType',
  'calculation': 'calculationType',
  'payable hours': 'payableHours',
  'hourly rate': 'hourlyRate',
  'hourly multiplier': 'hourlyMultiplier',
  'currency': 'currency',
  'base amount': 'baseAmount',
  'exchange rate': 'exchangeRate',
  'payroll cycle': 'payrollCycleCode',
  'approver': 'approverName',
  'status': 'status',
  'notes': 'notes',
}

function mapRowToApi(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = String(key).trim().toLowerCase()
    const apiKey = COLUMN_MAP[normalizedKey]
    if (apiKey) {
      mapped[apiKey] = value
    }
  }
  return mapped
}

function downloadTemplate() {
  const sampleRow: Record<string, string | number> = {
    'Employee CMID': 1001,
    'Input Type': 'Bono Colaboración',
    'Calculation': 'base_amount',
    'Payable Hours': '',
    'Hourly Rate': '',
    'Hourly Multiplier': '',
    'Currency': 'DOP',
    'Base Amount': 5000,
    'Exchange Rate': 1,
    'Payroll Cycle': '2026-P10',
    'Approver': 'Orlando Santana',
    'Status': 'pending',
    'Notes': 'Sample row — delete before uploading',
  }
  const ws = XLSX.utils.json_to_sheet([sampleRow], { header: [...TEMPLATE_COLUMNS] })
  // Set column widths for readability
  ws['!cols'] = TEMPLATE_COLUMNS.map((col) => ({ wch: Math.max(col.length + 4, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Payroll Inputs')
  XLSX.writeFile(wb, 'payroll-inputs-template.xlsx')
}

function BulkImportModal({
  onClose,
  onComplete,
}: {
  onClose: () => void
  onComplete: (result: BulkUploadResult) => Promise<void>
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'uploading' | 'done'>('upload')
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    setParseError(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) { setParseError('No sheets found in the file.'); return }
        const sheet = workbook.Sheets[sheetName]
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        if (jsonRows.length === 0) { setParseError('The file appears to be empty (no data rows).'); return }
        const mapped = jsonRows.map(mapRowToApi)
        setParsedRows(mapped)
        setStep('preview')
      } catch {
        setParseError('Failed to parse the file. Please check it is a valid .xlsx, .xls, or .csv file.')
      }
    }
    reader.onerror = () => setParseError('Failed to read the file.')
    reader.readAsArrayBuffer(file)
  }, [])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  async function handleUpload() {
    setStep('uploading')
    setUploadError(null)
    try {
      const result = await bulkUploadPayrollInputs(parsedRows)
      setUploadResult(result)
      setStep('done')
    } catch (err: unknown) {
      setUploadError(err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Upload failed.')
      setStep('preview')
    }
  }

  function handleDone() {
    if (uploadResult) {
      void onComplete(uploadResult)
    } else {
      onClose()
    }
  }

  // Preview columns (use API field names from mapped rows)
  const previewCols = parsedRows.length > 0 ? Object.keys(parsedRows[0]) : []
  const previewSlice = parsedRows.slice(0, 10)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <div className="modal-frame-xl">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Import payroll inputs</h2>
            <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Download the template, fill it in, then upload</p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body">
          {/* Step 1: Download template + file upload */}
          {(step === 'upload' || step === 'preview') && (
            <>
              {/* Download template */}
              <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl border border-brand-200 bg-brand-100 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">Step 1: Download Template</p>
                    <p className="text-xs text-surface-600 dark:text-surface-300 mt-0.5">
                      Download the Excel template with the correct column headers and a sample row.
                    </p>
                    <button type="button" onClick={downloadTemplate} className="btn-secondary btn-sm mt-2">
                      <Download className="w-3.5 h-3.5" />
                      Download template (.xlsx)
                    </button>
                  </div>
                </div>
              </div>

              {/* File upload area */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 p-4">
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-2">Step 2: Upload your file</p>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                    dragOver ? 'border-brand-400 bg-brand-50/40' : 'border-surface-300 hover:border-brand-300 hover:bg-brand-50/20'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-surface-400 dark:text-surface-500 mx-auto mb-2" />
                  <p className="text-sm text-surface-700 dark:text-surface-200">
                    Drag and drop your file here, or <span className="text-brand-600 font-medium">click to browse</span>
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-1">Accepts .xlsx, .xls, or .csv files</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
                {fileName && step === 'upload' && !parseError && (
                  <p className="text-xs text-surface-600 dark:text-surface-300 mt-2">Selected: {fileName}</p>
                )}
                {parseError && (
                  <div className="alert-error mt-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{parseError}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">Step 3: Preview</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
                    Showing {previewSlice.length} of {parsedRows.length} rows. Verify the data before uploading.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => { setStep('upload'); setParsedRows([]); setFileName(null) }}
                >
                  Choose different file
                </button>
              </div>
              {uploadError && (
                <div className="alert-error mb-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
              <div className="overflow-x-auto max-h-64 border border-surface-200 dark:border-surface-700 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-surface-50 dark:bg-surface-900">
                    <tr>
                      <th className="px-2 py-1.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider border-b border-surface-200 dark:border-surface-700">#</th>
                      {previewCols.map((col) => (
                        <th key={col} className="px-2 py-1.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider border-b border-surface-200 dark:border-surface-700 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewSlice.map((row, idx) => (
                      <tr key={idx} className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50/50">
                        <td className="px-2 py-1.5 text-surface-400 dark:text-surface-500 tabular-nums">{idx + 1}</td>
                        {previewCols.map((col) => (
                          <td key={col} className="px-2 py-1.5 text-surface-700 dark:text-surface-200 whitespace-nowrap max-w-[200px] truncate">
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 10 && (
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-2 text-center">
                  ...and {parsedRows.length - 10} more rows not shown in preview
                </p>
              )}
            </div>
          )}

          {/* Uploading */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">Uploading {parsedRows.length} rows...</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-1">Please wait while we process your data.</p>
            </div>
          )}

          {/* Done / Results */}
          {step === 'done' && uploadResult && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">Upload complete</p>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <div>
                      <p className="text-2xl font-bold text-emerald-700 tabular-nums">{uploadResult.created}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">Created</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600 tabular-nums">{uploadResult.skipped}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">Skipped</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600 tabular-nums">{uploadResult.errors.length}</p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">Errors</p>
                    </div>
                  </div>
                </div>
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                  <p className="text-sm font-semibold text-red-800 mb-2">Errors</p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {uploadResult.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 'done' ? (
            <button type="button" onClick={handleDone} className="btn-primary">
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className="btn-secondary" disabled={step === 'uploading'}>
                Cancel
              </button>
              {step === 'preview' && (
                <button type="button" onClick={handleUpload} className="btn-primary" disabled={parsedRows.length === 0}>
                  <Upload className="w-4 h-4" />
                  Upload {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
