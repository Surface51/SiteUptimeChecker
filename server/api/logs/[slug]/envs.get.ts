import { resolveLogQueryForSlug, logEnvsFor } from '../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return { envs: await logEnvsFor(ctx) }
})
