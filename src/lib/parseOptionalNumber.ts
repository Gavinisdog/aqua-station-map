// Dependency-free on purpose: scripts/stations-lib.ts imports it under Node type stripping.

/** WRA sends numbers as strings: blank, null/undefined or non-numeric → null. */
export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text === '') return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}
