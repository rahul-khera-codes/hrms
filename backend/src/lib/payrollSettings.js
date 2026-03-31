import { query } from '../config/db.js'

const DEFAULT_WORKING_DAYS_PER_MONTH = 23.83
const DEFAULT_HOURS_PER_DAY = 8
const DEFAULT_OT_MULTIPLIER = 1.35
const DEFAULT_NIGHT_MULTIPLIER = 1.15

export async function getSettings() {
  const result = await query('SELECT * FROM settings WHERE id = 1')
  const row = result.rows[0]
  if (!row) {
    return {
      workingDaysPerMonth: DEFAULT_WORKING_DAYS_PER_MONTH,
      hoursPerDay: DEFAULT_HOURS_PER_DAY,
      otMultiplier: DEFAULT_OT_MULTIPLIER,
      nightMultiplier: DEFAULT_NIGHT_MULTIPLIER,
      nightShiftStartHour: 21,
      nightShiftEndHour: 7,
      defaultBaseSalary: 0,
    }
  }
  return {
    workingDaysPerMonth: Number(row.working_days_per_month) || DEFAULT_WORKING_DAYS_PER_MONTH,
    hoursPerDay: Number(row.hours_per_day) || DEFAULT_HOURS_PER_DAY,
    otMultiplier: Number(row.ot_multiplier) || DEFAULT_OT_MULTIPLIER,
    nightMultiplier: Number(row.night_multiplier) || DEFAULT_NIGHT_MULTIPLIER,
    nightShiftStartHour: Number(row.night_shift_start_hour) ?? 21,
    nightShiftEndHour: Number(row.night_shift_end_hour) ?? 7,
    defaultBaseSalary: row.default_base_salary != null ? Number(row.default_base_salary) : 0,
  }
}
