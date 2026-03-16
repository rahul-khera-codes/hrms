import { useState, useEffect } from 'react'
import { Users, Plus, Pencil } from 'lucide-react'
import { getEmployees, createEmployee, updateEmployee, type EmployeeRecord } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<EmployeeRecord | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [salaryType, setSalaryType] = useState<'hourly' | 'monthly'>('hourly')
  const [baseSalary, setBaseSalary] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    return getEmployees().then(setEmployees)
  }

  useEffect(() => {
    setLoading(true)
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setEditing(null)
    setName('')
    setEmail('')
    setPassword('')
    setSalaryType('hourly')
    setBaseSalary('')
    setModal('add')
  }

  function openEdit(emp: EmployeeRecord) {
    setEditing(emp)
    setName(emp.name)
    setEmail(emp.email)
    setPassword('')
    setSalaryType((emp.salaryType === 'monthly' ? 'monthly' : 'hourly') as 'hourly' | 'monthly')
    setBaseSalary(emp.baseSalary > 0 ? String(emp.baseSalary) : '')
    setModal('edit')
  }

  async function handleSave() {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }
    if (!trimmedEmail) {
      setError('Email is required')
      return
    }
    if (modal === 'add' && !password) {
      setError('Password is required for new employees')
      return
    }
    if (modal === 'add' && password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (modal === 'add') {
        await createEmployee({
          name: trimmedName,
          email: trimmedEmail,
          password,
          salaryType,
          baseSalary: baseSalary ? parseFloat(baseSalary) : 0,
        })
      } else if (editing) {
        await updateEmployee(editing.id, {
          name: trimmedName,
          email: trimmedEmail,
          ...(password ? { password } : {}),
          salaryType,
          baseSalary: baseSalary ? parseFloat(baseSalary) : 0,
        })
      }
      setModal(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading && employees.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Employee database</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Manage employees. Not filled by payroll.</p>
        </div>
        <div className="rounded-xl border border-surface-200/80 bg-white p-6 text-surface-500 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Employee database</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Manage employees. Add and edit staff here; payroll uses this list.</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary flex items-center justify-center gap-2 rounded-xl min-h-[2.75rem]">
          <Plus className="w-4 h-4" />
          Add employee
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        {employees.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No employees yet. Add one to get started.</div>
        ) : (
          <ul className="divide-y divide-surface-100">
            {employees.map((emp) => (
              <li key={emp.id} className="flex items-center gap-4 p-4 sm:p-5">
                <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-surface-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-surface-900">{emp.name}</p>
                  <p className="text-xs text-surface-500 mt-0.5">{emp.email}</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {emp.salaryType === 'monthly' ? 'Monthly' : 'Hourly'} · {emp.salaryType === 'monthly' ? emp.baseSalary.toLocaleString() : emp.baseSalary.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openEdit(emp)} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">{modal === 'add' ? 'Add employee' : 'Edit employee'}</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input w-full rounded-xl min-h-[2.75rem]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="label">Email</label>xxx
                <input
                  type="email"
                  className="input w-full rounded-xl min-h-[2.75rem]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              {modal === 'add' && (
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input w-full rounded-xl min-h-[2.75rem]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                </div>
              )}
              {modal === 'edit' && (
                <div>
                  <label className="label">New password (leave blank to keep)</label>
                  <input
                    type="password"
                    className="input w-full rounded-xl min-h-[2.75rem]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                </div>
              )}
              <div>
                <label className="label">Salary type</label>
                <AdminSelect
                  value={salaryType}
                  onChange={(val) => setSalaryType(val as 'hourly' | 'monthly')}
                  options={[
                    { value: 'hourly', label: 'Hourly' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                />
              </div>
              <div>
                <label className="label">{salaryType === 'monthly' ? 'Monthly base salary' : 'Hourly rate'}</label>
                <input
                  type="number"
                  min={0}
                  step={salaryType === 'monthly' ? 100 : 0.01}
                  className="input w-full rounded-xl min-h-[2.75rem]"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  placeholder={salaryType === 'monthly' ? 'e.g. 25000' : 'e.g. 150'}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary rounded-xl min-h-[2.75rem] px-4">Cancel</button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim() || !email.trim() || (modal === 'add' && (!password || password.length < 6))}
                className="btn-primary rounded-xl min-h-[2.75rem] px-4 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
