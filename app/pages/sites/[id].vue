<script setup lang="ts">
import type {
  DailyUptime,
  DnsRecordSet,
  HistoryPoint,
  IncidentRow,
  LighthouseFormFactor,
  LighthouseReport,
  MaintenanceWindowRow,
  NotificationRow,
  SiteSummary,
  WhoisRecord,
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

const { tags: allTags } = useTags()

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

const { data: whoisHistory, refresh: refreshWhois } = await useFetch<WhoisRecord[]>(
  () => `/api/sites/${id.value}/whois`,
  { default: () => [] },
)

const { data: dnsHistory, refresh: refreshDns } = await useFetch<DnsRecordSet[]>(
  () => `/api/sites/${id.value}/dns`,
  { default: () => [] },
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
    refreshWhois()
    refreshDns()
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
  <div v-if="siteError" class="rounded-lg border border-down bg-down-tint p-4 text-sm text-down">
    Site not found.
  </div>

  <div v-else-if="site" class="flex flex-col gap-10">
    <NuxtLink
      to="/"
      class="inline-flex w-fit items-center gap-1.5 text-sm text-secondary no-underline transition-colors hover:text-primary"
    >
      <UiIcon name="arrow_back" :size="16" />
      Back to dashboard
    </NuxtLink>

    <!-- Header -->
    <UiCard flush>
      <div class="aspect-[3/1] w-full border-b border-border-default bg-sunken">
        <img
          v-if="screenshotSrc && !screenshotFailed"
          :src="screenshotSrc"
          alt=""
          class="h-full w-full object-cover object-top"
          @error="screenshotFailed = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-tertiary">
          <UiIcon name="public" :size="44" />
        </div>
      </div>

      <div class="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="truncate font-display text-4xl font-bold tracking-tight text-primary">
              {{ site.name || hostname }}
            </h1>
            <StatusBadge
              :status="site.latestCheck?.status ?? null"
              :state="!site.enabled ? 'paused' : undefined"
              size="md"
            />
            <UiBadge v-if="site.inMaintenance" tone="maint">Maintenance</UiBadge>
          </div>
          <a
            :href="site.url"
            target="_blank"
            rel="noopener"
            class="mt-1.5 inline-block text-sm text-tertiary no-underline transition-colors hover:text-accent"
          >
            {{ site.url }}
          </a>
          <p v-if="site.latestCheck?.pageTitle" class="mt-1 truncate text-xs text-tertiary">
            {{ site.latestCheck.pageTitle }}
          </p>
          <TagEditor
            class="mt-3"
            :site-id="site.id"
            :tags="site.tags"
            :suggestions="allTags"
            @changed="() => refreshSite()"
          />
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <UiButton variant="secondary" :disabled="checking" @click="checkNow">
            {{ checking ? 'Checking…' : 'Check now' }}
          </UiButton>
          <UiButton variant="secondary" :disabled="toggling" @click="togglePaused">
            {{ site.enabled ? 'Pause' : 'Resume' }}
          </UiButton>
          <UiButton variant="ghost" @click="startEdit">Edit</UiButton>
          <UiButton variant="danger" :disabled="deleting" @click="removeSite">Remove</UiButton>
        </div>
      </div>

      <form v-if="isEditing" class="flex flex-col gap-4 border-t border-border-default p-6" @submit.prevent="saveEdit">
        <div class="flex flex-col gap-4 sm:flex-row">
          <div class="flex-1"><UiInput v-model="editUrl" label="URL" /></div>
          <div class="sm:w-52"><UiInput v-model="editName" label="Name" /></div>
          <div class="sm:w-52">
            <UiSelect v-model="editInterval" label="Interval" :options="intervalOptions" />
          </div>
        </div>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div class="sm:w-52">
            <UiInput v-model="editDegradedMs" label="Degraded threshold (ms)" type="number" min="100" max="60000" />
          </div>
          <div class="sm:w-52">
            <UiInput v-model="editExpectedStatus" label="Expected status (optional)" placeholder="e.g. 401" />
          </div>
          <div class="flex gap-2">
            <UiButton type="submit" variant="primary" :disabled="saving">
              {{ saving ? 'Saving…' : 'Save' }}
            </UiButton>
            <UiButton variant="ghost" @click="isEditing = false">Cancel</UiButton>
          </div>
        </div>
        <p v-if="editError" class="text-sm text-down">{{ editError }}</p>
      </form>
    </UiCard>

    <!-- Key stats -->
    <UiCard padding="px-8 py-7">
      <div class="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <UiStatBlock
          :value="site.uptime24h === null ? '—' : `${site.uptime24h.toFixed(2)}%`"
          label="Uptime (24h)"
          icon="monitoring"
        />
        <UiStatBlock
          :value="site.uptime7d === null ? '—' : `${site.uptime7d.toFixed(2)}%`"
          label="Uptime (7d)"
          icon="calendar_month"
        />
        <UiStatBlock
          :value="avgResponseMs === null ? '—' : `${Math.round(avgResponseMs)} ms`"
          :label="`Avg response · p95 ${p95ResponseMs === null ? '—' : `${Math.round(p95ResponseMs)} ms`}`"
          icon="speed"
        />
        <UiStatBlock
          :value="site.latestCheck?.sslDaysRemaining ?? '—'"
          label="SSL days remaining"
          icon="lock"
          :value-class="(site.latestCheck?.sslDaysRemaining ?? 999) < 14 ? 'text-degraded' : undefined"
        />
      </div>
    </UiCard>

    <!-- Availability -->
    <section class="flex flex-col gap-4">
      <UiSectionHeading>Availability</UiSectionHeading>
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <UptimeGauge label="Uptime (24h)" :value="site.uptime24h" />
        <UptimeGauge label="Uptime (7d)" :value="site.uptime7d" />
      </div>
      <UiCard>
        <UiSectionHeading as="h3" class="mb-4">Recent checks</UiSectionHeading>
        <UptimeBar :ticks="recentTicks" />
      </UiCard>
      <UiCard>
        <UiSectionHeading as="h3" class="mb-4">Daily uptime (90d)</UiSectionHeading>
        <UptimeCalendar :days="dailyUptime ?? []" />
      </UiCard>
    </section>

    <!-- Performance -->
    <section class="flex flex-col gap-4">
      <UiSectionHeading>Performance</UiSectionHeading>
      <UiCard>
        <UiSectionHeading as="h3" class="mb-4">
          Response time
          <template #actions>
            <UiSegmentedControl v-model="selectedHours" :options="hoursOptions" />
          </template>
        </UiSectionHeading>
        <ResponseTimeChart
          :points="history ?? []"
          :degraded-ms="site.degradedMs"
          :incidents="incidents ?? []"
          :maintenance-windows="maintenanceWindows ?? []"
        />
      </UiCard>
      <UiCard>
        <UiSectionHeading as="h3" class="mb-4">Lighthouse</UiSectionHeading>
        <LighthouseReport
          :site-id="id"
          :form-factor="lhFormFactor"
          :history="lighthouseHistory ?? []"
          @update:form-factor="lhFormFactor = $event"
          @ran="() => { refreshLighthouse(); refreshNotifications() }"
        />
        <div class="mt-6">
          <LighthousePerfChart :points="lighthouseHistory ?? []" />
        </div>
      </UiCard>
    </section>

    <!-- Domain & DNS -->
    <section class="flex flex-col gap-4">
      <UiSectionHeading>Domain &amp; DNS</UiSectionHeading>
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UiCard>
          <UiSectionHeading as="h3" class="mb-4">WHOIS</UiSectionHeading>
          <WhoisPanel :site-id="id" :history="whoisHistory ?? []" @ran="refreshWhois" />
        </UiCard>
        <UiCard>
          <UiSectionHeading as="h3" class="mb-4">DNS records</UiSectionHeading>
          <DnsRecordsPanel :site-id="id" :history="dnsHistory ?? []" @ran="refreshDns" />
        </UiCard>
      </div>
    </section>

    <!-- Incidents & maintenance -->
    <section class="flex flex-col gap-4">
      <UiSectionHeading>Incidents &amp; maintenance</UiSectionHeading>
      <IncidentList :incidents="incidents ?? []" />
      <UiCard v-if="(incidents ?? []).some((i) => i.endedAt !== null)">
        <UiSectionHeading as="h3" class="mb-4">Incident duration (MTTR trend)</UiSectionHeading>
        <IncidentDurationBar :incidents="incidents ?? []" />
      </UiCard>
      <MaintenanceManager :site-id="id" />
    </section>

    <!-- Activity -->
    <section class="flex flex-col gap-4">
      <UiSectionHeading>Activity</UiSectionHeading>
      <SiteNotifications :notifications="siteNotifications ?? []" />
      <CheckLog :site-id="id" />
      <UiCard v-if="site.latestCheck">
        <UiSectionHeading as="h3" class="mb-4">Latest check details</UiSectionHeading>
        <CheckDetail :check="site.latestCheck" />
      </UiCard>
      <UiEmptyState v-else icon="pending">No checks yet — one should land shortly.</UiEmptyState>
    </section>
  </div>
</template>
