<script setup lang="ts">
const { toasts, dismiss } = useToasts()

// Flat by design: a bordered raised card with a status-colored left rule,
// rather than a tinted fill plus shadow.
const typeClasses: Record<string, string> = {
  info: 'border-l-maint',
  success: 'border-l-up',
  warning: 'border-l-degraded',
  error: 'border-l-down',
}

const typeIcons: Record<string, string> = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  error: 'error',
}

const iconColors: Record<string, string> = {
  info: 'text-maint',
  success: 'text-up',
  warning: 'text-degraded',
  error: 'text-down',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-md border border-l-4 border-border-default bg-raised px-4 py-3 text-sm text-primary"
        :class="typeClasses[t.type]"
      >
        <UiIcon :name="typeIcons[t.type] ?? 'info'" :size="18" :class="iconColors[t.type]" class="shrink-0" />
        <span class="min-w-0 flex-1">{{ t.message }}</span>
        <button
          type="button"
          class="shrink-0 cursor-pointer text-tertiary transition-colors hover:text-primary"
          aria-label="Dismiss"
          @click="dismiss(t.id)"
        >
          <UiIcon name="close" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
