/**
 * Runs `fn` on a fixed interval while the calling component is mounted, and stops when it
 * unmounts. The site pages lean on this to keep polling scoped to what's on screen: each tab
 * is its own component, so switching away clears its interval and its endpoints stop being
 * refreshed.
 */
export function usePoll(fn: () => unknown, ms = 30_000) {
  let interval: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    interval = setInterval(fn, ms)
  })

  onUnmounted(() => {
    if (interval) clearInterval(interval)
  })
}
