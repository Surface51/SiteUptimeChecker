<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    siteId: number
    tags: string[]
    suggestions?: string[]
    activeTags?: string[]
    size?: 'sm' | 'md'
  }>(),
  { suggestions: () => [], activeTags: () => [], size: 'md' },
)

const emit = defineEmits<{
  changed: [tags: string[]]
  'toggle-filter': [tag: string]
}>()

const { refresh: refreshAllTags } = useTags()

const adding = ref(false)
const newTag = ref('')
const busy = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const datalistId = `tag-suggestions-${props.siteId}`

const remainingSuggestions = computed(() =>
  props.suggestions.filter((s) => !props.tags.some((t) => t.toLowerCase() === s.toLowerCase())),
)

function startAdd() {
  adding.value = true
  newTag.value = ''
  nextTick(() => inputEl.value?.focus())
}

function cancelAdd() {
  adding.value = false
  newTag.value = ''
}

async function submitAdd() {
  const tag = newTag.value.trim()
  if (!tag) {
    cancelAdd()
    return
  }
  busy.value = true
  try {
    const result = await $fetch<{ tags: string[] }>(`/api/sites/${props.siteId}/tags`, {
      method: 'POST',
      body: { tag },
    })
    emit('changed', result.tags)
    refreshAllTags()
    cancelAdd()
  } finally {
    busy.value = false
  }
}

async function removeTag(tag: string) {
  busy.value = true
  try {
    const result = await $fetch<{ tags: string[] }>(`/api/sites/${props.siteId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    })
    emit('changed', result.tags)
    refreshAllTags()
  } finally {
    busy.value = false
  }
}

function isActive(tag: string) {
  return props.activeTags.some((t) => t.toLowerCase() === tag.toLowerCase())
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" :class="size === 'sm' ? 'text-[11px]' : 'text-xs'">
    <span
      v-for="tag in tags"
      :key="tag"
      class="group/tag inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold transition-colors duration-100 ease-snappy"
      :class="isActive(tag) ? 'bg-accent text-accent-text' : 'bg-sunken text-secondary'"
    >
      <button
        type="button"
        class="cursor-pointer hover:underline"
        @click.stop.prevent="emit('toggle-filter', tag)"
      >
        {{ tag }}
      </button>
      <button
        type="button"
        class="cursor-pointer opacity-0 transition-opacity group-hover/tag:opacity-100"
        :class="isActive(tag) ? 'hover:text-white' : 'text-tertiary hover:text-down'"
        :disabled="busy"
        :aria-label="`Remove tag ${tag}`"
        @click.stop.prevent="removeTag(tag)"
      >
        ×
      </button>
    </span>

    <form v-if="adding" class="inline-flex items-center" @submit.stop.prevent="submitAdd" @click.stop.prevent>
      <input
        ref="inputEl"
        v-model="newTag"
        type="text"
        maxlength="30"
        placeholder="tag name"
        :list="datalistId"
        class="w-24 rounded-full border border-border-default bg-raised px-2.5 py-1 text-primary outline-none placeholder:text-tertiary focus:border-border-strong"
        @keydown.esc.stop.prevent="cancelAdd"
        @blur="submitAdd"
      />
      <datalist :id="datalistId">
        <option v-for="s in remainingSuggestions" :key="s" :value="s" />
      </datalist>
    </form>
    <button
      v-else
      type="button"
      class="cursor-pointer rounded-full border border-dashed border-border-default px-2.5 py-1 text-tertiary transition-colors hover:border-border-strong hover:text-primary"
      @click.stop.prevent="startAdd"
    >
      + Tag
    </button>
  </div>
</template>
