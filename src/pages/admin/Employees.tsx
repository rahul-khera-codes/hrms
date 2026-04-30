import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Users, Plus, Pencil, LayoutGrid, Table2, Search, Download, ArrowUp, ArrowDown, Filter, AlertCircle, CheckCircle2, Ban, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DetailModalHeader } from '@/components/DetailModalHeader'
import { statusBadgeClass } from '@/lib/badges'
import { SkeletonTableRows } from '@/components/Skeleton'
import { BulkActionBar } from '@/components/BulkActionBar'
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
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)
  const [activeEmployees, setActiveEmployees] = useState<Set<string>>(new Set())
  // Bulk selection state (table view only)
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  function clearEmpSelection() { setSelectedEmpIds(new Set()) }
  function toggleEmpSelect(id: string) {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
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
  const [bank, setBank] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [governmentId, setGovernmentId] = useState('')
  const [gender, setGender] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [personalEmail, setPersonalEmail] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [homePhone, setHomePhone] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [terminationReason, setTerminationReason] = useState('')
  // payMethod removed from employee form — it's per payroll cycle now

  const contractTypeOptions = [
    { value: 'Employee (I)', label: 'Employee (I)' },
    { value: 'Employee (T)', label: 'Employee (T)' },
    { value: 'Contractor', label: 'Contractor' },
    { value: 'Intern', label: 'Intern' },
  ]

  const locationOptions = [
    { value: '', label: 'Select location' },
    { value: 'SD1', label: 'SD1' },
    { value: 'SD2', label: 'SD2' },
  ]

  const departmentOptions = [
    { value: '', label: 'Select department' },
    { value: 'Operations', label: 'Operations' },
    { value: 'Client Services', label: 'Client Services' },
    { value: 'Quality Assurance (QA)', label: 'Quality Assurance (QA)' },
    { value: 'Training & Development', label: 'Training & Development' },
    { value: 'Workforce Management (WFM)', label: 'Workforce Management (WFM)' },
    { value: 'Human Resources (HR)', label: 'Human Resources (HR)' },
    { value: 'Recruitment', label: 'Recruitment' },
    { value: 'Information Technology (IT)', label: 'Information Technology (IT)' },
    { value: 'Facilities/Administration', label: 'Facilities/Administration' },
    { value: 'Finance & Accounting', label: 'Finance & Accounting' },
    { value: 'Business Intelligence', label: 'Business Intelligence' },
    { value: 'Business Development', label: 'Business Development' },
    { value: 'Marketing', label: 'Marketing' },
    { value: 'Other', label: 'Other' },
  ]

  const jobTitleOptions = [
    { value: '', label: 'Select job title' },
    { value: 'Cust. Support Specialist', label: 'Cust. Support Specialist' },
    { value: 'Cust. Support Specialist (Sr)', label: 'Cust. Support Specialist (Sr)' },
    { value: 'Tech Support Specialist', label: 'Tech Support Specialist' },
    { value: 'Tech Support Specialist (Sr)', label: 'Tech Support Specialist (Sr)' },
    { value: 'Sales Support Specialist', label: 'Sales Support Specialist' },
    { value: 'Sales Support Specialist (Sr)', label: 'Sales Support Specialist (Sr)' },
    { value: 'Team Supervisor', label: 'Team Supervisor' },
    { value: 'Team Supervisor (Asst)', label: 'Team Supervisor (Asst)' },
    { value: 'Team Supervisor (Sr)', label: 'Team Supervisor (Sr)' },
    { value: 'Account Manager', label: 'Account Manager' },
    { value: 'Account Manager (Sr)', label: 'Account Manager (Sr)' },
    { value: 'Operations Manager', label: 'Operations Manager' },
    { value: 'Operations Manager (Sr)', label: 'Operations Manager (Sr)' },
    { value: 'OX Coordinator', label: 'OX Coordinator' },
    { value: 'QA Specialist', label: 'QA Specialist' },
    { value: 'Trainer', label: 'Trainer' },
    { value: 'Recruiter', label: 'Recruiter' },
    { value: 'Recruiting Coordinator', label: 'Recruiting Coordinator' },
    { value: 'WFM Specialist', label: 'WFM Specialist' },
    { value: 'HR Coordinator', label: 'HR Coordinator' },
    { value: 'Reporting Specialist', label: 'Reporting Specialist' },
    { value: 'Receptionist', label: 'Receptionist' },
    { value: 'IT Specialist', label: 'IT Specialist' },
    { value: 'Finance Coordinator', label: 'Finance Coordinator' },
    { value: 'Administrative Assistant', label: 'Administrative Assistant' },
    { value: 'Driver', label: 'Driver' },
    { value: 'Site Manager', label: 'Site Manager' },
    { value: 'Janitorial Support', label: 'Janitorial Support' },
  ]

  const contractStatusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'onboarding', label: 'Onboarding' },
    { value: 'prenotice', label: 'Prenotice' },
    { value: 'terminated', label: 'Terminated' },
    { value: 'suspended', label: 'Suspended' },
  ]

  const terminationReasonOptions = [
    { value: '', label: 'Select reason' },
    { value: 'V-Career Change', label: 'V-Career Change' },
    { value: 'V-Dsat with Growth Opportunities', label: 'V-Dsat with Growth Opportunities' },
    { value: 'V-Dsat with Compensation/Benefits', label: 'V-Dsat with Compensation/Benefits' },
    { value: 'V-Dsat with Management/Leadership', label: 'V-Dsat with Management/Leadership' },
    { value: 'V-Dsat with Policy/Process Change', label: 'V-Dsat with Policy/Process Change' },
    { value: 'V-Dsat with Primary Account Change', label: 'V-Dsat with Primary Account Change' },
    { value: 'V-Dsat with Team/Supervisor Change', label: 'V-Dsat with Team/Supervisor Change' },
    { value: 'V-Dsat with Work Mode Change', label: 'V-Dsat with Work Mode Change' },
    { value: 'V-Dsat with Relocation', label: 'V-Dsat with Relocation' },
    { value: 'V-Dsat with Job Duties', label: 'V-Dsat with Job Duties' },
    { value: 'V-Dsat with Schedule', label: 'V-Dsat with Schedule' },
    { value: 'V-Dsat with Work-Life Balance', label: 'V-Dsat with Work-Life Balance' },
    { value: 'V-Dsat with Workplace Environment', label: 'V-Dsat with Workplace Environment' },
    { value: 'V-Another Job Offer BPO Industry', label: 'V-Another Job Offer BPO Industry' },
    { value: 'V-Another Job Offer Different Industry', label: 'V-Another Job Offer Different Industry' },
    { value: 'V-Another Job Offer Summer Work', label: 'V-Another Job Offer Summer Work' },
    { value: 'V-Medical Reasons', label: 'V-Medical Reasons' },
    { value: 'V-Military Service/Deployment', label: 'V-Military Service/Deployment' },
    { value: 'V-Personal Reasons', label: 'V-Personal Reasons' },
    { value: 'V-Relocating Out of Country', label: 'V-Relocating Out of Country' },
    { value: 'V-Relocating Within Country', label: 'V-Relocating Within Country' },
    { value: 'V-Retirement', label: 'V-Retirement' },
    { value: 'V-School/Education Reasons', label: 'V-School/Education Reasons' },
    { value: 'V-Other', label: 'V-Other' },
    { value: 'I-Attendance Policy Violation', label: 'I-Attendance Policy Violation' },
    { value: 'I-Breach of Confidentiality', label: 'I-Breach of Confidentiality' },
    { value: 'I-Contract Expired (Non-Renewal)', label: 'I-Contract Expired (Non-Renewal)' },
    { value: 'I-Customer Abuse', label: 'I-Customer Abuse' },
    { value: 'I-Data Privacy Violation', label: 'I-Data Privacy Violation' },
    { value: 'I-Deceased', label: 'I-Deceased' },
    { value: 'I-Destruction of Company Property', label: 'I-Destruction of Company Property' },
    { value: 'I-Discriminatory Behavior', label: 'I-Discriminatory Behavior' },
    { value: 'I-Electronic Security Violation', label: 'I-Electronic Security Violation' },
    { value: 'I-End of Seasonal/Temporary Assignment', label: 'I-End of Seasonal/Temporary Assignment' },
    { value: 'I-Failure to Pass New Hire Training', label: 'I-Failure to Pass New Hire Training' },
    { value: 'I-Failure to Pass Screening', label: 'I-Failure to Pass Screening' },
    { value: 'I-Falsification of Records/Information', label: 'I-Falsification of Records/Information' },
    { value: 'I-Fraud', label: 'I-Fraud' },
    { value: 'I-Incarceration', label: 'I-Incarceration' },
    { value: 'I-Insubordination/Disrespect', label: 'I-Insubordination/Disrespect' },
    { value: 'I-Job Abandonment', label: 'I-Job Abandonment' },
    { value: 'I-Loss of Client/Contract', label: 'I-Loss of Client/Contract' },
    { value: 'I-Loss of Required License/Certification', label: 'I-Loss of Required License/Certification' },
    { value: 'I-Medical Unfit for Duty', label: 'I-Medical Unfit for Duty' },
    { value: 'I-Physical Security Violation', label: 'I-Physical Security Violation' },
    { value: 'I-Poor Performance', label: 'I-Poor Performance' },
    { value: 'I-Reduction in Force/Restructuring', label: 'I-Reduction in Force/Restructuring' },
    { value: 'I-Refused to Comply with Work Mode Change', label: 'I-Refused to Comply with Work Mode Change' },
    { value: 'I-Sexual Harassment', label: 'I-Sexual Harassment' },
    { value: 'I-Theft', label: 'I-Theft' },
    { value: 'I-Work Avoidance', label: 'I-Work Avoidance' },
    { value: 'I-Working Under the Influence (WUI)', label: 'I-Working Under the Influence (WUI)' },
    { value: 'I-Workplace Violence/Aggression', label: 'I-Workplace Violence/Aggression' },
    { value: 'I-Other', label: 'I-Other' },
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

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((emp) => {
      const assignment = assignmentByEmployee[emp.id]
      const clientMatch = clientFilter === 'all' || assignment?.clientId === clientFilter
      const shiftMatch = shiftFilter === 'all' || assignment?.shiftName === shiftFilter
      const searchMatch = !q || emp.name.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q) || (emp.cmid != null && String(emp.cmid).includes(q))
      return clientMatch && shiftMatch && searchMatch
    })
  }, [employees, assignmentByEmployee, clientFilter, shiftFilter, search])

  const empColAccessor = useCallback((emp: EmployeeRecord, col: string): string | number => {
    switch (col) {
      case 'CMID': return emp.cmid ?? 0
      case 'Employee Name': return emp.name.toLowerCase()
      case 'Account': return (emp.primaryClientName ?? '').toLowerCase()
      case 'Email': return emp.email.toLowerCase()
      case 'Salary Type': return (emp.salaryType ?? '').toLowerCase()
      case 'Salary': return emp.baseSalary ?? 0
      case 'Department': return (emp.department ?? '').toLowerCase()
      case 'Job Title': return (emp.jobTitle ?? '').toLowerCase()
      case 'Contract Status': return (emp.contractStatus ?? '').toLowerCase()
      default: return ''
    }
  }, [])

  const filteredEmployees = useMemo(() => {
    let result = [...baseFiltered]
    // Per-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      result = result.filter((e) => String(empColAccessor(e, col)).toLowerCase().includes(lower))
    }
    // Sort
    if (sortCol) {
      result.sort((a, b) => {
        const aVal = empColAccessor(a, sortCol)
        const bVal = empColAccessor(b, sortCol)
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        }
        const cmp = String(aVal).localeCompare(String(bVal))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [baseFiltered, columnFilters, sortCol, sortDir, empColAccessor])

  function handleEmpSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }
  function handleEmpColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }

  function exportEmployeesCSV() {
    if (!filteredEmployees.length) return
    const headers = ['CMID', 'Employee Name', 'Account', 'Email', 'Salary Type', 'Salary', 'Department', 'Job Title', 'Contract Status']
    const rows = filteredEmployees.map((e) => [
      e.cmid != null ? String(e.cmid) : '',
      e.name,
      e.primaryClientName ?? '',
      e.email,
      e.salaryType ?? '',
      e.baseSalary != null ? String(e.baseSalary) : '',
      e.department ?? '',
      e.jobTitle ?? '',
      e.contractStatus ?? '',
    ])
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
    setBank('')
    setBankAccount('')
    setGovernmentId('')
    setGender('')
    setDateOfBirth('')
    setPersonalEmail('')
    setCompanyEmail('')
    setHomePhone('')
    setMobilePhone('')
    setTerminationReason('')
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
    setBank(emp.bank || '')
    setBankAccount(emp.bankAccount || '')
    setGovernmentId(emp.governmentId || '')
    setGender(emp.gender || '')
    setDateOfBirth(emp.dateOfBirth || '')
    setPersonalEmail(emp.personalEmail || '')
    setCompanyEmail(emp.companyEmail || '')
    setHomePhone(emp.homePhone || '')
    setMobilePhone(emp.mobilePhone || '')
    setTerminationReason(emp.terminationReason || '')
    setModal('edit')
  }

  async function bulkSetContractStatus(nextStatus: 'active' | 'inactive') {
    if (selectedEmpIds.size === 0) return
    setBulkSaving(true)
    let ok = 0
    let failed = 0
    for (const id of Array.from(selectedEmpIds)) {
      try {
        await updateEmployee(id, { contractStatus: nextStatus })
        ok++
      } catch {
        failed++
      }
    }
    setBulkSaving(false)
    setError(failed === 0 ? null : `${ok} updated, ${failed} failed.`)
    clearEmpSelection()
    await load()
  }

  async function handleSave() {
    const trimmedName = name.trim()
    // Company email is the login email
    const trimmedEmail = (companyEmail || email).trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }
    if (!trimmedEmail) {
      setError('Company email is required (used as login)')
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
          terminationDate: (contractStatus === 'terminated' || contractStatus === 'prenotice') ? terminationDate || undefined : undefined,
          terminationReason: (contractStatus === 'terminated' || contractStatus === 'prenotice') ? terminationReason || undefined : undefined,
          bank: bank || undefined,
          bankAccount: bankAccount || undefined,
          governmentId: governmentId || undefined,
          gender: gender || undefined,
          dateOfBirth: dateOfBirth || undefined,
          personalEmail: personalEmail || undefined,
          companyEmail: companyEmail || undefined,
          homePhone: homePhone || undefined,
          mobilePhone: mobilePhone || undefined,
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
          terminationDate: (contractStatus === 'terminated' || contractStatus === 'prenotice') ? terminationDate || undefined : undefined,
          terminationReason: (contractStatus === 'terminated' || contractStatus === 'prenotice') ? terminationReason || undefined : undefined,
          bank: bank || undefined,
          bankAccount: bankAccount || undefined,
          governmentId: governmentId || undefined,
          gender: gender || undefined,
          dateOfBirth: dateOfBirth || undefined,
          personalEmail: personalEmail || undefined,
          companyEmail: companyEmail || undefined,
          homePhone: homePhone || undefined,
          mobilePhone: mobilePhone || undefined,
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
      <div className="page">
        <PageHeader title="Employees" subtitle="Manage employees. Payroll uses this list." icon={<Users className="w-5 h-5" />} />
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scroll-fade-x">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-50">
                <tr>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <th key={i} className="px-3 py-2.5 text-[10px] uppercase tracking-wider whitespace-nowrap border-b border-surface-200">
                      <span className="inline-block bg-surface-200/70 rounded animate-pulse h-3 w-16" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SkeletonTableRows rows={6} cols={6} />
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
        title="Employees"
        subtitle="Manage employees. Add and edit staff here; payroll uses this list."
        icon={<Users className="w-5 h-5" />}
        actions={
          <>
            <button
              type="button"
              onClick={exportEmployeesCSV}
              disabled={filteredEmployees.length === 0}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={(e) => { e.currentTarget.blur(); openAdd() }}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              Add employee
            </button>
          </>
        }
      />

      {error && (
        <div className="alert-error">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
          <span className="flex-1 min-w-0 break-words">{error}</span>
        </div>
      )}

      <div className="toolbar">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 sm:items-center w-full">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
            <input
              type="text"
              placeholder="Search by name, email, or CMID"
              className="input pl-9 pr-8 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="w-full sm:w-40">
            <AdminSelect
              value={clientFilter}
              onChange={(val) => setClientFilter(val)}
              options={[
                { value: 'all', label: 'All clients' },
                ...clients.map((client) => ({ value: client.id, label: client.name })),
              ]}
            />
          </div>
          <div className="w-full sm:w-40">
            <AdminSelect
              value={shiftFilter}
              onChange={(val) => setShiftFilter(val)}
              options={[
                { value: 'all', label: 'All shifts' },
                ...uniqueShiftNames.map((shiftName) => ({ value: shiftName, label: shiftName })),
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
      </div>

      <div className="card overflow-hidden">
        {employees.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Users className="w-5 h-5" /></div>
            <p className="empty-state-title">No employees yet</p>
            <p className="empty-state-description">Add your first employee to start tracking attendance and payroll.</p>
          </div>
        ) : viewMode === 'card' && filteredEmployees.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Search className="w-5 h-5" /></div>
            <p className="empty-state-title">No matches</p>
            <p className="empty-state-description">Try adjusting your search or filters.</p>
            {Object.values(columnFilters).some(Boolean) && (
              <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setColumnFilters({}); setFilterOpen(null) }}>
                Clear column filters
              </button>
            )}
          </div>
        ) : viewMode === 'card' ? (
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
                      <span className="badge-success shrink-0" title="Currently clocked in">
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
        ) : (
          <div className="overflow-x-auto scroll-fade-x">
            <table className="min-w-[1200px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-3 py-1.5 w-10 border-b border-surface-200">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      className="w-3.5 h-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      checked={paginatedEmployees.length > 0 && paginatedEmployees.every((e) => selectedEmpIds.has(e.id))}
                      ref={(el) => {
                        if (!el) return
                        const total = paginatedEmployees.length
                        const sel = paginatedEmployees.filter((e) => selectedEmpIds.has(e.id)).length
                        el.indeterminate = sel > 0 && sel < total
                      }}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedEmpIds(new Set(paginatedEmployees.map((emp) => emp.id)))
                        else clearEmpSelection()
                      }}
                    />
                  </th>
                  {['CMID', 'Employee Name', 'Account', 'Email', 'Department', 'Job Title', 'Salary Type', 'Salary', 'Contract Status', 'Actions'].map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${col === 'Actions' ? 'text-right' : col === 'Salary' ? 'text-right' : ''}`}
                    >
                      {col === 'Actions' ? col : (
                        <>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              className="flex items-center gap-0.5 hover:text-surface-700 transition-colors"
                              onClick={() => handleEmpSort(col)}
                            >
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
                            <div className="mt-1 relative" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={columnFilters[col] ?? ''}
                                onChange={(e) => handleEmpColumnFilter(col, e.target.value)}
                                placeholder={`Filter ${col}...`}
                                className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 pr-5 bg-white focus:ring-1 focus:ring-brand-300 outline-none"
                                autoFocus
                              />
                              {columnFilters[col] && (
                                <button
                                  type="button"
                                  onClick={() => handleEmpColumnFilter(col, '')}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-surface-400 hover:text-surface-700"
                                  aria-label="Clear filter"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-surface-400 mb-3">
                          <Search className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium text-surface-700">No matches</p>
                        <p className="text-xs text-surface-500 mt-1">Try adjusting your search or column filters.</p>
                        {Object.values(columnFilters).some(Boolean) && (
                          <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setColumnFilters({}); setFilterOpen(null) }}>
                            Clear column filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {paginatedEmployees.map((emp) => (
                  <tr key={emp.id} className={`border-b border-surface-100 hover:bg-brand-50/40 transition-colors cursor-pointer ${selectedEmpIds.has(emp.id) ? 'bg-brand-50/30' : ''}`} onClick={() => openEdit(emp)}>
                    <td className="px-3 py-2.5 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${emp.name}`}
                        className="w-3.5 h-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        checked={selectedEmpIds.has(emp.id)}
                        onChange={() => toggleEmpSelect(emp.id)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{emp.cmid ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {emp.name}
                        {activeEmployees.has(emp.id) && (
                          <span className="badge-success text-[9px] py-0" title="Currently clocked in">Active</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-surface-700 whitespace-nowrap">{emp.primaryClientName ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap max-w-[200px] truncate">{emp.email}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{emp.department ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{emp.jobTitle ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-700 whitespace-nowrap capitalize">{emp.salaryType ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right font-medium">
                      {emp.salaryType === 'monthly' ? emp.baseSalary.toLocaleString() : emp.baseSalary.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {emp.contractStatus ? (
                        <span className={`${statusBadgeClass(emp.contractStatus)} capitalize`}>
                          {emp.contractStatus}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => openEdit(emp)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              className="btn-secondary btn-sm flex-1 sm:flex-none"
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
              className="btn-secondary btn-sm flex-1 sm:flex-none"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <BulkActionBar count={selectedEmpIds.size} onClear={clearEmpSelection}>
        <button
          type="button"
          onClick={() => void bulkSetContractStatus('active')}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Mark selected employees Active"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Activate</span>
        </button>
        <button
          type="button"
          onClick={() => void bulkSetContractStatus('inactive')}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Mark selected employees Inactive"
        >
          <Ban className="w-3.5 h-3.5 text-amber-600" />
          <span className="hidden sm:inline">Deactivate</span>
        </button>
      </BulkActionBar>

      {modal && createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0" onClick={() => setModal(null)} aria-label="Close" />
          <div className="modal-frame-lg">
            {modal === 'edit' && editing ? (
              <DetailModalHeader
                employeeName={editing.name}
                cmid={editing.cmid}
                reportsTo={editing.reportsToName ?? null}
                accountName={editing.primaryClientName ?? null}
                onClose={() => setModal(null)}
              />
            ) : (
              <div className="modal-header">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="modal-title">Add employee</h2>
                    <p className="text-[11px] text-surface-500 mt-0.5">Create a new employee record.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="p-2.5 min-w-[2.75rem] min-h-[2.75rem] rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 shrink-0 transition-colors flex items-center justify-center"
                  aria-label="Close"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            )}
            <div className="modal-body">
              {/* ── PERSONAL DETAILS ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Personal Details</p>
              <div>
                <label className="label">Full Name <span className="text-red-500" aria-hidden>*</span></label>
                <input
                  type="text"
                  className="input w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <label className="label">Government ID</label>
                <input
                  type="text"
                  className="input w-full"
                  value={governmentId}
                  onChange={(e) => setGovernmentId(e.target.value)}
                  placeholder="000-0000000-0"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Date of Birth</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Gender</label>
                  <AdminSelect
                    value={gender}
                    onChange={(val) => setGender(val)}
                    options={[
                      { value: '', label: 'Select gender' },
                      { value: 'Male', label: 'Male' },
                      { value: 'Female', label: 'Female' },
                      { value: 'Non-binary', label: 'Non-binary' },
                    ]}
                  />
                </div>
              </div>

              {/* Password only — company email is the login email */}
              {modal === 'add' && (
                <div>
                  <label className="label">Password <span className="text-red-500" aria-hidden>*</span></label>
                  <input
                    type="password"
                    className="input w-full"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    required
                    minLength={6}
                  />
                </div>
              )}
              {modal === 'edit' && (
                <div>
                  <label className="label">New password (leave blank to keep)</label>
                  <input
                    type="password"
                    className="input w-full"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                </div>
              )}

              {/* ── ENGAGEMENT DETAILS ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Engagement Details</p>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">CMID</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input w-full"
                      value={cmid}
                      onChange={(e) => setCmid(e.target.value)}
                      placeholder="e.g. 1001"
                    />
                  </div>
                  <div>
                    <label className="label">Harmony ID</label>
                    <input
                      type="text"
                      className="input w-full bg-surface-50 text-surface-500"
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
                      className="input w-full"
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
              </div>

              {/* ── CONTRACT STATUS ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Contract Status</p>
              <div className="space-y-4">
                <div>
                  <label className="label">Contract Status</label>
                  <AdminSelect
                    value={contractStatus}
                    onChange={(val) => {
                      setContractStatus(val)
                      if (val !== 'terminated' && val !== 'prenotice') {
                        setTerminationDate('')
                        setTerminationReason('')
                      }
                    }}
                    options={contractStatusOptions}
                  />
                </div>
                {(contractStatus === 'terminated' || contractStatus === 'prenotice') && (
                  <>
                    <div>
                      <label className="label">Termination Date</label>
                      <input
                        type="date"
                        className="input w-full"
                        value={terminationDate}
                        onChange={(e) => setTerminationDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Termination Reason</label>
                      <AdminSelect
                        value={terminationReason}
                        onChange={(val) => setTerminationReason(val)}
                        options={terminationReasonOptions}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* ── BANK DETAILS ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Bank Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Bank</label>
                  <AdminSelect
                    value={bank}
                    onChange={setBank}
                    options={[
                      { value: '', label: 'Select bank' },
                      { value: 'Banco Popular', label: 'Banco Popular' },
                      { value: 'Banreservas', label: 'Banreservas' },
                      { value: 'BHD Leon', label: 'BHD Leon' },
                      { value: 'Scotiabank', label: 'Scotiabank' },
                      { value: 'Banco Santa Cruz', label: 'Banco Santa Cruz' },
                      { value: 'Asociacion Popular', label: 'Asociacion Popular' },
                      { value: 'Banco Promerica', label: 'Banco Promerica' },
                      { value: 'Banco Caribe', label: 'Banco Caribe' },
                      { value: 'Banco BDI', label: 'Banco BDI' },
                      { value: 'Other', label: 'Other' },
                    ]}
                  />
                </div>
                <div>
                  <label className="label">Bank Account</label>
                  <input type="text" className="input" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Account number" />
                </div>
              </div>

              {/* ── SALARY ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Salary</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Salary Type</label>
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
                  <label className="label">Salary</label>
                  <input
                    type="number"
                    min={0}
                    step={salaryType === 'monthly' ? 100 : 0.01}
                    className="input"
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                    placeholder={salaryType === 'monthly' ? 'e.g. 40000' : 'e.g. 180'}
                  />
                </div>
                <div>
                  <label className="label">Hourly Rate</label>
                  <input
                    type="text"
                    className="input bg-surface-50 text-surface-600"
                    readOnly
                    value={(() => {
                      const s = parseFloat(baseSalary) || 0
                      if (s === 0) return '$0.00'
                      const rate = salaryType === 'monthly' ? (s * 12) / 26 / 88 : s
                      return `$${rate.toFixed(4)}`
                    })()}
                  />
                  {salaryType === 'monthly' && <p className="hint">= (salary × 12) / 26 / 88</p>}
                </div>
              </div>

              {/* ── CONTACT DETAILS ── */}
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Contact Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Personal Email</label>
                  <input
                    type="email"
                    className="input w-full"
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                    placeholder="personal@example.com"
                  />
                </div>
                <div>
                  <label className="label">Company Email</label>
                  <input
                    type="email"
                    className="input w-full"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="name@company.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Home Phone</label>
                  <input
                    type="tel"
                    className="input w-full"
                    value={homePhone}
                    onChange={(e) => setHomePhone(e.target.value)}
                    placeholder="Home phone number"
                  />
                </div>
                <div>
                  <label className="label">Mobile Phone</label>
                  <input
                    type="tel"
                    className="input w-full"
                    value={mobilePhone}
                    onChange={(e) => setMobilePhone(e.target.value)}
                    placeholder="Mobile phone number"
                  />
                </div>
              </div>

              {/* ── SCHEDULE ASSIGNMENT ── */}
              {(modal === 'add' || modal === 'edit') && (
                <>
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2 pt-3 border-t border-surface-100">Schedule Assignment</p>
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
                        className="input w-full"
                        value={assignmentStartTime}
                        onChange={(e) => setAssignmentStartTime(e.target.value)}
                        disabled={!assignedShiftId}
                      />
                    </div>
                    <div>
                      <label className="label">Shift end time</label>
                      <input
                        type="time"
                        className="input w-full"
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
            <div className="modal-footer">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim() || !(companyEmail || email).trim() || (modal === 'add' && (!password || password.length < 6))}
                className="btn-primary"
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
