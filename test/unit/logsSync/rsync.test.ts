import { describe, it, expect } from 'vitest'
import type { SyncJob } from '../../../scripts/logs-sync/planTargets'
import { parseRsyncList, planJob, sshCommand, target } from '../../../scripts/logs-sync/rsync'

const LIST = `drwxr-x---          4,096 2026/08/10 17:36:11 .
-rw-r--r--            350 2026/08/18 22:24:07 error.log
-rw-r--r--        666,080 2026/08/18 22:23:59 nginx-access.log
-rw-r--r--         97,451 2026/08/05 19:34:00 nginx-access.log-20260806.gz
-rw-r--r--            184 2026/08/12 03:50:27 nginx-error.log
`

describe('parseRsyncList', () => {
  it('parses regular files, dropping the directory entry and thousands separators', () => {
    const rows = parseRsyncList(LIST)
    expect(rows.map((r) => r.name)).toEqual([
      'error.log', 'nginx-access.log', 'nginx-access.log-20260806.gz', 'nginx-error.log',
    ])
    expect(rows[1]!.size).toBe(666080)
    expect(rows[2]!.mtime.getFullYear()).toBe(2026)
  })
})

describe('sshCommand', () => {
  it('builds the ephemeral-host variant for Pantheon (no host-key pinning)', () => {
    const cmd = sshCommand({ host: '1.2.3.4', user: 'live.uuid', port: 2222, verifyHostKey: false })
    expect(cmd).toContain('-p 2222')
    expect(cmd).toContain('StrictHostKeyChecking=no')
    expect(cmd).toContain('UserKnownHostsFile=/dev/null')
    expect(cmd).toContain('BatchMode=yes')
  })

  it('verifies the host key for a custom server and adds the identity file', () => {
    const cmd = sshCommand({ host: 'box', user: 'root', port: 22, identityFile: '/k/id', verifyHostKey: true })
    expect(cmd).toContain('StrictHostKeyChecking=accept-new')
    expect(cmd).toContain('-i /k/id')
    expect(cmd).not.toContain('-p 22')
  })

  it('passes no -p or -i for a bare ~/.ssh/config alias', () => {
    const cmd = sshCommand({ host: 'marchingillini-web1', verifyHostKey: true })
    expect(cmd).not.toContain('-p')
    expect(cmd).not.toContain('-i')
    expect(cmd).toContain('BatchMode=yes')
    expect(cmd).toContain('StrictHostKeyChecking=accept-new')
  })
})

const dirJob: SyncJob = {
  key: 'k', origin: 'pantheon', folder: 'f', env: 'live', serverDir: '1.2.3.4',
  destDir: '/ingress/f/live/1.2.3.4',
  ssh: { host: '1.2.3.4', user: 'live.uuid', port: 2222, verifyHostKey: false },
  kind: 'dir', remote: 'logs/nginx',
}
const now = new Date('2026-08-27T00:00:00Z')

describe('planJob', () => {
  it("keeps a dir job's recognised files, skips what it can't classify", () => {
    const entries = parseRsyncList(LIST).concat({ name: 'README', size: 10, mtime: now })
    const plan = planJob(dirJob, entries, { now, localSize: () => null })
    expect(plan.transfers.map((t) => t.localName).sort()).toEqual([
      'error.log', 'nginx-access.log', 'nginx-access.log-20260806.gz', 'nginx-error.log',
    ])
    expect(plan.skipped).toBe(1)
  })

  it('skips an immutable file already present at the same size', () => {
    const plan = planJob(dirJob, parseRsyncList(LIST), {
      now,
      localSize: (n) => (n === 'nginx-access.log-20260806.gz' ? 97451 : null),
    })
    expect(plan.transfers.map((t) => t.localName)).not.toContain('nginx-access.log-20260806.gz')
    // the live nginx-access.log is mutable — never skipped on a size match
    expect(plan.transfers.map((t) => t.localName)).toContain('nginx-access.log')
  })

  it('applies --max-age-days to immutable files only', () => {
    const plan = planJob(dirJob, parseRsyncList(LIST), { now, maxAgeDays: 7, localSize: () => null })
    expect(plan.transfers.map((t) => t.localName)).not.toContain('nginx-access.log-20260806.gz') // 22 days old
    expect(plan.transfers.map((t) => t.localName)).toContain('nginx-access.log') // live, kept
  })

  it('renames glob matches and flags a collision instead of overwriting', () => {
    const globJob: SyncJob = {
      ...dirJob, kind: 'glob', remote: '/home/mi/logs/site.com-*.gz', as: 'apache-access.log', rotated: true,
    }
    const entries = [
      { name: 'site.com-20260801.gz', size: 100, mtime: now },
      { name: 'site.com-20260801-2.gz', size: 200, mtime: now }, // no distinct date → same local name
    ]
    const plan = planJob(globJob, entries, { now, localSize: () => null })
    expect(plan.transfers).toHaveLength(0)
    expect([...plan.collisions.keys()]).toEqual(['apache-access.log-20260801.gz'])
  })
})

describe('target', () => {
  it('prefixes user@ when a login name is set', () => {
    expect(target({ ...dirJob, ssh: { host: 'box', user: 'root', port: 22, verifyHostKey: true } }, '/var/log/x'))
      .toBe('root@box:/var/log/x')
  })

  it('omits user@ for a bare ~/.ssh/config alias so ssh resolves the login name', () => {
    expect(target({ ...dirJob, ssh: { host: 'marchingillini-web1', verifyHostKey: true } }, '/var/log/x'))
      .toBe('marchingillini-web1:/var/log/x')
  })
})
