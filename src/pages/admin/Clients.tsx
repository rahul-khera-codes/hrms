import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Plus, Pencil, Trash2, LayoutGrid, Table2, Search, ArrowUp, ArrowDown, Filter, Download, X } from 'lucide-react'
import { getClients, createClient, updateClient, deleteClient, getEmployees, type Client, type EmployeeRecord } from '@/lib/apiAdmin'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonTableRows } from '@/components/Skeleton'
import AdminSelect from '@/components/AdminSelect'
import AdminDatePicker from '@/components/AdminDatePicker'
import DocumentUpload from '@/components/DocumentUpload'

const VERTICALS = [
  'Home Care',
  'Real State & Property Mgmt.',
  'Medical Practice',
  'Image & Diagnostic',
]

const BILLABLE_TYPES = [
  'Monthly',
  'Per Hour',
  'Per Day',
  'Per Week',
  'Per Month',
  'Per FTE',
  'Project-Based',
  'Per Transaction',
]

const CONTRACT_STATUSES = [
  'Onboarding',
  'Active',
  'Suspended',
  'Prenotice',
  'Terminated',
]

const TERMINATION_REASONS = [
  'Business Contraction',
  'Vendor Switch',
  'Regulatory/Compliance Issues',
  'Budget Limitations',
  'Security Incident (Data Exposure)',
  'Project Completion',
  'Regional Realignment',
  'Insourcing Decision',
  'Corporate Restructuring',
  'Business Closure',
  'Service Delivery Issues',
  'Vendor Consolidation',
  'Service Scope Reduction',
  'Technology Migration',
  'Contractual Dispute',
  'Contract Ended (No Renewal)',
  'Strategic Direction Change',
  'Redundancy of Service',
  'Implementation Failure',
  'Partnership Breakdown',
  'Underutilization',
  'Non-Payment Suspension',
]

const TABLE_COLUMNS = ['Company Name', 'Vertical', 'Sales Owner', 'Ops Owner', 'Contract Status', 'Actions'] as const

function contractStatusBadge(status: string | null) {
  if (!status) return null
  const map: Record<string, string> = {
    Onboarding: 'bg-blue-50 text-blue-700 border-blue-200',
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Suspended: 'bg-amber-50 text-amber-700 border-amber-200',
    Prenotice: 'bg-orange-50 text-orange-700 border-orange-200',
    Terminated: 'bg-red-50 text-red-700 border-red-200',
  }
  const cls = map[status] ?? 'bg-surface-100 text-surface-600 border-surface-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      {status}
    </span>
  )
}

export default function AdminClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [vertical, setVertical] = useState('')
  const [salesOwnerId, setSalesOwnerId] = useState('')
  const [opsOwnerId, setOpsOwnerId] = useState('')
  const [registeredAddress, setRegisteredAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [mainPhone, setMainPhone] = useState('')
  const [opsPoc, setOpsPoc] = useState('')
  const [opsPocEmail, setOpsPocEmail] = useState('')
  const [opsPhone, setOpsPhone] = useState('')
  const [billingPoc, setBillingPoc] = useState('')
  const [billingPocEmail, setBillingPocEmail] = useState('')
  const [billingPocPhone, setBillingPocPhone] = useState('')
  const [billableHeadcount, setBillableHeadcount] = useState('')
  const [billableType, setBillableType] = useState('')
  const [billingRate, setBillingRate] = useState('')
  const [otPremium, setOtPremium] = useState('')
  const [contractStatus, setContractStatus] = useState('')
  const [terminationDate, setTerminationDate] = useState('')
  const [terminationReason, setTerminationReason] = useState('')

  const showTerminationFields = contractStatus === 'Prenotice' || contractStatus === 'Terminated'

  const employeeOptions = useMemo(
    () => [{ value: '', label: 'None' }, ...employees.map((e) => ({ value: e.id, label: e.name }))],
    [employees],
  )

  function getColValue(c: Client, col: string): string {
    switch (col) {
      case 'Company Name': return c.name.toLowerCase()
      case 'Vertical': return (c.vertical ?? '').toLowerCase()
      case 'Sales Owner': return (c.salesOwnerName ?? '').toLowerCase()
      case 'Ops Owner': return (c.opsOwnerName ?? '').toLowerCase()
      case 'Contract Status': return (c.contractStatus ?? '').toLowerCase()
      default: return ''
    }
  }

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = q
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.code ?? '').toLowerCase().includes(q) ||
            (c.vertical ?? '').toLowerCase().includes(q) ||
            (c.salesOwnerName ?? '').toLowerCase().includes(q) ||
            (c.opsOwnerName ?? '').toLowerCase().includes(q) ||
            (c.contractStatus ?? '').toLowerCase().includes(q),
        )
      : [...clients]

    // Per-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      result = result.filter((c) => getColValue(c, col).includes(lower))
    }

    // Sort
    if (sortCol) {
      result.sort((a, b) => {
        const av = getColValue(a, sortCol)
        const bv = getColValue(b, sortCol)
        const cmp = av.localeCompare(bv)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [clients, search, columnFilters, sortCol, sortDir])

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortCol(col)
      setSortDir('asc')
    }
  }
  function handleColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }

  useEffect(() => {
    Promise.all([getClients(), getEmployees()])
      .then(([clientList, empList]) => {
        setClients(clientList)
        setEmployees(empList)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load data'))
      .finally(() => setLoading(false))
  }, [])

  function resetForm() {
    setName('')
    setCode('')
    setVertical('')
    setSalesOwnerId('')
    setOpsOwnerId('')
    setRegisteredAddress('')
    setWebsite('')
    setMainPhone('')
    setOpsPoc('')
    setOpsPocEmail('')
    setOpsPhone('')
    setBillingPoc('')
    setBillingPocEmail('')
    setBillingPocPhone('')
    setBillableHeadcount('')
    setBillableType('')
    setBillingRate('')
    setOtPremium('')
    setContractStatus('Onboarding')
    setTerminationDate('')
    setTerminationReason('')
  }

  function openAdd() {
    setEditing(null)
    resetForm()
    setModal('add')
  }

  function openEdit(c: Client) {
    setEditing(c)
    setName(c.name)
    setCode(c.code || '')
    setVertical(c.vertical || '')
    setSalesOwnerId(c.salesOwnerId || '')
    setOpsOwnerId(c.opsOwnerId || '')
    setRegisteredAddress(c.registeredAddress || '')
    setWebsite(c.website || '')
    setMainPhone(c.mainPhone || '')
    setOpsPoc(c.opsPoc || '')
    setOpsPocEmail(c.opsPocEmail || '')
    setOpsPhone(c.opsPhone || '')
    setBillingPoc(c.billingPoc || '')
    setBillingPocEmail(c.billingPocEmail || '')
    setBillingPocPhone(c.billingPocPhone || '')
    setBillableHeadcount(c.billableHeadcount != null ? String(c.billableHeadcount) : '')
    setBillableType(c.billableType || '')
    setBillingRate(c.billingRate != null ? String(c.billingRate) : '')
    setOtPremium(c.otPremium != null ? String(c.otPremium) : '')
    setContractStatus(c.contractStatus || '')
    setTerminationDate(c.terminationDate || '')
    setTerminationReason(c.terminationReason || '')
    setModal('edit')
  }

  function buildPayload() {
    return {
      name: name.trim(),
      code: code.trim() || undefined,
      vertical: vertical || null,
      salesOwnerId: salesOwnerId || null,
      opsOwnerId: opsOwnerId || null,
      registeredAddress: registeredAddress.trim() || null,
      website: website.trim() || null,
      mainPhone: mainPhone.trim() || null,
      opsPoc: opsPoc.trim() || null,
      opsPocEmail: opsPocEmail.trim() || null,
      opsPhone: opsPhone.trim() || null,
      billingPoc: billingPoc.trim() || null,
      billingPocEmail: billingPocEmail.trim() || null,
      billingPocPhone: billingPocPhone.trim() || null,
      billableHeadcount: billableHeadcount ? Number(billableHeadcount) : null,
      billableType: billableType || null,
      billingRate: billingRate ? Number(billingRate) : null,
      otPremium: otPremium ? Number(otPremium) : null,
      contractStatus: contractStatus || null,
      terminationDate: showTerminationFields && terminationDate ? terminationDate : null,
      terminationReason: showTerminationFields && terminationReason ? terminationReason : null,
    }
  }

  async function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Company name is required')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (modal === 'add') {
        await createClient(buildPayload())
      } else if (editing) {
        await updateClient(editing.id, buildPayload())
      }
      setModal(null)
      const list = await getClients()
      setClients(list)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Client) {
    if (!window.confirm(`Delete account "${c.name}"? This will remove all schedule assignments for this account.`)) return
    setError(null)
    try {
      await deleteClient(c.id)
      setClients((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  function exportCSV() {
    if (!filteredClients.length) return
    const headers = [
      'Company Name',
      'Code',
      'Vertical',
      'Sales Owner',
      'Ops Owner',
      'Registered Address',
      'Website',
      'Main Phone',
      'Ops POC',
      'Ops POC Email',
      'Ops Phone',
      'Billing POC',
      'Billing POC Email',
      'Billing POC Phone',
      'Billable Headcount',
      'Billable Type',
      'Billing Rate',
      'OT Premium',
      'Contract Status',
      'Termination Date',
      'Termination Reason',
    ]
    const rows = filteredClients.map((c) => [
      c.name,
      c.code || '',
      c.vertical || '',
      c.salesOwnerName || '',
      c.opsOwnerName || '',
      c.registeredAddress || '',
      c.website || '',
      c.mainPhone || '',
      c.opsPoc || '',
      c.opsPocEmail || '',
      c.opsPhone || '',
      c.billingPoc || '',
      c.billingPocEmail || '',
      c.billingPocPhone || '',
      c.billableHeadcount != null ? String(c.billableHeadcount) : '',
      c.billableType || '',
      c.billingRate != null ? String(c.billingRate) : '',
      c.otPremium != null ? String(c.otPremium) : '',
      c.contractStatus || '',
      c.terminationDate || '',
      c.terminationReason || '',
    ])
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Accounts" subtitle="Manage client accounts, contacts, and billing." icon={<Building2 className="w-5 h-5" />} />
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <tbody>
                <SkeletonTableRows rows={5} cols={6} />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Accounts"
        subtitle="Manage client accounts, contacts, and billing."
        icon={<Building2 className="w-5 h-5" />}
        actions={
          <>
            <button type="button" onClick={exportCSV} disabled={filteredClients.length === 0} className="btn-secondary">
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button type="button" onClick={(e) => { e.currentTarget.blur(); openAdd() }} className="btn-primary">
              <Plus className="w-4 h-4" />
              Add account
            </button>
          </>
        }
      />

      {error && (
        <div className="alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, vertical, owner, status..."
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented self-start sm:self-auto">
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

      <div className="card overflow-hidden">
        {clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Building2 className="w-5 h-5" /></div>
            <p className="empty-state-title">No accounts yet</p>
            <p className="empty-state-description">Add your first account to get started.</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Search className="w-5 h-5" /></div>
            <p className="empty-state-title">No matches</p>
            <p className="empty-state-description">Try a different search term.</p>
          </div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {filteredClients.map((c) => (
              <li
                key={c.id}
                onClick={() => openEdit(c)}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-surface-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-surface-900">{c.name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {c.vertical && <span className="text-xs text-surface-500">{c.vertical}</span>}
                    {c.contractStatus && contractStatusBadge(c.contractStatus)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-surface-500">
                    {c.salesOwnerName && <span>Sales: {c.salesOwnerName}</span>}
                    {c.opsOwnerName && <span>Ops: {c.opsOwnerName}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(c) }} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(c) }} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50 shadow-[0_1px_0_0_theme(colors.surface.200)]">
                <tr>
                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${col === 'Actions' ? 'text-right' : ''}`}
                    >
                      {col === 'Actions' ? (
                        col
                      ) : (
                        <>
                          <div className="flex items-center gap-0.5">
                            <button type="button" className="flex items-center gap-0.5 hover:text-surface-700 transition-colors" onClick={() => handleSort(col)}>
                              {col}
                              {sortCol === col && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                            </button>
                            <button
                              type="button"
                              className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400'}`}
                              onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}
                            >
                              <Filter className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {filterOpen === col && (
                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={columnFilters[col] ?? ''}
                                onChange={(e) => handleColumnFilter(col, e.target.value)}
                                placeholder={`Filter ${col}...`}
                                className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-brand-300 outline-none"
                                autoFocus
                              />
                            </div>
                          )}
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-surface-100 hover:bg-brand-50/40 transition-colors cursor-pointer"
                    onClick={() => openEdit(c)}
                  >
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap">{c.name}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{c.vertical || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{c.salesOwnerName || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{c.opsOwnerName || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{contractStatusBadge(c.contractStatus) ?? <span className="text-xs text-surface-400">-</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                          className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(c) }}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0" onClick={() => setModal(null)} aria-label="Close" />
          <div className="modal-frame-xl">
            {/* Modal header */}
            {modal === 'edit' && editing ? (
              <div className="modal-header">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0 text-sm font-semibold">
                    {editing.name ? editing.name.charAt(0).toUpperCase() : '-'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-surface-900 truncate">{editing.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      {editing.vertical && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-100 border border-surface-200 text-[11px] font-medium text-surface-700">
                          {editing.vertical}
                        </span>
                      )}
                      {editing.contractStatus && contractStatusBadge(editing.contractStatus)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="p-2.5 min-w-[2.75rem] min-h-[2.75rem] rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 shrink-0 transition-colors flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="modal-header">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="modal-title">Add account</h2>
                    <p className="text-[11px] text-surface-500 mt-0.5">Create a new client account.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="p-2.5 min-w-[2.75rem] min-h-[2.75rem] rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 shrink-0 transition-colors flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="modal-body">
              {/* ── ACCOUNT INFORMATION ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Account Information</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Company Name <span className="text-red-500" aria-hidden>*</span></label>
                  <input type="text" className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" required />
                </div>
                <div>
                  <label className="label">Vertical</label>
                  <AdminSelect value={vertical} onChange={setVertical} options={[{ value: '', label: 'None' }, ...VERTICALS.map((v) => ({ value: v, label: v }))]} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Sales Owner</label>
                  <AdminSelect value={salesOwnerId} onChange={setSalesOwnerId} options={employeeOptions} />
                </div>
                <div>
                  <label className="label">Ops Owner</label>
                  <AdminSelect value={opsOwnerId} onChange={setOpsOwnerId} options={employeeOptions} />
                </div>
              </div>

              {/* ── CONTACT INFORMATION ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Contact Information</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Registered Address</label>
                  <input type="text" className="input w-full" value={registeredAddress} onChange={(e) => setRegisteredAddress(e.target.value)} placeholder="Street, city, country" />
                </div>
                <div>
                  <label className="label">Website</label>
                  <input type="url" className="input w-full" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
                </div>
                <div>
                  <label className="label">Main Phone</label>
                  <input type="text" className="input w-full" value={mainPhone} onChange={(e) => setMainPhone(e.target.value)} placeholder="Main phone number" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Ops POC</label>
                  <input type="text" className="input w-full" value={opsPoc} onChange={(e) => setOpsPoc(e.target.value)} placeholder="Operations point of contact" />
                </div>
                <div>
                  <label className="label">Ops POC Email</label>
                  <input type="email" className="input w-full" value={opsPocEmail} onChange={(e) => setOpsPocEmail(e.target.value)} placeholder="ops@example.com" />
                </div>
                <div>
                  <label className="label">Ops Phone</label>
                  <input type="text" className="input w-full" value={opsPhone} onChange={(e) => setOpsPhone(e.target.value)} placeholder="Ops phone number" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Billing POC</label>
                  <input type="text" className="input w-full" value={billingPoc} onChange={(e) => setBillingPoc(e.target.value)} placeholder="Billing point of contact" />
                </div>
                <div>
                  <label className="label">Billing POC Email</label>
                  <input type="email" className="input w-full" value={billingPocEmail} onChange={(e) => setBillingPocEmail(e.target.value)} placeholder="billing@example.com" />
                </div>
                <div>
                  <label className="label">Billing POC Phone</label>
                  <input type="text" className="input w-full" value={billingPocPhone} onChange={(e) => setBillingPocPhone(e.target.value)} placeholder="Billing phone number" />
                </div>
              </div>

              {/* ── BILLING INFORMATION ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Billing Information</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="label">Billable Headcount</label>
                  <input type="number" step="0.01" className="input w-full" value={billableHeadcount} onChange={(e) => setBillableHeadcount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="label">Billable Type</label>
                  <AdminSelect value={billableType} onChange={setBillableType} options={[{ value: '', label: 'None' }, ...BILLABLE_TYPES.map((t) => ({ value: t, label: t }))]} />
                </div>
                <div>
                  <label className="label">Billing Rate</label>
                  <input type="number" step="0.01" className="input w-full" value={billingRate} onChange={(e) => setBillingRate(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="label">OT Premium</label>
                  <input type="number" step="0.01" className="input w-full" value={otPremium} onChange={(e) => setOtPremium(e.target.value)} placeholder="1.2" />
                </div>
              </div>

              {/* ── CONTRACT STATUS ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Contract Status</p>

              <div>
                <label className="label">Contract Status</label>
                <AdminSelect
                  value={contractStatus}
                  onChange={(val) => {
                    setContractStatus(val)
                    if (val !== 'Prenotice' && val !== 'Terminated') {
                      setTerminationDate('')
                      setTerminationReason('')
                    }
                  }}
                  options={[{ value: '', label: 'None' }, ...CONTRACT_STATUSES.map((s) => ({ value: s, label: s }))]}
                />
              </div>

              {showTerminationFields && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Termination Date</label>
                    <AdminDatePicker value={terminationDate} onChange={setTerminationDate} />
                  </div>
                  <div>
                    <label className="label">Termination Reason</label>
                    <AdminSelect value={terminationReason} onChange={setTerminationReason} options={[{ value: '', label: 'None' }, ...TERMINATION_REASONS.map((r) => ({ value: r, label: r }))]} />
                  </div>
                </div>
              )}

              {/* ── DOCUMENTS ── */}
              {editing && (
                <>
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Documents</p>
                  <DocumentUpload entityType="account" entityId={editing.id} />
                </>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
