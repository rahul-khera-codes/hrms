import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Clock, CalendarDays, LogOut, PanelLeftClose, PanelLeft, CalendarCheck2, Calendar, FileText } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Navbar } from '@/components/Navbar'
import ThemeToggle from '@/components/ThemeToggle'
import clsx from 'clsx'

// Sidebar order per 18MAY2026 client feedback: no Dashboard tab, My Payroll before Payroll Calendar
const nav = [
  { to: '/dashboard/sessions', label: 'My Attendance', icon: Clock },
  { to: '/dashboard/schedule', label: 'My Schedule', icon: CalendarDays },
  { to: '/dashboard/leave', label: 'My Leaves', icon: CalendarCheck2 },
  { to: '/dashboard/payroll', label: 'My Payroll', icon: FileText },
  { to: '/dashboard/payroll-calendar', label: 'Payroll Calendar', icon: Calendar },
]

export default function EmployeeLayout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="h-screen overflow-hidden bg-surface-50 dark:bg-surface-900 dark:bg-surface-950 flex flex-col">
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
            'border-r border-surface-200/70 dark:border-surface-800 bg-white dark:bg-surface-900 brand-sidebar-accent flex flex-col shrink-0 transition-[width,transform] duration-200 overflow-hidden z-50',
            'fixed inset-y-0 left-0 w-64 shadow-xl -translate-x-full md:relative md:shadow-none md:translate-x-0',
            mobileMenuOpen && 'translate-x-0',
            collapsed && 'md:w-[4.5rem]',
            !collapsed && 'md:w-60'
          )}
        >
          <div className={clsx('border-b border-surface-100 dark:border-surface-800 flex items-center', collapsed ? 'p-3 justify-center' : 'px-5 py-4')}>
            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="p-1.5 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:text-surface-200 dark:hover:bg-surface-800 dark:hover:text-surface-200 transition-colors"
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
                    <h1 className="text-sm font-semibold text-surface-900 dark:text-surface-50 tracking-tight leading-tight font-display">HARMONY</h1>
                    <p className="text-[10px] text-brand-700 dark:text-brand-400 uppercase tracking-wider font-medium">Employee</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="ml-auto p-1.5 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:text-surface-200 dark:hover:bg-surface-800 dark:hover:text-surface-200 transition-colors"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <nav className={clsx('flex-1 overflow-y-auto overflow-x-hidden', collapsed ? 'p-2' : 'p-3')}>
            <div className={clsx('flex flex-col gap-0.5', collapsed && 'items-center')}>
              {nav.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/dashboard'}
                  onClick={() => { if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileMenuOpen(false) }}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-lg text-sm font-medium transition-all relative',
                      collapsed ? 'p-2.5 justify-center' : 'gap-3 px-3 py-2',
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 shadow-[inset_0_0_0_1px_rgb(153_246_224_/_0.6)] dark:shadow-[inset_0_0_0_1px_rgb(17_94_89_/_0.6)]'
                        : 'text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-50'
                    )
                  }
                  title={collapsed ? label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && !collapsed && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-600 rounded-r-full" />
                      )}
                      <Icon className={clsx('w-4 h-4 shrink-0', isActive ? 'text-brand-600 dark:text-brand-300' : '')} />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className={clsx('border-t border-surface-100 dark:border-surface-800 p-3', collapsed && 'flex flex-col items-center')}>
            <div className={clsx('rounded-xl bg-surface-50 dark:bg-surface-900 dark:bg-surface-800 flex items-center', collapsed ? 'p-1.5 justify-center' : 'gap-2.5 px-2 py-2')}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-semibold shrink-0 shadow-sm">
                {user?.name?.charAt(0)?.toUpperCase() ?? 'E'}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-surface-900 dark:text-surface-50 truncate">{user?.name}</p>
                  <p className="text-[10px] text-surface-500 dark:text-surface-400 dark:text-surface-500 truncate">{user?.email}</p>
                </div>
              )}
            </div>
            <div className={clsx('mt-1 flex', collapsed ? 'flex-col items-center gap-1' : 'items-center gap-1')}>
              <ThemeToggle className={collapsed ? '' : 'shrink-0'} />
              <button
                type="button"
                onClick={logout}
                className={clsx(
                  'rounded-lg text-sm font-medium text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-300 transition-colors flex items-center',
                  collapsed ? 'p-2.5 justify-center w-full' : 'gap-3 px-3 py-2 flex-1'
                )}
                title={collapsed ? 'Sign out' : undefined}
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {!collapsed && 'Sign out'}
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="mx-auto px-3 sm:px-5 md:px-6 lg:px-8 py-4 sm:py-5 md:py-6 lg:py-7">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden inline-flex items-center gap-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-medium text-surface-700 dark:text-surface-200 mb-4 shadow-sm"
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
