<script setup lang="ts">
const { active: kiosk } = useKiosk()
</script>

<template>
  <div class="flex min-h-screen flex-col bg-page text-primary lg:flex-row">
    <NuxtRouteAnnouncer />
    <ClientOnly><AppSplash /></ClientOnly>
    <ClientOnly><CommandPalette /></ClientOnly>
    <ToastHost />
    <LighthouseProgressPanel />
    <AppSidebar v-if="!kiosk" />
    <main class="min-w-0 flex-1" :class="kiosk ? 'px-6 py-6' : 'px-6 py-8 lg:px-12 lg:py-12'">
      <div :class="kiosk ? '' : 'mx-auto max-w-[1160px]'">
        <NuxtPage />
      </div>
    </main>
  </div>
</template>
