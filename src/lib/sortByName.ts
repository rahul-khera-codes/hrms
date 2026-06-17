// 10JUN2026 client video Item 5 — Orlando: "we're about to add 150+ people,
// the employee lookup needs to be sorted alphabetically across every form".
// Shared helper so every employee/person dropdown uses the same sort.
// Locale-aware, case-insensitive — handles accented Spanish names correctly
// (e.g. "Ángela" sorts with the As, not after Z).

export function sortByName<T extends { name?: string | null }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) =>
    String(a?.name ?? '').localeCompare(String(b?.name ?? ''), undefined, { sensitivity: 'base' })
  )
}

// 17JUN2026 (Jose 16JUN video, Issue 2) — Jose: "terminated agents should
// not show up in the tables of attendance, leaves, and scheduler". For
// employee-picker dropdowns on NEW-record forms only — existing records
// with a terminated employee still display their name everywhere they
// already do (tables, edit modals, etc.). The rule is: anyone currently
// 'terminated' OR 'prenotice' OR 'inactive' is hidden from lookup
// pickers. The 11JUN light-red row tint covers the case where you're
// LOOKING at an existing record for one of these employees.
export function activeForLookup<T extends { name?: string | null; contractStatus?: string | null }>(list: readonly T[]): T[] {
  return sortByName(
    list.filter((e) => {
      const s = String(e?.contractStatus || 'active').toLowerCase()
      return s !== 'terminated' && s !== 'prenotice' && s !== 'inactive'
    }),
  )
}
