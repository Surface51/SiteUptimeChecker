import type { InjectionKey, Ref } from 'vue'
import type { SiteSummary } from '#shared/types'

export interface SiteShell {
  /** The site the shell fetched. Undefined only before the first response / on a 404. */
  site: Ref<SiteSummary | undefined>
  /** Re-fetch the site — call after a mutation (check now, pause, edit) so the header updates. */
  refreshSite: () => Promise<void>
}

export const SITE_SHELL_KEY: InjectionKey<SiteShell> = Symbol('siteShell')

/**
 * Reads the site provided by `app/pages/sites/[id].vue`. The tab pages under that route use
 * this instead of each re-fetching `/api/sites/:id`.
 */
export function useInjectedSite(): SiteShell {
  const shell = inject(SITE_SHELL_KEY)
  if (!shell) throw new Error('useInjectedSite() must be used inside the sites/[id] shell')
  return shell
}
