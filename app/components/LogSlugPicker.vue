<script setup lang="ts">
interface SlugOption {
  slug: string
  ingested: boolean
  linkedSiteId: number | null
}

const props = defineProps<{
  modelValue: string
  /** Site being edited, so its own link isn't reported as "already linked elsewhere". */
  siteId?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// Not awaited: the folder list is a convenience for a field tucked inside a form, and making
// setup async would suspend the whole form on it.
const { data } = useFetch<{ slugs: SlugOption[] }>('/api/logs/slugs', {
  lazy: true,
  default: () => ({ slugs: [] }),
})

const options = computed(() => {
  const found = data.value?.slugs ?? []
  const opts = [{ label: 'Not linked', value: '' }]

  for (const entry of found) {
    const takenByAnother = entry.linkedSiteId !== null && entry.linkedSiteId !== props.siteId
    const notes = [
      entry.ingested ? null : 'not yet ingested',
      takenByAnother ? 'linked to another site' : null,
    ].filter(Boolean)

    opts.push({
      label: notes.length ? `${entry.slug} (${notes.join(', ')})` : entry.slug,
      value: entry.slug,
    })
  }

  // A slug saved earlier whose folder has since been removed would otherwise vanish from the
  // list, silently unlinking the site on the next save.
  if (props.modelValue && !found.some((entry) => entry.slug === props.modelValue)) {
    opts.push({ label: `${props.modelValue} (folder missing)`, value: props.modelValue })
  }

  return opts
})

const hasFolders = computed(() => (data.value?.slugs.length ?? 0) > 0)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <UiSelect
      :model-value="modelValue"
      label="Log folder"
      :options="options"
      @update:model-value="emit('update:modelValue', String($event))"
    />
    <p class="text-xs text-tertiary">
      <template v-if="hasFolders">
        Links this site to a folder in <code>log-ingress/</code> to unlock log analytics.
      </template>
      <template v-else>
        No folders found. Add logs at
        <code>log-ingress/&lt;name&gt;/&lt;env&gt;/&lt;server-ip&gt;/</code> to link one here.
      </template>
    </p>
  </div>
</template>
