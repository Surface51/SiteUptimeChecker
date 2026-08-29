<script setup lang="ts">
import type { TriageItem } from '#shared/types'

useHead({ title: 'Triage · Site Uptime' })

const { data: items, pending, error, refresh } = await useFetch<TriageItem[]>('/api/triage', {
  default: () => [],
})

let interval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  interval = setInterval(() => refresh(), 30_000)
})
onUnmounted(() => {
  if (interval) clearInterval(interval)
})

const counts = computed(() => {
  const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const it of items.value ?? []) c[it.severity]++
  return c
})
</script>

<template>
  <div class="flex flex-col gap-9">
    <div>
      <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Triage</h1>
      <p class="mt-1.5 text-base text-secondary">
        Everything across the fleet that wants a look, most urgent first.
      </p>
    </div>

    <div v-if="error" class="rounded-lg border border-down bg-down-tint p-4 text-sm text-down">
      Failed to load triage: {{ error.message }}
    </div>

    <div v-else-if="pending && !items.length" class="text-tertiary">Loading…</div>

    <UiEmptyState v-else-if="!items.length" icon="task_alt">
      Nothing needs attention — every monitored site is healthy.
    </UiEmptyState>

    <template v-else>
      <div class="flex flex-wrap gap-3">
        <div
          v-for="(n, sev) in counts"
          :key="sev"
          class="rounded-lg border border-border-default bg-raised px-4 py-2 text-sm"
        >
          <span class="font-display text-xl font-bold text-primary">{{ n }}</span>
          <span class="ml-2 text-tertiary capitalize">{{ sev }}</span>
        </div>
      </div>

      <TriageList :items="items" />
    </template>
  </div>
</template>
