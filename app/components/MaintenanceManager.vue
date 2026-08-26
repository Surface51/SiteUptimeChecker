<script setup lang="ts">
import type { MaintenanceWindowRow } from '#shared/types'

const props = defineProps<{ siteId: number }>()

const windows = ref<MaintenanceWindowRow[]>([])
const pending = ref(false)

const startsAt = ref('')
const endsAt = ref('')
const reason = ref('')
const errorMessage = ref('')
const saving = ref(false)

async function load() {
  pending.value = true
  try {
    windows.value = await $fetch<MaintenanceWindowRow[]>(`/api/sites/${props.siteId}/maintenance`)
  } finally {
    pending.value = false
  }
}
load()

function formatTime(iso: string) {
  return new Date(iso).toLocaleString()
}

function isActive(win: MaintenanceWindowRow) {
  const now = Date.now()
  return new Date(win.startsAt).getTime() <= now && now <= new Date(win.endsAt).getTime()
}

async function add() {
  if (!startsAt.value || !endsAt.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    // datetime-local inputs are local time with no offset — convert to a real Date, then ISO (UTC), for storage.
    await $fetch(`/api/sites/${props.siteId}/maintenance`, {
      method: 'POST',
      body: {
        startsAt: new Date(startsAt.value).toISOString(),
        endsAt: new Date(endsAt.value).toISOString(),
        reason: reason.value.trim() || undefined,
      },
    })
    startsAt.value = ''
    endsAt.value = ''
    reason.value = ''
    await load()
  } catch (e: any) {
    errorMessage.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to add maintenance window'
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  await $fetch(`/api/sites/${props.siteId}/maintenance/${id}`, { method: 'DELETE' })
  await load()
}
</script>

<template>
  <UiCard>
    <UiSectionHeading as="h3" class="mb-4">Maintenance windows</UiSectionHeading>

    <form class="flex flex-col gap-4 sm:flex-row sm:items-end" @submit.prevent="add">
      <div class="flex-1"><UiInput v-model="startsAt" label="Starts" type="datetime-local" /></div>
      <div class="flex-1"><UiInput v-model="endsAt" label="Ends" type="datetime-local" /></div>
      <div class="flex-1">
        <UiInput v-model="reason" label="Reason (optional)" placeholder="Scheduled deploy" />
      </div>
      <UiButton type="submit" variant="primary" :disabled="saving">
        {{ saving ? 'Adding…' : 'Add' }}
      </UiButton>
    </form>
    <p v-if="errorMessage" class="mt-3 text-sm text-down">{{ errorMessage }}</p>

    <div v-if="windows.length" class="mt-5 flex flex-col divide-y divide-border-default text-sm">
      <div v-for="win in windows" :key="win.id" class="flex items-center justify-between gap-3 py-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2 text-primary">
            <span>{{ formatTime(win.startsAt) }} <span class="text-tertiary">→</span> {{ formatTime(win.endsAt) }}</span>
            <UiBadge v-if="isActive(win)" tone="maint">Active</UiBadge>
          </div>
          <div v-if="win.reason" class="mt-0.5 truncate text-xs text-tertiary">{{ win.reason }}</div>
        </div>
        <button
          type="button"
          class="cursor-pointer rounded-full border border-border-default px-3 py-1 text-xs font-medium text-secondary transition-colors hover:border-down hover:bg-down hover:text-white"
          @click="remove(win.id)"
        >
          Remove
        </button>
      </div>
    </div>
    <p v-else-if="!pending" class="mt-4 text-sm text-tertiary">No maintenance windows scheduled.</p>
  </UiCard>
</template>
