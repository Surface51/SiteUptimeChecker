import { getLighthouseProgress } from '../../utils/lighthouse'

export default defineEventHandler(() => {
  return getLighthouseProgress()
})
