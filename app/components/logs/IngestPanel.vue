<script setup lang="ts">
const { status, progress, starting, runIngest } = useLogIngest()

const emit = defineEmits<{ finished: [] }>()
const { onFinished } = useLogIngest()
onFinished(() => emit('finished'))

const currentFileName = computed(() => status.value.currentFile?.split('/').slice(-3).join('/') ?? null)

const fileProgress = computed(() => {
  const { currentFileBytesTotal: total, currentFileBytesDone: done } = status.value
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
})

const finishedLabel = computed(() => {
  if (!status.value.finishedAt) return null
  const when = new Date(status.value.finishedAt)
  return Number.isNaN(when.getTime()) ? null : when.toLocaleString()
})
</script>

<template>
  <UiCard>
    <div class="flex flex-col gap-4">
      <UiSectionHeading as="h3">
        Ingestion
        <template #actions>
          <UiButton variant="secondary" size="sm" :disabled="starting || status.running" @click="runIngest">
            {{ status.running ? 'Ingesting…' : starting ? 'Starting…' : 'Ingest now' }}
          </UiButton>
        </template>
      </UiSectionHeading>

      <div v-if="status.running" class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-sm text-secondary">
          <span>{{ status.filesDone }} of {{ status.filesTotal }} files</span>
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

      <div v-else class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-secondary">
        <span v-if="finishedLabel">Last run {{ finishedLabel }}</span>
        <span v-else>No run yet this session.</span>
        <span v-if="status.filesTotal">
          {{ status.filesTotal }} files · {{ status.filesSkipped }} unchanged
        </span>
      </div>

      <div v-if="status.errors.length" class="flex flex-col gap-1 rounded-md bg-down-tint p-3">
        <span class="text-xs font-semibold tracking-wide text-down uppercase">
          {{ status.errors.length }} file{{ status.errors.length === 1 ? '' : 's' }} failed
        </span>
        <p v-for="err in status.errors.slice(0, 5)" :key="err" class="font-mono text-xs break-all text-down">
          {{ err }}
        </p>
      </div>
    </div>
  </UiCard>
</template>
