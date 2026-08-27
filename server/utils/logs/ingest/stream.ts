import { createReadStream, readSync, openSync, closeSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'

export interface LineSource {
  lines: AsyncIterable<string>
  /** Call after fully consuming `lines` to get total compressed/on-disk bytes read. */
  getBytesRead: () => number
}

export function openLineSource(path: string, compressed: boolean, startByte = 0): LineSource {
  const readStream = createReadStream(path, compressed ? undefined : { start: startByte })
  let bytesRead = 0
  readStream.on('data', (chunk: Buffer) => {
    bytesRead += chunk.length
  })

  const input = compressed ? readStream.pipe(createGunzip()) : readStream
  const rl = createInterface({ input, crlfDelay: Infinity })

  return {
    lines: rl,
    getBytesRead: () => bytesRead
  }
}

/** Sha1 of the first `bytes` bytes of a file, used to detect rotation/truncation of a "live" file. */
export function computeHeadHash(path: string, bytes = 1024): string {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const read = readSync(fd, buf, 0, bytes, 0)
    return createHash('sha1').update(buf.subarray(0, read)).digest('hex')
  } finally {
    closeSync(fd)
  }
}
