<script setup lang="ts">
const emit = defineEmits<{ added: [] }>()

const url = ref('')
const name = ref('')
const checkIntervalSeconds = ref(300)
const degradedMs = ref(5000)
const expectedStatus = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const intervals = [
  { label: 'Every 15 minutes', value: 900 },
  { label: 'Every hour', value: 3600 },
  { label: 'Every day', value: 86400 },
]

async function submit() {
  if (!url.value.trim()) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/sites', {
      method: 'POST',
      body: {
        url: url.value.trim(),
        name: name.value.trim() || undefined,
        checkIntervalSeconds: checkIntervalSeconds.value,
        degradedMs: degradedMs.value,
        expectedStatus: expectedStatus.value.trim() === '' ? null : Number(expectedStatus.value),
      },
    })
    url.value = ''
    name.value = ''
    checkIntervalSeconds.value = 300
    degradedMs.value = 5000
    expectedStatus.value = ''
    emit('added')
  } catch (e: any) {
    errorMessage.value = e?.data?.statusMessage || e?.statusMessage || 'Failed to add site'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="rounded-xl border border-slate-800 bg-slate-900/50 p-4" @submit.prevent="submit">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex-1">
        <label class="mb-1 block text-xs text-slate-500">URL</label>
        <input
          v-model="url"
          type="text"
          placeholder="example.com"
          class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div class="sm:w-48">
        <label class="mb-1 block text-xs text-slate-500">Name (optional)</label>
        <input
          v-model="name"
          type="text"
          placeholder="My site"
          class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div class="sm:w-44">
        <label class="mb-1 block text-xs text-slate-500">Interval</label>
        <select
          v-model.number="checkIntervalSeconds"
          class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
        >
          <option v-for="opt in intervals" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <button
        type="submit"
        :disabled="submitting || !url.trim()"
        class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ submitting ? 'Adding…' : 'Add site' }}
      </button>
    </div>
    <details class="mt-3">
      <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-400">Advanced options</summary>
      <div class="mt-2 flex flex-col gap-3 sm:flex-row">
        <div class="sm:w-48">
          <label class="mb-1 block text-xs text-slate-500">Degraded threshold (ms)</label>
          <input
            v-model.number="degradedMs"
            type="number"
            min="100"
            max="60000"
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div class="sm:w-48">
          <label class="mb-1 block text-xs text-slate-500">Expected status (optional)</label>
          <input
            v-model="expectedStatus"
            type="text"
            placeholder="e.g. 401"
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
          />
        </div>
      </div>
    </details>
    <p v-if="errorMessage" class="mt-2 text-sm text-rose-400">{{ errorMessage }}</p>
  </form>
</template>
