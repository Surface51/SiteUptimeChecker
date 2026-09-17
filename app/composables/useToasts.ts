export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  message: string
  type: ToastType
  /** Optional destination — clicking the toast (anywhere but its dismiss button) navigates here. */
  href?: string
}

// Module-level (singleton) state so any component can push/consume the same toast list.
const toasts = ref<Toast[]>([])
let nextId = 1

const TYPE_TTL_MS: Record<ToastType, number> = {
  info: 5000,
  success: 5000,
  warning: 7000,
  error: 8000,
}

export function useToasts() {
  function push(message: string, type: ToastType = 'info', href?: string) {
    const id = nextId++
    toasts.value.push({ id, message, type, href })
    setTimeout(() => dismiss(id), TYPE_TTL_MS[type])
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, push, dismiss }
}
