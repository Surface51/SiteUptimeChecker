import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import type { IngestJob } from './worker'

export interface JobDone {
  type: 'done'
  fileId: number
  scratchPath: string
  table: string
  linesIngested: number
  parseErrors: number
  byteOffset: number
}
export interface JobError {
  type: 'error'
  fileId: number
  message: string
}
export type JobResult = JobDone | JobError

export interface PoolHandlers {
  onProgress?: (fileId: number, bytesRead: number) => void
  /** Awaited before the worker is handed its next job — the place to merge the scratch DB. */
  onResult: (result: JobResult, job: IngestJob) => Promise<void>
}

const WORKER_URL = new URL('./worker.js', import.meta.url)

interface Slot {
  worker: Worker
  id: number
  job: IngestJob | null
}

export class WorkerPool {
  private slots: Slot[] = []
  private queue: IngestJob[] = []
  private idle: Slot[] = []
  private completed = 0
  private total = 0
  private resolve!: () => void
  private reject: ((e: Error) => void) | null = null

  constructor(
    jobsCount: number,
    private opts: { scratchDir: string; memoryLimit: string },
    private handlers: PoolHandlers,
  ) {
    for (let i = 0; i < jobsCount; i++) this.spawn(i)
  }

  private spawn(id: number) {
    const worker = new Worker(fileURLToPath(WORKER_URL), {
      workerData: { id, scratchDir: this.opts.scratchDir, memoryLimit: this.opts.memoryLimit },
    })
    const slot: Slot = { worker, id, job: null }
    this.slots[id] = slot

    worker.on('message', (msg: any) => {
      if (msg?.type === 'ready') {
        this.idle.push(slot)
        this.pump()
      } else if (msg?.type === 'progress') {
        this.handlers.onProgress?.(msg.fileId, msg.bytesRead)
      } else if (msg?.type === 'done' || msg?.type === 'error') {
        this.finishJob(slot, msg as JobResult)
      }
    })

    worker.on('error', (err) => this.reject?.(err))
    worker.on('exit', (code) => {
      if (code !== 0 && slot.job) {
        this.finishJob(slot, { type: 'error', fileId: slot.job.fileId, message: `worker exited (code ${code})` }, true)
      }
    })
  }

  private finishJob(slot: Slot, result: JobResult, crashed = false) {
    const job = slot.job
    if (!job) return
    slot.job = null
    this.handlers
      .onResult(result, job)
      .catch((e) => this.reject?.(e as Error))
      .finally(() => {
        this.completed++
        if (crashed) this.spawn(slot.id)
        else this.idle.push(slot)
        if (this.completed >= this.total) this.resolve()
        else this.pump()
      })
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const slot = this.idle.pop()!
      const job = this.queue.shift()!
      slot.job = job
      slot.worker.postMessage(job)
    }
  }

  run(jobs: IngestJob[]): Promise<void> {
    this.queue = [...jobs]
    this.total = jobs.length
    return new Promise<void>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
      if (!this.total) return resolve()
      this.pump()
    })
  }

  async close() {
    await Promise.all(
      this.slots.filter(Boolean).map((s) => {
        try { s.worker.postMessage({ type: 'shutdown' }) } catch { /* gone */ }
        return s.worker.terminate()
      }),
    )
  }
}
