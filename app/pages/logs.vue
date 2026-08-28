<script setup lang="ts">
import type { LogColumn } from '~/components/logs/DataTable.vue'

useHead({ title: 'Logs — Site Uptime' })

interface StatusFile {
  path: string
  filename: string
  logType: string
  env: string
  ip: string
  compressed: boolean
  mutable: boolean
  size: number
  byteOffset: number
  status: string
  linesIngested: number
  parseErrors: number
  lastError: string | null
  updatedAt: string | null
}

interface StatusFolder {
  slug: string
  paused: boolean
  linkedSite: { id: number; name: string | null; url: string } | null
  envs: string[]
  servers: number
  filesOnDisk: number
  bytesOnDisk: number
  bytesIngested: number
  linesIngested: number
  parseErrors: number
  filesNew: number
  filesPending: number
  filesRunning: number
  filesStopped: number
  filesDone: number
  filesErrored: number
  lastIngestAt: string | null
  lastError: string | null
  files: StatusFile[]
}

interface LogStatusResponse {
  ingest: import('#shared/types').IngestStatus
  logStoreOffline: boolean
  generatedAt: string
  folders: StatusFolder[]
}

const { data, pending, refresh } = await useFetch<LogStatusResponse>('/api/logs/status', {
  default: () => ({
    ingest: {
      running: false,
      stopRequested: false,
      stoppedReason: null,
      source: 'server' as const,
      startedAt: null,
      finishedAt: null,
      filesTotal: 0,
      filesDone: 0,
      filesSkipped: 0,
      currentFile: null,
      currentFileBytesTotal: 0,
      currentFileBytesDone: 0,
      errors: [],
    },
    logStoreOffline: false,
    generatedAt: '',
    folders: [],
  }),
})

const { status, progress, starting, stopping, runIngest, stopIngest, onFinished } = useLogIngest()

// Re-pull the folder table when a run ends, and keep it fresh while one is going.
onFinished(() => refresh())
let poll: ReturnType<typeof setInterval> | null = null
watch(
  () => status.value.running,
  (running) => {
    if (running && !poll) poll = setInterval(() => refresh(), 5000)
    if (!running && poll) {
      clearInterval(poll)
      poll = null
    }
  },
)
onUnmounted(() => {
  if (poll) clearInterval(poll)
})

const folders = computed(() => data.value?.folders ?? [])

const totals = computed(() => {
  const f = folders.value
  return {
    folders: f.length,
    files: f.reduce((n, x) => n + x.filesOnDisk, 0),
    bytesOnDisk: f.reduce((n, x) => n + x.bytesOnDisk, 0),
    bytesIngested: f.reduce((n, x) => n + x.bytesIngested, 0),
    parseErrors: f.reduce((n, x) => n + x.parseErrors, 0),
    paused: f.filter((x) => x.paused).length,
  }
})

function folderStatus(f: StatusFolder | Record<string, any>): { label: string; tone: 'neutral' | 'accent' | 'up' | 'degraded' | 'down' | 'maint' } {
  if (f.paused) return { label: 'Paused', tone: 'maint' }
  if (f.filesRunning > 0) return { label: 'Ingesting', tone: 'accent' }
  if (f.filesErrored > 0) return { label: `${f.filesErrored} error${f.filesErrored === 1 ? '' : 's'}`, tone: 'down' }
  if (f.filesStopped > 0) return { label: 'Stopped', tone: 'degraded' }
  if (f.filesOnDisk === 0) return { label: 'No files', tone: 'neutral' }
  if (f.filesDone === f.filesOnDisk) return { label: 'Up to date', tone: 'up' }
  return { label: 'Pending', tone: 'neutral' }
}

function fileStatusTone(s: string): 'neutral' | 'accent' | 'up' | 'degraded' | 'down' {
  if (s === 'running') return 'accent'
  if (s === 'done') return 'up'
  if (s === 'error') return 'down'
  if (s === 'stopped') return 'degraded'
  return 'neutral'
}

function ingestedPct(f: StatusFolder | Record<string, any>): number {
  return f.bytesOnDisk > 0 ? Math.min(100, Math.round((f.bytesIngested / f.bytesOnDisk) * 100)) : 0
}
function filePct(f: StatusFile | Record<string, any>): number {
  return f.size > 0 ? Math.min(100, Math.round((f.byteOffset / f.size) * 100)) : 0
}

const columns: LogColumn[] = [
  { key: 'slug', label: 'Folder' },
  { key: 'status', label: 'Status' },
  { key: 'files', label: 'Files', numeric: true },
  { key: 'size', label: 'On disk', numeric: true },
  { key: 'lines', label: 'Lines', numeric: true },
  { key: 'errors', label: 'Parse errors', numeric: true },
  { key: 'lastIngestAt', label: 'Last ingest' },
  { key: 'actions', label: '', numeric: true },
]

// Rows are the folders; DataTable keys/expands on `slug`.
const rows = computed(() =>
  folders.value.map((f) => ({
    ...f,
    slug: f.slug,
    lastIngestAt: f.lastIngestAt,
  })),
)

// --- row action menu (Teleported, fixed-position — copied from SitesTable so it isn't
// clipped by DataTable's overflow-x-auto wrapper) ---
const openMenuSlug = ref<string | null>(null)
const menuPos = ref<{ top: number; left: number } | null>(null)

function toggleMenu(slug: string, event: MouseEvent) {
  if (openMenuSlug.value === slug) return closeMenu()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menuPos.value = { top: rect.bottom + 6, left: rect.right - 192 }
  openMenuSlug.value = slug
  window.addEventListener('scroll', closeMenu, { capture: true, passive: true })
  window.addEventListener('resize', closeMenu, { passive: true })
}
function closeMenu() {
  openMenuSlug.value = null
  menuPos.value = null
  window.removeEventListener('scroll', closeMenu, { capture: true })
  window.removeEventListener('resize', closeMenu)
}
onUnmounted(() => {
  window.removeEventListener('scroll', closeMenu, { capture: true })
  window.removeEventListener('resize', closeMenu)
})

const busySlug = ref<string | null>(null)

async function setPaused(slug: string, paused: boolean) {
  closeMenu()
  busySlug.value = slug
  try {
    await $fetch(`/api/logs/${slug}/pause`, { method: 'POST', body: { paused } })
    await refresh()
  } finally {
    busySlug.value = null
  }
}

async function ingestFolder(slug: string) {
  closeMenu()
  await runIngest(slug)
  await refresh()
}

async function purgeFolder(slug: string) {
  closeMenu()
  if (!confirm(`Purge all ingested log data for "${slug}"? The files on disk are kept and will re-ingest on the next run.`)) {
    return
  }
  busySlug.value = slug
  try {
    await $fetch(`/api/logs/${slug}/purge`, { method: 'DELETE' })
    await refresh()
  } finally {
    busySlug.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-9">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Logs</h1>
        <p class="mt-1.5 text-base text-secondary">
          Import status for every folder in <code class="font-mono text-sm">log-ingress/</code>.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <UiButton
          v-if="status.running"
          variant="ghost"
          icon="stop_circle"
          :disabled="stopping || status.stopRequested"
          @click="stopIngest"
        >
          {{ status.stopRequested ? 'Stopping…' : 'Stop run' }}
        </UiButton>
        <UiButton
          variant="secondary"
          icon="sync"
          :disabled="starting || status.running || data.logStoreOffline"
          @click="() => runIngest()"
        >
          {{ status.running ? 'Ingesting…' : starting ? 'Starting…' : 'Ingest now' }}
        </UiButton>
      </div>
    </div>

    <div
      v-if="data.logStoreOffline"
      class="rounded-lg border border-degraded/40 bg-degraded-tint px-5 py-4 text-sm text-degraded"
    >
      The log database is currently handed off to an external bulk ingest. Folder listings still
      work; per-file detail and analytics resume when it reconnects.
    </div>

    <UiCard padding="px-8 py-7">
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        <UiStatBlock :value="totals.folders" label="Folders" icon="folder" />
        <UiStatBlock :value="totals.files" label="Files on disk" icon="description" />
        <UiStatBlock :value="formatBytes(totals.bytesOnDisk)" label="On disk" icon="database" />
        <UiStatBlock :value="formatBytes(totals.bytesIngested)" label="Ingested" icon="download_done" />
        <UiStatBlock
          :value="formatCount(totals.parseErrors)"
          label="Parse errors"
          icon="error"
          :value-class="totals.parseErrors > 0 ? 'text-degraded' : undefined"
        />
      </div>
      <p v-if="totals.paused" class="mt-5 text-sm text-tertiary">{{ totals.paused }} paused</p>
    </UiCard>

    <LogsIngestProgress
      v-if="status.running"
      :status="status"
      :progress="progress"
      class="rounded-lg border border-border-default bg-raised px-5 py-4"
    />

    <LogsDataTable
      title="Log folders"
      :columns="columns"
      :rows="rows"
      :pending="pending"
      row-key="slug"
      min-width="900px"
      empty="No folders in log-ingress/ yet."
    >
      <template #actions>
        <UiButton variant="ghost" size="sm" icon="refresh" @click="() => refresh()">Refresh</UiButton>
      </template>

      <template #cell-slug="{ row }">
        <div class="flex flex-col">
          <span class="font-mono text-sm text-primary">{{ row.slug }}</span>
          <NuxtLink
            v-if="row.linkedSite"
            :to="`/sites/${row.linkedSite.id}/logs`"
            class="text-xs text-tertiary no-underline hover:text-accent"
            @click.stop
          >
            {{ row.linkedSite.name || row.linkedSite.url }}
          </NuxtLink>
          <span v-else class="text-xs text-tertiary">not linked to a site</span>
        </div>
      </template>

      <template #cell-status="{ row }">
        <UiBadge :tone="folderStatus(row).tone">{{ folderStatus(row).label }}</UiBadge>
      </template>

      <template #cell-files="{ row }">
        <span class="tabular-nums">{{ row.filesDone }}/{{ row.filesOnDisk }}</span>
      </template>

      <template #cell-size="{ row }">
        <div class="flex flex-col items-end">
          <span class="tabular-nums">{{ formatBytes(row.bytesOnDisk) }}</span>
          <span class="text-xs text-tertiary">{{ ingestedPct(row) }}% in</span>
        </div>
      </template>

      <template #cell-lines="{ row }">{{ formatCount(row.linesIngested) }}</template>

      <template #cell-errors="{ row }">
        <span :class="row.parseErrors > 0 ? 'text-degraded' : 'text-tertiary'">
          {{ formatCount(row.parseErrors) }}
        </span>
      </template>

      <template #cell-lastIngestAt="{ row }">
        <span class="text-tertiary">{{ formatLogTime(row.lastIngestAt) }}</span>
      </template>

      <template #cell-actions="{ row }">
        <div class="relative inline-block text-left" @click.stop>
          <button
            type="button"
            class="cursor-pointer rounded-full border border-border-default px-3 py-1 text-xs font-medium text-secondary transition-colors hover:bg-inverse hover:text-on-inverse disabled:opacity-50"
            :disabled="busySlug === row.slug"
            @click="toggleMenu(row.slug, $event)"
          >
            Actions ▾
          </button>

          <Teleport to="body">
            <div v-if="openMenuSlug === row.slug" class="fixed inset-0 z-40" @click="closeMenu" />
            <div
              v-if="openMenuSlug === row.slug && menuPos"
              class="fixed z-50 w-48 overflow-hidden rounded-md border border-border-default bg-raised py-1 shadow-lg"
              :style="{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }"
              @click.stop
            >
              <button
                v-if="row.paused"
                type="button"
                class="block w-full cursor-pointer px-3.5 py-2 text-left text-xs text-secondary transition-colors hover:bg-sunken hover:text-primary"
                @click="setPaused(row.slug, false)"
              >
                Resume ingestion
              </button>
              <button
                v-else
                type="button"
                class="block w-full cursor-pointer px-3.5 py-2 text-left text-xs text-secondary transition-colors hover:bg-sunken hover:text-primary"
                @click="setPaused(row.slug, true)"
              >
                Pause ingestion
              </button>
              <button
                type="button"
                :disabled="status.running || row.paused || data.logStoreOffline"
                class="block w-full cursor-pointer px-3.5 py-2 text-left text-xs text-secondary transition-colors hover:bg-sunken hover:text-primary disabled:opacity-50"
                @click="ingestFolder(row.slug)"
              >
                Ingest this folder
              </button>
              <NuxtLink
                v-if="row.linkedSite"
                :to="`/sites/${row.linkedSite.id}/logs`"
                class="block w-full px-3.5 py-2 text-left text-xs text-secondary no-underline transition-colors hover:bg-sunken hover:text-primary"
              >
                View log analytics
              </NuxtLink>
              <div class="my-1 border-t border-border-default" />
              <button
                type="button"
                :disabled="data.logStoreOffline"
                class="block w-full cursor-pointer px-3.5 py-2 text-left text-xs text-down transition-colors hover:bg-down-tint disabled:opacity-50"
                @click="purgeFolder(row.slug)"
              >
                Purge ingested data
              </button>
            </div>
          </Teleport>
        </div>
      </template>

      <template #detail="{ row }">
        <div class="flex flex-col gap-4">
          <LogsTrafficOverview :slug="row.slug" :site-id="row.linkedSite?.id ?? null" />

          <div class="overflow-x-auto">
            <table class="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr class="text-left text-tertiary uppercase">
                  <th class="py-1.5 pr-4 font-semibold">File</th>
                  <th class="py-1.5 pr-4 font-semibold">Type</th>
                  <th class="py-1.5 pr-4 font-semibold">Server</th>
                  <th class="py-1.5 pr-4 text-right font-semibold">Size</th>
                  <th class="py-1.5 pr-4 text-right font-semibold">Progress</th>
                  <th class="py-1.5 pr-4 text-right font-semibold">Lines</th>
                  <th class="py-1.5 pr-4 text-right font-semibold">Errors</th>
                  <th class="py-1.5 pr-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="file in row.files" :key="file.path" class="border-t border-border-default">
                  <td class="py-1.5 pr-4 font-mono">
                    {{ file.filename }}
                    <span v-if="file.compressed" class="text-tertiary">· gz</span>
                  </td>
                  <td class="py-1.5 pr-4 text-tertiary">{{ file.logType }}</td>
                  <td class="py-1.5 pr-4 font-mono text-tertiary">{{ file.env }}/{{ file.ip }}</td>
                  <td class="py-1.5 pr-4 text-right tabular-nums">{{ formatBytes(file.size) }}</td>
                  <td class="py-1.5 pr-4 text-right tabular-nums">{{ filePct(file) }}%</td>
                  <td class="py-1.5 pr-4 text-right tabular-nums">{{ formatCount(file.linesIngested) }}</td>
                  <td
                    class="py-1.5 pr-4 text-right tabular-nums"
                    :class="file.parseErrors > 0 ? 'text-degraded' : 'text-tertiary'"
                  >
                    {{ formatCount(file.parseErrors) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    <UiBadge :tone="fileStatusTone(file.status)">{{ file.status }}</UiBadge>
                    <span v-if="file.lastError" class="mt-1 block max-w-[320px] truncate text-down" :title="file.lastError">
                      {{ file.lastError }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </LogsDataTable>
  </div>
</template>
