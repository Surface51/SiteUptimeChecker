import { listAllTagNames } from '../utils/db'

export default defineEventHandler(() => {
  return listAllTagNames()
})
