function fmtBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)}${u[i]}`
}

/** One line per job transition on a plain stream; a single rewriting counter on a TTY. */
export class Progress {
  private tty: boolean
  private total: number
  private done = 0
  private failed = 0
  private files = 0
  private bytes = 0
  private started = Date.now()

  constructor(opts: { tty: boolean; total: number }) {
    this.tty = opts.tty
    this.total = opts.total
  }

  start(key: string) {
    if (!this.tty) console.log(`→ ${key}`)
    else this.paint(key)
  }

  ok(key: string, transferred: number, bytes: number, skipped: number) {
    this.done++
    this.files += transferred
    this.bytes += bytes
    const detail = transferred
      ? `${transferred} file${transferred === 1 ? '' : 's'}, ${fmtBytes(bytes)}${skipped ? `, ${skipped} skipped` : ''}`
      : skipped ? `up to date (${skipped} skipped)` : 'nothing to pull'
    if (!this.tty) console.log(`✓ ${key} — ${detail}`)
    else this.paint(key)
  }

  fail(key: string, message: string) {
    this.done++
    this.failed++
    if (!this.tty) console.error(`✗ ${key} — ${message}`)
    else this.paint(key)
  }

  private paint(current: string) {
    const secs = ((Date.now() - this.started) / 1000).toFixed(0)
    const line =
      `  ${this.done}/${this.total} jobs  ${this.files} files  ${fmtBytes(this.bytes)}  ` +
      `${this.failed ? `${this.failed} failed  ` : ''}${secs}s  ${current}`
    const width = (process.stdout.columns || 100) - 1
    process.stdout.write(`\r\x1b[2K${line.length > width ? line.slice(0, width - 1) + '…' : line}`)
  }

  finish() {
    if (this.tty) process.stdout.write('\n')
    const secs = ((Date.now() - this.started) / 1000).toFixed(1)
    console.log(
      `\n${this.failed ? '⚠ ' : ''}${this.done - this.failed}/${this.total} jobs ok` +
        `${this.failed ? `, ${this.failed} failed` : ''} — ${this.files} files, ${fmtBytes(this.bytes)} in ${secs}s`,
    )
  }
}
