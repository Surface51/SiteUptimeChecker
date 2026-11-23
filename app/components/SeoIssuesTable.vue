<script setup lang="ts">
import type { SeoIssueGroup } from '#shared/types'
import { seoIssueLabel, seoSeverityLabel, seoSeverityTone } from '~/utils/seoDisplay'

defineProps<{ groups: SeoIssueGroup[] }>()

const open = ref(new Set<string>())
function toggle(key: string) {
  const next = new Set(open.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  open.value = next
}

const MAX_SHOWN = 100
</script>

<template>
  <UiEmptyState v-if="!groups.length" icon="task_alt">No issues found in the latest crawl.</UiEmptyState>
  <div v-else class="overflow-hidden rounded-lg border border-border-default bg-raised">
    <div v-for="g in groups" :key="`${g.severity}:${g.code}`" class="border-b border-border-default last:border-0">
      <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-sunken"
        :aria-expanded="open.has(`${g.severity}:${g.code}`)"
        @click="toggle(`${g.severity}:${g.code}`)"
      >
        <UiIcon :name="open.has(`${g.severity}:${g.code}`) ? 'expand_more' : 'chevron_right'" :size="18" class="text-tertiary" />
        <UiBadge :tone="seoSeverityTone[g.severity]">{{ seoSeverityLabel[g.severity] }}</UiBadge>
        <span class="flex-1 font-medium text-primary">{{ seoIssueLabel[g.code] ?? g.code }}</span>
        <span class="text-secondary tabular-nums">{{ g.count }}</span>
      </button>
      <ul v-if="open.has(`${g.severity}:${g.code}`)" class="flex flex-col gap-2 px-4 pb-4 pl-12 text-xs">
        <li v-for="(issue, i) in g.issues.slice(0, MAX_SHOWN)" :key="i" class="flex flex-col gap-0.5">
          <a :href="issue.url" target="_blank" rel="noopener noreferrer" class="break-all text-primary hover:text-accent hover:underline">
            {{ issue.url }}
          </a>
          <span v-if="issue.detail" class="break-all text-secondary">{{ issue.detail }}</span>
          <span v-if="issue.sourceUrl" class="break-all text-tertiary">Linked from {{ issue.sourceUrl }}</span>
        </li>
        <li v-if="g.issues.length > MAX_SHOWN" class="text-tertiary">…and {{ g.issues.length - MAX_SHOWN }} more</li>
      </ul>
    </div>
  </div>
</template>
