<script setup lang="ts">
import type { CheckStatus, SiteSummary } from '#shared/types'

const props = defineProps<{ sites: SiteSummary[] }>()
const emit = defineEmits<{ removed: [], checked: [] }>()

type SortKey =
  | 'name'
  | 'status'
  | 'uptime24h'
  | 'uptime7d'
  | 'response'
  | 'sslDays'
  | 'lastChecked'
  | 'performance'
  | 'performanceDesktop'

const sortKey = ref<SortKey>('status')
const sortDir = ref<'asc' | 'desc'>('asc')
const checkingId = ref<number | null>(null)
const runningLighthouseId = ref<number | null>(null)
const openMenuId = ref<number | null>(null)

const { ping: pingLighthouseProgress } = useLighthouseProgress()

function toggleMenu(siteId: number) {
  openMenuId.value = openMenuId.value === siteId ? null : siteId
}
function closeMenu() {
  openMenuId.value = null
}

function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function statusRank(status: CheckStatus | null | undefined): number {
  switch (status) {
    case 'down':
      return 0
    case 'degraded':
      return 1
    case 'up':
      return 2
    default:
      return 3
  }
}

function timeOf(iso: string | undefined | null): number | null {
  if (!iso) return null
  return new Date(`${iso.replace(' ', 'T')}Z`).getTime()
}

// Nulls always sort last, regardless of direction — missing data shouldn't jump to the top on desc.
function compareNullable(a: number | null, b: number | null, dir: 1 | -1) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * dir
}

const sortedSites = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  const list = [...props.sites]

  list.sort((a, b) => {
    switch (sortKey.value) {
      case 'name': {
        const an = (a.name || hostnameOf(a.url)).toLowerCase()
        const bn = (b.name || hostnameOf(b.url)).toLowerCase()
        return an < bn ? -1 * dir : an > bn ? 1 * dir : 0
      }
      case 'status':
        return compareNullable(statusRank(a.latestCheck?.status), statusRank(b.latestCheck?.status), dir)
      case 'uptime24h':
        return compareNullable(a.uptime24h, b.uptime24h, dir)
      case 'uptime7d':
        return compareNullable(a.uptime7d, b.uptime7d, dir)
      case 'response':
        return compareNullable(a.latestCheck?.timeTotal ?? null, b.latestCheck?.timeTotal ?? null, dir)
      case 'sslDays':
        return compareNullable(a.latestCheck?.sslDaysRemaining ?? null, b.latestCheck?.sslDaysRemaining ?? null, dir)
      case 'lastChecked':
        return compareNullable(timeOf(a.latestCheck?.checkedAt), timeOf(b.latestCheck?.checkedAt), dir)
      case 'performance':
        return compareNullable(a.latestPerformance, b.latestPerformance, dir)
      case 'performanceDesktop':
        return compareNullable(a.latestPerformanceDesktop, b.latestPerformanceDesktop, dir)
      default:
        return 0
    }
  })

  return list
})

const columns: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Site' },
  { key: 'status', label: 'Status' },
  { key: 'uptime24h', label: 'Uptime 24h', align: 'right' },
  { key: 'uptime7d', label: 'Uptime 7d', align: 'right' },
  { key: 'response', label: 'Response', align: 'right' },
  { key: 'performance', label: 'Perf · Mobile', align: 'right' },
  { key: 'performanceDesktop', label: 'Perf · Desktop', align: 'right' },
  { key: 'sslDays', label: 'SSL days', align: 'right' },
  { key: 'lastChecked', label: 'Last checked', align: 'right' },
]

function formatPct(v: number | null) {
  return v === null ? '—' : `${v.toFixed(1)}%`
}
function formatMs(v: number | null | undefined) {
  return v == null ? '—' : `${Math.round(v)} ms`
}
function performanceColor(p: number | null) {
  if (p === null) return 'bg-slate-800/60 text-slate-500'
  if (p >= 90) return 'bg-emerald-900/40 text-emerald-300'
  if (p >= 50) return 'bg-amber-900/40 text-amber-300'
  return 'bg-rose-900/40 text-rose-300'
}

function formatRelative(iso: string | undefined | null) {
  const t = timeOf(iso)
  if (t === null) return '—'
  const diffSec = Math.round((Date.now() - t) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`
  return `${Math.round(diffSec / 86400)}d ago`
}

async function remove(site: SiteSummary) {
  closeMenu()
  if (!confirm(`Remove ${site.name || hostnameOf(site.url)}?`)) return
  await $fetch(`/api/sites/${site.id}`, { method: 'DELETE' })
  emit('removed')
}

async function checkNow(site: SiteSummary) {
  closeMenu()
  checkingId.value = site.id
  try {
    await $fetch(`/api/sites/${site.id}/check`, { method: 'POST' })
    emit('checked')
  } finally {
    checkingId.value = null
  }
}

async function runLighthouseNow(site: SiteSummary) {
  closeMenu()
  runningLighthouseId.value = site.id
  pingLighthouseProgress()
  try {
    // Omitting formFactor runs both mobile and desktop in one call (serialized server-side).
    await $fetch(`/api/sites/${site.id}/lighthouse`, { method: 'POST' })
    emit('checked')
  } finally {
    runningLighthouseId.value = null
  }
}
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
    <table class="w-full min-w-[820px] border-collapse text-sm">
      <thead>
        <tr class="border-b border-slate-800 text-left text-xs text-slate-500">
          <th
            v-for="col in columns"
            :key="col.key"
            class="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 font-medium hover:text-slate-300"
            :class="col.align === 'right' ? 'text-right' : 'text-left'"
            @click="setSort(col.key)"
          >
            <span class="inline-flex items-center gap-1" :class="col.align === 'right' ? 'flex-row-reverse' : ''">
              {{ col.label }}
              <span v-if="sortKey === col.key" class="text-slate-400">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </span>
          </th>
          <th class="px-4 py-2.5" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="site in sortedSites"
          :key="site.id"
          class="cursor-pointer border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40"
          @click="$router.push(`/sites/${site.id}`)"
        >
          <td class="px-4 py-2.5">
            <div class="font-medium text-slate-100">{{ site.name || hostnameOf(site.url) }}</div>
            <div class="truncate text-xs text-slate-500">{{ hostnameOf(site.url) }}</div>
          </td>
          <td class="px-4 py-2.5">
            <StatusBadge :status="site.latestCheck?.status ?? null" />
          </td>
          <td class="px-4 py-2.5 text-right text-slate-300">{{ formatPct(site.uptime24h) }}</td>
          <td class="px-4 py-2.5 text-right text-slate-300">{{ formatPct(site.uptime7d) }}</td>
          <td class="px-4 py-2.5 text-right text-slate-300">{{ formatMs(site.latestCheck?.timeTotal) }}</td>
          <td class="px-4 py-2.5 text-right">
            <span
              v-if="site.latestPerformance !== null"
              class="rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="performanceColor(site.latestPerformance)"
            >
              {{ site.latestPerformance }}
            </span>
            <span v-else class="text-slate-500">—</span>
          </td>
          <td class="px-4 py-2.5 text-right">
            <span
              v-if="site.latestPerformanceDesktop !== null"
              class="rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="performanceColor(site.latestPerformanceDesktop)"
            >
              {{ site.latestPerformanceDesktop }}
            </span>
            <span v-else class="text-slate-500">—</span>
          </td>
          <td
            class="px-4 py-2.5 text-right"
            :class="(site.latestCheck?.sslDaysRemaining ?? 999) < 14 ? 'text-amber-300' : 'text-slate-300'"
          >
            {{ site.latestCheck?.sslDaysRemaining ?? '—' }}
          </td>
          <td class="px-4 py-2.5 text-right text-slate-500">{{ formatRelative(site.latestCheck?.checkedAt) }}</td>
          <td class="px-4 py-2.5 text-right">
            <div class="relative inline-block text-left" @click.stop>
              <button
                type="button"
                class="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                @click="toggleMenu(site.id)"
              >
                Actions ▾
              </button>

              <div v-if="openMenuId === site.id" class="fixed inset-0 z-10" @click="closeMenu" />

              <div
                v-if="openMenuId === site.id"
                class="absolute right-0 z-20 mt-1 w-44 rounded-md border border-slate-800 bg-slate-900 py-1 shadow-xl"
              >
                <button
                  type="button"
                  :disabled="checkingId === site.id"
                  class="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  @click="checkNow(site)"
                >
                  {{ checkingId === site.id ? 'Checking…' : 'Check now' }}
                </button>
                <button
                  type="button"
                  :disabled="runningLighthouseId === site.id"
                  class="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  @click="runLighthouseNow(site)"
                >
                  {{ runningLighthouseId === site.id ? 'Running…' : 'Run Lighthouse now' }}
                </button>
                <div class="my-1 border-t border-slate-800" />
                <button
                  type="button"
                  class="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-rose-950/60 hover:text-rose-300"
                  @click="remove(site)"
                >
                  Remove
                </button>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
