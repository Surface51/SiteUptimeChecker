import { getQuery, setHeader } from 'h3'
function escapeCsvValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = v instanceof Date ? v.toISOString() : String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]!)
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvValue(row[h])).join(','))
  }
  return lines.join('\n')
}

/** Returns a CSV string (and sets download headers) when ?format=csv, else the usual JSON shape.
 * Applied to any list endpoint so every table in the app is exportable for free. */
export function respondListOrCsv(
  event: any,
  rows: Record<string, unknown>[],
  jsonKey: string,
  filename: string
): string | Record<string, unknown> {
  const q = getQuery(event)
  if (String(q.format || '').toLowerCase() === 'csv') {
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    return rowsToCsv(rows)
  }
  return { [jsonKey]: rows }
}
