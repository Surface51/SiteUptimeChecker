<script setup lang="ts">
const { currentJob, queueLength, isRunning } = useLighthouseProgress()
</script>

<template>
  <div
    v-if="isRunning"
    class="fixed right-4 bottom-4 z-40 w-72 rounded-md border border-border-default bg-raised p-4 text-sm"
  >
    <template v-if="currentJob">
      <div class="flex items-center gap-2 text-primary">
        <span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
        <span class="min-w-0 truncate font-medium">{{ currentJob.siteLabel }}</span>
        <span class="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[10px] tracking-wide text-secondary uppercase">
          {{ currentJob.formFactor }}
        </span>
      </div>
      <div class="mt-1.5 text-xs text-secondary">{{ currentJob.phase || 'Working…' }}</div>
      <div v-if="queueLength > 0" class="mt-1 text-xs text-tertiary">{{ queueLength }} more queued</div>
    </template>
    <template v-else>
      <div class="flex items-center gap-2 text-primary">
        <span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
        <span>Queued — {{ queueLength }} report{{ queueLength === 1 ? '' : 's' }} waiting</span>
      </div>
    </template>
  </div>
</template>
