<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <NuxtRouteAnnouncer />
    <header class="border-b border-slate-800 bg-slate-900/60">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
        <span class="text-xl">📡</span>
        <NuxtLink to="/" class="text-lg font-semibold tracking-tight text-slate-100 hover:text-white">
          Site Uptime
        </NuxtLink>
        <div class="ml-auto">
          <NotificationBell />
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-6 py-8">
      <NuxtPage />
    </main>
  </div>
</template>
