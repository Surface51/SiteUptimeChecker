import { buildSiteSummary, listSites } from '../../utils/db'

export default defineEventHandler(() => {
  return listSites().map(buildSiteSummary)
})
