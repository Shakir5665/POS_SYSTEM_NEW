/**
 * CSV Export & Sanitization Utilities
 * Implements defenses against CSV Formula Injection / DDE Injection (CWE-1236)
 */

export function sanitizeCsvCell(cell) {
  if (cell === null || cell === undefined) return ''
  let str = String(cell)
  // Prevent CSV Formula Injection (CWE-1236 / DDE Injection):
  // If cell starts with formula trigger characters (=, +, -, @, \t, \r), prepend a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  // Wrap in double quotes if it contains comma, double-quote, or newline
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportCsv(filename, headers, rows) {
  const sanitizedHeaders = headers.map(sanitizeCsvCell)
  const sanitizedRows = rows.map((r) => r.map(sanitizeCsvCell))
  const csvContent = [sanitizedHeaders.join(','), ...sanitizedRows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}
