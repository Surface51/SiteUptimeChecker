// https://nuxt.com/docs/api/configuration/nuxt-config
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
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
