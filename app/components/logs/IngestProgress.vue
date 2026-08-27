<script setup lang="ts">
import type { IngestStatus } from '#shared/types'

const props = defineProps<{ status: IngestStatus; progress: number }>()

const currentFileName = computed(
  () => props.status.currentFile?.split('/').slice(-3).join('/') ?? null,
)

const fileProgress = computed(() => {
  const { currentFileBytesTotal: total, currentFileBytesDone: done } = props.status
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between text-sm text-secondary">
      <span>
        {{ status.filesDone }} of {{ status.filesTotal }} files
        <span v-if="status.source === 'cli'" class="text-tertiary">· external ingest</span>
        <span v-else-if="status.stopRequested" class="text-tertiary">· stopping…</span>
      </span>
      <span>{{ progress }}%</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-sunken">
      <div
        class="h-full rounded-full bg-accent transition-[width] duration-300 ease-snappy"
        :style="{ width: `${progress}%` }"
      />
    </div>
    <p v-if="currentFileName" class="truncate font-mono text-xs text-tertiary">
      {{ currentFileName }} · {{ fileProgress }}%
    </p>
  </div>
</template>
