<script setup lang="ts">
import type { ThemePref } from '../../composables/useTheme'

const { pref, ready, setTheme } = useTheme()

const options: { label: string; value: ThemePref; icon: string }[] = [
  { label: 'Light', value: 'light', icon: 'light_mode' },
  { label: 'Auto', value: 'system', icon: 'contrast' },
  { label: 'Dark', value: 'dark', icon: 'dark_mode' },
]
</script>

<template>
  <!-- The sidebar is black in both themes, so this control uses literal colors
       rather than the flipping surface tokens. -->
  <div class="inline-flex gap-0.5 rounded-full border border-white/15 p-0.5">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="inline-flex cursor-pointer items-center justify-center rounded-full p-1.5 transition-colors duration-100 ease-snappy"
      :class="
        ready && pref === opt.value
          ? 'bg-white/15 text-white'
          : 'text-neutral-400 hover:bg-white/10 hover:text-white'
      "
      :title="opt.label"
      :aria-label="`${opt.label} theme`"
      :aria-pressed="ready && pref === opt.value"
      @click="setTheme(opt.value)"
    >
      <UiIcon :name="opt.icon" :size="16" />
    </button>
  </div>
</template>
