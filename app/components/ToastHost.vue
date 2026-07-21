<script setup lang="ts">
const { toasts, dismiss } = useToasts()

const typeClasses: Record<string, string> = {
  info: 'border-slate-700 bg-slate-900 text-slate-200',
  success: 'border-emerald-800 bg-emerald-950/80 text-emerald-200',
  warning: 'border-amber-800 bg-amber-950/80 text-amber-200',
  error: 'border-rose-800 bg-rose-950/80 text-rose-200',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg"
        :class="typeClasses[t.type]"
      >
        <span class="min-w-0 flex-1">{{ t.message }}</span>
        <button type="button" class="shrink-0 text-xs opacity-60 hover:opacity-100" @click="dismiss(t.id)">✕</button>
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
