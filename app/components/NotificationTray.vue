<script setup lang="ts">
/**
 * Bell + dropdown tray. Quiet by design: info/success messages never pop up over the page (see
 * useToasts) — they collect here, alongside the latest stored alerts, and the bell shows a
 * count. Only warnings and errors also raise a corner toast.
 */
withDefaults(defineProps<{ placement?: 'side' | 'below' }>(), { placement: 'side' })

const { notifications, unreadCount, markAllRead } = useNotifications()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const recentAlerts = computed(() =>
  (notifications.value ?? [])
    .filter((n) => !n.dismissed)
    .slice(0, 6),
)

function toggle() {
  open.value = !open.value
}

function go(href?: string) {
  open.value = false
  if (href) navigateTo(href)
}

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      aria-label="Notifications"
      :aria-expanded="open"
      class="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
      @click="toggle"
    >
      <UiIcon name="notifications" :size="20" />
      <span
        v-if="unreadCount > 0"
        class="absolute -top-0.5 -right-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-4 font-bold text-white"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border-default bg-raised text-sm text-primary shadow-lg"
      :class="placement === 'side' ? 'top-0 left-full ml-3' : 'top-full right-0 mt-2'"
    >
      <div class="max-h-[70vh] overflow-y-auto">
        <section v-if="recentAlerts.length">
          <div class="flex items-center justify-between px-4 pt-3 pb-1">
            <h3 class="text-xs font-semibold tracking-wide text-tertiary uppercase">Alerts</h3>
            <button
              v-if="unreadCount > 0"
              type="button"
              class="cursor-pointer text-xs text-secondary hover:text-primary"
              @click="markAllRead()"
            >
              Mark all read
            </button>
          </div>
          <ul>
            <li
              v-for="n in recentAlerts"
              :key="n.id"
              class="flex cursor-pointer items-start gap-2.5 px-4 py-2 hover:bg-sunken"
              @click="go(notificationHref(n))"
            >
              <UiIcon
                :name="notificationTypeIcon[n.type]"
                :size="16"
                class="mt-0.5 shrink-0 rounded-full p-0.5"
                :class="notificationToneClass[n.type]"
              />
              <span class="min-w-0 flex-1" :class="n.read ? 'text-secondary' : 'font-medium'">{{ n.message }}</span>
              <span v-if="!n.read" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
            </li>
          </ul>
        </section>

        <p v-if="!recentAlerts.length" class="px-4 py-6 text-center text-secondary">
          Nothing new.
        </p>
      </div>
      <NuxtLink
        to="/notifications"
        class="block border-t border-border-default px-4 py-2.5 text-center text-xs font-medium text-accent no-underline hover:bg-sunken"
        @click="open = false"
      >
        View all notifications
      </NuxtLink>
    </div>
  </div>
</template>
