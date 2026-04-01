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
  shiftStart: string
  shiftEnd: string
  date: string
}

function normalizeTimeInput(value: string) {
  const trimmed = value.trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (!match) return null
  const hh = Number(match[1])
  const mm = Number(match[2])
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function formatShiftTimeRange(start?: string | null, end?: string | null) {
  const s = start ? String(start).slice(0, 5) : '—'
  const e = end ? String(end).slice(0, 5) : '—'
  return `${s}-${e}`
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
  const [assignmentStartTime, setAssignmentStartTime] = useState('')
  const [assignmentEndTime, setAssignmentEndTime] = useState('')
  const [assignmentDate, setAssignmentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [assignmentByEmployee, setAssignmentByEmployee] = useState<Record<string, EmployeeAssignmentInfo>>({})
  const [clientFilter, setClientFilter] = useState('all')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [activeEmployees, setActiveEmployees] = useState<Set<string>>(new Set())
  const [cmid, setCmid] = useState('')
  const [contractType, setContractType] = useState<string>('employee')
  const [hireDate, setHireDate] = useState('')
  const [location, setLocation] = useState('')
  const [department, setDepartment] = useState('')
  const [primaryClientId, setPrimaryClientId] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [reportsTo, setReportsTo] = useState('')
  const [contractStatus, setContractStatus] = useState<string>('active')
  const [terminationDate, setTerminationDate] = useState('')

  const contractTypeOptions = [
    { value: 'employee', label: 'Employee' },
    { value: 'contractor', label: 'Contractor' },
  ]

  const locationOptions = [
    { value: '', label: 'Select location' },
    { value: 'DO-SDQ1', label: 'DO-SDQ1' },
    { value: 'DO-SDQ2', label: 'DO-SDQ2' },
  ]

  const departmentOptions = [
    { value: '', label: 'Select department' },
    { value: 'Operations', label: 'Operations' },
    { value: 'HR', label: 'HR' },
    { value: 'Finance', label: 'Finance' },
    { value: 'IT', label: 'IT' },
    { value: 'Sales', label: 'Sales' },
    { value: 'Support', label: 'Support' },
  ]

  const jobTitleOptions = [
    { value: '', label: 'Select job title' },
    { value: 'Agent', label: 'Agent' },
    { value: 'Team Lead', label: 'Team Lead' },
    { value: 'Supervisor', label: 'Supervisor' },
    { value: 'Manager', label: 'Manager' },
    { value: 'Director', label: 'Director' },
    { value: 'Analyst', label: 'Analyst' },
    { value: 'Specialist', label: 'Specialist' },
  ]

  const contractStatusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'terminated', label: 'Terminated' },
    { value: 'suspended', label: 'Suspended' },
  ]

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
          shiftStart: row.shiftStart,
          shiftEnd: row.shiftEnd,
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
      setAssignmentStartTime('')
      setAssignmentEndTime('')
      return
    }
    getShifts(assignedClientId)
      .then((list) => {
        setShifts(list)
        setAssignedShiftId((current) => {
          const nextShiftId = list.some((shift) => shift.id === current) ? current : ''
          if (!nextShiftId) {
            setAssignmentStartTime('')
            setAssignmentEndTime('')
          } else {
            const selected = list.find((shift) => shift.id === nextShiftId)
            if (selected) {
              setAssignmentStartTime((prev) => prev || String(selected.startTime).slice(0, 5))
              setAssignmentEndTime((prev) => prev || String(selected.endTime).slice(0, 5))
            }
          }
          return nextShiftId
        })
      })
      .catch(() => {
        setShifts([])
        setAssignedShiftId('')
        setAssignmentStartTime('')
        setAssignmentEndTime('')
      })
  }, [assignedClientId])

  function handleAssignedShiftChange(shiftId: string) {
    setAssignedShiftId(shiftId)
    if (!shiftId) {
      setAssignmentStartTime('')
      setAssignmentEndTime('')
      return
    }
    const selected = shifts.find((shift) => shift.id === shiftId)
    if (!selected) return
    setAssignmentStartTime(String(selected.startTime).slice(0, 5))
    setAssignmentEndTime(String(selected.endTime).slice(0, 5))
  }

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
    setAssignmentStartTime('')
    setAssignmentEndTime('')
    setAssignmentDate(format(new Date(), 'yyyy-MM-dd'))
    setCmid('')
    setContractType('employee')
    setHireDate('')
    setLocation('')
    setDepartment('')
    setPrimaryClientId('')
    setJobTitle('')
    setReportsTo('')
    setContractStatus('active')
    setTerminationDate('')
    setModal('add')
  }

  function openEdit(emp: EmployeeRecord) {
    setEditing(emp)
    setName(emp.name)
    setEmail(emp.email)
    setPassword('')
    setSalaryType((emp.salaryType === 'monthly' ? 'monthly' : 'hourly') as 'hourly' | 'monthly')
    setBaseSalary(emp.baseSalary > 0 ? String(emp.baseSalary) : '')
    const assignment = assignmentByEmployee[emp.id]
    setAssignedClientId(assignment?.clientId ?? '')
    setAssignedShiftId(assignment?.shiftId ?? '')
    setAssignmentStartTime(assignment ? String(assignment.shiftStart).slice(0, 5) : '')
    setAssignmentEndTime(assignment ? String(assignment.shiftEnd).slice(0, 5) : '')
    setAssignmentDate(assignment?.date ?? format(new Date(), 'yyyy-MM-dd'))
    setCmid(emp.cmid != null ? String(emp.cmid) : '')
    setContractType(emp.contractType || 'employee')
    setHireDate(emp.hireDate || '')
    setLocation(emp.location || '')
    setDepartment(emp.department || '')
    setPrimaryClientId(emp.primaryClientId || '')
    setJobTitle(emp.jobTitle || '')
    setReportsTo(emp.reportsTo || '')
    setContractStatus(emp.contractStatus || 'active')
    setTerminationDate(emp.terminationDate || '')
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
    if ((assignmentStartTime && !assignmentEndTime) || (!assignmentStartTime && assignmentEndTime)) {
      setError('Provide both start and end time for shift timing override')
      return
    }

    const normalizedStart = assignmentStartTime ? normalizeTimeInput(assignmentStartTime) : null
    const normalizedEnd = assignmentEndTime ? normalizeTimeInput(assignmentEndTime) : null
    if ((assignmentStartTime && !normalizedStart) || (assignmentEndTime && !normalizedEnd)) {
      setError('Invalid time format. Use HH:mm')
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
          cmid: cmid ? parseInt(cmid, 10) : null,
          contractType,
          hireDate: hireDate || undefined,
          location: location || undefined,
          department: department || undefined,
          primaryClientId: primaryClientId || undefined,
          jobTitle: jobTitle || undefined,
          reportsTo: reportsTo || undefined,
          contractStatus,
          terminationDate: contractStatus === 'terminated' ? terminationDate || undefined : undefined,
        })
        if (assignedClientId && assignedShiftId) {
          try {
            await createScheduleAssignment({
              clientId: assignedClientId,
              userId: createdEmployee.id,
              shiftId: assignedShiftId,
              date: assignmentDate,
              ...(normalizedStart && normalizedEnd
                ? { overrideStartTime: normalizedStart, overrideEndTime: normalizedEnd }
                : {}),
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
          cmid: cmid ? parseInt(cmid, 10) : null,
          contractType,
          hireDate: hireDate || undefined,
          location: location || undefined,
          department: department || undefined,
          primaryClientId: primaryClientId || undefined,
          jobTitle: jobTitle || undefined,
          reportsTo: reportsTo || undefined,
          contractStatus,
          terminationDate: contractStatus === 'terminated' ? terminationDate || undefined : undefined,
        })
        if (assignedClientId && assignedShiftId) {
          await createScheduleAssignment({
            clientId: assignedClientId,
            userId: editing.id,
            shiftId: assignedShiftId,
            date: assignmentDate,
            ...(normalizedStart && normalizedEnd
              ? { overrideStartTime: normalizedStart, overrideEndTime: normalizedEnd }
              : {}),
          })
        }
      }
      setModal(null)
      setClientFilter('all')
      setShiftFilter('all')
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
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80"
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
                  {emp.contractStatus && (
                    <p className="text-xs text-surface-500 mt-0.5">
                      {emp.contractType === 'contractor' ? 'Contractor' : 'Employee'}
                      {emp.harmonyId ? ` · ${emp.harmonyId}` : ''}
                      {emp.location ? ` · ${emp.location}` : ''}
                      {emp.department ? ` · ${emp.department}` : ''}
                      {emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
                      {' · '}
                      <span className={
                        emp.contractStatus === 'active' ? 'text-emerald-600' :
                        emp.contractStatus === 'terminated' ? 'text-red-600' :
                        'text-amber-600'
                      }>
                        {emp.contractStatus.charAt(0).toUpperCase() + emp.contractStatus.slice(1)}
                      </span>
                    </p>
                  )}
                  {assignmentByEmployee[emp.id] ? (
                    <p className="text-xs text-brand-600 mt-0.5 truncate">
                      {assignmentByEmployee[emp.id].clientName} · {assignmentByEmployee[emp.id].shiftName} ({formatShiftTimeRange(assignmentByEmployee[emp.id].shiftStart, assignmentByEmployee[emp.id].shiftEnd)}) · {assignmentByEmployee[emp.id].date}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-surface-500">
            Showing {pageStart + 1}-{Math.min(pageStart + EMPLOYEES_PER_PAGE, filteredEmployees.length)} of {filteredEmployees.length}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="btn-secondary rounded-xl min-h-[2.5rem] px-3 disabled:opacity-50 flex-1 sm:flex-none"
            >
              Previous
            </button>
            <span className="text-xs sm:text-sm text-surface-600 min-w-[80px] text-center flex-none">
              Page {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="btn-secondary rounded-xl min-h-[2.5rem] px-3 disabled:opacity-50 flex-1 sm:flex-none"
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
              {/* Engagement Details Section */}
              <div className="border-t border-surface-200 pt-4 mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-3">Engagement Details</p>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">CMID</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="input w-full rounded-xl min-h-[2.75rem]"
                        value={cmid}
                        onChange={(e) => setCmid(e.target.value)}
                        placeholder="e.g. 1001"
                      />
                    </div>
                    <div>
                      <label className="label">Harmony ID</label>
                      <input
                        type="text"
                        className="input w-full rounded-xl min-h-[2.75rem] bg-surface-50 text-surface-500"
                        value={cmid ? `HRM-${cmid.padStart(5, '0')}` : ''}
                        readOnly
                        disabled
                        placeholder="Auto-calculated from CMID"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Contract Type</label>
                      <AdminSelect
                        value={contractType}
                        onChange={(val) => setContractType(val)}
                        options={contractTypeOptions}
                      />
                    </div>
                    <div>
                      <label className="label">Hire Date</label>
                      <input
                        type="date"
                        className="input w-full rounded-xl min-h-[2.75rem]"
                        value={hireDate}
                        onChange={(e) => setHireDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Location</label>
                      <AdminSelect
                        value={location}
                        onChange={(val) => setLocation(val)}
                        options={locationOptions}
                      />
                    </div>
                    <div>
                      <label className="label">Department</label>
                      <AdminSelect
                        value={department}
                        onChange={(val) => setDepartment(val)}
                        options={departmentOptions}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Primary Account</label>
                    <AdminSelect
                      value={primaryClientId}
                      onChange={(val) => setPrimaryClientId(val)}
                      options={[
                        { value: '', label: 'Select client' },
                        ...clients.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Job Title</label>
                      <AdminSelect
                        value={jobTitle}
                        onChange={(val) => setJobTitle(val)}
                        options={jobTitleOptions}
                      />
                    </div>
                    <div>
                      <label className="label">Reports To</label>
                      <AdminSelect
                        value={reportsTo}
                        onChange={(val) => setReportsTo(val)}
                        options={[
                          { value: '', label: 'Select supervisor' },
                          ...employees.filter((e) => e.id !== editing?.id).map((e) => ({ value: e.id, label: e.name })),
                        ]}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Contract Status</label>
                    <AdminSelect
                      value={contractStatus}
                      onChange={(val) => {
                        setContractStatus(val)
                        if (val !== 'terminated') setTerminationDate('')
                      }}
                      options={contractStatusOptions}
                    />
                  </div>
                  {contractStatus === 'terminated' && (
                    <div>
                      <label className="label">Termination Date</label>
                      <input
                        type="date"
                        className="input w-full rounded-xl min-h-[2.75rem]"
                        value={terminationDate}
                        onChange={(e) => setTerminationDate(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
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
                      onChange={handleAssignedShiftChange}
                      options={[
                        { value: '', label: assignedClientId ? 'Select shift' : 'Select client first' },
                        ...shifts.map((shift) => ({ value: shift.id, label: shift.name })),
                      ]}
                      disabled={!assignedClientId}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Shift start time</label>
                      <input
                        type="time"
                        className="input w-full rounded-xl min-h-[2.75rem]"
                        value={assignmentStartTime}
                        onChange={(e) => setAssignmentStartTime(e.target.value)}
                        disabled={!assignedShiftId}
                      />
                    </div>
                    <div>
                      <label className="label">Shift end time</label>
                      <input
                        type="time"
                        className="input w-full rounded-xl min-h-[2.75rem]"
                        value={assignmentEndTime}
                        onChange={(e) => setAssignmentEndTime(e.target.value)}
                        disabled={!assignedShiftId}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Assignment date</label>
                    <AdminDatePicker value={assignmentDate} onChange={setAssignmentDate} />
                  </div>
                </>
              )}
            </div>
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 justify-end">
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
