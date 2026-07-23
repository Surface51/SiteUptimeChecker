import { enqueueLighthouseForAllSites } from '../../utils/lighthouse'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'
  const queued = enqueueLighthouseForAllSites({ force })
  return { queued }
})
