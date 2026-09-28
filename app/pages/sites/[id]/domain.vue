<script setup lang="ts">
import type { DnsRecordSet, SubdomainRow, SubdomainScanState, WhoisRecord } from '#shared/types'

const route = useRoute()
const id = computed(() => Number(route.params.id))

const { data: whoisHistory, refresh: refreshWhois } = await useFetch<WhoisRecord[]>(
  () => `/api/sites/${id.value}/whois`,
  { default: () => [] },
)

const { data: dnsHistory, refresh: refreshDns } = await useFetch<DnsRecordSet[]>(
  () => `/api/sites/${id.value}/dns`,
  { default: () => [] },
)

const { data: subdomains, refresh: refreshSubdomains } = await useFetch<{
  subdomains: SubdomainRow[]
  scan: SubdomainScanState | null
}>(() => `/api/sites/${id.value}/subdomains`, { default: () => ({ subdomains: [], scan: null }) })

usePoll(() => {
  refreshWhois()
  refreshDns()
  refreshSubdomains()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <UiCard>
        <UiSectionHeading as="h3" class="mb-4">WHOIS</UiSectionHeading>
        <WhoisPanel :site-id="id" :history="whoisHistory ?? []" @ran="refreshWhois" />
      </UiCard>
      <UiCard>
        <UiSectionHeading as="h3" class="mb-4">DNS records</UiSectionHeading>
        <DnsRecordsPanel :site-id="id" :history="dnsHistory ?? []" @ran="refreshDns" />
      </UiCard>
    </div>

    <SubdomainsPanel
      :site-id="id"
      :subdomains="subdomains?.subdomains ?? []"
      :scan="subdomains?.scan ?? null"
      @ran="refreshSubdomains"
    />
  </div>
</template>
