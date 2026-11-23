<script setup lang="ts">
import type { SeoOverview } from '#shared/types'
import { chartColors, parseDbTime, type EChartsOption } from '~/utils/echarts'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const { site } = useInjectedSite()

const { data: overview, refresh } = await useFetch<SeoOverview>(() => `/api/sites/${id.value}/seo`)

const crawling = computed(() => overview.value?.job?.status === 'queued' || overview.value?.job?.status === 'running')

// Poll quickly while a crawl is in flight so the page counter moves; otherwise the usual cadence.
usePoll(() => refresh())
let fastTimer: ReturnType<typeof setInterval> | undefined
watch(
  crawling,
  (active) => {
    if (fastTimer) clearInterval(fastTimer)
    fastTimer = active ? setInterval(() => refresh(), 3000) : undefined
  },
  { immediate: true },
)
onUnmounted(() => fastTimer && clearInterval(fastTimer))

const starting = ref(false)
async function crawlNow() {
  starting.value = true
  try {
    await $fetch(`/api/sites/${id.value}/seo/crawl`, { method: 'POST' })
    await refresh()
  } finally {
    starting.value = false
  }
}

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}

// Severity is status, so it wears the reserved status colours — always with a legend.
const trendOption = computed<EChartsOption>(() => {
  const points = overview.value?.trend ?? []
  const series = [
    { key: 'error' as const, label: 'Errors', color: chartColors.down },
    { key: 'warn' as const, label: 'Warnings', color: chartColors.degraded },
    { key: 'info' as const, label: 'Info', color: chartColors.neutral },
  ]
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { fontSize: 11 }, itemHeight: 8, itemWidth: 12 },
    grid: { left: 40, right: 16, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: points.map((p) => new Date(parseDbTime(p.startedAt)).toLocaleDateString()) },
    yAxis: { type: 'value', minInterval: 1 },
    series: series.map((s) => ({
      name: s.label,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 28,
      itemStyle: { color: s.color, borderColor: chartColors.surface, borderWidth: 1 },
      data: points.map((p) => p[s.key]),
    })),
  }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard v-if="overview && !overview.enabled">
      <p class="text-sm text-secondary">
        SEO monitoring is off for this site. Turn it on under Edit → SEO monitoring.
      </p>
    </UiCard>

    <UiCard>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <UiSectionHeading as="h3">Indexability</UiSectionHeading>
        <span class="text-xs text-tertiary">
          {{ overview?.state ? `Checked ${formatTime(overview.state.updatedAt)}` : 'Updated on every healthy check' }}
        </span>
      </div>
      <SeoGuardStrip :state="overview?.state ?? null" :crawl="overview?.latestCrawl ?? null" />
    </UiCard>

    <UiCard>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <UiSectionHeading as="h3">Site crawl</UiSectionHeading>
        <div class="flex items-center gap-3">
          <span class="text-xs text-tertiary">
            <template v-if="crawling">
              {{ overview?.job?.status === 'queued' ? 'Queued…' : `Crawling — ${overview?.job?.pagesCrawled ?? 0} pages` }}
            </template>
            <template v-else-if="overview?.latestCrawl">
              {{ overview.latestCrawl.pagesCrawled }} pages · {{ formatTime(overview.latestCrawl.startedAt) }}
            </template>
            <template v-else>No crawl yet — runs weekly</template>
          </span>
          <UiButton variant="secondary" :disabled="crawling || starting" @click="crawlNow">
            {{ crawling ? 'Crawling…' : 'Crawl now' }}
          </UiButton>
        </div>
      </div>

      <p v-if="overview?.job?.status === 'error'" class="mb-4 text-xs text-down">Last crawl failed: {{ overview.job.error }}</p>
      <p v-else-if="overview?.latestCrawl?.error" class="mb-4 text-xs text-down">Last crawl failed: {{ overview.latestCrawl.error }}</p>

      <div v-if="(overview?.trend.length ?? 0) > 1" class="mb-6 h-48">
        <BaseChart :option="trendOption" />
      </div>

      <SeoIssuesTable v-if="overview?.latestCrawl" :groups="overview.groups" />
      <UiEmptyState v-else icon="travel_explore">
        The first crawl reads robots.txt and the sitemap, then visits up to 500 pages.
      </UiEmptyState>
    </UiCard>

    <SeoCrawlerPanel v-if="site?.logSlug" :site-id="id" />
  </div>
</template>
