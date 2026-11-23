<script setup lang="ts">
import type { SeoCrawl, SeoState } from '#shared/types'

const props = defineProps<{ state: SeoState | null; crawl: SeoCrawl | null }>()

type Tone = 'up' | 'degraded' | 'down' | 'neutral'
interface Cell {
  label: string
  badge: string
  tone: Tone
  detail: string
}

const noindex = (r: string | null | undefined) => !!r && r.split(',').some((d) => d === 'noindex' || d === 'none')

const cells = computed<Cell[]>(() => {
  const s = props.state
  const robotsStatus = s?.robotsStatus ?? null
  return [
    {
      label: 'Homepage',
      ...(!s
        ? { badge: 'Unknown', tone: 'neutral' as Tone, detail: 'Waiting for the next healthy check' }
        : noindex(s.homepageRobots)
          ? { badge: 'Noindex', tone: 'down' as Tone, detail: `robots: ${s.homepageRobots}` }
          : { badge: 'Indexable', tone: 'up' as Tone, detail: s.homepageRobots ? `robots: ${s.homepageRobots}` : 'No robots directives' }),
    },
    {
      label: 'robots.txt',
      ...(robotsStatus === null
        ? { badge: 'Unknown', tone: 'neutral' as Tone, detail: 'Not fetched yet' }
        : s?.robotsBlocked
          ? { badge: 'Blocks /', tone: 'down' as Tone, detail: 'Disallows the homepage for Googlebot' }
          : robotsStatus === 0 || robotsStatus >= 500
            ? { badge: robotsStatus === 0 ? 'No response' : `HTTP ${robotsStatus}`, tone: 'down' as Tone, detail: 'Google pauses crawling until it loads' }
            : robotsStatus >= 400
              ? { badge: 'None', tone: 'neutral' as Tone, detail: `HTTP ${robotsStatus} — everything is crawlable` }
              : { badge: 'OK', tone: 'up' as Tone, detail: 'Homepage is crawlable' }),
    },
    {
      label: 'Canonical',
      ...(!s?.homepageCanonical
        ? { badge: 'None', tone: 'neutral' as Tone, detail: 'Homepage declares no canonical' }
        : { badge: 'Set', tone: 'up' as Tone, detail: s.homepageCanonical }),
    },
    {
      label: 'Sitemap',
      ...(!props.crawl
        ? { badge: 'Unknown', tone: 'neutral' as Tone, detail: 'No crawl yet' }
        : props.crawl.sitemapUrls
          ? { badge: `${props.crawl.sitemapUrls} URLs`, tone: 'up' as Tone, detail: 'Found at the last crawl' }
          : { badge: 'Missing', tone: 'degraded' as Tone, detail: 'None in robots.txt or at /sitemap.xml' }),
    },
  ]
})
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div v-for="cell in cells" :key="cell.label" class="flex flex-col gap-2 rounded-lg border border-border-default bg-raised p-4">
      <span class="text-xs font-semibold tracking-wide text-tertiary uppercase">{{ cell.label }}</span>
      <div><UiBadge :tone="cell.tone">{{ cell.badge }}</UiBadge></div>
      <span class="truncate text-xs text-secondary" :title="cell.detail">{{ cell.detail }}</span>
    </div>
  </div>
</template>
