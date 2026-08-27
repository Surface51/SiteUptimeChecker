<script setup lang="ts">
import { formatLogTime } from '~/utils/logFormat'

const props = defineProps<{ siteId: number; fingerprint: string }>()

const filters = useInjectedLogFilters()

// Fetched only when a group is expanded, rather than pulling every stack trace up front.
const { data, pending } = await useFetch<{ occurrences: any[] }>(
  () => `/api/sites/${props.siteId}/logs/errors/php/${props.fingerprint}`,
  { query: filters.query, default: () => ({ occurrences: [] }), server: false },
)

const latest = computed(() => data.value?.occurrences[0] ?? null)
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="pending" class="text-xs text-tertiary">Loading occurrences…</p>

    <template v-else-if="latest">
      <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-tertiary">
        <span>{{ data!.occurrences.length }} recent occurrence(s)</span>
        <span v-if="latest.src_file" class="font-mono">
          {{ latest.src_file }}<template v-if="latest.src_line">:{{ latest.src_line }}</template>
        </span>
        <span>latest {{ formatLogTime(latest.ts) }}</span>
      </div>

      <pre
        v-if="latest.stack"
        class="max-h-72 overflow-auto rounded-md bg-page p-3 font-mono text-xs whitespace-pre-wrap text-secondary"
      >{{ latest.stack }}</pre>
      <p v-else class="font-mono text-xs break-all text-secondary">{{ latest.message }}</p>
    </template>

    <p v-else class="text-xs text-tertiary">No occurrences in this range.</p>
  </div>
</template>
