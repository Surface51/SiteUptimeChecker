<script setup lang="ts" generic="T extends string | number">
defineProps<{
  modelValue: T
  options: { label: string; value: T; icon?: string }[]
}>()

defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div class="inline-flex gap-1 rounded-full border border-border-default p-1">
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      class="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-100 ease-snappy"
      :class="
        modelValue === opt.value
          ? 'bg-inverse text-on-inverse'
          : 'text-secondary hover:bg-sunken hover:text-primary'
      "
      :aria-pressed="modelValue === opt.value"
      @click="$emit('update:modelValue', opt.value)"
    >
      <UiIcon v-if="opt.icon" :name="opt.icon" :size="15" />
      {{ opt.label }}
    </button>
  </div>
</template>
