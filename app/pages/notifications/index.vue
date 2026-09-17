<script setup lang="ts">
import { NOTIFICATION_TYPES, type NotificationRow } from '#shared/types'

useHead({ title: 'Notifications — Site Uptime' })

const { sites } = useSites()
const { push: pushToast } = useToasts()

// These three actions used to live in the header's NotificationBell dropdown,
// which the sidebar redesign replaced with a plain unread badge.
const {
  markAllRead,
  desktopEnabled,
  enableDesktopNotifications,
  disableDesktopNotifications,
} = useNotifications()

const READ_OPTIONS = [
  { label: 'All', value: 'all' as const },
  { label: 'Unread only', value: 'unread' as const },
]

const SEVERITY_OPTIONS: { label: string; value: 'critical' | 'warning' | 'info' | '' }[] = [
  { label: 'All severities', value: '' },
  { label: notificationSeverityLabel.critical, value: 'critical' },
  { label: notificationSeverityLabel.warning, value: 'warning' },
  { label: notificationSeverityLabel.info, value: 'info' },
]

const siteId = ref<number | ''>('')
const type = ref<NotificationRow['type'] | ''>('')
const severity = ref<'critical' | 'warning' | 'info' | ''>('')
const readFilter = ref<'all' | 'unread'>('all')

// Type is the more specific of the two, so picking one clears the other rather than leaving a
// selected-but-ignored control on screen.
watch(type, (value) => {
  if (value !== '') severity.value = ''
})
watch(severity, (value) => {
  if (value !== '') type.value = ''
})

const searchInput = ref('')
const q = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    q.value = value.trim()
  }, 300)
})

const LIMIT = 50
const offset = ref(0)

// Resets pagination whenever a filter (not the offset itself) changes.
watch([siteId, type, severity, readFilter, q], () => {
  offset.value = 0
})

// Severity has no column of its own — the type dropdown wins when both are set (it's the more
// specific filter), otherwise a severity picks the types API filter can already narrow by.
const severityTypes = computed(() =>
  NOTIFICATION_TYPES.filter((t) => notificationSeverity[t] === severity.value),
)

const listQuery = computed(() => ({
  includeDismissed: 'true',
  limit: LIMIT,
  offset: offset.value,
  ...(siteId.value !== '' ? { siteId: siteId.value } : {}),
  ...(type.value !== ''
    ? { type: type.value }
    : severity.value
      ? { types: severityTypes.value.join(',') }
      : {}),
  ...(readFilter.value === 'unread' ? { unreadOnly: 'true' } : {}),
  ...(q.value ? { q: q.value } : {}),
}))

const countQuery = computed(() => {
  const { limit, offset: _offset, ...rest } = listQuery.value
  return rest
})

const { data: page, refresh, pending } = useFetch<NotificationRow[]>('/api/notifications', {
  query: listQuery,
  default: () => [],
})
const { data: countData, refresh: refreshCount } = useFetch<{ count: number }>('/api/notifications/count', {
  query: countQuery,
  default: () => ({ count: 0 }),
})

// Accumulates pages as "Load more" advances the offset, resetting whenever the query itself
// (not just the offset) changes underneath it.
const rows = ref<NotificationRow[]>([])
watch(
  page,
  (value) => {
    rows.value = offset.value === 0 ? (value ?? []) : [...rows.value, ...(value ?? [])]
  },
)
watch(listQuery, (next, prev) => {
  if (next.offset === prev.offset) rows.value = []
})

const hasMore = computed(() => rows.value.length < (countData.value?.count ?? 0))

function loadMore() {
  offset.value += LIMIT
}

async function reload() {
  offset.value = 0
  await Promise.all([refresh(), refreshCount()])
}

function dayLabel(iso: string): string {
  const date = new Date(`${iso.replace(' ', 'T')}Z`)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

const groups = computed(() => {
  const out: { label: string; rows: NotificationRow[] }[] = []
  for (const n of rows.value) {
    const label = dayLabel(n.createdAt)
    const last = out[out.length - 1]
    if (last && last.label === label) last.rows.push(n)
    else out.push({ label, rows: [n] })
  }
  return out
})

async function markRead(n: NotificationRow) {
  if (n.read) return
  await $fetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
  rows.value = rows.value.map((row) => (row.id === n.id ? { ...row, read: true } : row))
}

function onNotificationClick(n: NotificationRow) {
  // Fire-and-forget: the navigation itself shouldn't wait on this, and cmd/middle-click
  // (which never calls this handler) still lands on an unread-looking row — acceptable, since
  // the poll's own refresh will catch it up.
  markRead(n)
}

async function toggleRead(n: NotificationRow) {
  await $fetch(`/api/notifications/${n.id}/${n.read ? 'unread' : 'read'}`, { method: 'POST' })
  rows.value = rows.value.map((row) => (row.id === n.id ? { ...row, read: !row.read } : row))
}

async function dismissOne(n: NotificationRow) {
  rows.value = rows.value.filter((row) => row.id !== n.id)
  await $fetch(`/api/notifications/${n.id}/dismiss`, { method: 'POST' })
  await refreshCount()
}

async function onMarkAllRead() {
  await markAllRead()
  rows.value = rows.value.map((row) => ({ ...row, read: true }))
}

async function onClearAll() {
  // Independent of the filters above: "Clear all" dismisses every active notification, same as
  // it always has, but now with a confirmation and an undo. The 200-row cap matches the list
  // API's own max page size — beyond that, the extras still get dismissed but fall outside what
  // "Undo" can restore, same trade-off the old unlimited "Clear" made with no undo at all.
  const active = await $fetch<NotificationRow[]>('/api/notifications', { query: { limit: 200 } })
  if (!active.length) return
  if (!confirm(`Clear ${active.length} notification${active.length === 1 ? '' : 's'}?`)) return

  await $fetch('/api/notifications/dismiss-all', { method: 'POST' })
  await reload()
  pushToast(`Cleared ${active.length} notification${active.length === 1 ? '' : 's'}.`, 'info')
  lastClearedIds.value = active.map((n) => n.id)
}

const lastClearedIds = ref<number[] | null>(null)
async function undoClear() {
  if (!lastClearedIds.value) return
  await $fetch('/api/notifications/restore', { method: 'POST', body: { ids: lastClearedIds.value } })
  lastClearedIds.value = null
  await reload()
}

function toggleDesktop() {
  if (desktopEnabled.value) disableDesktopNotifications()
  else enableDesktopNotifications()
}
</script>

<template>
  <div class="flex flex-col gap-9">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Notifications</h1>
        <p class="mt-1.5 text-base text-secondary">Full history across all monitored sites.</p>
      </div>
      <div class="flex flex-wrap gap-2.5">
        <UiButton
          variant="ghost"
          :icon="desktopEnabled ? 'notifications_active' : 'notifications_off'"
          @click="toggleDesktop"
        >
          {{ desktopEnabled ? 'Desktop on' : 'Enable desktop' }}
        </UiButton>
        <UiButton variant="ghost" icon="clear_all" @click="onClearAll">Clear all</UiButton>
        <UiButton variant="secondary" icon="done_all" @click="onMarkAllRead">Mark all read</UiButton>
      </div>
    </div>

    <UiCard>
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-end gap-4">
          <div class="w-52">
            <UiSelect
              v-model="siteId"
              label="Site"
              :options="[
                { label: 'All sites', value: '' },
                ...sites.map((s) => ({ label: s.name || s.url, value: s.id })),
              ]"
            />
          </div>
          <div class="w-52">
            <UiSelect v-model="type" label="Type" :options="notificationTypeOptions" />
          </div>
          <div class="w-44">
            <UiSelect v-model="severity" label="Severity" :options="SEVERITY_OPTIONS" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-secondary">Status</span>
            <UiSegmentedControl v-model="readFilter" :options="READ_OPTIONS" />
          </div>
          <div class="ml-auto">
            <UiButton variant="ghost" icon="refresh" @click="reload">Refresh</UiButton>
          </div>
        </div>
        <UiInput v-model="searchInput" label="Search" placeholder="Search message text or IP…" />
      </div>
    </UiCard>

    <div v-if="lastClearedIds" class="flex items-center gap-3 rounded-lg border border-border-default bg-sunken px-4 py-3 text-sm text-secondary">
      <UiIcon name="info" :size="16" />
      <span class="flex-1">Notifications cleared.</span>
      <button type="button" class="cursor-pointer font-medium text-accent transition-colors hover:text-accent-hover" @click="undoClear">
        Undo
      </button>
    </div>

    <div class="overflow-hidden rounded-lg border border-border-default bg-raised">
      <div v-if="pending && !rows.length" class="p-10 text-center text-sm text-tertiary">Loading…</div>
      <div v-else-if="!rows.length" class="p-10 text-center text-sm text-tertiary">
        No notifications match these filters.
      </div>
      <template v-else>
        <div v-for="group in groups" :key="group.label">
          <div class="border-b border-border-default bg-sunken px-6 py-2 text-xs font-semibold tracking-wide text-tertiary uppercase">
            {{ group.label }}
          </div>
          <div
            v-for="n in group.rows"
            :key="n.id"
            class="group flex w-full items-center gap-3.5 border-b border-border-default px-6 py-4.5 transition-colors last:border-0 hover:bg-sunken"
            :class="n.read ? 'bg-transparent' : 'bg-sunken'"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              :class="notificationToneClass[n.type]"
            >
              <UiIcon :name="notificationTypeIcon[n.type] || 'notifications'" :size="18" />
            </span>
            <NuxtLink :to="notificationHref(n)" class="min-w-0 flex-1 no-underline" @click="onNotificationClick(n)">
              <span class="block text-sm text-primary" :class="n.read ? 'font-normal' : 'font-semibold'">
                {{ n.message }}
              </span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
                <span>{{ n.siteName || n.siteUrl }}</span>
                <span>·</span>
                <span :title="formatAbsoluteTime(n.createdAt)">{{ formatRelativeTime(n.createdAt) }}</span>
                <span v-if="n.dismissed" class="rounded-full bg-sunken px-2 py-0.5 text-[10px] text-secondary">
                  Cleared
                </span>
              </span>
            </NuxtLink>
            <span v-if="!n.read" class="h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                class="cursor-pointer rounded-full p-1.5 text-tertiary transition-colors hover:bg-raised hover:text-primary"
                :title="n.read ? 'Mark unread' : 'Mark read'"
                @click="toggleRead(n)"
              >
                <UiIcon :name="n.read ? 'mark_email_unread' : 'mark_email_read'" :size="16" />
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-full p-1.5 text-tertiary transition-colors hover:bg-raised hover:text-primary"
                title="Dismiss"
                @click="dismissOne(n)"
              >
                <UiIcon name="close" :size="16" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="hasMore" class="flex justify-center">
      <UiButton variant="ghost" :disabled="pending" @click="loadMore">Load more</UiButton>
    </div>
  </div>
</template>
