<script setup lang="ts">
const emit = defineEmits<{ added: [] }>()

const url = ref('')
const name = ref('')
const checkIntervalSeconds = ref(300)
const submitting = ref(false)
const errorMessage = ref('')

const intervals = [
  { label: 'Every 1 minute', value: 60 },
  { label: 'Every 5 minutes', value: 300 },
  { label: 'Every 15 minutes', value: 900 },
  { label: 'Every hour', value: 3600 },
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
      },
    })
    url.value = ''
    name.value = ''
    checkIntervalSeconds.value = 300
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
    <p v-if="errorMessage" class="mt-2 text-sm text-rose-400">{{ errorMessage }}</p>
  </form>
</template>
