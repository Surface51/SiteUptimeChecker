<script setup lang="ts">
import { formatExact, formatLogTime } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))
const filters = useInjectedLogFilters()

const { data: threats, pending } = useLogView<{
  suspiciousPaths: any[]
  offenderIps: any[]
  forbiddenSummary: any[]
}>('security/threats', () => ({ suspiciousPaths: [], offenderIps: [], forbiddenSummary: [] }))

// Selected offenders drive the nginx rule generator below.
const selected = ref<string[]>([])

function toggle(ip: string) {
  selected.value = selected.value.includes(ip)
    ? selected.value.filter((entry) => entry !== ip)
    : [...selected.value, ip]
}

// Generated server-side rather than string-built here, so the addresses are validated before
// they end up in something the operator pastes into a server config.
const blockRules = ref<string>('')
watch(selected, async (ips) => {
  if (!ips.length) {
    blockRules.value = ''
    return
  }
  const result = await $fetch<{ nginxDeny: string }>(
    `/api/sites/${id.value}/logs/security/block-rules`,
    { query: { ips: ips.join(',') } },
  )
  blockRules.value = result.nginxDeny
})

const inspectIp = computed(() => (route.query.ip ? String(route.query.ip) : null))

const profile = ref<any>(null)
const profilePending = ref(false)

watch(
  [inspectIp, filters.query],
  async ([ip]) => {
    if (!ip) {
      profile.value = null
      return
    }
    profilePending.value = true
    try {
      profile.value = await $fetch(`/api/sites/${id.value}/logs/security/ip/${ip}`, {
        query: filters.query.value,
      })
    } finally {
      profilePending.value = false
    }
  },
  { immediate: true },
)

function clearInspect() {
  const query = { ...route.query }
  delete query.ip
  router.replace({ query })
}

const pathColumns: LogColumn[] = [
  { key: 'path', label: 'Probed path', mono: true },
  { key: 'hits', label: 'Hits', numeric: true, format: formatExact },
  { key: 'unique_ips', label: 'IPs', numeric: true, format: formatExact },
  { key: 'last_seen', label: 'Last seen', format: formatLogTime },
]

const offenderColumns: LogColumn[] = [
  { key: 'client_ip', label: 'Client IP', mono: true },
  { key: 'country', label: 'Country' },
  { key: 'not_found_count', label: '404s', numeric: true, format: formatExact },
  { key: 'requests', label: 'Requests', numeric: true, format: formatExact },
  { key: 'last_seen', label: 'Last seen', format: formatLogTime },
]

const forbiddenColumns: LogColumn[] = [
  { key: 'fingerprint', label: 'nginx rejection', mono: true },
  { key: 'total_count', label: 'Count', numeric: true, format: formatExact },
  { key: 'last_seen', label: 'Last seen', format: formatLogTime },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard v-if="inspectIp">
      <div class="flex flex-col gap-4">
        <UiSectionHeading as="h3">
          <span class="font-mono">{{ inspectIp }}</span>
          <template #actions>
            <UiButton variant="ghost" size="sm" @click="clearInspect">Close</UiButton>
          </template>
        </UiSectionHeading>

        <p v-if="profilePending" class="text-sm text-tertiary">Loading profile…</p>
        <template v-else-if="profile">
          <div class="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <UiStatBlock :value="formatExact(profile.profile?.request_count)" label="Requests (all time)" />
            <UiStatBlock :value="formatExact(profile.profile?.error_4xx_count)" label="4xx" />
            <UiStatBlock :value="formatExact(profile.profile?.distinct_paths)" label="Distinct paths" />
            <UiStatBlock :value="profile.profile?.country ?? '—'" label="Country" />
          </div>
          <p v-if="!profile.profile" class="text-sm text-tertiary">
            No stored profile for this address yet — rebuild IP profiles to compute one.
          </p>
          <div v-if="profile.recentRequests?.length" class="max-h-64 overflow-auto rounded-md bg-page p-3">
            <p
              v-for="(req, index) in profile.recentRequests.slice(0, 40)"
              :key="index"
              class="font-mono text-xs text-secondary"
            >
              {{ formatLogTime(req.ts) }} · {{ req.status }} · {{ req.method }} {{ req.path }}
            </p>
          </div>
        </template>
      </div>
    </UiCard>

    <LogsDataTable
      title="Scanner probes"
      :columns="pathColumns"
      :rows="threats?.suspiciousPaths ?? []"
      :pending="pending"
      empty="No known scanner paths probed in this range"
      min-width="640px"
    />

    <LogsDataTable
      title="404 offenders"
      :columns="offenderColumns"
      :rows="threats?.offenderIps ?? []"
      :pending="pending"
      empty="No addresses generating repeated 404s"
      min-width="680px"
    >
      <template #actions>
        <span class="text-xs text-tertiary">Select addresses to generate nginx rules</span>
      </template>
      <template #cell-client_ip="{ value }">
        <label class="flex cursor-pointer items-center gap-2" @click.stop>
          <input
            type="checkbox"
            :checked="selected.includes(String(value))"
            class="cursor-pointer accent-[var(--accent)]"
            @change="toggle(String(value))"
          />
          <NuxtLink
            :to="{ query: { ...route.query, ip: value } }"
            class="font-mono text-xs text-primary no-underline transition-colors hover:text-accent"
          >
            {{ value }}
          </NuxtLink>
        </label>
      </template>
    </LogsDataTable>

    <UiCard v-if="selected.length">
      <div class="flex flex-col gap-3">
        <UiSectionHeading as="h3">
          Block rules
          <template #actions>
            <UiButton variant="ghost" size="sm" @click="selected = []">Clear</UiButton>
          </template>
        </UiSectionHeading>
        <p class="text-sm text-secondary">
          Paste into your nginx server block. Review before applying — a shared NAT address can
          put real visitors behind one of these.
        </p>
        <pre
          v-if="blockRules"
          class="overflow-x-auto rounded-md bg-page p-3 font-mono text-xs text-secondary"
        >{{ blockRules }}</pre>
        <p v-else class="text-xs text-tertiary">Generating…</p>
      </div>
    </UiCard>

    <LogsDataTable
      title="Rejected by nginx"
      :columns="forbiddenColumns"
      :rows="threats?.forbiddenSummary ?? []"
      :pending="pending"
      empty="No forbidden/denied entries in this range"
      min-width="560px"
    />
  </div>
</template>
