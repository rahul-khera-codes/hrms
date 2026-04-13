import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Plus, Pencil, Trash2, LayoutGrid, Table2, Search } from 'lucide-react'
import { getClients, createClient, updateClient, deleteClient, type Client } from '@/lib/apiAdmin'

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

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q),
    )
  }, [clients, search])

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">BPO Clients</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Manage clients for scheduling.</p>
        </div>
        <div className="rounded-xl border border-surface-200/80 bg-white p-6 text-surface-500 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">BPO Clients</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Manage clients. Use clients when building schedules.</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur()
            openAdd()
          }}
          className="btn-primary flex items-center justify-center gap-2 rounded-xl min-h-[2.75rem]"
        >
          <Plus className="w-4 h-4" />
          Add client
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      {/* Filter bar: Search + View toggle */}
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
        {clients.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No clients yet. Add one to get started.</div>
        ) : filteredClients.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No clients match your search.</div>
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
                      className={`px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${col === 'Actions' ? 'text-right' : ''}`}
                    >
                      {col}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">{modal === 'add' ? 'Add client' : 'Edit client'}</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input type="text" className="input w-full rounded-xl min-h-[2.75rem]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
              </div>
              <div>
                <label className="label">Code (optional)</label>
                <input type="text" className="input w-full rounded-xl min-h-[2.75rem]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BPO-01" />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 justify-end">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary rounded-xl min-h-[2.75rem] px-4">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary rounded-xl min-h-[2.75rem] px-4 disabled:opacity-60">
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
