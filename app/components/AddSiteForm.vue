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
  <UiCard>
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <span class="font-display text-lg font-semibold text-primary">Add a site to monitor</span>

      <div class="flex flex-wrap gap-4">
        <div class="min-w-[220px] flex-1">
          <UiInput v-model="url" label="URL" placeholder="example.com" />
        </div>
        <div class="min-w-[220px] flex-1">
          <UiInput v-model="name" label="Name (optional)" placeholder="My site" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="mr-1 text-sm text-secondary">Check interval</span>
        <UiChip
          v-for="opt in intervals"
          :key="opt.value"
          :active="checkIntervalSeconds === opt.value"
          @click="checkIntervalSeconds = opt.value"
        >
          {{ opt.label }}
        </UiChip>
      </div>

      <details>
        <summary class="cursor-pointer text-sm text-tertiary transition-colors hover:text-secondary">
          Advanced options
        </summary>
        <div class="mt-3 flex flex-col gap-4 sm:flex-row">
          <div class="sm:w-56">
            <UiInput v-model="degradedMs" label="Degraded threshold (ms)" type="number" min="100" max="60000" />
          </div>
          <div class="sm:w-56">
            <UiInput v-model="expectedStatus" label="Expected status (optional)" placeholder="e.g. 401" />
          </div>
        </div>
      </details>

      <p v-if="errorMessage" class="text-sm text-down">{{ errorMessage }}</p>

      <div>
        <UiButton type="submit" variant="primary" :disabled="submitting || !url.trim()">
          {{ submitting ? 'Adding…' : 'Add site' }}
        </UiButton>
      </div>
    </form>
  </UiCard>
</template>
