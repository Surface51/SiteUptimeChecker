import type { IngestStatus } from '#shared/types'

interface FileState {
  fileId: number
  label: string
  size: number
  weight: number
  bytesRead: number
  status: 'queued' | 'running' | 'done' | 'error'
  lines: number
  errors: number
  message?: string
}

function fmtBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)}${u[i]}`
}

function bar(pct: number, width = 16): string {
  const on = Math.round((pct / 100) * width)
  return `▕${'█'.repeat(on)}${'░'.repeat(width - on)}▏`
}

/** Live per-worker progress on a TTY; one line per state transition otherwise. */
export class Progress {
  private files = new Map<number, FileState>()
  private started = Date.now()
  private tty: boolean
  private linesPainted = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private totalWeight = 0

  constructor(opts: { tty: boolean }) {
    this.tty = opts.tty
  }

  init(files: { fileId: number; label: string; size: number; weight: number }[]) {
    for (const f of files) {
      this.files.set(f.fileId, { ...f, bytesRead: 0, status: 'queued', lines: 0, errors: 0 })
      this.totalWeight += f.weight
    }
    if (this.tty) {
      process.stdout.write('\x1b[?25l')
      this.timer = setInterval(() => this.paint(), 120)
      this.timer.unref?.()
    }
  }

  start(fileId: number) {
    const f = this.files.get(fileId)
    if (!f) return
    f.status = 'running'
    if (!this.tty) console.log(`[logs] start  ${f.label} (${fmtBytes(f.weight)} to parse)`)
  }

  progress(fileId: number, bytesRead: number) {
    const f = this.files.get(fileId)
    if (f) f.bytesRead = bytesRead
  }

  done(fileId: number, lines: number, errors: number) {
    const f = this.files.get(fileId)
    if (!f) return
    f.status = 'done'
    f.lines = lines
    f.errors = errors
    f.bytesRead = f.weight
    if (!this.tty) {
      const secs = ((Date.now() - this.started) / 1000).toFixed(1)
      console.log(`[logs] done   ${f.label}  ${lines.toLocaleString()} rows, ${errors} parse errors  (+${secs}s)`)
    }
  }

  error(fileId: number, message: string) {
    const f = this.files.get(fileId)
    if (!f) return
    f.status = 'error'
    f.message = message
    if (!this.tty) console.error(`[logs] ERROR  ${f.label}: ${message}`)
  }

  private paint() {
    if (!this.tty) return
    const all = [...this.files.values()]
    const doneCount = all.filter((f) => f.status === 'done' || f.status === 'error').length
    const weightDone = all.reduce((s, f) => s + Math.min(f.bytesRead, f.weight), 0)
    const pct = this.totalWeight ? Math.round((weightDone / this.totalWeight) * 100) : 0
    const elapsed = (Date.now() - this.started) / 1000
    const rate = elapsed > 0 ? weightDone / elapsed : 0
    const eta = rate > 0 ? (this.totalWeight - weightDone) / rate : 0

    const lines: string[] = []
    lines.push(
      `  ${bar(pct)} ${String(pct).padStart(3)}%  ${doneCount}/${all.length} files  ` +
        `${fmtBytes(rate)}/s  eta ${eta > 0 ? `${Math.round(eta)}s` : '—'}`,
    )
    for (const f of all.filter((x) => x.status === 'running')) {
      const fp = f.weight ? Math.min(100, Math.round((f.bytesRead / f.weight) * 100)) : 0
      lines.push(`  ${bar(fp, 10)} ${String(fp).padStart(3)}%  ${trunc(f.label, 52)}  ${fmtBytes(f.bytesRead)}/${fmtBytes(f.weight)}`)
    }
    const errs = all.filter((f) => f.status === 'error').length
    if (errs) lines.push(`  ${errs} file error${errs === 1 ? '' : 's'}`)

    const prev = this.linesPainted
    if (prev) process.stdout.write(`\x1b[${prev}A`)
    for (const l of lines) process.stdout.write(`\x1b[2K${trunc(l, (process.stdout.columns || 100) - 1)}\n`)
    // clear any leftover lines from a taller previous frame, then step back over them
    const leftover = Math.max(0, prev - lines.length)
    for (let i = 0; i < leftover; i++) process.stdout.write('\x1b[2K\n')
    if (leftover) process.stdout.write(`\x1b[${leftover}A`)
    this.linesPainted = lines.length
  }

  finish() {
    if (this.timer) clearInterval(this.timer)
    if (this.tty) {
      this.paint()
      process.stdout.write('\x1b[?25h')
    }
  }

  snapshot(): IngestStatus {
    const all = [...this.files.values()]
    const done = all.filter((f) => f.status === 'done' || f.status === 'error')
    const running = all.find((f) => f.status === 'running')
    return {
      running: done.length < all.length,
      stopRequested: false,
      stoppedReason: null,
      source: 'cli',
      startedAt: new Date(this.started).toISOString(),
      finishedAt: done.length >= all.length ? new Date().toISOString() : null,
      filesTotal: all.length,
      filesDone: done.length,
      filesSkipped: 0,
      currentFile: running?.label ?? null,
      currentFileBytesTotal: running?.weight ?? 0,
      currentFileBytesDone: running?.bytesRead ?? 0,
      errors: all.filter((f) => f.status === 'error').map((f) => `${f.label}: ${f.message}`),
    }
  }
}

function trunc(s: string, n: number): string {
  return s.length > n ? `…${s.slice(-(n - 1))}` : s
}
