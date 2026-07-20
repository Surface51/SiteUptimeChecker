import tls from 'node:tls'

export interface SslInfo {
  valid: boolean
  issuer: string | null
  expiresAt: string | null
  daysRemaining: number | null
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
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
