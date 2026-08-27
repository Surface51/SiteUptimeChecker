import { getIngestStatus } from '../../../utils/logs/ingest/queue'

export default defineEventHandler(() => {
  return getIngestStatus()
})
