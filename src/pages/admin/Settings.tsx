import { useState, useEffect } from 'react'
import { Clock, Moon, TrendingUp, Save, Plug, Calendar, Banknote, Settings as SettingsIcon, Percent, Info } from 'lucide-react'
import { createHoliday, deleteHoliday, getHolidays, getSettings, updateSettings, type HolidayItem } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

// Read-only reference values — mirror constants in backend/src/lib/drPayrollRules.js
// Updated whenever DR labor-law rates change. Surface these here so payroll admins
// can verify what the engine uses without diving into code.
const TAX_REFERENCE = {
  afpEmployeePct: 2.87,
  sfsEmployeePct: 3.04,
  infotepEmployeePct: 0.5,
  afpEmployerPct: 7.10,
  sfsEmployerPct: 7.09,
  infotepEmployerPct: 1.00,
  arlEmployerPct: 1.20,
  regularOTPct: 35,
  holidayOTPct: 100,
  isrBrackets2026: [
    { from: 0, to: 416_220, rate: 0, note: 'Exempt' },
    { from: 416_220.01, to: 624_329, rate: 15, note: '15% over excess of 416,220.00' },
    { from: 624_329.01, to: 867_123, rate: 20, note: '20% + RD$31,216 over excess of 624,329.00' },
    { from: 867_123.01, to: Infinity, rate: 25, note: '25% + RD$79,776 over excess of 867,123.00' },
  ],
}

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
  const [doubleOtMultiplier, setDoubleOtMultiplier] = useState('2.00')
  const [nightMultiplier, setNightMultiplier] = useState('1.15')
  const [nightShiftStartHour, setNightShiftStartHour] = useState(21)
  const [nightShiftEndHour, setNightShiftEndHour] = useState(7)
  const [defaultBaseSalary, setDefaultBaseSalary] = useState('0')
  // 10JUN2026 client video Item 8 — clock-in IP allowlist
  const [clockInIpAllowlistEnabled, setClockInIpAllowlistEnabled] = useState(false)
  const [clockInIpAllowlist, setClockInIpAllowlist] = useState('')
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
        setDoubleOtMultiplier(String(data.doubleOtMultiplier ?? 2.0))
        setNightMultiplier(String(data.nightMultiplier))
        setNightShiftStartHour(data.nightShiftStartHour)
        setNightShiftEndHour(data.nightShiftEndHour)
        setDefaultBaseSalary(String(data.defaultBaseSalary ?? 0))
        setClockInIpAllowlistEnabled(data.clockInIpAllowlistEnabled === true)
        setClockInIpAllowlist(String(data.clockInIpAllowlist ?? ''))
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
    const dot = parseFloat(doubleOtMultiplier)
    const night = parseFloat(nightMultiplier)
    const dbs = parseFloat(defaultBaseSalary)
    if (Number.isNaN(wd) || wd <= 0 || Number.isNaN(hd) || hd <= 0 || Number.isNaN(ot) || ot < 1 || Number.isNaN(dot) || dot < 1 || Number.isNaN(night) || night < 1) {
      setError('Please enter valid numbers (vacation factor & hours > 0, multipliers ≥ 1).')
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
        doubleOtMultiplier: dot,
        nightMultiplier: night,
        nightShiftStartHour,
        nightShiftEndHour,
        defaultBaseSalary: dbs,
        clockInIpAllowlistEnabled,
        clockInIpAllowlist,
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
        <div className="card p-5 sm:p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <span className="block h-3 w-32 rounded bg-surface-200/70 animate-pulse" />
              <span className="block h-10 w-full rounded-lg bg-surface-100 dark:bg-surface-800 animate-pulse" />
            </div>
          ))}
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

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white dark:bg-surface-900 p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 dark:text-surface-50 mb-0.5 sm:mb-1">Public holidays</h2>
        <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500 mb-4 sm:mb-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 p-4 sm:p-6 border border-surface-200 dark:border-surface-700 rounded-xl bg-surface-50/50">
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
            <thead className="bg-surface-50 dark:bg-surface-900">
              <tr>
                <th className="py-2 px-3 text-left">Date</th>
                <th className="py-2 px-3 text-left">Name</th>
                <th className="py-2 px-3 text-left">Type</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-t border-surface-100 dark:border-surface-800">
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
                  <td colSpan={4} className="py-4 px-3 text-center text-surface-500 dark:text-surface-400 dark:text-surface-500">No holidays added.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white dark:bg-surface-900 p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 dark:text-surface-50 mb-0.5 sm:mb-1">Payroll rules</h2>
        <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500 mb-4 sm:mb-6">
          Define how regular, overtime, and night hours are calculated. Used for payroll and for converting monthly salary to hourly.
        </p>
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 dark:text-surface-50 text-sm sm:text-base">Default base salary</p>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">
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
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-surface-600 dark:text-surface-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 dark:text-surface-50 text-sm sm:text-base">Vacation factor</p>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">Vacation/divider used for monthly → hourly conversion (e.g. 23.83)</p>
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
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-surface-600 dark:text-surface-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 dark:text-surface-50 text-sm sm:text-base">Hours per day</p>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">Standard workday length (e.g. 8)</p>
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
              <p className="font-medium text-surface-900 dark:text-surface-50 text-sm sm:text-base">Regular overtime multiplier (X35%)</p>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">
                Pay rate for regular OT hours (1.35 = 35% extra).
              </p>
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
          {/* 21MAY2026 client video: explicit X100% / double-overtime multiplier */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 dark:text-surface-50 text-sm sm:text-base">Double overtime multiplier (X100%)</p>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">
                Pay rate for X100% hours such as holiday-worked or premium OT (2.00 = 100% extra).
              </p>
            </div>
            <input
              type="number"
              min={1}
              step={0.05}
              className="input w-full sm:w-24 text-center rounded-xl min-h-[2.75rem]"
              value={doubleOtMultiplier}
              onChange={(e) => setDoubleOtMultiplier(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-surface-200/80">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-surface-900 dark:text-surface-50 text-sm sm:text-base">Night differential multiplier</p>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">Pay rate for night hours (e.g. 1.15 = 15% extra)</p>
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
          <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 px-1">
            Night window: from {formatHour(nightShiftStartHour)} until {formatHour(nightShiftEndHour)} (e.g. 9 PM – 7 AM = 21 to 7).
          </p>

          {/* 10JUN2026 client video Item 8 — Orlando: "limit the software
              to be used from the site or from an approved location… a
              list through Settings of approved IPs". When the toggle is
              off (default) the allowlist is ignored, so admins can roll
              this out gradually. */}
          <div className="pt-4 mt-2 border-t border-surface-200 dark:border-surface-700">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Clock-in IP allowlist</h4>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">When enabled, employees can only clock in/out from listed IPs.</p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clockInIpAllowlistEnabled}
                  onChange={(e) => setClockInIpAllowlistEnabled(e.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-medium text-surface-700 dark:text-surface-200">Enforce</span>
              </label>
            </div>
            <textarea
              value={clockInIpAllowlist}
              onChange={(e) => setClockInIpAllowlist(e.target.value)}
              rows={5}
              placeholder={'# One IP or CIDR per line. # lines are comments.\n# Examples:\n# 203.0.113.5\n# 203.0.113.0/24'}
              className="w-full text-xs font-mono rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2 focus:ring-1 focus:ring-brand-300 outline-none"
              disabled={!clockInIpAllowlistEnabled}
            />
            <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-1">
              Supports single IPv4/IPv6 addresses and IPv4 CIDR blocks (e.g. <code>203.0.113.0/24</code>). Saved with the form below.
            </p>
          </div>
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

      {/* Tax & Deduction Rates (read-only reference) — added per 18MAY2026 client feedback */}
      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white dark:bg-surface-900 p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start gap-3 mb-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Percent className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900 dark:text-surface-50">Tax &amp; Deduction Rates (Reference)</h2>
            <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
              Values used by the payroll engine. Stored in code (Dominican Republic 2026 labor &amp; tax rules). Change via code update if rates change by law.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-surface-200/80 p-3">
            <p className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Employee Deductions (TSS)</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">AFP (Pensions)</span><span className="font-semibold tabular-nums">{TAX_REFERENCE.afpEmployeePct}%</span></div>
              <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">SFS (Health)</span><span className="font-semibold tabular-nums">{TAX_REFERENCE.sfsEmployeePct}%</span></div>
              <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">INFOTEP (on profit-sharing only)</span><span className="font-semibold tabular-nums">{TAX_REFERENCE.infotepEmployeePct}%</span></div>
            </div>
          </div>
          <div className="rounded-lg border border-surface-200/80 p-3">
            <p className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Employer Costs</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">AFP</span><span className="font-semibold tabular-nums">{TAX_REFERENCE.afpEmployerPct}%</span></div>
              <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">SFS</span><span className="font-semibold tabular-nums">{TAX_REFERENCE.sfsEmployerPct}%</span></div>
              <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">INFOTEP</span><span className="font-semibold tabular-nums">{TAX_REFERENCE.infotepEmployerPct}%</span></div>
              <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">ARL (Labor Risk)</span><span className="font-semibold tabular-nums">{TAX_REFERENCE.arlEmployerPct}%</span></div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-surface-200/80 p-3 mb-4">
          <p className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Overtime Premiums</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">Regular OT (X35%)</span><span className="font-semibold tabular-nums">+{TAX_REFERENCE.regularOTPct}% (configurable above)</span></div>
            <div className="flex justify-between"><span className="text-surface-600 dark:text-surface-300">Holiday OT (X100%)</span><span className="font-semibold tabular-nums">+{TAX_REFERENCE.holidayOTPct}% (fixed by law)</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-surface-200/80 overflow-hidden">
          <div className="px-3 py-2 bg-surface-50 dark:bg-surface-900 border-b border-surface-200/80">
            <p className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">ISR Tax Brackets (Monthly, 2026)</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-200/80 text-surface-500 dark:text-surface-400 dark:text-surface-500">
                <th className="px-3 py-2 text-left font-medium">From (RD$)</th>
                <th className="px-3 py-2 text-left font-medium">To (RD$)</th>
                <th className="px-3 py-2 text-left font-medium">Rate</th>
                <th className="px-3 py-2 text-left font-medium">Calculation</th>
              </tr>
            </thead>
            <tbody>
              {TAX_REFERENCE.isrBrackets2026.map((b, i) => (
                <tr key={i} className="border-b border-surface-100 dark:border-surface-800 last:border-b-0">
                  <td className="px-3 py-2 tabular-nums">{b.from.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 tabular-nums">{b.to === Infinity ? 'Over' : b.to.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 font-semibold">{b.rate}%</td>
                  <td className="px-3 py-2 text-surface-600 dark:text-surface-300">{b.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-3 flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          Bi-weekly periods use ÷ 26/12 to map back to monthly equivalents for ISR brackets and TSS caps.
        </p>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white dark:bg-surface-900 p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start gap-3 mb-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0">
            <Plug className="w-5 h-5 text-surface-600 dark:text-surface-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900 dark:text-surface-50">Integrations</h2>
            <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
              Connect to external payroll or accounting systems. (Coming soon.)
            </p>
          </div>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-dashed border-surface-300 bg-surface-50/50 p-6 sm:p-8 text-center text-surface-500 dark:text-surface-400 dark:text-surface-500 text-xs sm:text-sm">
          No integrations configured. API and webhook options will be available in a future update.
        </div>
      </div>
    </div>
  )
}
