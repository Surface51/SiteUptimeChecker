<script setup lang="ts">
import type { HistoryPoint, SiteSummary } from '#shared/types'
import {
  emptySiteSettings,
  siteSettingsFromSite,
  siteSettingsToBody,
} from '~/utils/siteSettingsPayload'
import { SITE_SHELL_KEY } from '~/composables/useSiteShell'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))

const { data: site, refresh: refreshSite, error: siteError } = await useFetch<SiteSummary>(
  () => `/api/sites/${id.value}`,
)

// Shared with the tab pages so they don't each re-fetch the site.
provide(SITE_SHELL_KEY, { site, refreshSite })

useHead({ title: () => (site.value ? site.value.name || site.value.url : 'Site Uptime') })

const { tags: allTags } = useTags()

// Just enough history for the header's average/p95 stat. The Performance tab owns its own
// range-controlled fetch.
const { data: history, refresh: refreshHistory } = await useFetch<HistoryPoint[]>(
  () => `/api/sites/${id.value}/history`,
  { query: { hours: 24 }, default: () => [] },
)

const avgResponseMs = computed(() => {
  const values = (history.value ?? []).map((p) => p.timeTotal).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
})

const p95ResponseMs = computed(() => {
  const values = (history.value ?? [])
    .map((p) => p.timeTotal)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  if (!values.length) return null
  const idx = Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)
  return values[idx] ?? null
})

usePoll(() => {
  refreshSite()
  refreshHistory()
})

const hostname = computed(() => {
  if (!site.value) return ''
  try {
    return new URL(site.value.url).hostname
  } catch {
    return site.value.url
  }
})

const screenshotSrc = computed(() => {
  if (!site.value?.screenshotUpdatedAt) return null
  return `/screenshots/${site.value.id}.png?v=${encodeURIComponent(site.value.screenshotUpdatedAt)}`
})
const screenshotFailed = ref(false)

const tabs = computed(() => [
  { label: 'Overview', to: '' },
  { label: 'Performance', to: 'performance' },
  { label: 'Domain', to: 'domain' },
  { label: 'Incidents', to: 'incidents' },
  { label: 'Activity', to: 'activity' },
  ...(site.value?.logSlug ? [{ label: 'Logs', to: 'logs' }] : []),
])

// --- actions ---
const checking = ref(false)
async function checkNow() {
  checking.value = true
  try {
    await $fetch(`/api/sites/${id.value}/check`, { method: 'POST' })
    await Promise.all([refreshSite(), refreshHistory()])
  } finally {
    checking.value = false
  }
}

const toggling = ref(false)
async function togglePaused() {
  if (!site.value) return
  toggling.value = true
  try {
    await $fetch(`/api/sites/${id.value}`, { method: 'PATCH', body: { enabled: !site.value.enabled } })
    await refreshSite()
  } finally {
    toggling.value = false
  }
}

const isEditing = ref(false)
const editError = ref('')
const saving = ref(false)
const editPayload = ref(emptySiteSettings())

function startEdit() {
  if (!site.value) return
  editPayload.value = siteSettingsFromSite(site.value)
  editError.value = ''
  isEditing.value = true
}

async function saveEdit() {
  saving.value = true
  editError.value = ''
  try {
    await $fetch(`/api/sites/${id.value}`, {
      method: 'PATCH',
      body: siteSettingsToBody(editPayload.value, { includeUrl: true }),
    })
    isEditing.value = false
    await refreshSite()
  } catch (e: any) {
    editError.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to save changes'
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)
async function removeSite() {
  if (!site.value) return
  if (!confirm(`Remove ${site.value.name || hostname.value}? This deletes its check history too.`)) return
  deleting.value = true
  try {
    await $fetch(`/api/sites/${id.value}`, { method: 'DELETE' })
    await router.push('/')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="siteError" class="rounded-lg border border-down bg-down-tint p-4 text-sm text-down">
    Site not found.
  </div>

  <div v-else-if="site" class="flex flex-col gap-8">
    <NuxtLink
      to="/"
      class="inline-flex w-fit items-center gap-1.5 text-sm text-secondary no-underline transition-colors hover:text-primary"
    >
      <UiIcon name="arrow_back" :size="16" />
      Back to dashboard
    </NuxtLink>

    <!-- Header -->
    <UiCard flush>
      <div class="aspect-[3/1] w-full border-b border-border-default bg-sunken">
        <img
          v-if="screenshotSrc && !screenshotFailed"
          :src="screenshotSrc"
          alt=""
          class="h-full w-full object-cover object-top"
          @error="screenshotFailed = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-tertiary">
          <UiIcon name="public" :size="44" />
        </div>
      </div>

      <div class="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="truncate font-display text-4xl font-bold tracking-tight text-primary">
              {{ site.name || hostname }}
            </h1>
            <StatusBadge
              :status="site.latestCheck?.status ?? null"
              :state="!site.enabled ? 'paused' : undefined"
              size="md"
            />
            <UiBadge v-if="site.inMaintenance" tone="maint">Maintenance</UiBadge>
          </div>
          <a
            :href="site.url"
            target="_blank"
            rel="noopener"
            class="mt-1.5 inline-block text-sm text-tertiary no-underline transition-colors hover:text-accent"
          >
            {{ site.url }}
          </a>
          <p v-if="site.latestCheck?.pageTitle" class="mt-1 truncate text-xs text-tertiary">
            {{ site.latestCheck.pageTitle }}
          </p>
          <TagEditor
            class="mt-3"
            :site-id="site.id"
            :tags="site.tags"
            :suggestions="allTags"
            @changed="() => refreshSite()"
          />
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <UiButton variant="secondary" :disabled="checking" @click="checkNow">
            {{ checking ? 'Checking…' : 'Check now' }}
          </UiButton>
          <UiButton variant="secondary" :disabled="toggling" @click="togglePaused">
            {{ site.enabled ? 'Pause' : 'Resume' }}
          </UiButton>
          <UiButton variant="ghost" @click="startEdit">Edit</UiButton>
          <UiButton variant="danger" :disabled="deleting" @click="removeSite">Remove</UiButton>
        </div>
      </div>

      <form v-if="isEditing" class="flex flex-col gap-4 border-t border-border-default p-6" @submit.prevent="saveEdit">
        <div class="flex flex-col gap-4 sm:flex-row">
          <div class="flex-1"><UiInput v-model="editPayload.url" label="URL" /></div>
          <div class="sm:w-52"><UiInput v-model="editPayload.name" label="Name" /></div>
        </div>
        <SiteSettingsForm v-model="editPayload" :site="site" hide-basics />
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div class="flex gap-2">
            <UiButton type="submit" variant="primary" :disabled="saving">
              {{ saving ? 'Saving…' : 'Save' }}
            </UiButton>
            <UiButton variant="ghost" @click="isEditing = false">Cancel</UiButton>
          </div>
        </div>
        <p v-if="editError" class="text-sm text-down">{{ editError }}</p>
      </form>
    </UiCard>

    <!-- Key stats -->
    <UiCard padding="px-8 py-7">
      <div class="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <UiStatBlock
          :value="site.uptime24h === null ? '—' : `${site.uptime24h.toFixed(2)}%`"
          label="Uptime (24h)"
          icon="monitoring"
        />
        <UiStatBlock
          :value="site.uptime7d === null ? '—' : `${site.uptime7d.toFixed(2)}%`"
          label="Uptime (7d)"
          icon="calendar_month"
        />
        <UiStatBlock
          :value="avgResponseMs === null ? '—' : `${Math.round(avgResponseMs)} ms`"
          :label="`Avg response · p95 ${p95ResponseMs === null ? '—' : `${Math.round(p95ResponseMs)} ms`}`"
          icon="speed"
        />
        <UiStatBlock
          :value="site.latestCheck?.sslDaysRemaining ?? '—'"
          label="SSL days remaining"
          icon="lock"
          :value-class="(site.latestCheck?.sslDaysRemaining ?? 999) < 14 ? 'text-degraded' : undefined"
        />
      </div>
    </UiCard>

    <UiTabNav :base="`/sites/${id}`" :tabs="tabs" :preserve-query="false" />

    <NuxtPage />
  </div>
</template>
