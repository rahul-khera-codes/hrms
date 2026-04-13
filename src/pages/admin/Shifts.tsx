import { useState, useEffect, useMemo } from 'react'
import { Clock, Plus, Pencil, Trash2, LayoutGrid, Table2, Search } from 'lucide-react'
import { getShifts, getClients, createShift, updateShift, deleteShift, type Shift, type Client } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'

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

  const filteredShifts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return shifts
    return shifts.filter((s) => s.name.toLowerCase().includes(q))
  }, [shifts, search])

  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients) m.set(c.id, c.name)
    return m
  }, [clients])

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

  if (loading && shifts.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Shifts</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Define shift templates for scheduling.</p>
        </div>
        <div className="rounded-xl border border-surface-200/80 bg-white p-6 text-surface-500 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Shifts</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Define shift templates. Use when assigning employees on the Schedule.</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary flex items-center justify-center gap-2 rounded-xl min-h-[2.75rem]">
          <Plus className="w-4 h-4" />
          Add shift
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      {/* Filter bar: Search + Filter by client + View toggle */}
      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
            <input
              type="text"
              placeholder="Search by name"
              className="input pl-9 rounded-xl min-h-[2.75rem] w-full"
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
          <div className="flex rounded-xl overflow-hidden border border-surface-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'card' ? 'bg-brand-600 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Card
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-brand-600 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        {shifts.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No shifts yet. Add one to get started.</div>
        ) : filteredShifts.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No shifts match your search.</div>
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
                      className={`px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${col === 'Actions' ? 'text-right' : ''}`}
                    >
                      {col}
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">{modal === 'add' ? 'Add shift' : 'Edit shift'}</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input type="text" className="input w-full rounded-xl min-h-[2.75rem]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Start time</label>
                  <input type="time" className="input w-full rounded-xl min-h-[2.75rem]" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="label">End time</label>
                  <input type="time" className="input w-full rounded-xl min-h-[2.75rem]" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 justify-end">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary rounded-xl min-h-[2.75rem] px-4">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary rounded-xl min-h-[2.75rem] px-4 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

