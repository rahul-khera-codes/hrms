import { useState, useEffect } from 'react'
import { Clock, Moon, TrendingUp, Save, Plug, Calendar, Banknote, Settings as SettingsIcon } from 'lucide-react'
import { createHoliday, deleteHoliday, getHolidays, getSettings, updateSettings, type HolidayItem } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

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
  const [defaultBaseSalary, setDefaultBaseSalary] = useState('0')
  const [holidays, setHolidays] = useState<HolidayItem[]>([])
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')
  const [holidayPaid, setHolidayPaid] = useState(true)
  const [holidaySaving, setHolidaySaving] = useState(false)
  const [showAddHolidayForm, setShowAddHolidayForm] = useState(false)

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
        setDefaultBaseSalary(String(data.defaultBaseSalary ?? 0))
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load settings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    getHolidays()
      .then((rows) => {
        if (!cancelled) setHolidays(rows)
      })
      .catch(() => {
        if (!cancelled) setHolidays([])
      })
    return () => { cancelled = true }
  }, [])

  async function handleAddHoliday() {
    if (!holidayDate || !holidayName.trim()) return
    setHolidaySaving(true)
    try {
      const created = await createHoliday({
        date: holidayDate,
        name: holidayName.trim(),
        isPaid: holidayPaid,
      })
      setHolidays((prev) => [...prev.filter((h) => h.date !== created.date), created].sort((a, b) => (a.date || '').localeCompare(b.date || '')))
      setHolidayName('')
      setHolidayDate('')
      setHolidayPaid(true)
      setShowAddHolidayForm(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save holiday')
    } finally {
      setHolidaySaving(false)
    }
  }

  function handleCancelAddHoliday() {
    setHolidayDate('')
    setHolidayName('')
    setHolidayPaid(true)
    setShowAddHolidayForm(false)
  }

  async function handleDeleteHoliday(id: string) {
    try {
      await deleteHoliday(id)
      setHolidays((prev) => prev.filter((h) => h.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete holiday')
    }
  }

  async function handleSave() {
    setError(null)
    setSuccess(false)
    const wd = parseFloat(workingDaysPerMonth)
    const hd = parseFloat(hoursPerDay)
    const ot = parseFloat(otMultiplier)
    const night = parseFloat(nightMultiplier)
    const dbs = parseFloat(defaultBaseSalary)
    if (Number.isNaN(wd) || wd <= 0 || Number.isNaN(hd) || hd <= 0 || Number.isNaN(ot) || ot < 1 || Number.isNaN(night) || night < 1) {
      setError('Please enter valid numbers (working days & hours > 0, multipliers ≥ 1).')
      return
    }
    if (Number.isNaN(dbs) || dbs < 0) {
      setError('Default base salary must be a number ≥ 0.')
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
        defaultBaseSalary: dbs,
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
      <div className="page overflow-x-hidden">
        <PageHeader title="Settings" subtitle="Configure payroll rules and system options." icon={<SettingsIcon className="w-5 h-5" />} />
        <div className="card p-6 flex items-center gap-3 text-surface-500 text-sm">
          <div className="spinner" /> Loading settings…
        </div>
      </div>
    )
  }

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Settings"
        subtitle="Configure payroll rules and system options."
        icon={<SettingsIcon className="w-5 h-5" />}
      />

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Public holidays</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-6">
          Used by payroll holiday pay rules (scheduled pay + 100% premium for worked holiday hours).
        </p>
        
        {!showAddHolidayForm ? (
          <button
            type="button"
            onClick={() => setShowAddHolidayForm(true)}
            className="btn-primary rounded-xl min-h-[2.75rem] px-6 mb-4"
          >
            + Add holiday
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 p-4 sm:p-6 border border-surface-200 rounded-xl bg-surface-50/50">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input w-full rounded-xl min-h-[2.75rem]"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                autoFocus
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input
                type="text"
                className="input w-full rounded-xl min-h-[2.75rem]"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="e.g. Independence Day"
              />
            </div>
            <div>
              <label className="label">Type</label>
              <AdminSelect
                value={holidayPaid ? 'paid' : 'unpaid'}
                onChange={(val) => setHolidayPaid(val === 'paid')}
                options={[
                  { value: 'paid', label: 'Paid holiday' },
                  { value: 'unpaid', label: 'Unpaid holiday' },
                ]}
              />
            </div>
            <div className="sm:col-span-4 flex flex-col-reverse sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancelAddHoliday}
                className="btn-secondary rounded-xl min-h-[2.75rem] px-6"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddHoliday}
                disabled={holidaySaving || !holidayDate || !holidayName.trim()}
                className="btn-primary rounded-xl min-h-[2.75rem] px-6 disabled:opacity-60"
              >
                {holidaySaving ? 'Saving…' : 'Save holiday'}
              </button>
            </div>
          </div>
        )}
        <div className="mt-4 rounded-xl border border-surface-200/80 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-50">
              <tr>
                <th className="py-2 px-3 text-left">Date</th>
                <th className="py-2 px-3 text-left">Name</th>
                <th className="py-2 px-3 text-left">Type</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-t border-surface-100">
                  <td className="py-2 px-3">{h.date}</td>
                  <td className="py-2 px-3">{h.name}</td>
                  <td className="py-2 px-3">{h.isPaid ? 'Paid' : 'Unpaid'}</td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteHoliday(h.id)}
                      className="btn-secondary rounded-lg px-3 py-1.5"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 px-3 text-center text-surface-500">No holidays added.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Payroll rules</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-6">
          Define how regular, overtime, and night hours are calculated. Used for payroll and for converting monthly salary to hourly.
        </p>
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 text-sm sm:text-base">Default base salary</p>
              <p className="text-xs sm:text-sm text-surface-500">
                Company default reference ($). Individual employee rates are still set in Employees.
              </p>
            </div>
            <input
              type="number"
              min={0}
              step={0.01}
              className="input w-full sm:w-24 text-right rounded-xl min-h-[2.75rem] tabular-nums"
              value={defaultBaseSalary}
              onChange={(e) => setDefaultBaseSalary(e.target.value)}
            />
          </div>
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
