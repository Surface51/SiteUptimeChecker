<script setup lang="ts">
import type { SiteSummary } from '#shared/types'

const props = defineProps<{ site: SiteSummary; activeFilterTags?: string[] }>()
const emit = defineEmits<{ removed: [], checked: [], 'toggle-filter': [tag: string] }>()

const { tags: allTags } = useTags()

const checking = ref(false)

const hostname = computed(() => {
  try {
    return new URL(props.site.url).hostname
  } catch {
    return props.site.url
  }
})

const uptimeLabel = computed(() =>
  props.site.uptime24h === null ? '—' : `${props.site.uptime24h.toFixed(2)}%`,
)

const responseLabel = computed(() => {
  const t = props.site.latestCheck?.timeTotal
  return t == null ? '—' : `${Math.round(t)} ms`
})

const performanceColor = computed(() => {
  const p = props.site.latestPerformance
  if (p === null) return 'bg-sunken text-tertiary'
  if (p >= 90) return 'bg-up-tint text-up'
  if (p >= 50) return 'bg-degraded-tint text-degraded'
  return 'bg-down-tint text-down'
})

const screenshotSrc = computed(() => {
  if (!props.site.screenshotUpdatedAt) return null
  return `/screenshots/${props.site.id}.png?v=${encodeURIComponent(props.site.screenshotUpdatedAt)}`
})

const screenshotFailed = ref(false)
watch(
  () => props.site.screenshotUpdatedAt,
  () => {
    screenshotFailed.value = false
  },
)

async function remove() {
  if (!confirm(`Remove ${props.site.name || hostname.value}?`)) return
  await $fetch(`/api/sites/${props.site.id}`, { method: 'DELETE' })
  emit('removed')
}

async function checkNow() {
  checking.value = true
  try {
    await $fetch(`/api/sites/${props.site.id}/check`, { method: 'POST' })
    emit('checked')
  } finally {
    checking.value = false
  }
}

const toggling = ref(false)
async function togglePaused() {
  toggling.value = true
  try {
    await $fetch(`/api/sites/${props.site.id}`, { method: 'PATCH', body: { enabled: !props.site.enabled } })
    emit('checked')
  } finally {
    toggling.value = false
  }
}
</script>

<template>
  <div
    class="group relative overflow-hidden rounded-lg border border-border-default bg-raised transition-colors duration-100 ease-snappy hover:border-border-strong"
  >
    <NuxtLink :to="`/sites/${site.id}`" class="block no-underline">
      <div class="aspect-video w-full overflow-hidden border-b border-border-default bg-sunken">
        <img
          v-if="screenshotSrc && !screenshotFailed"
          :src="screenshotSrc"
          alt=""
          class="h-full w-full object-cover object-top"
          @error="screenshotFailed = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-tertiary">
          <UiIcon name="public" :size="34" />
        </div>
      </div>

      <div class="flex flex-col gap-3.5 p-6">
        <div class="flex items-center justify-between gap-2">
          <h3 class="truncate font-display text-lg font-semibold text-primary">{{ site.name || hostname }}</h3>
          <StatusBadge
            :status="site.latestCheck?.status ?? null"
            :state="!site.enabled ? 'paused' : undefined"
          />
        </div>

        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-xs text-tertiary">{{ hostname }}</p>
          <span
            v-if="site.latestPerformance !== null"
            class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            :class="performanceColor"
            title="Lighthouse Performance (mobile)"
          >
            LH {{ site.latestPerformance }}
          </span>
        </div>

        <UiBadge v-if="site.inMaintenance" tone="maint" class="self-start">Maintenance</UiBadge>

        <TagEditor
          size="sm"
          :site-id="site.id"
          :tags="site.tags"
          :suggestions="allTags"
          :active-tags="activeFilterTags"
          @changed="emit('checked')"
          @toggle-filter="emit('toggle-filter', $event)"
        />

        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs text-tertiary">Uptime (24h)</div>
            <div class="text-base font-medium text-primary">{{ uptimeLabel }}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-tertiary">Response</div>
            <div class="text-base font-medium text-primary">{{ responseLabel }}</div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <Sparkline :points="site.sparkline" />
          <UiBadge
            v-if="site.latestCheck?.sslDaysRemaining !== null && site.latestCheck?.sslDaysRemaining !== undefined && site.latestCheck.sslDaysRemaining < 14"
            tone="degraded"
            class="whitespace-nowrap"
          >
            SSL {{ site.latestCheck.sslDaysRemaining }}d
          </UiBadge>
        </div>

        <UptimeBar :ticks="site.statusTicks" />
      </div>
    </NuxtLink>

    <div class="absolute top-3 right-3 hidden gap-1.5 group-hover:flex">
      <button
        type="button"
        :disabled="checking"
        class="cursor-pointer rounded-full border border-border-default bg-raised px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:bg-inverse hover:text-on-inverse disabled:opacity-50"
        @click.stop.prevent="checkNow"
      >
        {{ checking ? 'Checking…' : 'Check now' }}
      </button>
      <button
        type="button"
        :disabled="toggling"
        class="cursor-pointer rounded-full border border-border-default bg-raised px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:bg-inverse hover:text-on-inverse disabled:opacity-50"
        @click.stop.prevent="togglePaused"
      >
        {{ site.enabled ? 'Pause' : 'Resume' }}
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-full border border-border-default bg-raised px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:border-down hover:bg-down hover:text-white"
        @click.stop.prevent="remove"
      >
        Remove
      </button>
    </div>
  </div>
</template>
