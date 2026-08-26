export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'siteUptime.theme'

export function useTheme() {
  const pref = useState<ThemePref>('theme-pref', () => 'system')
  // Tracks the OS setting so `system` follows it live rather than only at load.
  const systemDark = useState<boolean>('theme-system-dark', () => false)
  // False until the client has read localStorage — lets theme-dependent markup
  // render its neutral form on the server and avoid a hydration mismatch.
  const ready = useState<boolean>('theme-ready', () => false)

  const isDark = computed(() => (pref.value === 'system' ? systemDark.value : pref.value === 'dark'))

  function setTheme(next: ThemePref) {
    pref.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode / blocked storage — the choice just won't survive a reload.
    }
  }

  if (import.meta.client) {
    onMounted(() => {
      if (ready.value) return

      const media = window.matchMedia('(prefers-color-scheme: dark)')
      systemDark.value = media.matches
      media.addEventListener('change', (e) => {
        systemDark.value = e.matches
      })

      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved === 'light' || saved === 'dark' || saved === 'system') pref.value = saved
      } catch {
        // ignore
      }

      watch(
        isDark,
        (dark) => {
          if (dark) document.documentElement.setAttribute('data-theme', 'dark')
          else document.documentElement.removeAttribute('data-theme')
        },
        { immediate: true },
      )

      ready.value = true
    })
  }

  return { pref, isDark, ready, setTheme }
}
