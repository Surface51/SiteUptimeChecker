/** Path substrings commonly probed by vulnerability scanners and credential-stuffing bots. */
export const SUSPICIOUS_PATH_PATTERNS = [
  '.git',
  '.env',
  'wp-login',
  'wp-admin',
  'wp-content',
  'xmlrpc.php',
  '.aws',
  'phpinfo',
  '/vendor/',
  '.ssh',
  'config.php',
  '.htpasswd',
  'eval-stdin',
  '.docker',
  'id_rsa',
  '/actuator/',
  '.vscode'
]

export function suspiciousPathWhereClause(): string {
  return SUSPICIOUS_PATH_PATTERNS.map((p) => `path ILIKE '%${p}%'`).join(' OR ')
}
