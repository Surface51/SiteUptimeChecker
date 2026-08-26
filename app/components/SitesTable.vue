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
  return v === null ? '—' : `${v.toFixed(2)}%`
}
function formatMs(v: number | null | undefined) {
  return v == null ? '—' : `${Math.round(v)} ms`
}
function performanceColor(p: number | null) {
  if (p === null) return 'bg-sunken text-tertiary'
  if (p >= 90) return 'bg-up-tint text-up'
  if (p >= 50) return 'bg-degraded-tint text-degraded'
  return 'bg-down-tint text-down'
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
  <div class="overflow-x-auto rounded-lg border border-border-default bg-raised">
    <table class="w-full min-w-[820px] border-collapse text-sm">
      <thead>
        <tr class="border-b border-border-default text-left">
          <th
            v-for="col in columns"
            :key="col.key"
            class="cursor-pointer px-4 py-3.5 text-xs font-semibold tracking-wide whitespace-nowrap text-tertiary uppercase select-none transition-colors hover:text-primary"
            :class="col.align === 'right' ? 'text-right' : 'text-left'"
            @click="setSort(col.key)"
          >
            <span class="inline-flex items-center gap-1" :class="col.align === 'right' ? 'flex-row-reverse' : ''">
              {{ col.label }}
              <span v-if="sortKey === col.key" class="text-accent">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </span>
          </th>
          <th class="px-4 py-3.5" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="site in sortedSites"
          :key="site.id"
          class="cursor-pointer border-b border-border-default transition-colors last:border-0 hover:bg-sunken"
          @click="$router.push(`/sites/${site.id}`)"
        >
          <td class="px-4 py-3.5">
            <div class="font-medium text-primary">{{ site.name || hostnameOf(site.url) }}</div>
            <div class="truncate text-xs text-tertiary">{{ hostnameOf(site.url) }}</div>
            <div v-if="site.tags.length" class="mt-1.5 flex flex-wrap gap-1">
              <span
                v-for="tag in site.tags"
                :key="tag"
                class="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold text-secondary"
              >
                {{ tag }}
              </span>
            </div>
          </td>
          <td class="px-4 py-3.5">
            <StatusBadge
              :status="site.latestCheck?.status ?? null"
              :state="!site.enabled ? 'paused' : undefined"
            />
          </td>
          <td class="px-4 py-3.5 text-right text-secondary">{{ formatPct(site.uptime24h) }}</td>
          <td class="px-4 py-3.5 text-right text-secondary">{{ formatPct(site.uptime7d) }}</td>
          <td class="px-4 py-3.5 text-right text-secondary">{{ formatMs(site.latestCheck?.timeTotal) }}</td>
          <td class="px-4 py-3.5 text-right">
            <span
              v-if="site.latestPerformance !== null"
              class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              :class="performanceColor(site.latestPerformance)"
            >
              {{ site.latestPerformance }}
            </span>
            <span v-else class="text-tertiary">—</span>
          </td>
          <td class="px-4 py-3.5 text-right">
            <span
              v-if="site.latestPerformanceDesktop !== null"
              class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              :class="performanceColor(site.latestPerformanceDesktop)"
            >
              {{ site.latestPerformanceDesktop }}
            </span>
            <span v-else class="text-tertiary">—</span>
          </td>
          <td
            class="px-4 py-3.5 text-right"
            :class="(site.latestCheck?.sslDaysRemaining ?? 999) < 14 ? 'font-medium text-degraded' : 'text-secondary'"
          >
            {{ site.latestCheck?.sslDaysRemaining ?? '—' }}
          </td>
          <td class="px-4 py-3.5 text-right text-tertiary">{{ formatRelative(site.latestCheck?.checkedAt) }}</td>
          <td class="px-4 py-3.5 text-right">
            <div class="relative inline-block text-left" @click.stop>
              <button
                type="button"
                class="cursor-pointer rounded-full border border-border-default px-3 py-1 text-xs font-medium text-secondary transition-colors hover:bg-inverse hover:text-on-inverse"
                @click="toggleMenu(site.id)"
              >
                Actions ▾
              </button>

              <div v-if="openMenuId === site.id" class="fixed inset-0 z-10" @click="closeMenu" />

              <div
                v-if="openMenuId === site.id"
                class="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-md border border-border-default bg-raised py-1"
              >
                <button
                  type="button"
                  :disabled="checkingId === site.id"
                  class="block w-full cursor-pointer px-3.5 py-2 text-left text-xs text-secondary transition-colors hover:bg-sunken hover:text-primary disabled:opacity-50"
                  @click="checkNow(site)"
                >
                  {{ checkingId === site.id ? 'Checking…' : 'Check now' }}
                </button>
                <button
                  type="button"
                  :disabled="runningLighthouseId === site.id"
                  class="block w-full cursor-pointer px-3.5 py-2 text-left text-xs text-secondary transition-colors hover:bg-sunken hover:text-primary disabled:opacity-50"
                  @click="runLighthouseNow(site)"
                >
                  {{ runningLighthouseId === site.id ? 'Running…' : 'Run Lighthouse now' }}
                </button>
                <div class="my-1 border-t border-border-default" />
                <button
                  type="button"
                  class="block w-full cursor-pointer px-3.5 py-2 text-left text-xs text-down transition-colors hover:bg-down-tint"
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
