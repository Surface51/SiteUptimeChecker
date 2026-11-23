<script setup lang="ts">
import { chartColors } from '~/utils/echarts'
import { formatCount, formatExact, formatPercent } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

const props = defineProps<{ siteId: number }>()

interface CrawlerStats {
  daily: { bucket: string; engine: string; value: number }[]
  byEngine: { engine: string; total: number; s2xx: number; s3xx: number; s4xx: number; s5xx: number }[]
  topErrors: { path: string; status: number; hits: number; last_seen: string }[]
  coverage: { hits: number; inSitemapHits: number; outsideSitemapPct: number | null } | null
}

const RANGE_DAYS = 30
const from = new Date(Date.now() - RANGE_DAYS * 24 * 60 * 60 * 1000).toISOString()

const { data, pending, error } = await useFetch<CrawlerStats>(() => `/api/sites/${props.siteId}/logs/seo/crawlers`, {
  query: { from },
  default: () => ({ daily: [], byEngine: [], topErrors: [], coverage: null }),
})

// Google dominates crawl volume on almost every site; everything else folds into one series so
// the chart stays two entities (legend + colour) rather than a hue per engine.
const rows = computed(() => {
  const merged = new Map<string, { bucket: string; series: string; value: number }>()
  for (const r of data.value?.daily ?? []) {
    const series = r.engine === 'Google' ? 'google' : 'other'
    const key = `${r.bucket}|${series}`
    const row = merged.get(key) ?? { bucket: r.bucket, series, value: 0 }
    row.value += Number(r.value)
    merged.set(key, row)
  }
  return [...merged.values()]
})

const series = computed(() => [
  { name: 'google', label: 'Googlebot', color: chartColors.primary },
  { name: 'other', label: 'Other search engines', color: chartColors.logAlt },
])

const google = computed(() => data.value?.byEngine.find((e) => e.engine === 'Google') ?? null)
const errorShare = computed(() => {
  const g = google.value
  return g && g.total ? ((Number(g.s4xx) + Number(g.s5xx)) / Number(g.total)) * 100 : null
})
const redirectShare = computed(() => {
  const g = google.value
  return g && g.total ? (Number(g.s3xx) / Number(g.total)) * 100 : null
})

const errorColumns: LogColumn[] = [
  { key: 'path', label: 'Path', mono: true },
  { key: 'status', label: 'Status', numeric: true, format: formatExact },
  { key: 'hits', label: 'Crawler hits', numeric: true, format: formatExact },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <UiSectionHeading as="h3">Search-engine crawling · last {{ RANGE_DAYS }} days</UiSectionHeading>
        <span class="text-xs text-tertiary">From access logs, by claimed user agent (not DNS-verified)</span>
      </div>
      <p v-if="error" class="text-sm text-tertiary">Crawler stats unavailable: {{ error.statusMessage || error.message }}</p>
      <template v-else>
        <div class="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <UiStatBlock :value="formatCount(google?.total ?? 0)" label="Googlebot requests" />
          <UiStatBlock :value="errorShare === null ? '—' : formatPercent(errorShare)" label="Googlebot hits on 4xx/5xx" />
          <UiStatBlock :value="redirectShare === null ? '—' : formatPercent(redirectShare)" label="Googlebot hits on redirects" />
          <UiStatBlock
            :value="data?.coverage?.outsideSitemapPct == null ? '—' : formatPercent(data.coverage.outsideSitemapPct)"
            label="2xx crawl hits outside the sitemap"
          />
        </div>
        <LogsTimeseriesChart
          :rows="rows"
          :series="series"
          type="line"
          height="h-56"
          :value-formatter="formatCount"
          :empty="pending ? 'Loading…' : 'No search-engine crawling in this range'"
        />
      </template>
    </UiCard>

    <LogsDataTable
      v-if="!error"
      title="Errors served to search engines"
      :columns="errorColumns"
      :rows="data?.topErrors ?? []"
      :pending="pending"
      empty="No 4xx/5xx responses to search-engine crawlers in this range"
      min-width="480px"
    />
  </div>
</template>
