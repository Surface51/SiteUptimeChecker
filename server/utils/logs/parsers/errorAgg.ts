import type { NginxErrorAggRow } from './types'
import { fingerprintMessage } from '../fingerprint/message'

export interface AggInput {
  ts: Date
  level: string
  message: string
  sampleRequest?: string | null
  sampleHost?: string | null
}

/**
 * Rolls error lines up into per-minute × level × message-fingerprint counts as they stream in,
 * because a single alert ("worker_connections are not enough", an AH0xxxx repeated on every
 * request) can recur millions of times in one file.
 *
 * Shared by the nginx and Apache error parsers so the one piece of buffered state they expose
 * through `hasPending()` has exactly one implementation: that flag drives the resumable-checkpoint
 * safe offset in ingest/queue.ts, and a second hand-written copy that drifted would silently
 * duplicate rows on a stopped-then-resumed run.
 */
export class ErrorAggregator {
  private currentBucketMs: number | null = null
  private bucketMap = new Map<string, NginxErrorAggRow>()

  /** Add one parsed error line; returns any rows finalized because the minute bucket rolled over. */
  add(input: AggInput): NginxErrorAggRow[] {
    const bucketMs = Math.floor(input.ts.getTime() / 60_000) * 60_000

    let flushed: NginxErrorAggRow[] = []
    if (this.currentBucketMs !== null && bucketMs !== this.currentBucketMs) {
      flushed = this.flush()
    }
    this.currentBucketMs = bucketMs

    const fingerprint = fingerprintMessage(input.message)
    const key = `${input.level}|${fingerprint}`
    const existing = this.bucketMap.get(key)
    if (existing) {
      existing.count++
    } else {
      this.bucketMap.set(key, {
        bucket: new Date(bucketMs),
        level: input.level,
        fingerprint,
        count: 1,
        sampleMessage: input.message,
        sampleRequest: input.sampleRequest ?? null,
        sampleHost: input.sampleHost ?? null,
      })
    }

    return flushed
  }

  /** Drain every open bucket. Call at EOF. */
  flush(): NginxErrorAggRow[] {
    const rows = Array.from(this.bucketMap.values())
    this.bucketMap.clear()
    return rows
  }

  hasPending(): boolean {
    return this.bucketMap.size > 0
  }
}
