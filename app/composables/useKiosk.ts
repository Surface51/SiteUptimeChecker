import type { SiteSummary } from '#shared/types'

/**
 * Kiosk (wall-display) mode: app.vue hides the sidebar and lets the page use the full width while
 * this is on. Only the page that offers kiosk mode flips it, and must switch it off on unmount.
 */
export function useKiosk() {
  const active = useState('kiosk', () => false)
  return { active }
}

/**
 * Everything a page needs to offer kiosk mode: `?kiosk=1` turns it on at load, `setKiosk` toggles it
 * (keeping the URL in step so a wall display can be bookmarked), leaving fullscreen with Esc leaves
 * kiosk too, and while it is on the site list is re-fetched every 10s on top of useSites' own poll.
 */
export function useKioskMode(sites: Ref<SiteSummary[]>, refresh: () => unknown) {
  const { active: kiosk } = useKiosk()
  const route = useRoute()
  const router = useRouter()

  async function setKiosk(on: boolean) {
    kiosk.value = on
    await router.replace({ query: { ...route.query, kiosk: on ? '1' : undefined } })
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen()
      if (!on && document.fullscreenElement) await document.exitFullscreen()
    } catch {
      // Fullscreen can be refused (no user gesture on a ?kiosk=1 load); the kiosk layout still applies.
    }
  }

  function onFullscreenChange() {
    if (!document.fullscreenElement && kiosk.value) {
      kiosk.value = false
      router.replace({ query: { ...route.query, kiosk: undefined } })
    }
  }

  usePoll(() => {
    if (kiosk.value) refresh()
  }, 10_000)

  const lastUpdated = ref(Date.now())
  const now = ref(Date.now())
  let clock: ReturnType<typeof setInterval> | undefined

  watch(sites, () => (lastUpdated.value = Date.now()))

  onMounted(() => {
    kiosk.value = route.query.kiosk === '1'
    document.addEventListener('fullscreenchange', onFullscreenChange)
    clock = setInterval(() => (now.value = Date.now()), 1000)
  })

  onUnmounted(() => {
    kiosk.value = false
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    if (clock) clearInterval(clock)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  })

  const secondsAgo = computed(() => Math.max(0, Math.round((now.value - lastUpdated.value) / 1000)))

  return { kiosk, setKiosk, secondsAgo }
}
