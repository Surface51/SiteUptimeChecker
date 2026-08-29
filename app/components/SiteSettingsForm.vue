<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import type { SiteSettingsPayload } from '~/utils/siteSettingsPayload'

/**
 * The shared editable-settings surface for a site — used both by AddSiteForm (create) and the
 * inline edit form on the site page. Only the basics are open by default so the common path
 * stays short; the deeper checks live behind collapsed <details> sections.
 *
 * Controlled component: it emits the full payload on every change and the parent owns the submit
 * button, error handling and the actual request.
 */
const props = defineProps<{
  site?: SiteSummary | null
  /** Hide the URL field (the create form shows its own URL + name row). */
  hideBasics?: boolean
}>()

const model = defineModel<SiteSettingsPayload>({ required: true })

const intervalOptions = [
  { label: 'Every 1 minute', value: 60 },
  { label: 'Every 5 minutes', value: 300 },
  { label: 'Every 15 minutes', value: 900 },
  { label: 'Every hour', value: 3600 },
]
const methodOptions = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((m) => ({
  label: m,
  value: m,
}))
const baselineOptions = [
  { label: 'Fixed threshold', value: 'fixed' },
  { label: 'Adaptive (7-day p95 × 2)', value: 'adaptive' },
]

// Convenience two-way helpers so the template stays flat.
function field<K extends keyof SiteSettingsPayload>(key: K) {
  return computed({
    get: () => model.value[key],
    set: (v: SiteSettingsPayload[K]) => {
      model.value = { ...model.value, [key]: v }
    },
  })
}

const hasStoredPass = computed(() => props.site?.hasAuthPass ?? false)
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="!hideBasics">
      <div class="flex flex-wrap gap-4">
        <div class="min-w-[220px] flex-1"><UiInput v-model="field('url').value" label="URL" placeholder="example.com" /></div>
        <div class="min-w-[220px] flex-1"><UiInput v-model="field('name').value" label="Name (optional)" placeholder="My site" /></div>
      </div>
    </template>

    <div class="flex flex-wrap gap-4">
      <div class="sm:w-56">
        <UiSelect v-model="field('checkIntervalSeconds').value" label="Check interval" :options="intervalOptions" />
      </div>
      <div class="sm:w-72"><LogSlugPicker v-model="field('logSlug').value" :site-id="site?.id" /></div>
    </div>

    <details class="rounded-md border border-border-default px-4 py-3">
      <summary class="cursor-pointer text-sm font-medium text-secondary">Content assertions</summary>
      <p class="mt-2 text-xs text-tertiary">Any failing assertion marks the check <strong>down</strong>, whatever the status code.</p>
      <div class="mt-3 flex flex-col gap-4">
        <div class="flex flex-wrap gap-4">
          <div class="min-w-[220px] flex-1"><UiInput v-model="field('contentExpect').value" label="Body must contain" placeholder="Add to cart" /></div>
          <div class="min-w-[220px] flex-1"><UiInput v-model="field('contentForbid').value" label="Body must NOT contain" placeholder="Fatal error" /></div>
        </div>
        <div class="flex flex-wrap gap-4">
          <div class="min-w-[220px] flex-1"><UiInput v-model="field('contentRegex').value" label="Body must match (regex)" placeholder="order #\d+" /></div>
          <div class="sm:w-56"><UiInput v-model="field('contentMinBytes').value" label="Minimum size (bytes)" type="number" min="0" placeholder="e.g. 2000" /></div>
        </div>
      </div>
    </details>

    <details class="rounded-md border border-border-default px-4 py-3">
      <summary class="cursor-pointer text-sm font-medium text-secondary">Request</summary>
      <div class="mt-3 flex flex-col gap-4">
        <div class="flex flex-wrap gap-4">
          <div class="sm:w-40"><UiSelect v-model="field('httpMethod').value" label="Method" :options="methodOptions" /></div>
          <div class="sm:w-40"><UiInput v-model="field('timeoutMs').value" label="Timeout (ms)" type="number" min="1000" max="120000" /></div>
          <div class="sm:w-56"><UiInput v-model="field('acceptedStatuses').value" label="Accepted statuses" placeholder="200-299, 301" /></div>
          <div class="sm:w-56"><UiInput v-model="field('expectedStatus').value" label="Expected status (exact)" placeholder="e.g. 401" /></div>
        </div>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-secondary">Request headers (JSON object)</span>
          <textarea
            v-model="field('requestHeaders').value"
            rows="3"
            placeholder='{ "X-Api-Key": "…" }'
            class="rounded-md border border-border-default bg-raised px-4 py-3 font-mono text-sm text-primary outline-none focus:border-border-strong"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-secondary">Request body</span>
          <textarea
            v-model="field('requestBody').value"
            rows="2"
            class="rounded-md border border-border-default bg-raised px-4 py-3 font-mono text-sm text-primary outline-none focus:border-border-strong"
          />
        </label>
        <div class="flex flex-wrap gap-4">
          <div class="sm:w-56"><UiInput v-model="field('authUser').value" label="Basic auth user" /></div>
          <div class="sm:w-56">
            <UiInput
              v-model="field('authPass').value"
              type="password"
              :label="hasStoredPass ? 'Basic auth password (set — blank keeps it)' : 'Basic auth password'"
            />
          </div>
          <label v-if="hasStoredPass" class="flex items-center gap-2 self-end pb-3 text-sm text-secondary">
            <input v-model="field('clearAuthPass').value" type="checkbox" class="h-4 w-4" />
            Clear stored password
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm text-secondary">
          <input v-model="field('followRedirects').value" type="checkbox" class="h-4 w-4" />
          Follow redirects
        </label>
      </div>
    </details>

    <details class="rounded-md border border-border-default px-4 py-3">
      <summary class="cursor-pointer text-sm font-medium text-secondary">Thresholds &amp; SLA</summary>
      <div class="mt-3 flex flex-wrap gap-4">
        <div class="sm:w-64"><UiSelect v-model="field('baselineMode').value" label="Degraded threshold mode" :options="baselineOptions" /></div>
        <div class="sm:w-56">
          <UiInput
            v-model="field('degradedMs').value"
            label="Fixed degraded threshold (ms)"
            type="number"
            min="100"
            max="60000"
          />
        </div>
        <div class="sm:w-56"><UiInput v-model="field('slaTarget').value" label="SLA target (%)" placeholder="e.g. 99.9" /></div>
      </div>
    </details>

    <details class="rounded-md border border-border-default px-4 py-3">
      <summary class="cursor-pointer text-sm font-medium text-secondary">Content-change watch</summary>
      <div class="mt-3 flex flex-col gap-3">
        <label class="flex items-center gap-2 text-sm text-secondary">
          <input v-model="field('contentWatch').value" type="checkbox" class="h-4 w-4" />
          Alert when the page content changes materially
        </label>
        <div class="sm:w-64">
          <UiInput
            v-model="field('contentWatchSensitivity').value"
            label="Alert threshold (% of chunks changed)"
            type="number"
            min="1"
            max="100"
          />
        </div>
      </div>
    </details>
  </div>
</template>
