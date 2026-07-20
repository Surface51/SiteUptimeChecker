<script setup lang="ts">
const { sites, pending, error, refresh } = useSites()

useHead({ title: 'Site Uptime' })

type ViewMode = 'cards' | 'table'
const viewMode = ref<ViewMode>('cards')

onMounted(() => {
  const saved = localStorage.getItem('siteUptime.viewMode')
  if (saved === 'cards' || saved === 'table') viewMode.value = saved
})

watch(viewMode, (mode) => {
  localStorage.setItem('siteUptime.viewMode', mode)
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <AddSiteForm @added="refresh" />

    <div v-if="error" class="rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300">
      Failed to load sites: {{ error.message }}
    </div>

    <div v-else-if="pending && !sites.length" class="text-slate-500">Loading…</div>

    <div v-else-if="!sites.length" class="rounded-xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
      No sites yet. Add one above to start monitoring.
    </div>

    <template v-else>
      <div class="flex justify-end">
        <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
          <button
            type="button"
            class="rounded px-2.5 py-1"
            :class="viewMode === 'cards' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="viewMode = 'cards'"
          >
            Cards
          </button>
          <button
            type="button"
            class="rounded px-2.5 py-1"
            :class="viewMode === 'table' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="viewMode = 'table'"
          >
            Table
          </button>
        </div>
      </div>

      <div v-if="viewMode === 'cards'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SiteCard v-for="site in sites" :key="site.id" :site="site" @removed="refresh" @checked="refresh" />
      </div>
      <SitesTable v-else :sites="sites" @removed="refresh" @checked="refresh" />
    </template>
  </div>
</template>
