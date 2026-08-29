<script setup lang="ts">
import type { SlaReport } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ sla: SlaReport }>()

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

const budgetPct = computed(() => Math.min(100, Math.round(props.sla.budgetUsedPct)))
const budgetOver = computed(() => props.sla.budgetUsedPct > 100)

const budgetColor = computed(() => {
  if (props.sla.budgetUsedPct > 100) return chartColors.down
  if (props.sla.budgetUsedPct > 75) return chartColors.degraded
  return chartColors.up
})

const met = computed(() => props.sla.achievedPct >= props.sla.target)

const trailingOption = computed<EChartsOption>(() => ({
  grid: { left: 40, right: 12, top: 12, bottom: 24 },
  tooltip: {
    trigger: 'axis',
    formatter: (params: any) => {
      const p = params[0]
      return `${p.name}<br/>${p.value === null || p.value === undefined ? 'no data' : `${Number(p.value).toFixed(3)}%`}`
    },
  },
  xAxis: {
    type: 'category',
    data: props.sla.trailing12.map((m) => m.month.slice(2)),
    axisLabel: { fontSize: 10 },
  },
  yAxis: {
    type: 'value',
    min: (v: { min: number }) => Math.floor(Math.min(v.min, props.sla.target) - 0.2),
    max: 100,
    axisLabel: { formatter: (v: number) => `${v}%`, fontSize: 10 },
  },
  series: [
    {
      type: 'bar',
      barMaxWidth: 18,
      data: props.sla.trailing12.map((m) => m.uptimePct),
      itemStyle: { color: chartColors.maint, borderRadius: [3, 3, 0, 0] },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: chartColors.degraded, type: 'dashed' },
        data: [{ yAxis: props.sla.target }],
      },
    },
  ],
}))
</script>

<template>
  <UiCard>
    <UiSectionHeading as="h3" class="mb-4">
      SLA — {{ sla.month }}
      <template #actions>
        <UiBadge :tone="met ? 'up' : 'down'">{{ met ? 'Meeting target' : 'Below target' }}</UiBadge>
      </template>
    </UiSectionHeading>

    <div class="grid grid-cols-2 gap-6 lg:grid-cols-4">
      <UiStatBlock
        :value="`${sla.achievedPct.toFixed(3)}%`"
        label="Achieved (this month)"
        icon="verified"
        :value-class="met ? 'text-up' : 'text-down'"
      />
      <UiStatBlock :value="`${sla.target}%`" label="Target" icon="target" />
      <UiStatBlock
        :value="sla.mttrSeconds === null ? '—' : fmtDuration(sla.mttrSeconds)"
        label="MTTR"
        icon="timer"
      />
      <UiStatBlock
        :value="sla.mtbfSeconds === null ? '—' : fmtDuration(sla.mtbfSeconds)"
        label="MTBF"
        icon="update"
      />
    </div>

    <div class="mt-6">
      <div class="mb-1.5 flex items-baseline justify-between text-sm">
        <span class="text-secondary">Error budget</span>
        <span :class="budgetOver ? 'text-down font-semibold' : 'text-tertiary'">
          {{ Math.round(sla.budgetUsedPct) }}% used
          · {{ fmtDuration(sla.downSeconds) }} down of {{ fmtDuration(sla.allowedDownSeconds) }} allowed
        </span>
      </div>
      <div class="h-2.5 w-full overflow-hidden rounded-full bg-sunken">
        <div class="h-full rounded-full transition-all" :style="{ width: `${budgetPct}%`, background: budgetColor }" />
      </div>
    </div>

    <div class="mt-6">
      <span class="text-xs tracking-wide text-tertiary uppercase">Trailing 12 months</span>
      <div class="mt-2 h-40">
        <BaseChart :option="trailingOption" />
      </div>
    </div>
  </UiCard>
</template>
