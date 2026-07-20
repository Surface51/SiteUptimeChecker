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
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <h2 class="mb-3 text-sm font-medium text-slate-200">Maintenance windows</h2>

    <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="add">
      <div class="flex-1">
        <label class="mb-1 block text-xs text-slate-500">Starts</label>
        <input
          v-model="startsAt"
          type="datetime-local"
          required
          class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div class="flex-1">
        <label class="mb-1 block text-xs text-slate-500">Ends</label>
        <input
          v-model="endsAt"
          type="datetime-local"
          required
          class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div class="flex-1">
        <label class="mb-1 block text-xs text-slate-500">Reason (optional)</label>
        <input
          v-model="reason"
          type="text"
          placeholder="Scheduled deploy"
          class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        :disabled="saving"
        class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {{ saving ? 'Adding…' : 'Add' }}
      </button>
    </form>
    <p v-if="errorMessage" class="mt-2 text-sm text-rose-400">{{ errorMessage }}</p>

    <div v-if="windows.length" class="mt-4 flex flex-col divide-y divide-slate-800 text-sm">
      <div v-for="win in windows" :key="win.id" class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <div class="text-slate-200">
            {{ formatTime(win.startsAt) }} <span class="text-slate-500">→</span> {{ formatTime(win.endsAt) }}
            <span v-if="isActive(win)" class="ml-1.5 rounded-full bg-sky-900/40 px-2 py-0.5 text-[11px] font-medium text-sky-300">Active</span>
          </div>
          <div v-if="win.reason" class="truncate text-xs text-slate-500">{{ win.reason }}</div>
        </div>
        <button
          type="button"
          class="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-rose-950/60 hover:text-rose-300"
          @click="remove(win.id)"
        >
          Remove
        </button>
      </div>
    </div>
    <p v-else-if="!pending" class="mt-3 text-sm text-slate-500">No maintenance windows scheduled.</p>
  </div>
</template>
