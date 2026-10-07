export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  message: string
  type: ToastType
  /** Optional destination — clicking the toast (anywhere but its dismiss button) navigates here. */
  href?: string
}

export interface TrayEntry extends Toast {
  at: number
}

// Module-level (singleton) state so any component can push/consume the same toast list.
const toasts = ref<Toast[]>([])
// Every message ever pushed this session (newest first), shown in the bell tray. Popups are
// reserved for things that need attention; the rest only land here.
const history = ref<TrayEntry[]>([])
const unseenCount = ref(0)
let nextId = 1

const MAX_HISTORY = 30
const timers = new Map<number, ReturnType<typeof setTimeout>>()

// Only these interrupt the page with a popup. info/success go to the tray alone.
const POPUP_TYPES: ReadonlySet<ToastType> = new Set(['warning', 'error'])

const TYPE_TTL_MS: Record<ToastType, number> = {
  info: 5000,
  success: 5000,
  warning: 7000,
  error: 8000,
}

export function useToasts() {
  function arm(id: number, type: ToastType) {
    timers.set(id, setTimeout(() => dismiss(id), TYPE_TTL_MS[type]))
  }

  function push(message: string, type: ToastType = 'info', href?: string) {
    const id = nextId++
    history.value = [{ id, message, type, href, at: Date.now() }, ...history.value].slice(0, MAX_HISTORY)
    unseenCount.value += 1
    if (!POPUP_TYPES.has(type)) return
    toasts.value.push({ id, message, type, href })
    arm(id, type)
  }

  function dismiss(id: number) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  /** Hovering a popup holds its auto-dismiss timer; leaving re-arms it. */
  function hold(id: number) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }
  function release(id: number) {
    const toast = toasts.value.find((t) => t.id === id)
    if (toast && !timers.has(id)) arm(id, toast.type)
  }

  function markSeen() {
    unseenCount.value = 0
  }

  function clearHistory() {
    history.value = []
    unseenCount.value = 0
  }

  return { toasts, push, dismiss, hold, release, history, unseenCount, markSeen, clearHistory }
}
