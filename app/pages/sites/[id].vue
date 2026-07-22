<script setup lang="ts">
import type {
  DailyUptime,
  HistoryPoint,
  IncidentRow,
  LighthouseFormFactor,
  LighthouseReport,
  MaintenanceWindowRow,
  NotificationRow,
  SiteSummary,
} from '#shared/types'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))

const { data: site, refresh: refreshSite, error: siteError } = await useFetch<SiteSummary>(
  () => `/api/sites/${id.value}`,
)

const { data: incidents, refresh: refreshIncidents } = await useFetch<IncidentRow[]>(
  () => `/api/sites/${id.value}/incidents`,
  { default: () => [] },
)

const { data: siteNotifications, refresh: refreshNotifications } = await useFetch<NotificationRow[]>(
  () => `/api/sites/${id.value}/notifications`,
  { default: () => [] },
)

const { data: dailyUptime } = await useFetch<DailyUptime[]>(
  () => `/api/sites/${id.value}/daily`,
  { query: { days: 90 }, default: () => [] },
)

const { data: maintenanceWindows, refresh: refreshMaintenance } = await useFetch<MaintenanceWindowRow[]>(
  () => `/api/sites/${id.value}/maintenance`,
  { default: () => [] },
)

useHead({ title: () => (site.value ? site.value.name || site.value.url : 'Site Uptime') })

const hoursOptions = [
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '7d', value: 24 * 7 },
]
const selectedHours = ref(24)

const { data: history, refresh: refreshHistory } = await useFetch<HistoryPoint[]>(
  () => `/api/sites/${id.value}/history`,
  { query: computed(() => ({ hours: selectedHours.value })), default: () => [] },
)

const recentTicks = computed(() => (history.value ?? []).slice(-50))

const lhFormFactor = ref<LighthouseFormFactor>('mobile')

const { data: lighthouseHistory, refresh: refreshLighthouse } = await useFetch<LighthouseReport[]>(
  () => `/api/sites/${id.value}/lighthouse`,
  { query: computed(() => ({ formFactor: lhFormFactor.value, days: 30 })), default: () => [] },
)

const avgResponseMs = computed(() => {
  const values = (history.value ?? []).map((p) => p.timeTotal).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
})

const p95ResponseMs = computed(() => {
  const values = (history.value ?? [])
    .map((p) => p.timeTotal)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  if (!values.length) return null
  const idx = Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)
  return values[idx] ?? null
})

let interval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  interval = setInterval(() => {
    refreshSite()
    refreshHistory()
    refreshIncidents()
    refreshLighthouse()
    refreshNotifications()
    refreshMaintenance()
  }, 30_000)
})
onUnmounted(() => {
  if (interval) clearInterval(interval)
})

const hostname = computed(() => {
  if (!site.value) return ''
  try {
    return new URL(site.value.url).hostname
  } catch {
    return site.value.url
  }
})

const screenshotSrc = computed(() => {
  if (!site.value?.screenshotUpdatedAt) return null
  return `/screenshots/${site.value.id}.png?v=${encodeURIComponent(site.value.screenshotUpdatedAt)}`
})
const screenshotFailed = ref(false)

// --- actions ---
const checking = ref(false)
async function checkNow() {
  checking.value = true
  try {
    await $fetch(`/api/sites/${id.value}/check`, { method: 'POST' })
    await Promise.all([refreshSite(), refreshHistory(), refreshNotifications()])
  } finally {
    checking.value = false
  }
}

const toggling = ref(false)
async function togglePaused() {
  if (!site.value) return
  toggling.value = true
  try {
    await $fetch(`/api/sites/${id.value}`, { method: 'PATCH', body: { enabled: !site.value.enabled } })
    await refreshSite()
  } finally {
    toggling.value = false
  }
}

const isEditing = ref(false)
const editUrl = ref('')
const editName = ref('')
const editInterval = ref(300)
const editDegradedMs = ref(5000)
const editExpectedStatus = ref('')
const editError = ref('')
const saving = ref(false)

const intervalOptions = [
  { label: 'Every 1 minute', value: 60 },
  { label: 'Every 5 minutes', value: 300 },
  { label: 'Every 15 minutes', value: 900 },
  { label: 'Every hour', value: 3600 },
]

function startEdit() {
  if (!site.value) return
  editUrl.value = site.value.url
  editName.value = site.value.name || ''
  editInterval.value = site.value.checkIntervalSeconds
  editDegradedMs.value = site.value.degradedMs
  editExpectedStatus.value = site.value.expectedStatus === null ? '' : String(site.value.expectedStatus)
  editError.value = ''
  isEditing.value = true
}

async function saveEdit() {
  saving.value = true
  editError.value = ''
  try {
    await $fetch(`/api/sites/${id.value}`, {
      method: 'PATCH',
      body: {
        url: editUrl.value.trim(),
        name: editName.value.trim() || null,
        checkIntervalSeconds: editInterval.value,
        degradedMs: editDegradedMs.value,
        expectedStatus: editExpectedStatus.value.trim() === '' ? null : Number(editExpectedStatus.value),
      },
    })
    isEditing.value = false
    await refreshSite()
  } catch (e: any) {
    editError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to save changes'
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)
async function removeSite() {
  if (!site.value) return
  if (!confirm(`Remove ${site.value.name || hostname.value}? This deletes its check history too.`)) return
  deleting.value = true
  try {
    await $fetch(`/api/sites/${id.value}`, { method: 'DELETE' })
    await router.push('/')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="siteError" class="rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300">
    Site not found.
  </div>

  <div v-else-if="site" class="flex flex-col gap-6">
    <NuxtLink to="/" class="text-sm text-slate-500 hover:text-slate-300">← Back to dashboard</NuxtLink>

    <div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
      <div class="aspect-[3/1] w-full bg-slate-800/60">
        <img
          v-if="screenshotSrc && !screenshotFailed"
          :src="screenshotSrc"
          alt=""
          class="h-full w-full object-cover object-top"
          @error="screenshotFailed = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-slate-600">
          <span class="text-4xl">🌐</span>
        </div>
      </div>

      <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="truncate text-lg font-semibold text-slate-100">{{ site.name || hostname }}</h1>
            <span v-if="!site.enabled" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500">
              <span class="h-2 w-2 rounded-full bg-slate-600" />
              Paused
            </span>
            <StatusBadge v-else :status="site.latestCheck?.status ?? null" />
            <span v-if="site.inMaintenance" class="rounded-full bg-sky-900/40 px-2 py-0.5 text-[11px] font-medium text-sky-300">
              Maintenance
            </span>
          </div>
          <a :href="site.url" target="_blank" rel="noopener" class="text-sm text-slate-500 hover:text-slate-300">
            {{ site.url }}
          </a>
          <p v-if="site.latestCheck?.pageTitle" class="mt-0.5 truncate text-xs text-slate-600">
            {{ site.latestCheck.pageTitle }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            :disabled="checking"
            class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            @click="checkNow"
          >
            {{ checking ? 'Checking…' : 'Check now' }}
          </button>
          <button
            type="button"
            :disabled="toggling"
            class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            @click="togglePaused"
          >
            {{ site.enabled ? 'Pause' : 'Resume' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            @click="startEdit"
          >
            Edit
          </button>
          <button
            type="button"
            :disabled="deleting"
            class="rounded-md border border-rose-900 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-950/60 disabled:opacity-50"
            @click="removeSite"
          >
            Remove
          </button>
        </div>
      </div>

      <form v-if="isEditing" class="border-t border-slate-800 p-4" @submit.prevent="saveEdit">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="flex-1">
            <label class="mb-1 block text-xs text-slate-500">URL</label>
            <input
              v-model="editUrl"
              type="text"
              class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div class="sm:w-48">
            <label class="mb-1 block text-xs text-slate-500">Name</label>
            <input
              v-model="editName"
              type="text"
              class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div class="sm:w-44">
            <label class="mb-1 block text-xs text-slate-500">Interval</label>
            <select
              v-model.number="editInterval"
              class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
            >
              <option v-for="opt in intervalOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>
        <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="sm:w-44">
            <label class="mb-1 block text-xs text-slate-500">Degraded threshold (ms)</label>
            <input
              v-model.number="editDegradedMs"
              type="number"
              min="100"
              max="60000"
              class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div class="sm:w-44">
            <label class="mb-1 block text-xs text-slate-500">Expected status (optional)</label>
            <input
              v-model="editExpectedStatus"
              type="text"
              placeholder="e.g. 401"
              class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div class="flex gap-2">
            <button
              type="submit"
              :disabled="saving"
              class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <button
              type="button"
              class="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              @click="isEditing = false"
            >
              Cancel
            </button>
          </div>
        </div>
        <p v-if="editError" class="mt-2 text-sm text-rose-400">{{ editError }}</p>
      </form>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <UptimeGauge label="Uptime (24h)" :value="site.uptime24h" />
      <UptimeGauge label="Uptime (7d)" :value="site.uptime7d" />
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div class="text-xs text-slate-500">Avg / p95 response</div>
        <div class="mt-1 text-2xl font-semibold text-slate-100">
          {{ avgResponseMs === null ? '—' : `${Math.round(avgResponseMs)} ms` }}
          <span class="text-sm font-normal text-slate-500">
            / {{ p95ResponseMs === null ? '—' : `${Math.round(p95ResponseMs)} ms` }}
          </span>
        </div>
      </div>
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div class="text-xs text-slate-500">SSL days remaining</div>
        <div
          class="mt-1 text-2xl font-semibold"
          :class="(site.latestCheck?.sslDaysRemaining ?? 999) < 14 ? 'text-amber-300' : 'text-slate-100'"
        >
          {{ site.latestCheck?.sslDaysRemaining ?? '—' }}
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 class="mb-3 text-sm font-medium text-slate-200">Recent checks</h2>
      <UptimeBar :ticks="recentTicks" />
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 class="mb-3 text-sm font-medium text-slate-200">Daily uptime (90d)</h2>
      <UptimeCalendar :days="dailyUptime ?? []" />
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium text-slate-200">Response time</h2>
        <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
          <button
            v-for="opt in hoursOptions"
            :key="opt.value"
            type="button"
            class="rounded px-2 py-1"
            :class="selectedHours === opt.value ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="selectedHours = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <ResponseTimeChart
        :points="history ?? []"
        :degraded-ms="site.degradedMs"
        :incidents="incidents ?? []"
        :maintenance-windows="maintenanceWindows ?? []"
      />
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 class="mb-3 text-sm font-medium text-slate-200">Lighthouse performance</h2>
      <LighthouseReport
        :site-id="id"
        :form-factor="lhFormFactor"
        :history="lighthouseHistory ?? []"
        @update:form-factor="lhFormFactor = $event"
        @ran="() => { refreshLighthouse(); refreshNotifications() }"
      />
      <div class="mt-4">
        <LighthousePerfChart :points="lighthouseHistory ?? []" />
      </div>
    </div>

    <SiteNotifications :notifications="siteNotifications ?? []" />

    <div v-if="(incidents ?? []).some((i) => i.endedAt !== null)" class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 class="mb-3 text-sm font-medium text-slate-200">Incident duration (MTTR trend)</h2>
      <IncidentDurationBar :incidents="incidents ?? []" />
    </div>

    <IncidentList :incidents="incidents ?? []" />

    <MaintenanceManager :site-id="id" />

    <CheckLog :site-id="id" />

    <div v-if="site.latestCheck">
      <h2 class="mb-3 text-sm font-medium text-slate-200">Latest check details</h2>
      <CheckDetail :check="site.latestCheck" />
    </div>
    <div v-else class="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
      No checks yet — one should land shortly.
    </div>
  </div>
</template>
