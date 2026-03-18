import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Users, Plus, Pencil } from 'lucide-react'
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  getClients,
  getShifts,
  getSchedule,
  createScheduleAssignment,
  getAdminAttendance,
  type EmployeeRecord,
  type Client,
  type Shift,
} from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'
import AdminDatePicker from '@/components/AdminDatePicker'
import { addDays, format } from 'date-fns'

const EMPLOYEES_PER_PAGE = 10

type EmployeeAssignmentInfo = {
  clientId: string
  clientName: string
  shiftId: string
  shiftName: string
  date: string
}

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
  const [clients, setClients] = useState<Client[]>([])
  const [allShifts, setAllShifts] = useState<Shift[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [assignedClientId, setAssignedClientId] = useState('')
  const [assignedShiftId, setAssignedShiftId] = useState('')
  const [assignmentDate, setAssignmentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [assignmentByEmployee, setAssignmentByEmployee] = useState<Record<string, EmployeeAssignmentInfo>>({})
  const [clientFilter, setClientFilter] = useState('all')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [activeEmployees, setActiveEmployees] = useState<Set<string>>(new Set())

  async function loadAssignments(clientList: Client[]) {
    if (clientList.length === 0) {
      setAssignmentByEmployee({})
      return
    }
    const from = format(addDays(new Date(), -365), 'yyyy-MM-dd')
    const to = format(addDays(new Date(), 365), 'yyyy-MM-dd')
    const scheduleResults = await Promise.all(
      clientList.map(async (client) => {
        try {
          const rows = await getSchedule({ clientId: client.id, from, to })
          return rows.map((row) => ({ ...row, clientName: client.name }))
        } catch {
          return []
        }
      })
    )
    const flattened = scheduleResults.flat()
    const next: Record<string, EmployeeAssignmentInfo> = {}
    for (const row of flattened) {
      const prev = next[row.userId]
      if (!prev || row.date > prev.date) {
        next[row.userId] = {
          clientId: row.clientId,
          clientName: row.clientName,
          shiftId: row.shiftId,
          shiftName: row.shiftName,
          date: row.date,
        }
      }
    }
    setAssignmentByEmployee(next)
  }

  const fetchActiveEmployees = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const records = await getAdminAttendance({ from: today, to: today, status: 'active' })
      const activeIds = new Set(records.map((r) => r.employeeId))
      setActiveEmployees(activeIds)
    } catch {
      setActiveEmployees(new Set())
    }
  }, [])

  const filteredEmployees =
    employees.filter((emp) => {
      const assignment = assignmentByEmployee[emp.id]
      const clientMatch = clientFilter === 'all' || assignment?.clientId === clientFilter
      const shiftMatch = shiftFilter === 'all' || assignment?.shiftName === shiftFilter
      return clientMatch && shiftMatch
    })

  const uniqueShiftNames = Array.from(
    new Set(allShifts.map((shift) => shift.name.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / EMPLOYEES_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * EMPLOYEES_PER_PAGE
  const paginatedEmployees = filteredEmployees.slice(pageStart, pageStart + EMPLOYEES_PER_PAGE)

  function load() {
    return getEmployees().then(setEmployees)
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([load(), getClients(), getShifts()])
      .then(async ([, clientList, shiftList]) => {
        setClients(clientList)
        setAllShifts(shiftList)
        await loadAssignments(clientList)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchActiveEmployees()

    // Poll every 2 seconds when page is visible
    const handleVisibilityChange = () => {
      if (document.hidden) return
      fetchActiveEmployees()
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        fetchActiveEmployees()
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchActiveEmployees])

  useEffect(() => {
    if (!assignedClientId) {
      setShifts([])
      setAssignedShiftId('')
      return
    }
    getShifts(assignedClientId)
      .then((list) => {
        setShifts(list)
        setAssignedShiftId((current) => (list.some((shift) => shift.id === current) ? current : ''))
      })
      .catch(() => {
        setShifts([])
        setAssignedShiftId('')
      })
  }, [assignedClientId])

  useEffect(() => {
    setCurrentPage(1)
  }, [clientFilter, shiftFilter])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  function openAdd() {
    setEditing(null)
    setName('')
    setEmail('')
    setPassword('')
    setSalaryType('hourly')
    setBaseSalary('')
    setAssignedClientId('')
    setAssignedShiftId('')
    setAssignmentDate(format(new Date(), 'yyyy-MM-dd'))
    setModal('add')
  }

  function openEdit(emp: EmployeeRecord) {
    setEditing(emp)
    setName(emp.name)
    setEmail(emp.email)
    setPassword('')
    setSalaryType((emp.salaryType === 'monthly' ? 'monthly' : 'hourly') as 'hourly' | 'monthly')
    setBaseSalary(emp.baseSalary > 0 ? String(emp.baseSalary) : '')
    setAssignedClientId('')
    setAssignedShiftId('')
    setAssignmentDate(format(new Date(), 'yyyy-MM-dd'))
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
    if (assignedClientId && !assignedShiftId) {
      setError('Shift is required when a client is selected')
      return
    }
    if (assignedShiftId && !assignedClientId) {
      setError('Client is required when a shift is selected')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (modal === 'add') {
        const createdEmployee = await createEmployee({
          name: trimmedName,
          email: trimmedEmail,
          password,
          salaryType,
          baseSalary: baseSalary ? parseFloat(baseSalary) : 0,
        })
        if (assignedClientId && assignedShiftId) {
          try {
            await createScheduleAssignment({
              clientId: assignedClientId,
              userId: createdEmployee.id,
              shiftId: assignedShiftId,
              date: assignmentDate,
            })
          } catch {
            await load()
            setModal(null)
            setError('Employee created, but shift assignment could not be saved')
            return
          }
        }
      } else if (editing) {
        await updateEmployee(editing.id, {
          name: trimmedName,
          email: trimmedEmail,
          ...(password ? { password } : {}),
          salaryType,
          baseSalary: baseSalary ? parseFloat(baseSalary) : 0,
        })
        if (assignedClientId && assignedShiftId) {
          await createScheduleAssignment({
            clientId: assignedClientId,
            userId: editing.id,
            shiftId: assignedShiftId,
            date: assignmentDate,
          })
        }
      }
      setModal(null)
      await load()
      await loadAssignments(clients)
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
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur()
            openAdd()
          }}
          className="btn-primary flex items-center justify-center gap-2 rounded-xl min-h-[2.75rem]"
        >
          <Plus className="w-4 h-4" />
          Add employee
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="w-full">
            <label className="label">Filter by client</label>
            <AdminSelect
              value={clientFilter}
              onChange={(val) => setClientFilter(val)}
              options={[
                { value: 'all', label: 'All clients' },
                ...clients.map((client) => ({ value: client.id, label: client.name })),
              ]}
            />
          </div>
          <div className="w-full">
            <label className="label">Filter by shift</label>
            <AdminSelect
              value={shiftFilter}
              onChange={(val) => setShiftFilter(val)}
              options={[
                { value: 'all', label: 'All shifts' },
                ...uniqueShiftNames.map((shiftName) => ({ value: shiftName, label: shiftName })),
              ]}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        {employees.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No employees yet. Add one to get started.</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No employees match the selected client.</div>
        ) : (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {paginatedEmployees.map((emp) => (
              <li
                key={emp.id}
                className="flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-surface-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-surface-900">{emp.name}</p>
                    {activeEmployees.has(emp.id) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-amber-100 text-amber-700 shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">{emp.email}</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {emp.salaryType === 'monthly' ? 'Monthly' : 'Hourly'} · {emp.salaryType === 'monthly' ? emp.baseSalary.toLocaleString() : emp.baseSalary.toFixed(2)}
                  </p>
                  {assignmentByEmployee[emp.id] ? (
                    <p className="text-xs text-brand-600 mt-0.5 truncate">
                      {assignmentByEmployee[emp.id].clientName} · {assignmentByEmployee[emp.id].shiftName} · {assignmentByEmployee[emp.id].date}
                    </p>
                  ) : null}
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

      {filteredEmployees.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-surface-500">
            Showing {pageStart + 1}-{Math.min(pageStart + EMPLOYEES_PER_PAGE, filteredEmployees.length)} of {filteredEmployees.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="btn-secondary rounded-xl min-h-[2.5rem] px-3 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs sm:text-sm text-surface-600 min-w-[80px] text-center">
              Page {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="btn-secondary rounded-xl min-h-[2.5rem] px-3 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {modal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
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
                <label className="label">Email</label>
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
              {(modal === 'add' || modal === 'edit') && (
                <>
                  <div>
                    <label className="label">Assign client</label>
                    <AdminSelect
                      value={assignedClientId}
                      onChange={(val) => setAssignedClientId(val)}
                      options={[
                        { value: '', label: 'Select client' },
                        ...clients.map((client) => ({ value: client.id, label: client.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className="label">Assign shift</label>
                    <AdminSelect
                      value={assignedShiftId}
                      onChange={(val) => setAssignedShiftId(val)}
                      options={[
                        { value: '', label: assignedClientId ? 'Select shift' : 'Select client first' },
                        ...shifts.map((shift) => ({ value: shift.id, label: shift.name })),
                      ]}
                      disabled={!assignedClientId}
                    />
                  </div>
                  <div>
                    <label className="label">Assignment date</label>
                    <AdminDatePicker value={assignmentDate} onChange={setAssignmentDate} />
                  </div>
                </>
              )}
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
        </div>,
        document.body
      )}
    </div>
  )
}
