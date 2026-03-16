import { useState, useEffect } from 'react'
import { Clock, Moon, TrendingUp, Save, Plug, Calendar } from 'lucide-react'
import { getSettings, updateSettings } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'

function formatHour(h: number) {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

export default function AdminSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [workingDaysPerMonth, setWorkingDaysPerMonth] = useState('23.83')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [otMultiplier, setOtMultiplier] = useState('1.35')
  const [nightMultiplier, setNightMultiplier] = useState('1.15')
  const [nightShiftStartHour, setNightShiftStartHour] = useState(21)
  const [nightShiftEndHour, setNightShiftEndHour] = useState(7)

  useEffect(() => {
    let cancelled = false
    setError(null)
    getSettings()
      .then((data) => {
        if (cancelled) return
        setWorkingDaysPerMonth(String(data.workingDaysPerMonth))
        setHoursPerDay(String(data.hoursPerDay))
        setOtMultiplier(String(data.otMultiplier))
        setNightMultiplier(String(data.nightMultiplier))
        setNightShiftStartHour(data.nightShiftStartHour)
        setNightShiftEndHour(data.nightShiftEndHour)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load settings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    setError(null)
    setSuccess(false)
    const wd = parseFloat(workingDaysPerMonth)
    const hd = parseFloat(hoursPerDay)
    const ot = parseFloat(otMultiplier)
    const night = parseFloat(nightMultiplier)
    if (Number.isNaN(wd) || wd <= 0 || Number.isNaN(hd) || hd <= 0 || Number.isNaN(ot) || ot < 1 || Number.isNaN(night) || night < 1) {
      setError('Please enter valid numbers (working days & hours > 0, multipliers ≥ 1).')
      return
    }
    setSaving(true)
    try {
      await updateSettings({
        workingDaysPerMonth: wd,
        hoursPerDay: hd,
        otMultiplier: ot,
        nightMultiplier: night,
        nightShiftStartHour,
        nightShiftEndHour,
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 overflow-x-hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Settings</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Configure payroll rules and system options.</p>
        </div>
        <div className="rounded-xl border border-surface-200/80 bg-white p-6 shadow-sm text-surface-500 text-sm">
          Loading settings…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Settings</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Configure payroll rules and system options.</p>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Payroll rules</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-6">
          Define how regular, overtime, and night hours are calculated. Used for payroll and for converting monthly salary to hourly.
        </p>
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-surface-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Working days per month</p>
              <p className="text-xs sm:text-sm text-surface-500">Used for monthly → hourly rate (e.g. 23.83)</p>
            </div>
            <input
              type="number"
              min={0.1}
              step={0.01}
              className="input w-full sm:w-24 text-center rounded-xl min-h-[2.75rem]"
              value={workingDaysPerMonth}
              onChange={(e) => setWorkingDaysPerMonth(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-surface-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Hours per day</p>
              <p className="text-xs sm:text-sm text-surface-500">Standard workday length (e.g. 8)</p>
            </div>
            <input
              type="number"
              min={0.1}
              step={0.5}
              className="input w-full sm:w-24 text-center rounded-xl min-h-[2.75rem]"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Overtime multiplier</p>
              <p className="text-xs sm:text-sm text-surface-500">Pay rate for OT (e.g. 1.35 = 35% extra)</p>
            </div>
            <input
              type="number"
              min={1}
              step={0.05}
              className="input w-full sm:w-24 text-center rounded-xl min-h-[2.75rem]"
              value={otMultiplier}
              onChange={(e) => setOtMultiplier(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Night differential multiplier</p>
              <p className="text-xs sm:text-sm text-surface-500">Pay rate for night hours (e.g. 1.15 = 15% extra)</p>
            </div>
            <input
              type="number"
              min={1}
              step={0.05}
              className="input w-full sm:w-24 text-center rounded-xl min-h-[2.75rem]"
              value={nightMultiplier}
              onChange={(e) => setNightMultiplier(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="flex flex-col gap-2">
              <label className="label">Night shift start (hour, 0–23)</label>
              <AdminSelect
                value={String(nightShiftStartHour)}
                onChange={(val) => setNightShiftStartHour(parseInt(val, 10))}
                options={Array.from({ length: 24 }, (_, i) => ({
                  value: String(i),
                  label: formatHour(i),
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="label">Night shift end (hour, 0–23)</label>
              <AdminSelect
                value={String(nightShiftEndHour)}
                onChange={(val) => setNightShiftEndHour(parseInt(val, 10))}
                options={Array.from({ length: 24 }, (_, i) => ({
                  value: String(i),
                  label: formatHour(i),
                }))}
              />
            </div>
          </div>
          <p className="text-xs text-surface-500 px-1">
            Night window: from {formatHour(nightShiftStartHour)} until {formatHour(nightShiftEndHour)} (e.g. 9 PM – 7 AM = 21 to 7).
          </p>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>
        )}
        {success && (
          <p className="mt-3 text-sm text-green-600" role="status">Settings saved.</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center justify-center gap-2 mt-4 sm:mt-6 rounded-xl w-full sm:w-auto min-h-[2.75rem] disabled:opacity-60"
        >
          <Save className="w-4 h-4 shrink-0" />
          {saving ? 'Saving…' : 'Save rules'}
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
          No integrations configured. API and webhook options will be available in a future update.
        </div>
      </div>
    </div>
  )
}
