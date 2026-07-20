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

  if (c.timeDns !== null) {
    segs.push({ label: 'DNS lookup', ms: c.timeDns - cursor, colorClass: 'bg-sky-500' })
    cursor = c.timeDns
  }
  if (c.timeTcp !== null) {
    segs.push({ label: 'TCP connect', ms: c.timeTcp - cursor, colorClass: 'bg-indigo-500' })
    cursor = c.timeTcp
  }
  if (c.timeTls !== null) {
    segs.push({ label: 'TLS handshake', ms: c.timeTls - cursor, colorClass: 'bg-violet-500' })
    cursor = c.timeTls
  }
  if (c.timeTtfb !== null) {
    segs.push({ label: 'Waiting (TTFB)', ms: c.timeTtfb - cursor, colorClass: 'bg-fuchsia-500' })
    cursor = c.timeTtfb
  }
  if (c.timeTotal !== null && c.timeTotal > cursor) {
    segs.push({ label: 'Content download', ms: c.timeTotal - cursor, colorClass: 'bg-emerald-600' })
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
    <div v-if="check.error" class="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">
      {{ check.error }}
    </div>

    <section v-if="segments.length" class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 class="mb-3 text-sm font-medium text-slate-200">Timing waterfall</h3>
      <div class="flex h-4 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          v-for="seg in segments"
          :key="seg.label"
          :class="seg.colorClass"
          :style="{ width: `${Math.max((seg.ms / total) * 100, 0.5)}%` }"
        />
      </div>
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <div v-for="seg in segments" :key="'legend-' + seg.label" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="seg.colorClass" />
          <span class="text-slate-400">{{ seg.label }}</span>
          <span class="font-medium text-slate-200">{{ Math.round(seg.ms) }} ms</span>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 class="mb-3 text-sm font-medium text-slate-200">SSL certificate</h3>
      <div v-if="check.sslExpiresAt" class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <div class="text-xs text-slate-500">Valid</div>
          <div :class="check.sslValid ? 'text-emerald-300' : 'text-rose-300'">{{ check.sslValid ? 'Yes' : 'No' }}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Issuer</div>
          <div class="text-slate-200">{{ check.sslIssuer || '—' }}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Expires</div>
          <div class="text-slate-200">{{ new Date(check.sslExpiresAt).toLocaleDateString() }}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Days remaining</div>
          <div :class="(check.sslDaysRemaining ?? 999) < 14 ? 'text-amber-300' : 'text-slate-200'">
            {{ check.sslDaysRemaining ?? '—' }}
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-slate-500">No SSL certificate (plain HTTP)</div>
    </section>

    <section v-if="check.securityHeaders" class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 class="mb-3 flex items-center justify-between text-sm font-medium text-slate-200">
        <span>Security headers</span>
        <span class="text-xs text-slate-500">{{ check.securityHeaders.score }} / {{ check.securityHeaders.maxScore }}</span>
      </h3>
      <div class="flex flex-col divide-y divide-slate-800 text-sm">
        <div
          v-for="(name) in Object.keys(securityHeaderLabels)"
          :key="name"
          class="flex items-center justify-between gap-3 py-1.5"
        >
          <span class="text-slate-400">{{ securityHeaderLabels[name] }}</span>
          <span
            class="rounded-full px-2 py-0.5 text-xs"
            :class="check.securityHeaders.headers[name]?.present ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-500'"
          >
            {{ check.securityHeaders.headers[name]?.present ? 'Present' : 'Missing' }}
          </span>
        </div>
      </div>
    </section>

    <section v-if="check.redirectChain.length" class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 class="mb-3 text-sm font-medium text-slate-200">Redirect chain</h3>
      <ol class="flex flex-col gap-1.5 text-sm">
        <li v-for="(hop, i) in check.redirectChain" :key="i" class="flex items-center gap-2 text-slate-300">
          <span class="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-400">{{ hop.status }}</span>
          <span class="truncate">{{ hop.url }}</span>
        </li>
      </ol>
    </section>

    <section v-if="check.dnsRecords" class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 class="mb-3 text-sm font-medium text-slate-200">DNS records</h3>
      <div class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <div class="text-xs text-slate-500">A</div>
          <div class="text-slate-200">{{ check.dnsRecords.a.length ? check.dnsRecords.a.join(', ') : '—' }}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">AAAA</div>
          <div class="text-slate-200">{{ check.dnsRecords.aaaa.length ? check.dnsRecords.aaaa.join(', ') : '—' }}</div>
        </div>
      </div>
      <div v-if="check.dnsRecords.error" class="mt-2 text-xs text-rose-400">{{ check.dnsRecords.error }}</div>
    </section>

    <details class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <summary class="cursor-pointer text-sm font-medium text-slate-200">Raw response headers</summary>
      <div class="mt-3 flex flex-col gap-1 font-mono text-xs text-slate-400">
        <div v-for="(value, key) in check.responseHeaders" :key="key">
          <span class="text-slate-500">{{ key }}:</span> {{ value }}
        </div>
        <div v-if="!Object.keys(check.responseHeaders).length" class="text-slate-600">No headers captured</div>
      </div>
    </details>
  </div>
</template>
