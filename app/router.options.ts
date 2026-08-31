import type { RouterConfig } from '@nuxt/schema'

/** First `/sites/:id` segment of a path, or undefined if it isn't a site route. */
function siteRoot(path: string): string | undefined {
  return path.match(/^\/sites\/\d+/)?.[0]
}

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    // Back/forward navigation — restore where the user was.
    if (savedPosition) return savedPosition

    // Explicit anchor target.
    if (to.hash) return { el: to.hash, top: 0 }

    // Switching between the tabs of one site (/sites/3, /sites/3/performance,
    // /sites/3/logs/errors, …) leaves the header and tab bar on screen, so
    // snapping back to the top is jarring. Hold the current scroll position.
    const site = siteRoot(to.path)
    if (site && site === siteRoot(from.path)) return false

    return { top: 0 }
  },
}
