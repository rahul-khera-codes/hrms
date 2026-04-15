import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Clock, Plus, Pencil, Trash2, LayoutGrid, Table2, Search, Timer, ArrowUp, ArrowDown, Filter, Download } from 'lucide-react'
import { getShifts, getClients, createShift, updateShift, deleteShift, type Shift, type Client } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

function formatTime(t: string) {
  if (!t) return '—'
  const s = String(t)
  if (s.length >= 5) return s.slice(0, 5)
  return s
}

const TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export default function AdminShifts() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [clientFilter, setClientFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [timezone, setTimezone] = useState('UTC')
  const [clientId, setClientId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients) m.set(c.id, c.name)
    return m
  }, [clients])

  const shiftColAccessor = (s: Shift, col: string): string => {
    switch (col) {
      case 'Name': return s.name.toLowerCase()
      case 'Start Time': return String(s.startTime ?? '')
      case 'End Time': return String(s.endTime ?? '')
      case 'Timezone': return (s.timezone ?? '').toLowerCase()
      case 'Client': return (s.clientId ? clientMap.get(s.clientId) : '')?.toLowerCase() ?? ''
      default: return ''
    }
  }

  const filteredShifts = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = q ? shifts.filter((s) => s.name.toLowerCase().includes(q)) : [...shifts]
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      result = result.filter((s) => shiftColAccessor(s, col).includes(lower))
    }
    if (sortCol) {
      result.sort((a, b) => {
        const cmp = shiftColAccessor(a, sortCol).localeCompare(shiftColAccessor(b, sortCol))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, search, columnFilters, sortCol, sortDir, clientMap])

  function handleShiftSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }
  function handleShiftColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }

  function load() {
    return Promise.all([getShifts(clientFilter || undefined), getClients()]).then(([s, c]) => {
      setShifts(s)
      setClients(c)
    })
  }

  useEffect(() => {
    setLoading(true)
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [clientFilter])

  function openAdd() {
    setEditing(null)
    setName('')
    setStartTime('09:00')
    setEndTime('17:00')
    setTimezone('UTC')
    setClientId(clientFilter || '')
    setModal('add')
  }

  function openEdit(s: Shift) {
    setEditing(s)
    setName(s.name)
    setStartTime(formatTime(s.startTime))
    setEndTime(formatTime(s.endTime))
    setTimezone(s.timezone || 'UTC')
    setClientId(s.clientId || '')
    setModal('edit')
  }

  async function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (modal === 'add') {
        await createShift({ name: trimmedName, startTime, endTime, timezone, clientId: clientId || undefined })
      } else if (editing) {
        await updateShift(editing.id, { name: trimmedName, startTime, endTime, timezone, clientId: clientId || undefined })
      }
      setModal(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Shift) {
    if (!window.confirm(`Delete shift "${s.name}"?`)) return
    setError(null)
    try {
      await deleteShift(s.id)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  function exportShiftsCSV() {
    if (!filteredShifts.length) return
    const headers = ['Name', 'Start Time', 'End Time', 'Timezone', 'Client']
    const rows = filteredShifts.map((s) => [
      s.name,
      formatTime(s.startTime),
      formatTime(s.endTime),
      s.timezone || '',
      s.clientId ? (clientMap.get(s.clientId) || '') : '',
    ])
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shifts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && shifts.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Shifts" subtitle="Define shift templates for scheduling" icon={<Timer className="w-5 h-5" />} />
        <div className="card p-6 flex items-center gap-3 text-surface-500 text-sm">
          <div className="spinner" /> Loading shifts…
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Shifts"
        subtitle="Define shift templates. Use when assigning employees on the Schedule."
        icon={<Timer className="w-5 h-5" />}
        actions={
          <>
            <button type="button" onClick={exportShiftsCSV} disabled={filteredShifts.length === 0} className="btn-secondary">
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button type="button" onClick={openAdd} className="btn-primary">
              <Plus className="w-4 h-4" />
              Add shift
            </button>
          </>
        }
      />

      {error && (
        <div className="alert-error"><span>{error}</span></div>
      )}

      {/* Filter bar */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <AdminSelect
            value={clientFilter}
            onChange={(val) => setClientFilter(val)}
            options={[
              { value: '', label: 'All shifts' },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
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
        {shifts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock className="w-5 h-5" /></div>
            <p className="empty-state-title">No shifts yet</p>
            <p className="empty-state-description">Add your first shift template to start scheduling.</p>
          </div>
        ) : filteredShifts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Search className="w-5 h-5" /></div>
            <p className="empty-state-title">No matches</p>
            <p className="empty-state-description">Try a different search term.</p>
          </div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {filteredShifts.map((s) => (
              <li
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-surface-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-surface-900">{s.name}</p>
                  <p className="text-xs text-surface-500 mt-0.5">{formatTime(s.startTime)} – {formatTime(s.endTime)}</p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button type="button" onClick={() => openEdit(s)} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleDelete(s)} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Delete">
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
                  {['Name', 'Start Time', 'End Time', 'Timezone', 'Client', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${col === 'Actions' ? 'text-right' : ''}`}
                    >
                      {col === 'Actions' ? col : (
                        <>
                          <div className="flex items-center gap-0.5">
                            <button type="button" className="flex items-center gap-0.5 hover:text-surface-700 transition-colors" onClick={() => handleShiftSort(col)}>
                              {col}
                              {sortCol === col && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                            </button>
                            <button type="button" className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400'}`} onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}>
                              <Filter className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {filterOpen === col && (
                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                              <input type="text" value={columnFilters[col] ?? ''} onChange={(e) => handleShiftColumnFilter(col, e.target.value)} placeholder={`Filter ${col}...`} className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-brand-300 outline-none" autoFocus />
                            </div>
                          )}
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredShifts.map((s) => (
                  <tr key={s.id} className="border-b border-surface-100 hover:bg-brand-50/40 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap">{s.name}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{formatTime(s.startTime)}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{formatTime(s.endTime)}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{s.timezone || '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{s.clientId ? (clientMap.get(s.clientId) || '-') : '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDelete(s)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Delete">
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
          <div className="modal-frame">
            <div className="modal-header">
              <h2 className="modal-title">{modal === 'add' ? 'Add shift' : 'Edit shift'}</h2>
            </div>
            <div className="modal-body">
              <div>
                <label className="label">Name</label>
                <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Start time</label>
                  <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="label">End time</label>
                  <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Timezone</label>
                <AdminSelect
                  value={timezone}
                  onChange={(val) => setTimezone(val)}
                  options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                />
              </div>
              <div>
                <label className="label">Client (optional)</label>
                <AdminSelect
                  value={clientId}
                  onChange={(val) => setClientId(val)}
                  options={[
                    { value: '', label: '— None —' },
                    ...clients.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

