<script setup lang="ts">
import { fuzzyRank } from '~/utils/fuzzy'

interface Command {
  id: string
  title: string
  subtitle?: string
  icon: string
  group: string
  run: () => void | Promise<void>
}

const { isOpen, close } = useCommandPalette()
const router = useRouter()
const route = useRoute()
const { sites } = useSites()
const { tags } = useTags()
const { setTheme, pref } = useTheme()
const { push: pushToast } = useToasts()

const query = ref('')
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

const LOG_TABS = [
  ['', 'Traffic'],
  ['performance', 'Performance'],
  ['errors', 'Errors'],
  ['bots', 'Bots'],
  ['security', 'Security'],
  ['php-fpm', 'PHP-FPM'],
  ['mysql', 'MySQL'],
  ['timeline', 'Timeline'],
  ['explorer', 'Explorer'],
] as const

const currentSiteId = computed(() => {
  const m = /^\/sites\/(\d+)/.exec(route.path)
  return m ? Number(m[1]) : null
})

function go(to: string) {
  close()
  router.push(to)
}

const commands = computed<Command[]>(() => {
  const cmds: Command[] = [
    { id: 'nav:dashboard', title: 'Dashboard', icon: 'dashboard', group: 'Go to', run: () => go('/') },
    { id: 'nav:triage', title: 'Triage', icon: 'emergency_home', group: 'Go to', run: () => go('/triage') },
    { id: 'nav:compare', title: 'Compare', icon: 'compare_arrows', group: 'Go to', run: () => go('/compare') },
    { id: 'nav:logs', title: 'Logs', icon: 'receipt_long', group: 'Go to', run: () => go('/logs') },
    { id: 'nav:notifications', title: 'Notifications', icon: 'notifications', group: 'Go to', run: () => go('/notifications') },
  ]

  for (const site of sites.value ?? []) {
    cmds.push({
      id: `site:${site.id}`,
      title: site.name || site.url,
      subtitle: site.url,
      icon: 'public',
      group: 'Sites',
      run: () => go(`/sites/${site.id}`),
    })
  }

  for (const tag of tags.value ?? []) {
    cmds.push({
      id: `tag:${tag}`,
      title: `#${tag}`,
      subtitle: 'Filter the dashboard',
      icon: 'sell',
      group: 'Tags',
      run: () => go(`/?tags=${encodeURIComponent(tag)}`),
    })
  }

  if (currentSiteId.value !== null) {
    const sid = currentSiteId.value
    for (const [slug, label] of LOG_TABS) {
      cmds.push({
        id: `logtab:${slug}`,
        title: `Logs · ${label}`,
        subtitle: 'Current site',
        icon: 'query_stats',
        group: 'This site',
        run: () => go(`/sites/${sid}/logs${slug ? `/${slug}` : ''}`),
      })
    }
  }

  cmds.push(
    {
      id: 'act:check-all',
      title: 'Check all sites now',
      icon: 'refresh',
      group: 'Actions',
      run: async () => {
        close()
        await $fetch('/api/sites/check-all', { method: 'POST' })
        pushToast('Checking all sites…', 'info')
      },
    },
    {
      id: 'act:lighthouse-all',
      title: 'Run all Lighthouse audits',
      icon: 'speed',
      group: 'Actions',
      run: async () => {
        close()
        await $fetch('/api/lighthouse/run-all', { method: 'POST' })
        pushToast('Queued Lighthouse audits', 'info')
      },
    },
    {
      id: 'act:theme',
      title: 'Toggle light / dark theme',
      icon: 'contrast',
      group: 'Actions',
      run: () => {
        setTheme(pref.value === 'dark' ? 'light' : 'dark')
        close()
      },
    },
  )

  if (currentSiteId.value !== null) {
    const sid = currentSiteId.value
    cmds.push({
      id: 'act:check-now',
      title: 'Check this site now',
      icon: 'bolt',
      group: 'Actions',
      run: async () => {
        close()
        await $fetch(`/api/sites/${sid}/check`, { method: 'POST' })
        pushToast('Checking…', 'info')
      },
    })
  }

  return cmds
})

const results = computed(() => {
  const q = query.value.trim()
  if (!q) return commands.value.map((item) => ({ item, match: { score: 0, indices: [] as number[] } }))
  return fuzzyRank(q, commands.value, (c) => `${c.title} ${c.subtitle ?? ''} ${c.group}`)
})

watch([results, isOpen], () => {
  activeIndex.value = 0
})

watch(isOpen, async (open) => {
  if (open) {
    lastFocused = (document.activeElement as HTMLElement) ?? null
    query.value = ''
    await nextTick()
    inputEl.value?.focus()
  } else {
    lastFocused?.focus?.()
  }
})

function move(delta: number) {
  const n = results.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => {
    listEl.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  })
}

function runActive() {
  results.value[activeIndex.value]?.item.run()
}

function onKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    isOpen.value = !isOpen.value
    return
  }
  if (!isOpen.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runActive()
  } else if (e.key === 'Tab') {
    // Single focus stop — keep focus on the input.
    e.preventDefault()
    inputEl.value?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="cp-fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
        @click.self="close()"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          class="w-full max-w-xl overflow-hidden rounded-xl border border-border-default bg-raised shadow-2xl"
        >
          <div class="flex items-center gap-3 border-b border-border-default px-4 py-3">
            <UiIcon name="search" :size="18" class="text-tertiary" />
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              placeholder="Jump to a site, page or action…"
              class="w-full bg-transparent text-base text-primary outline-none placeholder:text-tertiary"
              aria-controls="cp-list"
              :aria-activedescendant="results[activeIndex] ? `cp-opt-${activeIndex}` : undefined"
            />
            <kbd class="rounded bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-tertiary">esc</kbd>
          </div>

          <ul
            id="cp-list"
            ref="listEl"
            role="listbox"
            class="max-h-[52vh] overflow-y-auto py-2"
          >
            <li v-if="!results.length" class="px-4 py-6 text-center text-sm text-tertiary">No matches</li>
            <li
              v-for="(r, i) in results"
              :id="`cp-opt-${i}`"
              :key="r.item.id"
              role="option"
              :aria-selected="i === activeIndex"
              :data-active="i === activeIndex"
              class="mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
              :class="i === activeIndex ? 'bg-accent text-white' : 'text-primary hover:bg-sunken'"
              @click="r.item.run()"
              @mousemove="activeIndex = i"
            >
              <UiIcon :name="r.item.icon" :size="18" :class="i === activeIndex ? 'text-white' : 'text-tertiary'" />
              <span class="min-w-0 flex-1 truncate">
                {{ r.item.title }}
                <span
                  v-if="r.item.subtitle"
                  class="ml-2 truncate text-xs"
                  :class="i === activeIndex ? 'text-white/70' : 'text-tertiary'"
                >
                  {{ r.item.subtitle }}
                </span>
              </span>
              <span
                class="shrink-0 text-[10px] tracking-wide uppercase"
                :class="i === activeIndex ? 'text-white/60' : 'text-tertiary'"
              >
                {{ r.item.group }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cp-fade-enter-active,
.cp-fade-leave-active {
  transition: opacity 0.12s ease;
}
.cp-fade-enter-from,
.cp-fade-leave-to {
  opacity: 0;
}
</style>
