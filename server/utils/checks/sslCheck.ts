import tls from 'node:tls'

export interface SslInfo {
  valid: boolean
  issuer: string | null
  expiresAt: string | null
  daysRemaining: number | null
  /** DNS names from the certificate's subjectAltName, wildcards (`*.example.com`) dropped. */
  altNames: string[]
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Parses `cert.subjectaltname`, e.g. `"DNS:a.example.com, DNS:*.example.com, IP Address:1.2.3.4"`. */
export function parseAltNames(subjectaltname: string | undefined): string[] {
  if (!subjectaltname) return []
  return subjectaltname
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('DNS:'))
    .map((entry) => entry.slice(4).trim().toLowerCase())
    .filter((name) => name.length > 0 && !name.startsWith('*.'))
}

export function sslCheck(hostname: string, port = 443): Promise<SslInfo | null> {
  return new Promise((resolve) => {
    let settled = false
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: 10_000 },
      () => {
        const cert = socket.getPeerCertificate(true)
        if (!cert || !cert.valid_to) {
          settled = true
          socket.end()
          resolve(null)
          return
        }
        const expiresAt = new Date(cert.valid_to)
        const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
        settled = true
        resolve({
          valid: socket.authorized === true,
          issuer: firstString(cert.issuer?.O) || firstString(cert.issuer?.CN),
          expiresAt: expiresAt.toISOString(),
          daysRemaining,
          altNames: parseAltNames(cert.subjectaltname),
        })
        socket.end()
      },
    )

    socket.on('error', () => {
      if (!settled) {
        settled = true
        resolve(null)
      }
    })

    socket.on('timeout', () => {
      socket.destroy()
      if (!settled) {
        settled = true
        resolve(null)
      }
    })
  })
}
