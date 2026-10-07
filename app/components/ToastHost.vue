<script setup lang="ts">
const { toasts, dismiss, hold, release } = useToasts()

// A burst of alerts would otherwise stack up the screen — show the newest few and fold the rest.
const MAX_VISIBLE = 3
const visible = computed(() => toasts.value.slice(-MAX_VISIBLE))
const hiddenCount = computed(() => Math.max(0, toasts.value.length - MAX_VISIBLE))

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
  <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-xs flex-col items-end gap-2">
    <TransitionGroup name="toast">
      <div
        v-for="t in visible"
        :key="t.id"
        class="pointer-events-auto flex w-full items-start gap-2.5 rounded-md border border-l-4 border-border-default bg-raised px-4 py-3 text-sm text-primary"
        :class="[typeClasses[t.type], t.href ? 'cursor-pointer' : '']"
        @mouseenter="hold(t.id)"
        @mouseleave="release(t.id)"
        @click="t.href && navigateTo(t.href)"
      >
        <UiIcon :name="typeIcons[t.type] ?? 'info'" :size="18" :class="iconColors[t.type]" class="shrink-0" />
        <span class="min-w-0 flex-1">{{ t.message }}</span>
        <button
          type="button"
          class="shrink-0 cursor-pointer text-tertiary transition-colors hover:text-primary"
          aria-label="Dismiss"
          @click.stop="dismiss(t.id)"
        >
          <UiIcon name="close" :size="16" />
        </button>
      </div>
    </TransitionGroup>
    <p v-if="hiddenCount > 0" class="pointer-events-auto rounded-full border border-border-default bg-raised px-3 py-1 text-xs text-secondary">
      +{{ hiddenCount }} more in the bell
    </p>
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
  transform: translateY(8px);
}
</style>
