<script setup lang="ts">
import type { TriageItem, TriageSeverity } from '#shared/types'
import { formatRelativeTime } from '~/utils/notificationDisplay'

const props = defineProps<{ items: TriageItem[] }>()

const SEVERITY_ORDER: TriageSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

const SEVERITY_META: Record<TriageSeverity, { label: string; badge: string; dot: string }> = {
  critical: { label: 'Critical', badge: 'bg-down-tint text-down', dot: 'bg-down' },
  high: { label: 'High', badge: 'bg-down-tint text-down', dot: 'bg-down' },
  medium: { label: 'Medium', badge: 'bg-degraded-tint text-degraded', dot: 'bg-degraded' },
  low: { label: 'Low', badge: 'bg-maint-tint text-maint', dot: 'bg-maint' },
  info: { label: 'Info', badge: 'bg-sunken text-tertiary', dot: 'bg-neutral' },
}

const grouped = computed(() =>
  SEVERITY_ORDER.map((severity) => ({
    severity,
    meta: SEVERITY_META[severity],
    items: props.items.filter((i) => i.severity === severity),
  })).filter((g) => g.items.length),
)
</script>

<template>
  <div class="flex flex-col gap-8">
    <section v-for="group in grouped" :key="group.severity" class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full" :class="group.meta.dot" />
        <h2 class="font-display text-lg font-semibold text-primary">{{ group.meta.label }}</h2>
        <span class="text-sm text-tertiary">{{ group.items.length }}</span>
      </div>

      <UiCard flush>
        <ul class="divide-y divide-border-default">
          <li v-for="item in group.items" :key="item.id">
            <NuxtLink
              :to="item.to"
              class="flex items-start gap-4 px-5 py-4 no-underline transition-colors hover:bg-sunken"
            >
              <span
                class="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                :class="group.meta.badge"
              >
                {{ item.kind }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-primary">{{ item.siteName }}</span>
                <span class="block text-sm text-secondary">{{ item.detail }}</span>
              </span>
              <span v-if="item.since" class="shrink-0 text-xs text-tertiary">
                {{ formatRelativeTime(item.since) }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </UiCard>
    </section>
  </div>
</template>
