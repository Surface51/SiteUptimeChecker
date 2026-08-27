import { rebuildIpProfiles } from '../../../../utils/logs/ipProfiles'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  // Resolved for its validation only — it rejects a malformed slug. The rebuild itself covers
  // every IP in the store, since a profile is a full-history judgement about an address rather
  // than something scoped to one site or time range.
  await resolveLogQueryForSlug(event)
  return rebuildIpProfiles()
})
