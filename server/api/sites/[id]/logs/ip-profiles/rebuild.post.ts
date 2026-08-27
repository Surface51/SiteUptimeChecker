import { rebuildIpProfiles } from '../../../../../utils/logs/ipProfiles'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  // Resolved for its validation only — it rejects an unknown or unlinked site. The rebuild
  // itself covers every IP in the store, since a profile is a full-history judgement about an
  // address rather than something scoped to one site or time range.
  await resolveLogQueryForSite(event)
  return rebuildIpProfiles()
})
