<script setup lang="ts">
import type { NotificationRow } from '#shared/types'
import { chartColors, logSeriesPalette, type EChartsOption } from '~/utils/echarts'
import { formatCount, formatExact, formatLogTime, logTimeMs } from '~/utils/logFormat'

interface IncidentResponse {
  notification: NotificationRow
  unavailable: string | null
  ipEvidence: {
    profile: Record<string, unknown> | null
    recentRequests: Record<string, unknown>[]
    topPaths: (Record<string, unknown> & { suspicious: boolean })[]
    requestsPerMinute: { bucket: string; status: string; count: number }[]
  } | null
  logContext: {
    requests: { bucket: string; series: string; value: number }[]
    topPaths: Record<string, unknown>[]
    phpErrors: Record<string, unknown>[]
    fpmEvents: Record<string, unknown>[]
    topIps: Record<string, unknown>[]
  } | null
}

const props = defineProps<{ data: IncidentResponse }>()

const n = computed(() => props.data.notification)
const context = computed(() => n.value.context)
const { push: pushToast } = useToasts()

// Narrowed per-kind views of the context, rather than switching on `context.kind` inline in the
// template — keeps every branch below simply typed instead of leaning on template-level
// discriminated-union narrowing.
const ipCtx = computed(() => (context.value?.kind === 'threat_ip' ? context.value : null))
const logSpikeCtx = computed(() => (context.value?.kind === 'log_spike' ? context.value : null))
const checkCtx = computed(() => (context.value?.kind === 'check' ? context.value : null))
const sslCtx = computed(() => (context.value?.kind === 'ssl' ? context.value : null))
const domainCtx = computed(() => (context.value?.kind === 'domain' ? context.value : null))
const contentCtx = computed(() => (context.value?.kind === 'content' ? context.value : null))
const lighthouseCtx = computed(() => (context.value?.kind === 'lighthouse' ? context.value : null))

// log_spike and check share the same evidence (a log-analytics join over the alert's window) —
// one flag covers both branches for the shared chart-and-lists block below.
const showsLogContext = computed(() => !!logSpikeCtx.value || !!checkCtx.value)

function formatWindow(win: { from: string; to: string }): string {
  const from = new Date(win.from)
  const to = new Date(win.to)
  const sameDay = from.toDateString() === to.toDateString()
  return sameDay
    ? `${from.toLocaleString()} – ${to.toLocaleTimeString()}`
    : `${from.toLocaleString()} – ${to.toLocaleString()}`
}

// ---- threat_ip ----

const ipChartOption = computed<EChartsOption>(() => {
  const rows = props.data.ipEvidence?.requestsPerMinute ?? []
  const palette = logSeriesPalette()
  const split = (status: string) =>
    rows
      .filter((row) => row.status === status)
      .map((row) => [logTimeMs(row.bucket), Number(row.count)] as [number, number])
      .sort((a, b) => a[0] - b[0])

  return {
    grid: { left: 48, right: 12, top: 28, bottom: 24 },
    legend: { top: 0, textStyle: { fontSize: 10 }, itemHeight: 8, itemWidth: 12 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatCount(v) } },
    tooltip: { trigger: 'axis' },
    series: [
      {
        name: 'OK responses',
        type: 'bar',
        stack: 'req',
        data: split('ok'),
        itemStyle: { color: palette[0], borderColor: chartColors.surface, borderWidth: 1 },
      },
      {
        name: 'Error responses',
        type: 'bar',
        stack: 'req',
        data: split('error'),
        itemStyle: { color: palette[1], borderColor: chartColors.surface, borderWidth: 1 },
      },
    ],
  }
})

// ---- log_spike / check (shared log-context rendering) ----

const logChartOption = computed<EChartsOption>(() => {
  const rows = props.data.logContext?.requests ?? []
  const split = (name: string) =>
    rows
      .filter((row) => row.series === name)
      .map((row) => [logTimeMs(row.bucket), Number(row.value)] as [number, number])
      .sort((a, b) => a[0] - b[0])

  return {
    grid: { left: 48, right: 12, top: 28, bottom: 24 },
    legend: { top: 0, textStyle: { fontSize: 10 }, itemHeight: 8, itemWidth: 12 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatCount(v) } },
    tooltip: { trigger: 'axis' },
    series: [
      {
        name: 'Other responses',
        type: 'bar',
        stack: 'req',
        data: split('other'),
        itemStyle: { color: chartColors.neutral, borderColor: chartColors.surface, borderWidth: 1 },
      },
      {
        name: '5xx',
        type: 'bar',
        stack: 'req',
        data: split('5xx'),
        itemStyle: { color: chartColors.down, borderColor: chartColors.surface, borderWidth: 1 },
      },
    ],
  }
})

const hasLogContext = computed(() => {
  const c = props.data.logContext
  return !!c && (c.requests.length > 0 || c.phpErrors.length > 0 || c.fpmEvents.length > 0)
})

// ---- actions (threat_ip only) ----

const copyingRule = ref(false)
async function copyDenyRule(ip: string) {
  copyingRule.value = true
  try {
    const result = await $fetch<{ nginxDeny: string }>(`/api/sites/${n.value.siteId}/logs/security/block-rules`, {
      query: { ips: ip },
    })
    await navigator.clipboard.writeText(result.nginxDeny)
    pushToast('nginx deny rule copied to clipboard.', 'success')
  } catch {
    pushToast('Could not generate a deny rule for this address.', 'error')
  } finally {
    copyingRule.value = false
  }
}

const securityHref = computed(() =>
  ipCtx.value ? { path: `/sites/${n.value.siteId}/logs/security`, query: { ip: ipCtx.value.ip, range: '24h' } } : null,
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <div class="flex items-start gap-4">
        <span
          class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          :class="notificationToneClass[n.type]"
        >
          <UiIcon :name="notificationTypeIcon[n.type] || 'notifications'" :size="22" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-medium text-secondary">
              {{ notificationTypeLabel[n.type] }}
            </span>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="notificationToneClass[n.type]">
              {{ notificationSeverityLabel[notificationSeverity[n.type]] }}
            </span>
          </div>
          <h1 class="font-display text-2xl font-bold tracking-tight text-primary">{{ n.message }}</h1>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tertiary">
            <NuxtLink :to="`/sites/${n.siteId}`" class="text-secondary no-underline transition-colors hover:text-primary">
              {{ n.siteName || n.siteUrl }}
            </NuxtLink>
            <span>·</span>
            <span :title="formatAbsoluteTime(n.createdAt)">{{ formatAbsoluteTime(n.createdAt) }}</span>
          </div>
        </div>
      </div>
    </UiCard>

    <p v-if="data.unavailable" class="text-sm text-tertiary">{{ data.unavailable }}</p>

    <UiEmptyState v-if="!context" icon="history">
      <p class="text-primary">No structured details were captured for this notification.</p>
      <p>It was raised before incident evidence was tracked — the message above is all there is.</p>
    </UiEmptyState>

    <!-- threat_ip -->
    <template v-else-if="ipCtx">
      <UiCard>
        <div class="flex flex-col gap-4">
          <UiSectionHeading as="h3">Incident window</UiSectionHeading>
          <div class="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <UiStatBlock :value="formatExact(ipCtx.hits)" label="Not-found requests" />
            <UiStatBlock
              :value="formatExact(Number(data.ipEvidence?.profile?.request_count ?? ipCtx.hits))"
              label="Total requests"
            />
            <UiStatBlock :value="formatExact(Number(data.ipEvidence?.profile?.distinct_paths ?? 0))" label="Distinct paths" />
            <UiStatBlock :value="String(data.ipEvidence?.profile?.country ?? '—')" label="Country" />
          </div>
          <p class="text-xs text-tertiary">Window: {{ formatWindow(ipCtx.window) }}</p>
        </div>
      </UiCard>

      <UiCard v-if="data.ipEvidence?.requestsPerMinute.length">
        <UiSectionHeading as="h3" class="mb-4">Requests per minute</UiSectionHeading>
        <div class="h-48">
          <BaseChart :option="ipChartOption" />
        </div>
      </UiCard>

      <div class="grid gap-4 md:grid-cols-2">
        <UiCard v-if="data.ipEvidence?.topPaths.length">
          <UiSectionHeading as="h3" class="mb-4">Top probed paths</UiSectionHeading>
          <div class="flex flex-col gap-1.5">
            <p
              v-for="(row, index) in data.ipEvidence.topPaths.slice(0, 15)"
              :key="index"
              class="flex items-center justify-between gap-3 font-mono text-xs text-secondary"
            >
              <span class="flex min-w-0 items-center gap-1.5 truncate">
                <UiIcon v-if="row.suspicious" name="warning" :size="13" class="shrink-0 text-degraded" />
                <span class="truncate">{{ row.path_pattern }}</span>
              </span>
              <span class="shrink-0 tabular-nums">{{ formatExact(Number(row.hits)) }}</span>
            </p>
          </div>
        </UiCard>

        <UiCard v-if="data.ipEvidence?.recentRequests.length">
          <UiSectionHeading as="h3" class="mb-4">Sample requests</UiSectionHeading>
          <div class="max-h-64 overflow-auto">
            <p
              v-for="(req, index) in data.ipEvidence.recentRequests.slice(0, 40)"
              :key="index"
              class="font-mono text-xs text-secondary"
            >
              {{ formatLogTime(String(req.ts)) }} · {{ req.status }} · {{ req.method }} {{ req.path }}
            </p>
          </div>
        </UiCard>
      </div>

      <UiEmptyState v-if="!data.ipEvidence && !data.unavailable" icon="search_off">
        <p class="text-primary">No log rows cover this window.</p>
        <p>The logs may not reach back this far, or the folder was purged since this fired.</p>
      </UiEmptyState>

      <UiCard v-if="data.ipEvidence">
        <div class="flex flex-wrap items-center gap-3">
          <UiButton variant="secondary" icon="content_copy" :disabled="copyingRule" @click="copyDenyRule(ipCtx.ip)">
            Copy nginx deny rule
          </UiButton>
          <NuxtLink v-if="securityHref" :to="securityHref" custom v-slot="{ navigate }">
            <UiButton variant="ghost" icon="open_in_new" @click="navigate">Open in Security</UiButton>
          </NuxtLink>
        </div>
      </UiCard>
    </template>

    <!-- log_spike / check: share the log-context join -->
    <template v-else-if="showsLogContext">
      <UiCard v-if="logSpikeCtx">
        <div class="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <UiStatBlock :value="formatExact(logSpikeCtx.count)" label="In the last hour" />
          <UiStatBlock :value="formatExact(logSpikeCtx.baselinePerHour)" label="Baseline / hour" />
          <UiStatBlock :value="logSpikeCtx.metric === '5xx' ? '5xx responses' : 'PHP fatals'" label="Metric" />
        </div>
      </UiCard>
      <UiCard v-else-if="checkCtx && (checkCtx.httpStatus || checkCtx.reason)">
        <div class="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <UiStatBlock :value="checkCtx.httpStatus ?? '—'" label="HTTP status" />
          <UiStatBlock :value="checkCtx.reason ?? '—'" label="Reason" />
        </div>
      </UiCard>

      <template v-if="hasLogContext">
        <UiCard>
          <UiSectionHeading as="h3" class="mb-4">Requests around this window</UiSectionHeading>
          <div class="h-48">
            <BaseChart :option="logChartOption" />
          </div>
        </UiCard>

        <div class="grid gap-4 md:grid-cols-2">
          <UiCard v-if="data.logContext!.topPaths.length">
            <UiSectionHeading as="h3" class="mb-4">Failing endpoints</UiSectionHeading>
            <p
              v-for="(row, index) in data.logContext!.topPaths.slice(0, 10)"
              :key="index"
              class="flex justify-between gap-3 font-mono text-xs text-secondary"
            >
              <span class="truncate">{{ row.path_pattern }}</span>
              <span class="shrink-0 tabular-nums">{{ row.status }} · {{ formatExact(Number(row.count)) }}</span>
            </p>
          </UiCard>

          <UiCard v-if="data.logContext!.phpErrors.length">
            <UiSectionHeading as="h3" class="mb-4">PHP errors</UiSectionHeading>
            <p
              v-for="(row, index) in data.logContext!.phpErrors.slice(0, 10)"
              :key="index"
              class="truncate font-mono text-xs text-secondary"
              :title="String(row.sample_message)"
            >
              {{ formatExact(Number(row.occurrences)) }}× {{ row.sample_message }}
            </p>
          </UiCard>

          <UiCard v-if="data.logContext!.fpmEvents.length">
            <UiSectionHeading as="h3" class="mb-4">PHP-FPM</UiSectionHeading>
            <p
              v-for="(row, index) in data.logContext!.fpmEvents"
              :key="index"
              class="flex justify-between gap-3 font-mono text-xs text-secondary"
            >
              <span>{{ row.event_type }}</span>
              <span class="tabular-nums">{{ formatExact(Number(row.count)) }}</span>
            </p>
          </UiCard>

          <UiCard v-if="data.logContext!.topIps.length">
            <UiSectionHeading as="h3" class="mb-4">Busiest clients</UiSectionHeading>
            <p
              v-for="(row, index) in data.logContext!.topIps"
              :key="index"
              class="flex justify-between gap-3 font-mono text-xs text-secondary"
            >
              <span>{{ row.client_ip }}</span>
              <span class="tabular-nums">{{ formatExact(Number(row.requests)) }}</span>
            </p>
          </UiCard>
        </div>
      </template>

      <UiEmptyState v-else-if="!data.unavailable" icon="search_off">
        <p class="text-primary">No log rows cover this window.</p>
        <p>{{ checkCtx ? 'This site may not be linked to a log folder.' : 'The logs may not reach back this far.' }}</p>
      </UiEmptyState>
    </template>

    <!-- ssl -->
    <template v-else-if="sslCtx">
      <UiCard>
        <div class="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <UiStatBlock v-if="sslCtx.daysRemaining !== undefined" :value="sslCtx.daysRemaining ?? '—'" label="Days remaining" />
          <UiStatBlock v-if="sslCtx.issuerFrom" :value="sslCtx.issuerFrom" label="Previous issuer" />
          <UiStatBlock v-if="sslCtx.issuerTo" :value="sslCtx.issuerTo" label="Current issuer" />
        </div>
      </UiCard>
    </template>

    <!-- domain -->
    <template v-else-if="domainCtx">
      <UiCard>
        <div class="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <UiStatBlock v-if="domainCtx.expiryDate" :value="domainCtx.expiryDate" label="Registration expires" />
          <UiStatBlock v-if="domainCtx.days !== undefined" :value="domainCtx.days ?? '—'" label="Days remaining" />
        </div>
        <div v-if="domainCtx.nsFrom && domainCtx.nsTo" class="mt-4 flex flex-col gap-1 text-sm text-secondary">
          <p><span class="text-tertiary">From:</span> {{ domainCtx.nsFrom.join(', ') }}</p>
          <p><span class="text-tertiary">To:</span> {{ domainCtx.nsTo.join(', ') }}</p>
        </div>
      </UiCard>
    </template>

    <!-- content -->
    <template v-else-if="contentCtx">
      <UiCard>
        <div class="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <UiStatBlock :value="`~${contentCtx.percent}%`" label="Content changed" />
          <UiStatBlock :value="contentCtx.bodyHash.slice(0, 12)" label="New body hash" />
        </div>
      </UiCard>
    </template>

    <!-- lighthouse -->
    <template v-else-if="lighthouseCtx">
      <UiCard>
        <div class="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <UiStatBlock :value="lighthouseCtx.formFactor" label="Form factor" />
          <UiStatBlock :value="lighthouseCtx.previous" label="Previous score" />
          <UiStatBlock :value="lighthouseCtx.current" label="Current score" value-class="text-down" />
        </div>
      </UiCard>
    </template>
  </div>
</template>
