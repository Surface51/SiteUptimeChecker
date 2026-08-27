import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Vitest setupFiles are loaded and fully executed *before* a test file's own
// module graph is evaluated. That ordering guarantee is essential here: setting
// process.env.UPTIME_DATA_DIR from inside a test file (even before a static
// `import` of server/utils/db) does NOT work, because ES module imports are
// hoisted above all other top-level code in the importing file — db.ts would
// read process.cwd()/.data before this line ever ran. Doing it here, in a
// separate setup module, sidesteps that hoisting problem entirely.
process.env.UPTIME_DATA_DIR = mkdtempSync(join(tmpdir(), 'uptime-checker-test-'))

// Vitest runs test files in parallel workers, and each file that touches the log store opens
// its own DuckDB instance. At the default two threads and 1GB limit apiece, several of those at
// once starve the machine badly enough for unrelated tests to hit their 5s timeout. Test
// datasets are tiny, so intra-query parallelism buys nothing here.
process.env.DUCKDB_THREADS = '1'
process.env.DUCKDB_MEMORY_LIMIT = '256MB'
process.env.DUCKDB_READ_POOL = '1'
