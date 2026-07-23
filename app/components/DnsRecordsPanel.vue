<script setup lang="ts">
import type { DnsRecordSet } from '#shared/types'

const props = defineProps<{ siteId: number; history: DnsRecordSet[] }>()
const emit = defineEmits<{ ran: [] }>()

const latest = computed(() => {
  for (let i = props.history.length - 1; i >= 0; i--) {
    if (!props.history[i]!.error) return props.history[i]!
  }
  return props.history.length ? props.history[props.history.length - 1]! : null
})

const GROUPS: { key: keyof Pick<DnsRecordSet, 'a' | 'aaaa' | 'ns' | 'mx' | 'cname' | 'txt' | 'soa' | 'caa'>; label: string }[] = [
  { key: 'a', label: 'A' },
  { key: 'aaaa', label: 'AAAA' },
  { key: 'ns', label: 'NS' },
  { key: 'mx', label: 'MX' },
  { key: 'cname', label: 'CNAME' },
  { key: 'txt', label: 'TXT' },
  { key: 'soa', label: 'SOA' },
  { key: 'caa', label: 'CAA' },
]

const refreshing = ref(false)
async function refreshNow() {
  refreshing.value = true
  try {
    await $fetch(`/api/sites/${props.siteId}/domain-info`, { method: 'POST', query: { force: 'true' } })
    emit('ran')
  } finally {
    refreshing.value = false
  }
}

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="text-xs text-slate-500">
        {{ latest ? `Last checked ${formatTime(latest.checkedAt)}` : 'No DNS data yet' }}
      </div>
      <button
        type="button"
        :disabled="refreshing"
        class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        @click="refreshNow"
      >
        {{ refreshing ? 'Checking…' : 'Refresh now' }}
      </button>
    </div>

    <div v-if="latest" class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div v-for="group in GROUPS" :key="group.key">
        <div class="text-xs text-slate-500">{{ group.label }}</div>
        <div class="text-slate-200 break-words">
          {{ latest[group.key].length ? latest[group.key].join(', ') : '—' }}
        </div>
      </div>
    </div>

    <div v-if="latest?.error" class="text-xs text-rose-400">{{ latest.error }}</div>

    <div v-if="!latest" class="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
      No DNS data yet — click "Refresh now" to look it up.
    </div>
  </div>
</template>
