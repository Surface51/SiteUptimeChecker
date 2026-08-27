<script setup lang="ts">
import { formatDuration, formatExact, formatLogTime } from '~/utils/logFormat'

const props = defineProps<{ siteId: number; hash: string }>()

const filters = useInjectedLogFilters()

const { data, pending } = await useFetch<{ samples: any[] }>(
  () => `/api/sites/${props.siteId}/logs/mysql/digest/${props.hash}`,
  { query: filters.query, default: () => ({ samples: [] }), server: false },
)

const worst = computed(() => data.value?.samples[0] ?? null)
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="pending" class="text-xs text-tertiary">Loading samples…</p>

    <template v-else-if="worst">
      <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-tertiary">
        <span>slowest of {{ data!.samples.length }} sample(s)</span>
        <span>{{ formatDuration(worst.query_time) }}</span>
        <span>{{ formatExact(worst.rows_examined) }} rows examined</span>
        <span v-if="worst.db_schema">schema {{ worst.db_schema }}</span>
        <span>{{ formatLogTime(worst.ts) }}</span>
      </div>
      <pre
        class="max-h-72 overflow-auto rounded-md bg-page p-3 font-mono text-xs whitespace-pre-wrap text-secondary"
      >{{ worst.sql_text }}</pre>
    </template>

    <p v-else class="text-xs text-tertiary">No samples in this range.</p>
  </div>
</template>
