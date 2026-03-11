import { Clock, Moon, TrendingUp, Save, Plug } from 'lucide-react'

export default function AdminSettings() {
  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Settings</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Configure payroll rules and system options.</p>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Payroll rules</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-6">
          Define how regular, overtime, and night hours are calculated. These rules are used for payroll reports and exports.
        </p>
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80 hover:border-surface-300 transition-colors">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-surface-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Regular hours</p>
              <p className="text-xs sm:text-sm text-surface-500">Standard rate · 1.0x</p>
            </div>
            <input
              type="number"
              defaultValue="1"
              step="0.1"
              className="input w-full sm:w-20 text-center rounded-xl min-h-[2.75rem]"
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80 hover:border-surface-300 transition-colors">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Overtime</p>
              <p className="text-xs sm:text-sm text-surface-500">After 8h/day · 1.5x</p>
            </div>
            <input
              type="number"
              defaultValue="1.5"
              step="0.1"
              className="input w-full sm:w-20 text-center rounded-xl min-h-[2.75rem]"
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80 hover:border-surface-300 transition-colors">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Night shift</p>
              <p className="text-xs sm:text-sm text-surface-500">22:00 – 06:00 · 1.25x</p>
            </div>
            <input
              type="number"
              defaultValue="1.25"
              step="0.05"
              className="input w-full sm:w-20 text-center rounded-xl min-h-[2.75rem]"
            />
          </div>
        </div>
        <button type="button" className="btn-primary flex items-center justify-center gap-2 mt-4 sm:mt-6 rounded-xl w-full sm:w-auto min-h-[2.75rem]">
          <Save className="w-4 h-4 shrink-0" />
          Save rules
        </button>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start gap-3 mb-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
            <Plug className="w-5 h-5 text-surface-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900">Integrations</h2>
            <p className="text-xs sm:text-sm text-surface-500 mt-0.5">
              Connect to external payroll or accounting systems. (Coming soon.)
            </p>
          </div>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-dashed border-surface-300 bg-surface-50/50 p-6 sm:p-8 text-center text-surface-500 text-xs sm:text-sm">
          No integrations configured. API and webhook options will be available when the backend is connected.
        </div>
      </div>
    </div>
  )
}
