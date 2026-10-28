<script setup lang="ts">
import type { NotificationDelivery, NotificationSettings, NotificationType } from '#shared/types'
import { DEFAULT_NOTIFICATION_SETTINGS } from '#shared/notificationSettings'

useHead({ title: 'Notification settings' })

const { settings, save } = useNotificationSettings()
const { desktopEnabled, enableDesktopNotifications, disableDesktopNotifications } = useNotifications()
const { push: pushToast } = useToasts()

const draft = ref<NotificationSettings>(structuredClone(toRaw(settings.value)))
watch(settings, (v) => (draft.value = structuredClone(toRaw(v))))

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(settings.value))
const saving = ref(false)

const deliveryOptions: { label: string; value: NotificationDelivery }[] = [
  { label: 'Off', value: 'off' },
  { label: 'Feed', value: 'feed' },
  { label: 'Toast', value: 'toast' },
  { label: 'Desktop', value: 'desktop' },
]
const quietAllowOptions = [
  { label: 'Feed only', value: 'feed' },
  { label: 'Toast', value: 'toast' },
  { label: 'Desktop', value: 'desktop' },
]

const groups: { title: string; hint: string; types: NotificationType[] }[] = [
  { title: 'Status', hint: 'Down, recovery and slowness alerts from uptime checks.', types: ['down', 'up', 'degraded', 'flapping'] },
  {
    title: 'Certificates & domains',
    hint: 'Expiry and change watches.',
    types: ['ssl_expiring', 'ssl_issuer_changed', 'domain_expiring', 'nameservers_changed'],
  },
  { title: 'Content & performance', hint: 'Page changes and Lighthouse scores.', types: ['content_changed', 'lighthouse_regression'] },
  { title: 'Logs', hint: 'Raised from ingested server logs.', types: ['log_5xx_spike', 'log_php_fatal', 'log_threat_ip'] },
]

// down / up / ssl_expiring are edge-triggered rather than cooldown-based.
const NO_COOLDOWN = new Set<NotificationType>(['down', 'up', 'ssl_expiring'])

function cooldown(type: NotificationType) {
  return computed({
    get: () => draft.value.types[type].cooldownHours ?? '',
    set: (v: string | number) => {
      draft.value.types[type].cooldownHours = v === '' || Number.isNaN(Number(v)) ? null : Number(v)
    },
  })
}

function num<T extends 'downConfirmations' | 'recoveryConfirmations' | 'degradedConfirmations' | 'groupBurstsOver'>(key: T) {
  return computed({
    get: () => draft.value[key],
    set: (v: string | number) => {
      draft.value[key] = Number(v)
    },
  })
}

const flapWindow = computed({
  get: () => draft.value.flap.window,
  set: (v: string | number) => (draft.value.flap.window = Number(v)),
})
const flapTransitions = computed({
  get: () => draft.value.flap.transitions,
  set: (v: string | number) => (draft.value.flap.transitions = Number(v)),
})

async function onSave() {
  saving.value = true
  try {
    await save(draft.value)
    pushToast('Notification settings saved.', 'success')
  } catch (e) {
    const message = (e as { statusMessage?: string; data?: { statusMessage?: string } })
    pushToast(message.data?.statusMessage || message.statusMessage || 'Could not save the settings.', 'error')
  } finally {
    saving.value = false
  }
}

function onReset() {
  draft.value = structuredClone(DEFAULT_NOTIFICATION_SETTINGS)
}

function toggleDesktop() {
  if (desktopEnabled.value) disableDesktopNotifications()
  else enableDesktopNotifications()
}
</script>

<template>
  <div class="flex flex-col gap-9">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Notification settings</h1>
        <p class="mt-1.5 text-base text-secondary">
          Choose what raises a notification and how loudly. Individual sites can override these.
        </p>
      </div>
      <div class="flex flex-wrap gap-2.5">
        <UiButton variant="ghost" icon="restart_alt" @click="onReset">Reset to defaults</UiButton>
        <UiButton variant="secondary" icon="save" :disabled="!dirty || saving" @click="onSave">Save changes</UiButton>
      </div>
    </div>

    <section class="flex flex-col gap-4">
      <UiSectionHeading>Delivery by type</UiSectionHeading>
      <p class="text-sm text-secondary">
        <strong>Off</strong> never records it. <strong>Feed</strong> adds it to the list silently.
        <strong>Toast</strong> also pops up in the app. <strong>Desktop</strong> adds a browser notification.
      </p>
      <UiCard v-for="group in groups" :key="group.title" padding="p-5">
        <h3 class="font-display text-base font-semibold text-primary">{{ group.title }}</h3>
        <p class="mb-3 text-xs text-tertiary">{{ group.hint }}</p>
        <div class="flex flex-col divide-y divide-border-default">
          <div v-for="type in group.types" :key="type" class="flex flex-wrap items-center justify-between gap-3 py-3">
            <span class="min-w-40 text-sm font-medium text-primary">{{ notificationTypeLabel[type] }}</span>
            <div class="flex flex-wrap items-center gap-4">
              <UiSegmentedControl v-model="draft.types[type].delivery" :options="deliveryOptions" />
              <div class="w-36">
                <UiInput
                  v-if="!NO_COOLDOWN.has(type)"
                  v-model="cooldown(type).value"
                  type="number"
                  min="1"
                  max="720"
                  placeholder="Cooldown (h)"
                />
                <span v-else class="text-xs text-tertiary">No cooldown</span>
              </div>
            </div>
          </div>
        </div>
      </UiCard>
    </section>

    <section class="flex flex-col gap-4">
      <UiSectionHeading>Alert rules</UiSectionHeading>
      <UiCard>
        <p class="mb-4 text-sm text-secondary">
          A change has to last this many checks in a row before it is alerted, so one-off blips stay quiet.
        </p>
        <div class="flex flex-wrap gap-4">
          <div class="sm:w-56"><UiInput v-model="num('downConfirmations').value" label="Checks before “down”" type="number" min="1" max="10" /></div>
          <div class="sm:w-56"><UiInput v-model="num('recoveryConfirmations').value" label="Checks before “back up”" type="number" min="1" max="10" /></div>
          <div class="sm:w-56"><UiInput v-model="num('degradedConfirmations').value" label="Checks before “degraded”" type="number" min="1" max="10" /></div>
        </div>
        <p class="mt-6 mb-4 text-sm text-secondary">
          A site that changes status this often is flapping: you get one “flapping” alert and no down/up pairs until it settles.
        </p>
        <div class="flex flex-wrap gap-4">
          <div class="sm:w-56"><UiInput v-model="flapTransitions" label="Status changes" type="number" min="2" max="50" /></div>
          <div class="sm:w-56"><UiInput v-model="flapWindow" label="Within the last (checks)" type="number" min="4" max="50" /></div>
        </div>
      </UiCard>
    </section>

    <section class="flex flex-col gap-4">
      <UiSectionHeading>Quiet hours &amp; grouping</UiSectionHeading>
      <UiCard>
        <div class="flex flex-col gap-4">
          <label class="flex items-center gap-2 text-sm text-secondary">
            <input v-model="draft.quietHours.enabled" type="checkbox" class="h-4 w-4" />
            Turn down alerts during quiet hours (your local time). Down and flapping alerts always come through.
          </label>
          <div class="flex flex-wrap gap-4">
            <div class="sm:w-40"><UiInput v-model="draft.quietHours.start" label="From" type="time" /></div>
            <div class="sm:w-40"><UiInput v-model="draft.quietHours.end" label="Until" type="time" /></div>
            <div class="sm:w-56"><UiSelect v-model="draft.quietHours.allow" label="Maximum during quiet hours" :options="quietAllowOptions" /></div>
          </div>
          <div class="sm:w-72">
            <UiInput v-model="num('groupBurstsOver').value" label="Combine into one alert when more than" type="number" min="1" max="50" />
            <span class="mt-1 block text-xs text-tertiary">new alerts arrive at once (for example 5 sites going down together).</span>
          </div>
        </div>
      </UiCard>
    </section>

    <section class="flex flex-col gap-4">
      <UiSectionHeading>This browser</UiSectionHeading>
      <UiCard>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <p class="text-sm text-secondary">Desktop notifications need your browser's permission and are remembered per browser.</p>
          <UiButton variant="ghost" :icon="desktopEnabled ? 'notifications_active' : 'notifications_off'" @click="toggleDesktop">
            {{ desktopEnabled ? 'Desktop on' : 'Enable desktop' }}
          </UiButton>
        </div>
      </UiCard>
    </section>
  </div>
</template>
