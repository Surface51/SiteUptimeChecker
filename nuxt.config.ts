// https://nuxt.com/docs/api/configuration/nuxt-config
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
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
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    hooks: {
      async compiled(nitro) {
        // lighthouse loads many of its own gatherer/audit/report-asset files at runtime via
        // dynamic import() or fs.readFileSync with computed paths, which Nitro's static
        // dependency tracer can't follow — it only copies the files it can see referenced
        // directly. Rather than chase each missing file, copy the whole package wholesale so
        // production has everything the traced partial copy would otherwise be missing.
        const serverDir = nitro.options.output.serverDir
        await cp(
          join(process.cwd(), 'node_modules/lighthouse'),
          join(serverDir, 'node_modules/lighthouse'),
          { recursive: true, force: true },
        )
      },
    },
  },
})
