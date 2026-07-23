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
      class="group/tag inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors"
      :class="isActive(tag) ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-300'"
    >
      <button
        type="button"
        class="hover:underline"
        @click.stop.prevent="emit('toggle-filter', tag)"
      >
        {{ tag }}
      </button>
      <button
        type="button"
        class="text-slate-500 opacity-0 hover:text-rose-300 group-hover/tag:opacity-100"
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
        class="w-24 rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-100 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
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
      class="rounded-full border border-dashed border-slate-700 px-2 py-0.5 text-slate-500 hover:border-slate-500 hover:text-slate-300"
      @click.stop.prevent="startAdd"
    >
      + Tag
    </button>
  </div>
</template>
