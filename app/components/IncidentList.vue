<script setup lang="ts">
import type { IncidentRow } from '#shared/types'

const props = defineProps<{
  incidents: IncidentRow[]
  /** When the site is linked to logs, each incident can be expanded for its log context. */
  logSlug?: string | null
  siteId?: number
}>()

const route = useRoute()
const siteId = computed(() => props.siteId ?? Number(route.params.id))

const expanded = ref<number | null>(null)

function toggle(id: number) {
  if (!props.logSlug) return
  expanded.value = expanded.value === id ? null : id
}

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(2)}h`
}

const mttrSeconds = computed(() => {
  const closed = props.incidents.filter((i) => i.endedAt !== null)
  if (!closed.length) return null
  return closed.reduce((sum, i) => sum + (i.durationSeconds ?? 0), 0) / closed.length
})
</script>

<template>
  <UiCard>
    <UiSectionHeading as="h3" class="mb-4">
      Incidents
      <template #actions>
        <span class="text-xs text-tertiary">
          {{ incidents.length }} total · MTTR
          {{ formatDuration(mttrSeconds === null ? null : Math.round(mttrSeconds)) }}
        </span>
      </template>
    </UiSectionHeading>

    <div v-if="!incidents.length" class="py-6 text-center text-sm text-tertiary">No incidents recorded.</div>

    <ul v-else class="flex flex-col divide-y divide-border-default text-sm">
      <li v-for="incident in incidents" :key="incident.id" class="py-3">
        <div
          class="flex items-center justify-between gap-3"
          :class="logSlug ? 'cursor-pointer' : ''"
          @click="toggle(incident.id)"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 font-medium text-primary">
              <UiIcon
                v-if="logSlug"
                :name="expanded === incident.id ? 'expand_more' : 'chevron_right'"
                :size="16"
                class="text-tertiary"
              />
              {{ formatTime(incident.startedAt) }}
              <span class="text-tertiary">→</span>
              {{ incident.endedAt ? formatTime(incident.endedAt) : 'ongoing' }}
            </div>
            <div v-if="incident.cause" class="mt-0.5 truncate text-xs text-tertiary">{{ incident.cause }}</div>
          </div>
          <UiBadge :tone="incident.endedAt ? 'outline' : 'down'" class="whitespace-nowrap">
            {{ formatDuration(incident.durationSeconds) }}
          </UiBadge>
        </div>

        <div v-if="logSlug && expanded === incident.id" class="mt-3 rounded-md bg-sunken p-4">
          <LogsIncidentContext :site-id="siteId" :incident-id="incident.id" />
        </div>
      </li>
    </ul>
  </UiCard>
</template>
