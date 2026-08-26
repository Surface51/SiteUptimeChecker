<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    icon?: string
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'sm', type: 'button' },
)

const variantClass: Record<Variant, string> = {
  primary: 'bg-accent text-accent-text border-accent hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'bg-transparent text-primary border-border-strong hover:bg-inverse hover:text-on-inverse',
  ghost: 'bg-transparent text-secondary border-transparent hover:bg-sunken hover:text-primary',
  danger: 'bg-transparent text-down border-down hover:bg-down hover:text-white',
}

const sizeClass: Record<Size, string> = {
  sm: 'px-[18px] py-2 text-sm',
  md: 'px-6 py-3 text-base',
}

const classes = computed(() => [
  'inline-flex items-center gap-2 rounded-full border-2 font-display font-semibold',
  'cursor-pointer transition-all duration-100 ease-snappy',
  'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
  props.disabled ? 'hover:bg-transparent' : '',
  sizeClass[props.size],
  variantClass[props.variant],
])
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
    <UiIcon v-if="icon" :name="icon" :size="size === 'md' ? 20 : 18" />
  </button>
</template>
