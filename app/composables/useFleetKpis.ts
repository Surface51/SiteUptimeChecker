import type { FleetTrends } from '#shared/types'
import type { KpiDelta } from '~/components/FleetKpi.vue'
import { formatMs, formatPct, formatShortDuration } from '~/utils/fleetStats'

/** The five headline KPIs for a trends window, each with its change against the previous window. */
export function useFleetKpis(trends: Ref<FleetTrends | null | undefined>) {
  /** Percent change of `c` over `p`; null when either side has no data or `p` is zero. */
  function pctChange(c: number | null | undefined, p: number | null | undefined): number | null {
    if (c == null || p == null || p === 0) return null
    return ((c - p) / p) * 100
  }

  function direction(diff: number, epsilon = 0.0005): KpiDelta['direction'] {
    if (Math.abs(diff) < epsilon) return 'flat'
    return diff > 0 ? 'up' : 'down'
  }

  function toDelta(diff: number | null, text: string, higherIsBetter: boolean): KpiDelta | null {
    if (diff === null) return null
    const dir = direction(diff)
    const tone = dir === 'flat' ? 'flat' : (dir === 'up') === higherIsBetter ? 'good' : 'bad'
    return { text, tone, direction: dir }
  }

  function pctDelta(c: number | null | undefined, p: number | null | undefined, higherIsBetter: boolean) {
    const change = pctChange(c, p)
    return toDelta(change, change === null ? '' : `${Math.abs(change).toFixed(0)}%`, higherIsBetter)
  }

  return computed(() => {
    if (!trends.value) return []
    const c = trends.value.current
    const p = trends.value.previous
    const uptimeDiff = c.uptime !== null && p.uptime !== null ? c.uptime - p.uptime : null
    const incidentDiff = c.incidents - p.incidents
    return [
      {
        label: 'Fleet uptime',
        value: formatPct(c.uptime),
        delta: toDelta(uptimeDiff, uptimeDiff === null ? '' : `${Math.abs(uptimeDiff).toFixed(2)} pts`, true),
      },
      { label: 'Avg daily p95', value: formatMs(c.avgP95Ms), delta: pctDelta(c.avgP95Ms, p.avgP95Ms, false) },
      { label: 'Worst p95', value: formatMs(c.worstP95Ms), delta: pctDelta(c.worstP95Ms, p.worstP95Ms, false) },
      {
        label: 'Incidents',
        value: String(c.incidents),
        delta: toDelta(incidentDiff, String(Math.abs(incidentDiff)), false),
      },
      {
        label: 'MTTR',
        value: formatShortDuration(c.mttrSeconds),
        delta: pctDelta(c.mttrSeconds, p.mttrSeconds, false),
      },
    ]
  })
}
