import { enqueueLighthouseForAllSites } from '../../utils/lighthouse'

export default defineEventHandler(() => {
  const queued = enqueueLighthouseForAllSites()
  return { queued }
})
