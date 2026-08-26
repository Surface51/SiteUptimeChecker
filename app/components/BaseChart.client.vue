<script setup lang="ts">
import VChart from 'vue-echarts'
import { setChartMode, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ option: EChartsOption }>()

const { isDark } = useTheme()

// Single place the palette is switched — every chart reads `chartColors` inside a
// computed, so mutating it here re-renders all of them.
watch(isDark, (dark) => setChartMode(dark ? 'dark' : 'light'), { immediate: true })

// Background polling (useSites/useFetch refresh intervals) feeds charts a new `option`
// every ~30s. Without this, ECharts replays its enter/update animation on every poll,
// which reads as the whole chart jerkily redrawing itself. Snap to new data instantly.
const renderOption = computed<EChartsOption>(() => ({
  ...props.option,
  animation: false,
}))
</script>

<template>
  <VChart
    class="h-full w-full"
    :option="renderOption"
    :theme="isDark ? 'uptime-dark' : 'uptime-light'"
    autoresize
    :init-options="{ renderer: 'canvas' }"
  />
</template>
