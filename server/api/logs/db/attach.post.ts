import { assertHandoffAllowed } from '../../../utils/logs/handoffAuth'
import { attachLogDb } from '../../../utils/logs/dbHandoff'

/** Ends a DB handoff. The log store re-opens lazily on the next query and the schedulers
 * (production only) resume. */
export default defineEventHandler(async (event) => {
  assertHandoffAllowed(event)
  const body = await readBody<{ token?: unknown }>(event).catch(() => ({}) as { token?: unknown })
  const result = await attachLogDb(typeof body?.token === 'string' ? body.token : undefined)
  return result
})
