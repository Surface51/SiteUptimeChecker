import { execFile } from 'node:child_process'
import { resolve4 } from 'node:dns/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface PantheonSite {
  name: string
  id: string
  plan_name: string
  frozen: boolean
}

export function terminusBin(cliValue?: string): string {
  return cliValue || process.env.UPTIME_TERMINUS_BIN || 'terminus'
}

/**
 * `terminus site:list` in one call — it returns every accessible site as a JSON object keyed by
 * UUID, which we flatten. A non-zero exit or unparseable body almost always means the session
 * expired; the error says so.
 */
export async function listPantheonSites(bin: string): Promise<PantheonSite[]> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync(
      bin,
      ['site:list', '--format=json', '--fields=name,id,plan_name,frozen'],
      { maxBuffer: 64 * 1024 * 1024 },
    ))
  } catch (err: any) {
    throw new Error(
      `terminus site:list failed (${err.code ?? err.message}). ` +
        `Check the binary path and run \`${bin} auth:login\`.`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`terminus site:list did not return JSON — try \`${bin} auth:whoami\``)
  }
  const rows = parsed && typeof parsed === 'object' ? Object.values(parsed as Record<string, any>) : []
  return rows
    .filter((r) => r && typeof r.name === 'string' && typeof r.id === 'string')
    .map((r) => ({
      name: r.name,
      id: r.id,
      plan_name: String(r.plan_name ?? ''),
      frozen: r.frozen === true || r.frozen === 'true',
    }))
}

/** All appserver container IPs for a site+env. Empty means the env was never deployed. */
export async function appserverIps(env: string, id: string): Promise<string[]> {
  return resolveOrEmpty(`appserver.${env}.${id}.drush.in`)
}

/** The dbserver container IP(s) for a site+env. */
export async function dbserverIps(env: string, id: string): Promise<string[]> {
  return resolveOrEmpty(`dbserver.${env}.${id}.drush.in`)
}

async function resolveOrEmpty(host: string): Promise<string[]> {
  try {
    const ips = await resolve4(host)
    return [...new Set(ips)].sort()
  } catch {
    return []
  }
}

/** The SSH login for a Pantheon container: user is `<env>.<uuid>`, port 2222, key auth. */
export function pantheonSshUser(env: string, id: string): string {
  return `${env}.${id}`
}
