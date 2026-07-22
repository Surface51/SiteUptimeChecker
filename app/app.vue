<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <NuxtRouteAnnouncer />
    <ToastHost />
    <LighthouseProgressPanel />
    <header class="border-b border-slate-800 bg-slate-900/60">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
        <span class="text-xl">📡</span>
        <NuxtLink to="/" class="text-lg font-semibold tracking-tight text-slate-100 hover:text-white">
          Site Uptime
        </NuxtLink>
        <nav class="ml-4 flex items-center gap-4 text-sm text-slate-400">
          <NuxtLink to="/compare" class="hover:text-slate-200" active-class="text-slate-100">
            Compare
          </NuxtLink>
          <NuxtLink to="/notifications" class="hover:text-slate-200" active-class="text-slate-100">
            Notifications
          </NuxtLink>
        </nav>
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
