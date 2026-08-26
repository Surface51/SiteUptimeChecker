<script setup lang="ts">
// Owns the notification poll for the whole app — this used to live in
// NotificationBell, which the redesign removed. Unmounting this stops the
// 30s poll, the in-app toasts, and desktop notifications.
const { unreadCount } = useNotifications()
const { sites } = useSites()
const { tags } = useTags()

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', exact: true },
  { to: '/compare', label: 'Compare', icon: 'compare_arrows', exact: false },
  { to: '/notifications', label: 'Notifications', icon: 'notifications', exact: false },
]

const footnote = computed(() => {
  const siteCount = sites.value?.length ?? 0
  const tagCount = tags.value?.length ?? 0
  return `${siteCount} ${siteCount === 1 ? 'site' : 'sites'} · ${tagCount} ${tagCount === 1 ? 'tag' : 'tags'} tracked`
})
</script>

<template>
  <!-- Black in both themes by design, so everything here uses literal colors
       rather than the surface tokens that flip with [data-theme]. -->
  <aside
    class="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col gap-11 bg-black px-5 py-8 text-white lg:flex"
  >
    <NuxtLink to="/" class="flex items-center gap-2.5 no-underline">
      <span
        class="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 border-accent font-display text-xs font-extrabold text-accent"
      >
        S51
      </span>
      <span class="flex flex-col leading-tight">
        <span class="font-display text-base font-bold tracking-tight text-white">Site Uptime</span>
        <span class="text-[10px] tracking-wide text-neutral-400 uppercase">Surface 51</span>
      </span>
    </NuxtLink>

    <nav class="flex flex-col gap-1">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :exact-active-class="item.exact ? 'bg-accent! text-white! font-semibold' : ''"
        :active-class="item.exact ? '' : 'bg-accent! text-white! font-semibold'"
        class="flex items-center justify-between gap-2.5 rounded-full px-3 py-2.5 text-sm font-medium text-neutral-300 no-underline transition-colors duration-100 ease-snappy hover:bg-white/10 hover:text-white"
      >
        <span class="flex items-center gap-2.5">
          <UiIcon :name="item.icon" :size="19" />
          {{ item.label }}
        </span>
        <span
          v-if="item.to === '/notifications' && unreadCount > 0"
          class="rounded-full bg-accent px-[7px] py-px text-[11px] font-bold text-white"
        >
          {{ unreadCount }}
        </span>
      </NuxtLink>
    </nav>

    <div class="mt-auto flex flex-col gap-4">
      <UiThemeToggle />
      <p class="text-[11px] leading-relaxed text-neutral-500">{{ footnote }}</p>
    </div>
  </aside>

  <!-- Compact top bar below lg; same destinations, no drawer state to manage. -->
  <header
    class="sticky top-0 z-20 flex items-center gap-4 bg-black px-5 py-3 text-white lg:hidden"
  >
    <NuxtLink to="/" class="flex items-center gap-2 no-underline">
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-accent font-display text-[10px] font-extrabold text-accent"
      >
        S51
      </span>
      <span class="font-display text-sm font-bold tracking-tight text-white">Site Uptime</span>
    </NuxtLink>
    <nav class="flex items-center gap-1">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :exact-active-class="item.exact ? 'bg-accent! text-white!' : ''"
        :active-class="item.exact ? '' : 'bg-accent! text-white!'"
        class="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-300 no-underline transition-colors duration-100 ease-snappy hover:bg-white/10 hover:text-white"
        :aria-label="item.label"
      >
        <UiIcon :name="item.icon" :size="17" />
        <span
          v-if="item.to === '/notifications' && unreadCount > 0"
          class="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white"
        >
          {{ unreadCount }}
        </span>
      </NuxtLink>
    </nav>
    <div class="ml-auto">
      <UiThemeToggle />
    </div>
  </header>
</template>
