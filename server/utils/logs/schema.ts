import type { DuckDBConnection } from '@duckdb/node-api'

interface Migration {
  version: number
  sql: string[]
}

// Ordered, additive migrations. Each runs once; never edit a past entry's
// SQL after it has shipped — append a new migration instead.
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: [
      `CREATE SEQUENCE IF NOT EXISTS seq_site_id START 1`,
      `CREATE SEQUENCE IF NOT EXISTS seq_server_id START 1`,
      `CREATE SEQUENCE IF NOT EXISTS seq_file_id START 1`,

      `CREATE TABLE IF NOT EXISTS sites (
        site_id USMALLINT PRIMARY KEY,
        name TEXT UNIQUE,
        root_path TEXT,
        created_at TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS servers (
        server_id USMALLINT PRIMARY KEY,
        site_id USMALLINT,
        env TEXT,
        ip TEXT,
        role TEXT,
        UNIQUE(site_id, env, ip)
      )`,

      `CREATE TABLE IF NOT EXISTS ingest_files (
        file_id UINTEGER PRIMARY KEY,
        server_id USMALLINT,
        path TEXT UNIQUE,
        log_type TEXT,
        rotated_date DATE,
        compressed BOOLEAN,
        mutable BOOLEAN,
        size UBIGINT,
        mtime TIMESTAMP,
        head_hash TEXT,
        byte_offset UBIGINT DEFAULT 0,
        lines_ingested UBIGINT DEFAULT 0,
        parse_errors UBIGINT DEFAULT 0,
        status TEXT DEFAULT 'pending',
        last_error TEXT,
        updated_at TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS access_log (
        server_id USMALLINT,
        ts TIMESTAMP,
        client_ip TEXT,
        method TEXT,
        url TEXT,
        path TEXT,
        path_pattern TEXT,
        has_query BOOLEAN,
        status USMALLINT,
        bytes UBIGINT,
        referer TEXT,
        user_agent TEXT,
        duration DOUBLE,
        ua_browser TEXT,
        ua_os TEXT,
        ua_device TEXT,
        is_bot BOOLEAN,
        bot_name TEXT,
        country TEXT,
        file_id UINTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS nginx_error_agg (
        server_id USMALLINT,
        bucket TIMESTAMP,
        level TEXT,
        fingerprint TEXT,
        count UINTEGER,
        sample_message TEXT,
        sample_request TEXT,
        sample_host TEXT,
        file_id UINTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS php_error (
        server_id USMALLINT,
        ts TIMESTAMP,
        error_type TEXT,
        message TEXT,
        src_file TEXT,
        src_line UINTEGER,
        stack TEXT,
        fingerprint TEXT,
        file_id UINTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS fpm_events (
        server_id USMALLINT,
        ts TIMESTAMP,
        level TEXT,
        pool TEXT,
        event_type TEXT,
        pid UINTEGER,
        exit_code INTEGER,
        lifetime_sec DOUBLE,
        slow_sec DOUBLE,
        request_url TEXT,
        message TEXT,
        file_id UINTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS php_slow (
        server_id USMALLINT,
        ts TIMESTAMP,
        pool TEXT,
        pid UINTEGER,
        script TEXT,
        stack TEXT,
        fingerprint TEXT,
        file_id UINTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS mysql_slow (
        server_id USMALLINT,
        ts TIMESTAMP,
        db_user TEXT,
        db_host TEXT,
        thread_id UINTEGER,
        db_schema TEXT,
        qc_hit BOOLEAN,
        query_time DOUBLE,
        lock_time DOUBLE,
        rows_sent UBIGINT,
        rows_examined UBIGINT,
        rows_affected UBIGINT,
        bytes_sent UBIGINT,
        sql_text TEXT,
        fingerprint TEXT,
        fingerprint_hash TEXT,
        file_id UINTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS db_events (
        server_id USMALLINT,
        ts TIMESTAMP,
        thread_id UINTEGER,
        level TEXT,
        message TEXT,
        file_id UINTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS ip_profiles (
        server_id USMALLINT,
        client_ip TEXT,
        computed_at TIMESTAMP,
        request_count UBIGINT,
        error_4xx_count UBIGINT,
        error_5xx_count UBIGINT,
        distinct_paths UINTEGER,
        max_req_per_min UINTEGER,
        is_bot BOOLEAN,
        bot_name TEXT,
        country TEXT,
        facet_crawl_score DOUBLE,
        PRIMARY KEY (server_id, client_ip)
      )`
    ]
  }
]

export async function migrateLogDb(connection: DuckDBConnection): Promise<void> {
  await connection.run(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)`)
  const result = await connection.runAndReadAll(`SELECT version FROM schema_version LIMIT 1`)
  const rows = result.getRowObjectsJS()
  let current = rows[0] ? Number(rows[0].version) : 0

  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
  for (const migration of pending) {
    for (const sql of migration.sql) {
      await connection.run(sql)
    }
    current = migration.version
  }

  if (rows.length > 0) {
    await connection.run(`UPDATE schema_version SET version = ${current}`)
  } else {
    await connection.run(`INSERT INTO schema_version (version) VALUES (${current})`)
  }
}
