import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { UIPrefsProvider } from './contexts/UIPrefsContext'
import { ToastProvider } from './components/Toast'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import Landing from './pages/Landing'
import EmployeeLayout from './layouts/EmployeeLayout'
import AdminLayout from './layouts/AdminLayout'
import EmployeeSessions from './pages/employee/Sessions'
import EmployeeMySchedule from './pages/employee/MySchedule'
import EmployeeLeave from './pages/employee/Leave'
import EmployeePayrollCalendar from './pages/employee/PayrollCalendar'
import EmployeeMyPayroll from './pages/employee/MyPayroll'
import AdminAttendance from './pages/admin/Attendance'
import AdminPayroll from './pages/admin/Payroll'
import AdminReports from './pages/admin/Reports'
import AdminSettings from './pages/admin/Settings'
import AdminClients from './pages/admin/Clients'
import AdminShifts from './pages/admin/Shifts'
import AdminSchedule from './pages/admin/Schedule'
import AdminEmployees from './pages/admin/Employees'
import AdminPayrollCalendar from './pages/admin/PayrollCalendar'
import AdminPayrollInputs from './pages/admin/PayrollInputs'
import AdminLeaveRequests from './pages/admin/LeaveRequests'
import AdminBillablesCalculator from './pages/admin/BillablesCalculator'

function ProtectedEmployee({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  return <>{children}</>
}

function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-surface-500">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <UIPrefsProvider>
      <ToastProvider>
        <AuthProvider>
          <KeyboardShortcuts />
          <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/dashboard/*"
          element={
            <ProtectedEmployee>
              <EmployeeLayout />
            </ProtectedEmployee>
          }
        >
          <Route index element={<Navigate to="sessions" replace />} />
          <Route path="sessions" element={<EmployeeSessions />} />
          <Route path="schedule" element={<EmployeeMySchedule />} />
          <Route path="leave" element={<EmployeeLeave />} />
          <Route path="payroll-calendar" element={<EmployeePayrollCalendar />} />
          <Route path="payroll" element={<EmployeeMyPayroll />} />
        </Route>
        <Route
          path="/admin/*"
          element={
            <ProtectedAdmin>
              <AdminLayout />
            </ProtectedAdmin>
          }
        >
          <Route index element={<Navigate to="employees" replace />} />
          <Route path="dashboard" element={<Navigate to="/admin/employees" replace />} />
          <Route path="employees" element={<AdminEmployees />} />
          <Route path="attendance" element={<AdminAttendance />} />
          <Route path="payroll-calendar" element={<AdminPayrollCalendar />} />
          <Route path="payroll-inputs" element={<AdminPayrollInputs />} />
          <Route path="payroll" element={<AdminPayroll />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="shifts" element={<AdminShifts />} />
          <Route path="schedule" element={<AdminSchedule />} />
          <Route path="leave-requests" element={<AdminLeaveRequests />} />
          <Route path="billables" element={<AdminBillablesCalculator />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </UIPrefsProvider>
  )
}
