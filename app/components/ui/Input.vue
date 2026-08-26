<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    type?: string
    error?: string
    min?: number | string
    max?: number | string
    modelValue?: string | number
  }>(),
  { type: 'text' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

// `type="number"` fields bind to numeric refs, so coerce here rather than making
// every call site remember `v-model.number` (which a component would ignore anyway).
function onInput(event: Event, type: string) {
  const raw = (event.target as HTMLInputElement).value
  if (type !== 'number') return emit('update:modelValue', raw)
  const n = Number(raw)
  emit('update:modelValue', raw === '' || Number.isNaN(n) ? raw : n)
}
</script>

<template>
  <label class="flex w-full flex-col gap-1.5 font-body">
    <span v-if="label" class="text-sm font-medium text-secondary">{{ label }}</span>
    <input
      :type="type"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :value="modelValue"
      class="rounded-md border bg-raised px-4 py-3 text-base text-primary outline-none transition-colors duration-100 ease-snappy placeholder:text-tertiary focus:border-border-strong"
      :class="error ? 'border-accent' : 'border-border-default'"
      @input="onInput($event, type)"
    />
    <span v-if="error" class="text-xs text-accent">{{ error }}</span>
  </label>
</template>
