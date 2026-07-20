<script setup lang="ts">
import type { CheckRow, CheckStatus } from '#shared/types'

const props = defineProps<{ siteId: number }>()

const PAGE_SIZE = 25

const statusFilter = ref<CheckStatus | 'all'>('all')
const rows = ref<CheckRow[]>([])
const offset = ref(0)
const pending = ref(false)
const done = ref(false)
const expandedId = ref<number | null>(null)

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}

async function loadPage(reset: boolean) {
  if (pending.value) return
  pending.value = true
  try {
    const query: Record<string, string | number> = { limit: PAGE_SIZE, offset: reset ? 0 : offset.value }
    if (statusFilter.value !== 'all') query.status = statusFilter.value
    const page = await $fetch<CheckRow[]>(`/api/sites/${props.siteId}/log`, { query })
    rows.value = reset ? page : [...rows.value, ...page]
    offset.value = (reset ? 0 : offset.value) + page.length
    done.value = page.length < PAGE_SIZE
  } finally {
    pending.value = false
  }
}

watch(statusFilter, () => loadPage(true))
loadPage(true)

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-medium text-slate-200">Check log</h2>
      <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
        <button
          v-for="opt in [
            { label: 'All', value: 'all' as const },
            { label: 'Up', value: 'up' as const },
            { label: 'Degraded', value: 'degraded' as const },
            { label: 'Down', value: 'down' as const },
          ]"
          :key="opt.value"
          type="button"
          class="rounded px-2 py-1"
          :class="statusFilter === opt.value ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
          @click="statusFilter = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div v-if="!rows.length && !pending" class="py-6 text-center text-sm text-slate-500">No checks recorded yet.</div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr class="border-b border-slate-800 text-left text-xs text-slate-500">
            <th class="px-3 py-2 font-medium">Time</th>
            <th class="px-3 py-2 font-medium">Status</th>
            <th class="px-3 py-2 text-right font-medium">HTTP</th>
            <th class="px-3 py-2 text-right font-medium">Response</th>
            <th class="px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr
              class="cursor-pointer border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40"
              @click="toggleExpand(row.id)"
            >
              <td class="whitespace-nowrap px-3 py-2 text-slate-400">{{ formatTime(row.checkedAt) }}</td>
              <td class="px-3 py-2"><StatusBadge :status="row.status" /></td>
              <td class="px-3 py-2 text-right text-slate-300">{{ row.httpStatus ?? '—' }}</td>
              <td class="px-3 py-2 text-right text-slate-300">{{ row.timeTotal == null ? '—' : `${Math.round(row.timeTotal)} ms` }}</td>
              <td class="truncate px-3 py-2 text-rose-400">{{ row.error ?? '—' }}</td>
            </tr>
            <tr v-if="expandedId === row.id" class="border-b border-slate-800/60 last:border-0 bg-slate-950/40">
              <td colspan="5" class="p-3">
                <CheckDetail :check="row" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div class="mt-3 flex justify-center">
      <button
        v-if="!done"
        type="button"
        :disabled="pending"
        class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        @click="loadPage(false)"
      >
        {{ pending ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>
