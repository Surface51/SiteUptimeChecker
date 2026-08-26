<script setup lang="ts">
import type { CheckRow } from '#shared/types'

const props = defineProps<{ check: CheckRow }>()

interface Segment {
  label: string
  ms: number
  colorClass: string
}

const segments = computed<Segment[]>(() => {
  const c = props.check
  const segs: Segment[] = []
  let cursor = 0

  // Neutral ramp into the accent, matching the design system's phase breakdown.
  if (c.timeDns !== null) {
    segs.push({ label: 'DNS lookup', ms: c.timeDns - cursor, colorClass: 'bg-neutral' })
    cursor = c.timeDns
  }
  if (c.timeTcp !== null) {
    segs.push({ label: 'TCP connect', ms: c.timeTcp - cursor, colorClass: 'bg-secondary' })
    cursor = c.timeTcp
  }
  if (c.timeTls !== null) {
    segs.push({ label: 'TLS handshake', ms: c.timeTls - cursor, colorClass: 'bg-primary' })
    cursor = c.timeTls
  }
  if (c.timeTtfb !== null) {
    segs.push({ label: 'Waiting (TTFB)', ms: c.timeTtfb - cursor, colorClass: 'bg-accent' })
    cursor = c.timeTtfb
  }
  if (c.timeTotal !== null && c.timeTotal > cursor) {
    segs.push({ label: 'Content download', ms: c.timeTotal - cursor, colorClass: 'bg-maint' })
    cursor = c.timeTotal
  }

  return segs.filter((s) => s.ms >= 0)
})

const total = computed(() => Math.max(props.check.timeTotal ?? 0, 1))

const securityHeaderLabels: Record<string, string> = {
  'strict-transport-security': 'Strict-Transport-Security',
  'content-security-policy': 'Content-Security-Policy',
  'x-frame-options': 'X-Frame-Options',
  'x-content-type-options': 'X-Content-Type-Options',
  'referrer-policy': 'Referrer-Policy',
  'permissions-policy': 'Permissions-Policy',
  'cross-origin-opener-policy': 'Cross-Origin-Opener-Policy',
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="check.error" class="rounded-md border border-down bg-down-tint p-3 text-sm text-down">
      {{ check.error }}
    </div>

    <UiCard v-if="segments.length" padding="p-5">
      <h3 class="mb-4 font-display text-base font-semibold text-primary">Timing waterfall</h3>
      <div class="flex h-4 w-full overflow-hidden rounded-full bg-sunken">
        <div
          v-for="seg in segments"
          :key="seg.label"
          :class="seg.colorClass"
          :style="{ width: `${Math.max((seg.ms / total) * 100, 0.5)}%` }"
        />
      </div>
      <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <div v-for="seg in segments" :key="'legend-' + seg.label" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="seg.colorClass" />
          <span class="text-secondary">{{ seg.label }}</span>
          <span class="font-medium text-primary">{{ Math.round(seg.ms) }} ms</span>
        </div>
      </div>
    </UiCard>

    <UiCard padding="p-5">
      <h3 class="mb-4 font-display text-base font-semibold text-primary">SSL certificate</h3>
      <div v-if="check.sslExpiresAt" class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <div class="text-xs text-tertiary">Valid</div>
          <div :class="check.sslValid ? 'text-up' : 'text-down'">{{ check.sslValid ? 'Yes' : 'No' }}</div>
        </div>
        <div>
          <div class="text-xs text-tertiary">Issuer</div>
          <div class="text-primary">{{ check.sslIssuer || '—' }}</div>
        </div>
        <div>
          <div class="text-xs text-tertiary">Expires</div>
          <div class="text-primary">{{ new Date(check.sslExpiresAt).toLocaleDateString() }}</div>
        </div>
        <div>
          <div class="text-xs text-tertiary">Days remaining</div>
          <div :class="(check.sslDaysRemaining ?? 999) < 14 ? 'text-degraded' : 'text-primary'">
            {{ check.sslDaysRemaining ?? '—' }}
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-tertiary">No SSL certificate (plain HTTP)</div>
    </UiCard>

    <UiCard v-if="check.securityHeaders" padding="p-5">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="font-display text-base font-semibold text-primary">Security headers</h3>
        <span class="text-xs text-tertiary">
          {{ check.securityHeaders.score }} / {{ check.securityHeaders.maxScore }}
        </span>
      </div>
      <div class="flex flex-col divide-y divide-border-default text-sm">
        <div
          v-for="name in Object.keys(securityHeaderLabels)"
          :key="name"
          class="flex items-center justify-between gap-3 py-2"
        >
          <span class="text-secondary">{{ securityHeaderLabels[name] }}</span>
          <span
            class="rounded-full px-2.5 py-0.5 text-xs font-medium"
            :class="check.securityHeaders.headers[name]?.present ? 'bg-up-tint text-up' : 'bg-sunken text-tertiary'"
          >
            {{ check.securityHeaders.headers[name]?.present ? 'Present' : 'Missing' }}
          </span>
        </div>
      </div>
    </UiCard>

    <UiCard v-if="check.redirectChain.length" padding="p-5">
      <h3 class="mb-4 font-display text-base font-semibold text-primary">Redirect chain</h3>
      <ol class="flex flex-col gap-2 text-sm">
        <li v-for="(hop, i) in check.redirectChain" :key="i" class="flex items-center gap-2 text-secondary">
          <span class="rounded-sm bg-sunken px-2 py-0.5 font-mono text-xs text-tertiary">{{ hop.status }}</span>
          <span class="truncate">{{ hop.url }}</span>
        </li>
      </ol>
    </UiCard>

    <UiCard v-if="check.dnsRecords" padding="p-5">
      <h3 class="mb-4 font-display text-base font-semibold text-primary">DNS records</h3>
      <div class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <div class="text-xs text-tertiary">A</div>
          <div class="text-primary">{{ check.dnsRecords.a.length ? check.dnsRecords.a.join(', ') : '—' }}</div>
        </div>
        <div>
          <div class="text-xs text-tertiary">AAAA</div>
          <div class="text-primary">{{ check.dnsRecords.aaaa.length ? check.dnsRecords.aaaa.join(', ') : '—' }}</div>
        </div>
      </div>
      <div v-if="check.dnsRecords.error" class="mt-2 text-xs text-down">{{ check.dnsRecords.error }}</div>
    </UiCard>

    <details class="rounded-lg border border-border-default bg-raised p-5">
      <summary class="cursor-pointer font-display text-base font-semibold text-primary">Raw response headers</summary>
      <div class="mt-4 flex flex-col gap-1 font-mono text-xs text-secondary">
        <div v-for="(value, key) in check.responseHeaders" :key="key">
          <span class="text-tertiary">{{ key }}:</span> {{ value }}
        </div>
        <div v-if="!Object.keys(check.responseHeaders).length" class="text-tertiary">No headers captured</div>
      </div>
    </details>
  </div>
</template>
