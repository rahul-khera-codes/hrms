import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Clock, LogOut, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import clsx from 'clsx'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/sessions', label: 'My Sessions', icon: Clock },
]

export default function EmployeeLayout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Backdrop: only on small screens when sidebar is expanded */}
      {!collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="fixed inset-0 z-40 bg-surface-900/50 md:hidden"
          aria-label="Close sidebar"
        />
      )}
      <aside
        className={clsx(
          'border-r border-surface-200 bg-white flex flex-col shrink-0 transition-[width,transform] duration-200 overflow-hidden z-50',
          'md:relative md:z-auto',
          collapsed ? 'w-[4.5rem]' : 'w-64 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-xl max-md:w-64'
        )}
      >
        <div className={clsx('border-b border-surface-100 flex items-center', collapsed ? 'p-3 justify-center' : 'p-4 sm:p-6')}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
              title="Expand sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-semibold text-surface-900 tracking-tight">TimeTrack</h1>
                <p className="text-xs text-surface-500 mt-0.5">Clock-in &amp; hours</p>
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="ml-auto p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
        <nav className={clsx('flex-1 p-3 overflow-y-auto', collapsed && 'flex flex-col items-center gap-1')}>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              onClick={() => { if (typeof window !== 'undefined' && window.innerWidth < 768) setCollapsed(true) }}
              className={({ isActive }) =>
                clsx(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'p-2.5 justify-center' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                )
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className={clsx('p-3 border-t border-surface-100', collapsed && 'flex flex-col items-center')}>
          <div className={clsx('rounded-lg bg-surface-50 flex items-center', collapsed ? 'p-2 justify-center' : 'gap-3 px-3 py-2')}>
            <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-semibold shrink-0">
              {user?.name?.charAt(0) ?? 'E'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-surface-900 truncate">{user?.name}</p>
                <p className="text-xs text-surface-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            className={clsx(
              'w-full rounded-lg text-sm font-medium text-surface-600 hover:bg-surface-50 hover:text-surface-900 mt-1 transition-colors flex items-center',
              collapsed ? 'p-2.5 justify-center' : 'gap-3 px-3 py-2.5'
            )}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
