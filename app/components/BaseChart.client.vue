<script setup lang="ts">
import VChart from 'vue-echarts'
import type { EChartsOption } from '../utils/echarts'
import '../utils/echarts'

const props = defineProps<{ option: EChartsOption }>()

// Background polling (useSites/useFetch refresh intervals) feeds charts a new `option`
// every ~30s. Without this, ECharts replays its enter/update animation on every poll,
// which reads as the whole chart jerkily redrawing itself. Snap to new data instantly.
const renderOption = computed<EChartsOption>(() => ({
  ...props.option,
  animation: false,
}))
</script>

<template>
  <VChart class="h-full w-full" :option="renderOption" theme="uptime-dark" autoresize :init-options="{ renderer: 'canvas' }" />
</template>
