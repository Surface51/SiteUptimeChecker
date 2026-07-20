<script setup lang="ts">
import type { HistoryPoint, SiteSummary } from '#shared/types'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))

const { data: site, refresh: refreshSite, error: siteError } = await useFetch<SiteSummary>(
  () => `/api/sites/${id.value}`,
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
    await Promise.all([refreshSite(), refreshHistory()])
  } finally {
    checking.value = false
  }
}

const isEditing = ref(false)
const editUrl = ref('')
const editName = ref('')
const editInterval = ref(300)
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
            <StatusBadge :status="site.latestCheck?.status ?? null" />
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
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div class="text-xs text-slate-500">Uptime (24h)</div>
        <div class="mt-1 text-2xl font-semibold text-slate-100">
          {{ site.uptime24h === null ? '—' : `${site.uptime24h.toFixed(1)}%` }}
        </div>
      </div>
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div class="text-xs text-slate-500">Uptime (7d)</div>
        <div class="mt-1 text-2xl font-semibold text-slate-100">
          {{ site.uptime7d === null ? '—' : `${site.uptime7d.toFixed(1)}%` }}
        </div>
      </div>
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
      <HistoryChart :points="history ?? []" />
    </div>

    <div v-if="site.latestCheck">
      <h2 class="mb-3 text-sm font-medium text-slate-200">Latest check details</h2>
      <CheckDetail :check="site.latestCheck" />
    </div>
    <div v-else class="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
      No checks yet — one should land shortly.
    </div>
  </div>
</template>
