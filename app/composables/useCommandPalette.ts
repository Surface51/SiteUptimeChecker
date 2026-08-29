// Module-level singleton — same pattern as useToasts / useLighthouseProgress. The palette
// component watches `isOpen`; anything in the app can open it via `open()`.
const isOpen = ref(false)

export function useCommandPalette() {
  return {
    isOpen,
    open: () => {
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
    },
    toggle: () => {
      isOpen.value = !isOpen.value
    },
  }
}
