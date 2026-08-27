import { getIngestStatus, ingestEvents, type IngestStatus } from '../../../utils/logs/ingest/queue'

export default defineEventHandler((event) => {
  const stream = createEventStream(event)

  const onProgress = (status: IngestStatus) => {
    stream.push(JSON.stringify(status)).catch(() => {})
  }

  // Send the current snapshot immediately so late subscribers aren't stuck waiting.
  onProgress(getIngestStatus())
  ingestEvents.on('progress', onProgress)

  stream.onClosed(async () => {
    ingestEvents.off('progress', onProgress)
    await stream.close()
  })

  return stream.send()
})
