// Bundles the CLI entry and its worker with esbuild. Plain `node cli.ts` can't run these:
// Node strips TS types but does not resolve the extensionless relative imports the
// server/utils/logs modules use, and vite-node wouldn't hook worker_threads anyway. esbuild
// resolves everything into two self-contained ESM files, native addons left external.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outdir = join(here, '../../.output/logs-ingest')

await build({
  entryPoints: [join(here, 'cli.ts'), join(here, 'worker.ts')],
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Native addons and packages loaded via runtime createRequire — resolve from node_modules
  // at run time instead of being pulled into the bundle.
  external: ['@duckdb/node-api', 'better-sqlite3', 'geoip-lite'],
  logLevel: 'warning',
})

console.log(`[logs:ingest] bundled -> ${outdir}`)
