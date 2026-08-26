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
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-xs text-tertiary">
        {{ latest ? `Last checked ${formatTime(latest.checkedAt)}` : 'No DNS data yet' }}
      </div>
      <UiButton variant="secondary" :disabled="refreshing" @click="refreshNow">
        {{ refreshing ? 'Checking…' : 'Refresh now' }}
      </UiButton>
    </div>

    <div v-if="latest" class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <div v-for="group in GROUPS" :key="group.key">
        <div class="text-xs tracking-wide text-tertiary uppercase">{{ group.label }}</div>
        <div class="break-words text-primary">
          {{ latest[group.key].length ? latest[group.key].join(', ') : '—' }}
        </div>
      </div>
    </div>

    <div v-if="latest?.error" class="text-xs text-down">{{ latest.error }}</div>

    <UiEmptyState v-if="!latest" icon="dns">
      No DNS data yet — click "Refresh now" to look it up.
    </UiEmptyState>
  </div>
</template>
