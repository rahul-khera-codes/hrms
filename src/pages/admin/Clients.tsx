import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Plus, Pencil, Trash2, LayoutGrid, Table2, Search, ArrowUp, ArrowDown, Filter, Download } from 'lucide-react'
import { getClients, createClient, updateClient, deleteClient, type Client } from '@/lib/apiAdmin'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonTableRows } from '@/components/Skeleton'

export default function AdminClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Client | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q))
      : [...clients]
    // Per-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      if (col === 'Name') result = result.filter((c) => c.name.toLowerCase().includes(lower))
      else if (col === 'Code') result = result.filter((c) => (c.code ?? '').toLowerCase().includes(lower))
    }
    // Sort
    if (sortCol) {
      result.sort((a, b) => {
        const av = sortCol === 'Name' ? a.name.toLowerCase() : (a.code ?? '').toLowerCase()
        const bv = sortCol === 'Name' ? b.name.toLowerCase() : (b.code ?? '').toLowerCase()
        const cmp = av.localeCompare(bv)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [clients, search, columnFilters, sortCol, sortDir])

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }
  function handleColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }

  useEffect(() => {
    getClients()
      .then(setClients)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load clients'))
      .finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setEditing(null)
    setName('')
    setCode('')
    setModal('add')
  }

  function openEdit(c: Client) {
    setEditing(c)
    setName(c.name)
    setCode(c.code || '')
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
        await createClient({ name: trimmedName, code: code.trim() || undefined })
      } else if (editing) {
        await updateClient(editing.id, { name: trimmedName, code: code.trim() || undefined })
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
    if (!window.confirm(`Delete client "${c.name}"? This will remove all schedule assignments for this client.`)) return
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
    const headers = ['Name', 'Code']
    const rows = filteredClients.map((c) => [c.name, c.code || ''])
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Clients" subtitle="Manage BPO clients for scheduling" icon={<Building2 className="w-5 h-5" />} />
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <tbody>
                <SkeletonTableRows rows={4} cols={4} />
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
        title="Clients"
        subtitle="Manage BPO clients. Use them when building schedules."
        icon={<Building2 className="w-5 h-5" />}
        actions={
          <>
            <button type="button" onClick={exportCSV} disabled={filteredClients.length === 0} className="btn-secondary">
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button type="button" onClick={(e) => { e.currentTarget.blur(); openAdd() }} className="btn-primary">
              <Plus className="w-4 h-4" />
              Add client
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
            placeholder="Search by name or code"
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
            <p className="empty-state-title">No clients yet</p>
            <p className="empty-state-description">Add your first client to start building schedules.</p>
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
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-surface-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-surface-900">{c.name}</p>
                  {c.code && <p className="text-xs text-surface-500 mt-0.5">{c.code}</p>}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button type="button" onClick={() => openEdit(c)} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleDelete(c)} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Delete">
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
                  {['Name', 'Code', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${col === 'Actions' ? 'text-right' : ''}`}
                    >
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
                              <input type="text" value={columnFilters[col] ?? ''} onChange={(e) => handleColumnFilter(col, e.target.value)} placeholder={`Filter ${col}...`} className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-brand-300 outline-none" autoFocus />
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
                  <tr key={c.id} className="border-b border-surface-100 hover:bg-brand-50/40 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap">{c.name}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap font-mono">{c.code || '-'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDelete(c)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Delete">
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
              <h2 className="modal-title">{modal === 'add' ? 'Add client' : 'Edit client'}</h2>
            </div>
            <div className="modal-body">
              <div>
                <label className="label">Name</label>
                <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
              </div>
              <div>
                <label className="label">Code (optional)</label>
                <input type="text" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BPO-01" />
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
