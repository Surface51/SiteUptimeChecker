export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(withProtocol)
  return parsed.toString()
}
