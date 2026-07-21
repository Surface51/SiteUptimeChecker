<script setup lang="ts">
const { currentJob, queueLength, isRunning } = useLighthouseProgress()
</script>

<template>
  <div
    v-if="isRunning"
    class="fixed bottom-4 right-4 z-40 w-72 rounded-lg border border-slate-800 bg-slate-900/95 p-3 text-sm shadow-xl backdrop-blur"
  >
    <template v-if="currentJob">
      <div class="flex items-center gap-2 text-slate-200">
        <span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
        <span class="min-w-0 truncate font-medium">{{ currentJob.siteLabel }}</span>
        <span class="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
          {{ currentJob.formFactor }}
        </span>
      </div>
      <div class="mt-1 text-xs text-slate-500">{{ currentJob.phase || 'Working…' }}</div>
      <div v-if="queueLength > 0" class="mt-1 text-xs text-slate-600">{{ queueLength }} more queued</div>
    </template>
    <template v-else>
      <div class="flex items-center gap-2 text-slate-200">
        <span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
        <span>Queued — {{ queueLength }} report{{ queueLength === 1 ? '' : 's' }} waiting</span>
      </div>
    </template>
  </div>
</template>
