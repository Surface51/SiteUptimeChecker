<script setup lang="ts">
import type {
  HistoryPoint,
  IncidentRow,
  LighthouseFormFactor,
  LighthouseReport,
  MaintenanceWindowRow,
} from '#shared/types'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const { site } = useInjectedSite()

const hoursOptions = [
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '7d', value: 24 * 7 },
]
const selectedHours = ref(24)

const { data: history, refresh: refreshHistory } = await useFetch<HistoryPoint[]>(
  () => `/api/sites/${id.value}/history`,
  { query: computed(() => ({ hours: selectedHours.value })), default: () => [] },
)

const { data: incidents, refresh: refreshIncidents } = await useFetch<IncidentRow[]>(
  () => `/api/sites/${id.value}/incidents`,
  { default: () => [] },
)

const { data: maintenanceWindows, refresh: refreshMaintenance } = await useFetch<MaintenanceWindowRow[]>(
  () => `/api/sites/${id.value}/maintenance`,
  { default: () => [] },
)

const lhFormFactor = ref<LighthouseFormFactor>('mobile')

const { data: lighthouseHistory, refresh: refreshLighthouse } = await useFetch<LighthouseReport[]>(
  () => `/api/sites/${id.value}/lighthouse`,
  { query: computed(() => ({ formFactor: lhFormFactor.value, days: 30 })), default: () => [] },
)

usePoll(() => {
  refreshHistory()
  refreshIncidents()
  refreshMaintenance()
  refreshLighthouse()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <UiSectionHeading as="h3" class="mb-4">
        Response time
        <template #actions>
          <UiSegmentedControl v-model="selectedHours" :options="hoursOptions" />
        </template>
      </UiSectionHeading>
      <ResponseTimeChart
        :points="history ?? []"
        :degraded-ms="site?.degradedMs ?? 0"
        :incidents="incidents ?? []"
        :maintenance-windows="maintenanceWindows ?? []"
      />
    </UiCard>

    <UiCard>
      <UiSectionHeading as="h3" class="mb-4">Lighthouse</UiSectionHeading>
      <LighthouseReport
        :site-id="id"
        :form-factor="lhFormFactor"
        :history="lighthouseHistory ?? []"
        @update:form-factor="lhFormFactor = $event"
        @ran="() => refreshLighthouse()"
      />
      <div class="mt-6">
        <LighthousePerfChart :points="lighthouseHistory ?? []" />
      </div>
    </UiCard>
  </div>
</template>
