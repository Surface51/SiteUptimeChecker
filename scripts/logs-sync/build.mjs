// Bundles the sync CLI with esbuild, same reasoning as scripts/logs-ingest/build.mjs: plain
// `node cli.ts` can't resolve the extensionless relative imports the server/utils/logs modules
// use. This CLI shells out to rsync/ssh/terminus and never opens logs.duckdb, so @duckdb/node-api
// is deliberately absent here — that is what lets `logs:sync` run while the server (or
// `logs:ingest`) holds the DuckDB store.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outdir = join(here, '../../.output/logs-sync')

await build({
  entryPoints: [join(here, 'cli.ts')],
  outdir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // better-sqlite3 is a native addon loaded via createRequire (pulled in by server/utils/db.ts
  // for pausedLogFolders()). Everything else bundles.
  external: ['better-sqlite3'],
  logLevel: 'warning',
})

console.log(`[logs:sync] bundled -> ${outdir}`)
