<script setup lang="ts">
import type { IncidentRow } from '#shared/types'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const { site } = useInjectedSite()

const { data: incidents, refresh: refreshIncidents } = await useFetch<IncidentRow[]>(
  () => `/api/sites/${id.value}/incidents`,
  { default: () => [] },
)

usePoll(() => refreshIncidents())
</script>

<template>
  <div class="flex flex-col gap-6">
    <IncidentList :incidents="incidents ?? []" :log-slug="site?.logSlug" />

    <UiCard v-if="(incidents ?? []).some((i) => i.endedAt !== null)">
      <UiSectionHeading as="h3" class="mb-4">Incident duration (MTTR trend)</UiSectionHeading>
      <IncidentDurationBar :incidents="incidents ?? []" />
    </UiCard>

    <MaintenanceManager :site-id="id" />
  </div>
</template>
