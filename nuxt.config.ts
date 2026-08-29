// https://nuxt.com/docs/api/configuration/nuxt-config
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-anime'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700;800&display=swap',
        },
        {
          // display=block, not swap — the ligature fallback would render the raw
          // icon name ("check_circle") as text before the font lands.
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&display=block',
        },
      ],
      script: [
        {
          // Applies the persisted theme before first paint. Without this the
          // server-rendered (light) markup flashes before the client hydrates.
          innerHTML: `(function(){try{var t=localStorage.getItem('siteUptime.theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()`,
          tagPriority: 'critical',
        },
        {
          // Marks the splash as pending before first paint, so the SSR'd app never
          // flashes in the frame before the client-only overlay mounts. Cleared by
          // AppSplash on finish, and never set at all after the first load of a session.
          // If sessionStorage throws, the attribute stays unset and the app renders
          // normally rather than sitting behind a cover nothing clears.
          innerHTML: `(function(){try{if(!sessionStorage.getItem('siteUptime.splashSeen'))document.documentElement.setAttribute('data-splash','pending')}catch(e){}})()`,
          tagPriority: 'critical',
        },
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    hooks: {
      async compiled(nitro) {
        // These packages all load files at runtime that Nitro's static dependency tracer
        // can't follow, so it copies an incomplete subset of each. Rather than chase the
        // individual missing files, copy the packages wholesale.
        //
        //   lighthouse  — pulls its gatherers/audits/report assets via dynamic import() and
        //                 fs.readFileSync with computed paths.
        //   @duckdb     — @duckdb/node-api resolves its prebuilt platform bindings package
        //                 (@duckdb/node-bindings-<platform>) indirectly.
        //   geoip-lite  — loaded through a deferred createRequire in logs/enrich/geo.ts.
        const serverDir = nitro.options.output.serverDir
        for (const pkg of ['lighthouse', '@duckdb', 'geoip-lite']) {
          await cp(
            join(process.cwd(), 'node_modules', pkg),
            join(serverDir, 'node_modules', pkg),
            { recursive: true, force: true },
          )
        }
      },
    },
  },
})
