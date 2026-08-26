<script setup lang="ts">
defineProps<{
  label?: string
  modelValue?: string | number
  options: { label: string; value: string | number }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

// Preserve numeric option values — a bare select would hand back strings.
function onChange(event: Event, options: { label: string; value: string | number }[]) {
  const raw = (event.target as HTMLSelectElement).value
  const match = options.find((o) => String(o.value) === raw)
  emit('update:modelValue', match ? match.value : raw)
}
</script>

<template>
  <label class="flex w-full flex-col gap-1.5 font-body">
    <span v-if="label" class="text-sm font-medium text-secondary">{{ label }}</span>
    <select
      :value="modelValue"
      class="cursor-pointer rounded-md border border-border-default bg-raised px-4 py-3 text-base text-primary outline-none transition-colors duration-100 ease-snappy focus:border-border-strong"
      @change="onChange($event, options)"
    >
      <option v-for="opt in options" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
    </select>
  </label>
</template>
