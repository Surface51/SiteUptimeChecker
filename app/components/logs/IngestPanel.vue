<script setup lang="ts">
const { status, progress, starting, hasRun, collapsed, toggleCollapsed, runIngest, onFinished } = useLogIngest()

const emit = defineEmits<{ finished: [] }>()
onFinished(() => emit('finished'))
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

      <LogsIngestProgress
        v-if="hasRun"
        :status="status"
        :progress="progress"
        :collapsed="collapsed"
        @toggle="toggleCollapsed"
      />
      <div v-else class="text-sm text-secondary">No run yet this session.</div>

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
