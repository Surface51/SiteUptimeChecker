<script setup lang="ts">
import type { WhoisRecord } from '#shared/types'

const props = defineProps<{ siteId: number; history: WhoisRecord[] }>()
const emit = defineEmits<{ ran: [] }>()

const latest = computed(() => {
  for (let i = props.history.length - 1; i >= 0; i--) {
    if (!props.history[i]!.error) return props.history[i]!
  }
  return props.history.length ? props.history[props.history.length - 1]! : null
})

const daysUntilExpiry = computed(() => {
  if (!latest.value?.expiryDate) return null
  const expiry = new Date(latest.value.expiryDate)
  if (Number.isNaN(expiry.getTime())) return null
  return Math.floor((expiry.getTime() - Date.now()) / 86_400_000)
})

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

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="text-xs text-slate-500">
        {{ latest ? `Last checked ${formatTime(latest.checkedAt)}` : 'No WHOIS data yet' }}
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

    <div v-if="latest && !latest.error" class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div>
        <div class="text-xs text-slate-500">Registrar</div>
        <div class="text-slate-200">{{ latest.registrar || '—' }}</div>
      </div>
      <div>
        <div class="text-xs text-slate-500">Expires</div>
        <div class="text-slate-200">
          <span :class="daysUntilExpiry !== null && daysUntilExpiry < 30 ? 'text-amber-300' : ''">
            {{ formatDate(latest.expiryDate) }}
          </span>
          <span v-if="daysUntilExpiry !== null" class="text-xs text-slate-500">({{ daysUntilExpiry }}d)</span>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-500">Created</div>
        <div class="text-slate-200">{{ formatDate(latest.createdDate) }}</div>
      </div>
      <div>
        <div class="text-xs text-slate-500">Updated</div>
        <div class="text-slate-200">{{ formatDate(latest.updatedDate) }}</div>
      </div>
      <div class="sm:col-span-2">
        <div class="text-xs text-slate-500">Name servers</div>
        <div class="text-slate-200 break-words">{{ latest.nameServers.length ? latest.nameServers.join(', ') : '—' }}</div>
      </div>
      <div class="sm:col-span-2">
        <div class="text-xs text-slate-500">Status</div>
        <div class="text-slate-200 break-words">{{ latest.statuses.length ? latest.statuses.join(', ') : '—' }}</div>
      </div>
    </div>

    <div v-else-if="latest?.error" class="text-xs text-rose-400">{{ latest.error }}</div>

    <div v-else class="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
      No WHOIS data yet — click "Refresh now" to look it up.
    </div>
  </div>
</template>
