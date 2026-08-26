<script setup lang="ts">
const props = withDefaults(defineProps<{ points: number[]; width?: number; height?: number }>(), {
  width: 120,
  height: 32,
})

const path = computed(() => {
  const pts = props.points
  if (pts.length < 2) return ''
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const range = max - min || 1
  const stepX = props.width / (pts.length - 1)
  return pts
    .map((v, i) => {
      const x = i * stepX
      const y = props.height - ((v - min) / range) * (props.height - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})
</script>

<template>
  <svg
    v-if="points.length >= 2"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="overflow-visible text-accent"
  >
    <path :d="path" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <div v-else class="text-xs text-tertiary">No history yet</div>
</template>
