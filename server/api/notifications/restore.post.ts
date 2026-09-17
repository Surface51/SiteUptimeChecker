import { restoreNotifications } from '../../utils/db'

/** Un-dismisses the given ids — backs the "Undo" toast after "Clear all" on the notifications page. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isInteger) : []

  restoreNotifications(ids)
  setResponseStatus(event, 204)
  return null
})
