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
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-xs text-tertiary">
        {{ latest ? `Last checked ${formatTime(latest.checkedAt)}` : 'No WHOIS data yet' }}
      </div>
      <UiButton variant="secondary" :disabled="refreshing" @click="refreshNow">
        {{ refreshing ? 'Checking…' : 'Refresh now' }}
      </UiButton>
    </div>

    <div v-if="latest && !latest.error" class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <div>
        <div class="text-xs text-tertiary">Registrar</div>
        <div class="text-primary">{{ latest.registrar || '—' }}</div>
      </div>
      <div>
        <div class="text-xs text-tertiary">Expires</div>
        <div class="text-primary">
          <span :class="daysUntilExpiry !== null && daysUntilExpiry < 30 ? 'font-medium text-degraded' : ''">
            {{ formatDate(latest.expiryDate) }}
          </span>
          <span v-if="daysUntilExpiry !== null" class="text-xs text-tertiary">({{ daysUntilExpiry }}d)</span>
        </div>
      </div>
      <div>
        <div class="text-xs text-tertiary">Created</div>
        <div class="text-primary">{{ formatDate(latest.createdDate) }}</div>
      </div>
      <div>
        <div class="text-xs text-tertiary">Updated</div>
        <div class="text-primary">{{ formatDate(latest.updatedDate) }}</div>
      </div>
      <div class="sm:col-span-2">
        <div class="text-xs text-tertiary">Name servers</div>
        <div class="break-words text-primary">{{ latest.nameServers.length ? latest.nameServers.join(', ') : '—' }}</div>
      </div>
      <div class="sm:col-span-2">
        <div class="text-xs text-tertiary">Status</div>
        <div class="break-words text-primary">{{ latest.statuses.length ? latest.statuses.join(', ') : '—' }}</div>
      </div>
    </div>

    <div v-else-if="latest?.error" class="text-xs text-down">{{ latest.error }}</div>

    <UiEmptyState v-else icon="travel_explore">
      No WHOIS data yet — click "Refresh now" to look it up.
    </UiEmptyState>
  </div>
</template>
