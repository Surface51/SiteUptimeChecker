/** Collapses digits/ids out of an nginx error message so repeated alerts group into one fingerprint. */
export function fingerprintMessage(message: string): string {
  return message
    .replace(/\*\d+/g, '*#') // connection id, e.g. "*12345"
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}
