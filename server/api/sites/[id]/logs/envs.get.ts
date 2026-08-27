import { resolveLogQueryForSite, logEnvsFor } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return { envs: await logEnvsFor(ctx) }
})
