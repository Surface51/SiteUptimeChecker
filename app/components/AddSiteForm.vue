<script setup lang="ts">
import { emptySiteSettings, siteSettingsToBody } from '~/utils/siteSettingsPayload'

const emit = defineEmits<{ added: [] }>()

const payload = ref(emptySiteSettings())
const submitting = ref(false)
const errorMessage = ref('')

async function submit() {
  if (!payload.value.url.trim()) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/sites', {
      method: 'POST',
      body: siteSettingsToBody(payload.value, { includeUrl: true }),
    })
    payload.value = emptySiteSettings()
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

      <SiteSettingsForm v-model="payload" />

      <p v-if="errorMessage" class="text-sm text-down">{{ errorMessage }}</p>

      <div>
        <UiButton type="submit" variant="primary" :disabled="submitting || !payload.url.trim()">
          {{ submitting ? 'Adding…' : 'Add site' }}
        </UiButton>
      </div>
    </form>
  </UiCard>
</template>
