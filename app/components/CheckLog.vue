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
  <UiCard>
    <UiSectionHeading as="h3" class="mb-4">
      Check log
      <template #actions>
        <UiSegmentedControl
          v-model="statusFilter"
          :options="[
            { label: 'All', value: 'all' },
            { label: 'Up', value: 'up' },
            { label: 'Degraded', value: 'degraded' },
            { label: 'Down', value: 'down' },
          ]"
        />
      </template>
    </UiSectionHeading>

    <div v-if="!rows.length && !pending" class="py-6 text-center text-sm text-tertiary">No checks recorded yet.</div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr class="border-b border-border-default text-left">
            <th class="px-3 py-2.5 text-xs font-semibold tracking-wide text-tertiary uppercase">Time</th>
            <th class="px-3 py-2.5 text-xs font-semibold tracking-wide text-tertiary uppercase">Status</th>
            <th class="px-3 py-2.5 text-right text-xs font-semibold tracking-wide text-tertiary uppercase">HTTP</th>
            <th class="px-3 py-2.5 text-right text-xs font-semibold tracking-wide text-tertiary uppercase">Response</th>
            <th class="px-3 py-2.5 text-xs font-semibold tracking-wide text-tertiary uppercase">Error</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr
              class="cursor-pointer border-b border-border-default transition-colors last:border-0 hover:bg-sunken"
              @click="toggleExpand(row.id)"
            >
              <td class="px-3 py-2.5 whitespace-nowrap text-secondary">{{ formatTime(row.checkedAt) }}</td>
              <td class="px-3 py-2.5"><StatusBadge :status="row.status" /></td>
              <td class="px-3 py-2.5 text-right text-secondary">{{ row.httpStatus ?? '—' }}</td>
              <td class="px-3 py-2.5 text-right text-secondary">
                {{ row.timeTotal == null ? '—' : `${Math.round(row.timeTotal)} ms` }}
              </td>
              <td class="truncate px-3 py-2.5 text-down">{{ row.error ?? '—' }}</td>
            </tr>
            <tr v-if="expandedId === row.id" class="border-b border-border-default bg-sunken last:border-0">
              <td colspan="5" class="p-4">
                <CheckDetail :check="row" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex justify-center">
      <UiButton v-if="!done" variant="secondary" :disabled="pending" @click="loadPage(false)">
        {{ pending ? 'Loading…' : 'Load more' }}
      </UiButton>
    </div>
  </UiCard>
</template>
