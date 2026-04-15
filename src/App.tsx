import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Landing from './pages/Landing'
import EmployeeLayout from './layouts/EmployeeLayout'
import AdminLayout from './layouts/AdminLayout'
import EmployeeDashboard from './pages/employee/Dashboard'
import EmployeeSessions from './pages/employee/Sessions'
import EmployeeMySchedule from './pages/employee/MySchedule'
import EmployeeLeave from './pages/employee/Leave'
import AdminDashboard from './pages/admin/Dashboard'
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
    <AuthProvider>
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
          <Route index element={<EmployeeDashboard />} />
          <Route path="sessions" element={<EmployeeSessions />} />
          <Route path="schedule" element={<EmployeeMySchedule />} />
          <Route path="leave" element={<EmployeeLeave />} />
        </Route>
        <Route
          path="/admin/*"
          element={
            <ProtectedAdmin>
              <AdminLayout />
            </ProtectedAdmin>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
