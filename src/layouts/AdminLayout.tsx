import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Clock,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Building2,
  CalendarDays,
  Timer,
  Users,
  Calendar,
  CalendarCheck2,
  Receipt,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Navbar } from '@/components/Navbar'
import clsx from 'clsx'

const navSections: { title?: string; items: { to: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Workforce',
    items: [
      { to: '/admin/employees', label: 'Employees', icon: Users },
      { to: '/admin/attendance', label: 'Attendance', icon: Clock },
      { to: '/admin/schedule', label: 'Schedule', icon: CalendarDays },
      { to: '/admin/leave-requests', label: 'Leaves', icon: CalendarCheck2 },
    ],
  },
  {
    title: 'Payroll',
    items: [
      { to: '/admin/payroll-calendar', label: 'Payroll calendar', icon: Calendar },
      { to: '/admin/payroll-inputs', label: 'Payroll inputs', icon: Receipt },
      { to: '/admin/payroll', label: 'Payroll', icon: FileText },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/admin/clients', label: 'Accounts', icon: Building2 },
      { to: '/admin/shifts', label: 'Shifts', icon: Timer },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="h-screen overflow-hidden bg-surface-50 flex flex-col">
      <Navbar />
      <div className="flex-1 min-w-0 flex overflow-hidden">
        {mobileMenuOpen && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-surface-900/50 backdrop-blur-sm md:hidden"
            aria-label="Close sidebar"
          />
        )}
        <aside
          className={clsx(
            'border-r border-surface-200/70 bg-white brand-sidebar-accent flex flex-col shrink-0 transition-[width,transform] duration-200 overflow-hidden z-50',
            'fixed inset-y-0 left-0 w-64 shadow-xl -translate-x-full md:relative md:shadow-none md:translate-x-0',
            mobileMenuOpen && 'translate-x-0',
            collapsed && 'md:w-[4.5rem]',
            !collapsed && 'md:w-60'
          )}
        >
          <div className={clsx('border-b border-surface-100 flex items-center', collapsed ? 'p-3 justify-center' : 'px-5 py-4')}>
            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors"
                title="Expand sidebar"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-sm font-semibold text-surface-900 tracking-tight leading-tight font-display">HARMONY</h1>
                    <p className="text-[10px] text-brand-700 uppercase tracking-wider font-medium">Admin</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="ml-auto p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <nav className={clsx('flex-1 overflow-y-auto overflow-x-hidden', collapsed ? 'p-2' : 'p-3')}>
            {navSections.map((section, idx) => (
              <div key={idx} className={clsx(idx > 0 && (collapsed ? 'mt-3 pt-3 border-t border-surface-100' : 'mt-4'))}>
                {!collapsed && section.title && (
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1.5 px-3">
                    {section.title}
                  </p>
                )}
                <div className={clsx('flex flex-col gap-0.5', collapsed && 'items-center')}>
                  {section.items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/admin/dashboard'}
                      onClick={() => { if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileMenuOpen(false) }}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center rounded-lg text-sm font-medium transition-all group relative',
                          collapsed ? 'p-2.5 justify-center' : 'gap-3 px-3 py-2',
                          isActive
                            ? 'bg-brand-50 text-brand-700 shadow-[inset_0_0_0_1px_rgb(153_246_224_/_0.6)]'
                            : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                        )
                      }
                      title={collapsed ? label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && !collapsed && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-600 rounded-r-full" />
                          )}
                          <Icon className={clsx('w-4 h-4 shrink-0', isActive ? 'text-brand-600' : '')} />
                          {!collapsed && <span className="truncate">{label}</span>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className={clsx('border-t border-surface-100 p-3', collapsed && 'flex flex-col items-center')}>
            <div className={clsx('rounded-xl bg-surface-50 flex items-center', collapsed ? 'p-1.5 justify-center' : 'gap-2.5 px-2 py-2')}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-semibold shrink-0 shadow-sm">
                {user?.name?.charAt(0)?.toUpperCase() ?? 'A'}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-surface-900 truncate">{user?.name}</p>
                  <p className="text-[10px] text-surface-500 truncate">{user?.email}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={logout}
              className={clsx(
                'w-full rounded-lg text-sm font-medium text-surface-500 hover:bg-red-50 hover:text-red-600 mt-1 transition-colors flex items-center',
                collapsed ? 'p-2.5 justify-center' : 'gap-3 px-3 py-2'
              )}
              title={collapsed ? 'Sign out' : undefined}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && 'Sign out'}
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="max-w-7xl mx-auto px-3 sm:px-5 md:px-6 lg:px-8 py-4 sm:py-5 md:py-6 lg:py-7">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-surface-700 mb-4 shadow-sm"
            >
              <PanelLeft className="w-4 h-4" />
              Menu
            </button>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
