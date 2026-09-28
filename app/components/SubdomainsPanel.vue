<script setup lang="ts">
import type { SubdomainRow, SubdomainScanState, SubdomainSource } from '#shared/types'

const props = defineProps<{ siteId: number; subdomains: SubdomainRow[]; scan: SubdomainScanState | null }>()
const emit = defineEmits<{ ran: [] }>()

const showIgnored = ref(false)

const EXPIRY_WARNING_DAYS = 30

function problemRank(row: SubdomainRow): number {
  if (!row.resolves) return 0
  if (row.httpStatus !== null && (row.httpStatus >= 500 || row.httpStatus >= 400)) return 1
  if (row.sslDaysRemaining !== null && row.sslDaysRemaining < EXPIRY_WARNING_DAYS) return 2
  return 3
}

const visibleRows = computed(() => {
  const list = props.subdomains.filter((s) => showIgnored.value || !s.ignored)
  return [...list].sort((a, b) => {
    const diff = problemRank(a) - problemRank(b)
    return diff !== 0 ? diff : a.hostname.localeCompare(b.hostname)
  })
})

const ignoredCount = computed(() => props.subdomains.filter((s) => s.ignored).length)

const SOURCE_LABELS: Record<SubdomainSource, string> = { cert: 'Cert', dns: 'DNS', ct: 'CT' }

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}

function httpTone(status: number | null): 'up' | 'degraded' | 'down' | 'neutral' {
  if (status === null) return 'neutral'
  if (status >= 500) return 'down'
  if (status >= 400) return 'degraded'
  if (status >= 300) return 'neutral'
  return 'up'
}

function certClass(days: number | null): string {
  if (days === null) return 'text-tertiary'
  if (days < 7) return 'font-medium text-down'
  if (days < EXPIRY_WARNING_DAYS) return 'font-medium text-degraded'
  return 'text-secondary'
}

const scanning = ref(false)
async function rescan() {
  scanning.value = true
  try {
    await $fetch(`/api/sites/${props.siteId}/subdomains/scan`, { method: 'POST', query: { force: 'true' } })
    emit('ran')
  } finally {
    scanning.value = false
  }
}

async function toggleIgnored(row: SubdomainRow) {
  await $fetch(`/api/sites/${props.siteId}/subdomains/${encodeURIComponent(row.hostname)}`, {
    method: 'PATCH',
    body: { ignored: !row.ignored },
  })
  emit('ran')
}
</script>

<template>
  <UiCard>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <UiSectionHeading as="h3">Subdomains</UiSectionHeading>
      <div class="flex items-center gap-3">
        <div class="text-xs text-tertiary">
          {{ scan ? `Last scanned ${formatTime(scan.scannedAt)}` : 'No scan yet' }}
        </div>
        <UiButton variant="secondary" :disabled="scanning" @click="rescan">
          {{ scanning ? 'Scanning…' : 'Rescan' }}
        </UiButton>
      </div>
    </div>

    <p v-if="scan?.wildcard" class="mb-4 text-xs text-degraded">
      Wildcard DNS detected on the root domain — every label would appear to resolve, so the DNS
      wordlist probe was skipped this scan. Results below are from certificate SANs and Certificate
      Transparency only.
    </p>

    <UiEmptyState v-if="!subdomains.length" icon="dns">
      No subdomains discovered yet — click "Rescan" to look for some.
    </UiEmptyState>

    <template v-else>
      <div class="overflow-x-auto rounded-lg border border-border-default bg-raised">
        <table class="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr class="border-b border-border-default text-left">
              <th class="px-4 py-3 text-xs font-semibold tracking-wide text-tertiary uppercase">Hostname</th>
              <th class="px-4 py-3 text-xs font-semibold tracking-wide text-tertiary uppercase">Source</th>
              <th class="px-4 py-3 text-xs font-semibold tracking-wide text-tertiary uppercase">Resolves</th>
              <th class="px-4 py-3 text-xs font-semibold tracking-wide text-tertiary uppercase">HTTP</th>
              <th class="px-4 py-3 text-xs font-semibold tracking-wide text-tertiary uppercase">Cert</th>
              <th class="px-4 py-3 text-xs font-semibold tracking-wide text-tertiary uppercase">Seen</th>
              <th class="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.hostname"
              class="border-b border-border-default last:border-0"
              :class="row.ignored ? 'opacity-50' : ''"
            >
              <td class="px-4 py-3">
                <a
                  :href="`https://${row.hostname}/`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-primary hover:text-accent hover:underline"
                >
                  {{ row.hostname }}
                </a>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="source in row.sources"
                    :key="source"
                    class="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold text-secondary"
                  >
                    {{ SOURCE_LABELS[source] }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-secondary">
                <span v-if="!row.resolves" class="font-medium text-down">No</span>
                <span v-else-if="row.cname">{{ row.cname }}</span>
                <span v-else>{{ row.addresses.join(', ') || '—' }}</span>
              </td>
              <td class="px-4 py-3">
                <UiBadge v-if="row.httpStatus !== null" :tone="httpTone(row.httpStatus)">{{ row.httpStatus }}</UiBadge>
                <span v-else class="text-tertiary">—</span>
              </td>
              <td class="px-4 py-3">
                <span v-if="row.sslDaysRemaining !== null" :class="certClass(row.sslDaysRemaining)">
                  {{ row.sslDaysRemaining }}d
                </span>
                <span v-else class="text-tertiary">—</span>
              </td>
              <td class="px-4 py-3 text-xs text-tertiary">{{ formatTime(row.lastSeenAt) }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  type="button"
                  class="cursor-pointer text-xs text-tertiary transition-colors hover:text-primary"
                  @click="toggleIgnored(row)"
                >
                  {{ row.ignored ? 'Unignore' : 'Ignore' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        v-if="ignoredCount"
        type="button"
        class="mt-3 cursor-pointer text-xs text-tertiary transition-colors hover:text-primary"
        @click="showIgnored = !showIgnored"
      >
        {{ showIgnored ? 'Hide' : 'Show' }} {{ ignoredCount }} ignored
      </button>
    </template>
  </UiCard>
</template>
