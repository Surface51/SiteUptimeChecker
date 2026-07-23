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
  if (p === null) return 'bg-slate-800/60 text-slate-500'
  if (p >= 90) return 'bg-emerald-900/40 text-emerald-300'
  if (p >= 50) return 'bg-amber-900/40 text-amber-300'
  return 'bg-rose-900/40 text-rose-300'
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
  <div class="group relative rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden hover:border-slate-700 transition-colors">
    <NuxtLink :to="`/sites/${site.id}`" class="block">
      <div class="aspect-video w-full bg-slate-800/60 overflow-hidden">
        <img
          v-if="screenshotSrc && !screenshotFailed"
          :src="screenshotSrc"
          alt=""
          class="h-full w-full object-cover object-top"
          @error="screenshotFailed = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-slate-600">
          <span class="text-3xl">🌐</span>
        </div>
      </div>
      <div class="p-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="truncate font-medium text-slate-100">{{ site.name || hostname }}</h3>
          <span v-if="!site.enabled" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500">
            <span class="h-2 w-2 rounded-full bg-slate-600" />
            Paused
          </span>
          <StatusBadge v-else :status="site.latestCheck?.status ?? null" />
        </div>
        <div class="mt-0.5 flex items-center justify-between gap-2">
          <p class="truncate text-xs text-slate-500">{{ hostname }}</p>
          <span
            v-if="site.latestPerformance !== null"
            class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
            :class="performanceColor"
            title="Lighthouse Performance (mobile)"
          >
            LH {{ site.latestPerformance }}
          </span>
        </div>
        <div v-if="site.inMaintenance" class="mt-1.5 inline-flex items-center rounded-full bg-sky-900/40 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          Maintenance
        </div>

        <TagEditor
          class="mt-1.5"
          size="sm"
          :site-id="site.id"
          :tags="site.tags"
          :suggestions="allTags"
          :active-tags="activeFilterTags"
          @changed="emit('checked')"
          @toggle-filter="emit('toggle-filter', $event)"
        />

        <div class="mt-3 flex items-center justify-between text-sm">
          <div>
            <div class="text-slate-500 text-xs">Uptime (24h)</div>
            <div class="text-slate-200">{{ uptimeLabel }}</div>
          </div>
          <div class="text-right">
            <div class="text-slate-500 text-xs">Response</div>
            <div class="text-slate-200">{{ responseLabel }}</div>
          </div>
        </div>

        <div class="mt-2 flex items-center justify-between gap-2">
          <Sparkline :points="site.sparkline" />
          <span
            v-if="site.latestCheck?.sslDaysRemaining !== null && site.latestCheck?.sslDaysRemaining !== undefined && site.latestCheck.sslDaysRemaining < 14"
            class="whitespace-nowrap rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] font-medium text-amber-300"
          >
            SSL expires in {{ site.latestCheck.sslDaysRemaining }}d
          </span>
        </div>

        <UptimeBar class="mt-3" :ticks="site.statusTicks" />
      </div>
    </NuxtLink>

    <div class="absolute right-2 top-2 hidden gap-1.5 group-hover:flex">
      <button
        type="button"
        :disabled="checking"
        class="rounded-md bg-slate-950/70 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        @click.stop.prevent="checkNow"
      >
        {{ checking ? 'Checking…' : 'Check now' }}
      </button>
      <button
        type="button"
        :disabled="toggling"
        class="rounded-md bg-slate-950/70 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        @click.stop.prevent="togglePaused"
      >
        {{ site.enabled ? 'Pause' : 'Resume' }}
      </button>
      <button
        type="button"
        class="rounded-md bg-slate-950/70 px-2 py-1 text-xs text-slate-300 hover:bg-rose-900/70 hover:text-rose-200"
        @click.stop.prevent="remove"
      >
        Remove
      </button>
    </div>
  </div>
</template>
