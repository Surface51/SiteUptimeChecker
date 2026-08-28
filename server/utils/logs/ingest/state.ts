import type { DuckDBConnection } from '@duckdb/node-api'
import { timestampValue } from '@duckdb/node-api'
import type { DiscoveredFile, LogType } from '../discovery'
import { PARSER_REGISTRY } from './registry'

function toTs(d: Date) {
  return timestampValue(BigInt(d.getTime()) * BigInt(1000))
}

export interface FileRecord {
  fileId: number
  serverId: number
  path: string
  logType: string
  compressed: boolean
  mutable: boolean
  size: number
  headHash: string | null
  byteOffset: number
  status: string
}

export async function getOrCreateSite(conn: DuckDBConnection, name: string, rootPath: string): Promise<number> {
  const existing = await conn.runAndReadAll(`SELECT site_id FROM sites WHERE name = $name`, { name })
  const rows = existing.getRowObjectsJS()
  if (rows[0]) return Number(rows[0].site_id)

  const inserted = await conn.runAndReadAll(
    `INSERT INTO sites (site_id, name, root_path, created_at)
     VALUES (nextval('seq_site_id'), $name, $rootPath, $now)
     RETURNING site_id`,
    { name, rootPath, now: toTs(new Date()) }
  )
  return Number(inserted.getRowObjectsJS()[0]!.site_id)
}

export async function getOrCreateServer(
  conn: DuckDBConnection,
  siteId: number,
  env: string,
  ip: string,
  role: 'app' | 'db'
): Promise<number> {
  const existing = await conn.runAndReadAll(
    `SELECT server_id FROM servers WHERE site_id = $siteId AND env = $env AND ip = $ip`,
    { siteId, env, ip }
  )
  const rows = existing.getRowObjectsJS()
  if (rows[0]) return Number(rows[0].server_id)

  const inserted = await conn.runAndReadAll(
    `INSERT INTO servers (server_id, site_id, env, ip, role)
     VALUES (nextval('seq_server_id'), $siteId, $env, $ip, $role)
     RETURNING server_id`,
    { siteId, env, ip, role }
  )
  return Number(inserted.getRowObjectsJS()[0]!.server_id)
}

export async function getFileRecord(conn: DuckDBConnection, path: string): Promise<FileRecord | null> {
  const result = await conn.runAndReadAll(
    `SELECT file_id, server_id, path, log_type, compressed, mutable, size, head_hash, byte_offset, status
     FROM ingest_files WHERE path = $path`,
    { path }
  )
  const rows = result.getRowObjectsJS()
  const r = rows[0]
  if (!r) return null
  return {
    fileId: Number(r.file_id),
    serverId: Number(r.server_id),
    path: String(r.path),
    logType: String(r.log_type),
    compressed: Boolean(r.compressed),
    mutable: Boolean(r.mutable),
    size: Number(r.size),
    headHash: r.head_hash as string | null,
    byteOffset: Number(r.byte_offset),
    status: String(r.status)
  }
}

export async function insertFileRecord(
  conn: DuckDBConnection,
  serverId: number,
  file: DiscoveredFile,
  headHash: string | null
): Promise<number> {
  const inserted = await conn.runAndReadAll(
    `INSERT INTO ingest_files
       (file_id, server_id, path, log_type, rotated_date, compressed, mutable, size, mtime, head_hash,
        byte_offset, lines_ingested, parse_errors, status, updated_at)
     VALUES
       (nextval('seq_file_id'), $serverId, $path, $logType, $rotatedDate, $compressed, $mutable, $size, $mtime, $headHash,
        0, 0, 0, 'pending', $now)
     RETURNING file_id`,
    {
      serverId,
      path: file.absPath,
      logType: file.classified.logType,
      rotatedDate: file.classified.rotatedDate,
      compressed: file.classified.compressed,
      mutable: file.classified.mutable,
      size: file.size,
      mtime: toTs(file.mtime),
      headHash,
      now: toTs(new Date())
    }
  )
  return Number(inserted.getRowObjectsJS()[0]!.file_id)
}

export async function updateFileMeta(conn: DuckDBConnection, fileId: number, size: number, mtime: Date, headHash: string | null) {
  await conn.run(
    `UPDATE ingest_files SET size = $size, mtime = $mtime, head_hash = $headHash, updated_at = $now WHERE file_id = $fileId`,
    { size, mtime: toTs(mtime), headHash, now: toTs(new Date()), fileId }
  )
}

export async function updateFileProgress(
  conn: DuckDBConnection,
  fileId: number,
  progress: { byteOffset: number; linesIngested: number; parseErrors: number; status: string; lastError?: string | null }
) {
  await conn.run(
    `UPDATE ingest_files
     SET byte_offset = $byteOffset, lines_ingested = lines_ingested + $linesIngested,
         parse_errors = parse_errors + $parseErrors, status = $status, last_error = $lastError, updated_at = $now
     WHERE file_id = $fileId`,
    {
      byteOffset: progress.byteOffset,
      linesIngested: progress.linesIngested,
      parseErrors: progress.parseErrors,
      status: progress.status,
      lastError: progress.lastError ?? null,
      now: toTs(new Date()),
      fileId
    }
  )
}

/** A rotated/truncated live file: wipe its previously-ingested rows and restart from byte 0. */
export async function resetFileForRotation(conn: DuckDBConnection, fileId: number, logType: LogType) {
  const table = tableForLogType(logType)
  if (table) {
    await conn.run(`DELETE FROM ${table} WHERE file_id = $fileId`, { fileId })
  }
  await conn.run(
    `UPDATE ingest_files
     SET byte_offset = 0, lines_ingested = 0, parse_errors = 0, status = 'pending', last_error = NULL, updated_at = $now
     WHERE file_id = $fileId`,
    { now: toTs(new Date()), fileId }
  )
}

/** The DuckDB table a log type's rows land in — the single source is `PARSER_REGISTRY`, so a
 * new log type can't be half-registered (parser wired, rotation-reset silently skipping its
 * DELETE and duplicating rows on the next rotation). */
export function tableForLogType(logType: LogType): string | undefined {
  return PARSER_REGISTRY[logType]?.table
}
