<template>
  <div
    v-if="show"
    class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-page transition-opacity duration-500 ease-snappy"
    :class="leaving ? 'opacity-0' : 'opacity-100'"
  >
    <S51Logo class="s51 splash-logo h-[80vh] w-auto" />
    <Transition name="splash-msg" mode="out-in">
      <p
        :key="message"
        class="font-display text-sm uppercase tracking-wide text-tertiary"
        aria-live="polite"
      >
        {{ message }}
      </p>
    </Transition>
  </div>
</template>

<script setup lang="ts">
// First-visit loading splash. Plays once per browser session: an opaque cover
// over the SSR'd app while the S51 mark draws itself in via anime.js, with mock
// status lines stepping underneath, then a single fade-out. Never loops, never
// re-triggers on client-side navigation.
//
// The pre-paint cover (html[data-splash="pending"]::before, set by a critical
// script in nuxt.config) holds the frame until this client-only component mounts;
// finish() tears it down on every exit path.

const SEEN_KEY = 'siteUptime.splashSeen'
const MESSAGES = [
  'Connecting to monitors…',
  'Checking site status…',
  'Reading access logs…',
  'Ready.',
]
const DRAW_MS = 2800
const HOLD_MS = 400
const FADE_MS = 500

const { $anime } = useNuxtApp() as unknown as {
  $anime: {
    createTimeline: (opts?: Record<string, unknown>) => {
      add: (targets: unknown, params: Record<string, unknown>) => unknown
      then: (cb: () => void) => Promise<void>
      pause: () => void
    }
    svg: { createDrawable: (selector: string) => unknown }
  }
}

const show = ref(false)
const leaving = ref(false)
const message = ref(MESSAGES[0])

let timeline: { pause: () => void } | null = null
let msgTimers: ReturnType<typeof setTimeout>[] = []
let fadeTimer: ReturnType<typeof setTimeout> | null = null

function clearSplashAttr() {
  if (import.meta.client) document.documentElement.removeAttribute('data-splash')
}

/** Fade the overlay away and drop it from the tree. Idempotent. */
function finish() {
  if (leaving.value) return
  leaving.value = true
  fadeTimer = setTimeout(() => {
    show.value = false
    clearSplashAttr()
  }, FADE_MS)
}

function stepMessages() {
  // Spread the lines across the draw so "Ready." lands as it completes.
  const each = DRAW_MS / (MESSAGES.length - 1)
  MESSAGES.slice(1).forEach((text, i) => {
    msgTimers.push(setTimeout(() => (message.value = text), Math.round(each * (i + 1))))
  })
}

onMounted(async () => {
  let seen = false
  try {
    seen = !!sessionStorage.getItem(SEEN_KEY)
  } catch {
    seen = false
  }

  if (seen) {
    // Attribute was never set by the pre-paint script in this case, but clear
    // defensively in case storage state changed between paint and mount.
    clearSplashAttr()
    return
  }

  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* fall through — worst case the splash replays next load */
  }

  const reduceMotion =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches

  if (reduceMotion) {
    // No draw: the logo renders fully stroked by default. Set the end-state message
    // before the overlay mounts so there's no cross-fade, then hold briefly and fade.
    message.value = MESSAGES[MESSAGES.length - 1]
    show.value = true
    fadeTimer = setTimeout(finish, 900)
    return
  }

  show.value = true
  await nextTick()

  stepMessages()

  try {
    const tl = $anime.createTimeline()
    timeline = tl
    tl.add($anime.svg.createDrawable('.s51 path, .s51 polygon'), {
      draw: ['0 0', '0 1'],
      duration: DRAW_MS,
      ease: 'inOutQuad',
    })
    await tl.then(() => {})
  } catch (err) {
    // If anime.js is unavailable for any reason, don't strand the user behind
    // the cover — just fade whatever rendered.
    console.error('[AppSplash] animation failed', err)
  }

  fadeTimer = setTimeout(finish, HOLD_MS)
})

onBeforeUnmount(() => {
  msgTimers.forEach(clearTimeout)
  msgTimers = []
  if (fadeTimer) clearTimeout(fadeTimer)
  timeline?.pause()
  clearSplashAttr()
})
</script>

<style scoped>
/* Red on the light (white) cover, white on the dark cover. --accent is the brand
   red in both themes, so the dark case is the only override. */
.splash-logo {
  color: var(--accent);
}
[data-theme='dark'] .splash-logo {
  color: #ffffff;
}

.splash-msg-enter-active,
.splash-msg-leave-active {
  transition: opacity 200ms var(--ease-snappy);
}
.splash-msg-enter-from,
.splash-msg-leave-to {
  opacity: 0;
}
</style>
