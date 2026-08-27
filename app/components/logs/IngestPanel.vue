<script setup lang="ts">
const { status, progress, starting, runIngest, onFinished } = useLogIngest()

const emit = defineEmits<{ finished: [] }>()
onFinished(() => emit('finished'))

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

      <LogsIngestProgress v-if="status.running" :status="status" :progress="progress" />

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
