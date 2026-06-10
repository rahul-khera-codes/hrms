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
