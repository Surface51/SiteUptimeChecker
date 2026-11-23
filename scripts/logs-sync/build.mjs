// Bundles the sync CLI with esbuild, same reasoning as scripts/logs-ingest/build.mjs: plain
// `node cli.ts` can't resolve the extensionless relative imports the server/utils/logs modules
// use. This CLI shells out to rsync/ssh/terminus and never opens logs.duckdb, so @duckdb/node-api
// is deliberately absent here — that is what lets `logs:sync` run while the server (or
// `logs:ingest`) holds the DuckDB store.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// Deliberately outside .output: `nuxt build` wipes that whole directory, and this build runs
// on its own hourly timer as a different system user than the app build — sharing .output
// left whichever ran last owning files the other user's build couldn't then unlink.
const outdir = join(here, '../../.cli-output/logs-sync')

// jack (sync timer) and uptime (manual/ingest runs) both rebuild into .cli-output. The parent's
// setgid bit only fixes the group; with the default 022 umask whoever builds first leaves a
// 755 subdir / 644 bundle the other user can't overwrite ("permission denied"). esbuild's
// child process inherits this umask, so set it before the first build() call.
process.umask(0o002)

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
