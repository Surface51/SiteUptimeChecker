import type { DuckDBConnection } from '@duckdb/node-api'
import type { DiscoveredFile } from '../discovery'
import { computeHeadHash } from './stream'
import {
  getFileRecord,
  insertFileRecord,
  resetFileForRotation,
  tableForLogType,
  updateFileMeta,
} from './state'

export interface FilePlan {
  fileId: number
  startOffset: number
  needsIngest: boolean
}

/**
 * Decides, from the `ingest_files` bookkeeping and a sha1 of the file's first 1 KB, where to
 * start reading a discovered file and whether there's anything new to read. Shared by the
 * in-process `runIngest` and the parallel `logs:ingest` CLI so the resume rules stay in one
 * place.
 */
export async function planFile(
  conn: DuckDBConnection,
  file: DiscoveredFile,
  serverId: number,
): Promise<FilePlan> {
  const headHash = computeHeadHash(file.absPath)
  const existing = await getFileRecord(conn, file.absPath)

  if (!existing) {
    const fileId = await insertFileRecord(conn, serverId, file, headHash)
    return { fileId, startOffset: 0, needsIngest: file.size > 0 }
  }

  const { fileId } = existing

  if (file.classified.mutable) {
    const rotated =
      (existing.headHash !== null && headHash !== existing.headHash) || file.size < existing.byteOffset
    if (rotated) {
      await resetFileForRotation(conn, fileId, file.classified.logType)
      await updateFileMeta(conn, fileId, file.size, file.mtime, headHash)
      return { fileId, startOffset: 0, needsIngest: file.size > 0 }
    }
    await updateFileMeta(conn, fileId, file.size, file.mtime, headHash)
    return { fileId, startOffset: existing.byteOffset, needsIngest: file.size > existing.byteOffset }
  }

  // Immutable (rotated/dated or .gz) file: once done, never revisit.
  if (existing.status === 'done') {
    return { fileId, startOffset: 0, needsIngest: false }
  }
  // A stopped/interrupted *uncompressed* immutable file resumes from its checkpoint: the
  // checkpoint is taken at a parser-safe boundary, so the rows already committed are exactly
  // those before byte_offset. (Only reachable for offsets written by the checkpoint path —
  // the pre-checkpoint code never advanced byte_offset for a non-done immutable file.)
  if (
    !file.classified.compressed &&
    existing.byteOffset > 0 &&
    (existing.status === 'running' || existing.status === 'stopped')
  ) {
    return { fileId, startOffset: existing.byteOffset, needsIngest: file.size > existing.byteOffset }
  }
  // Never started, errored, or a compressed file interrupted mid-stream (its offset is
  // compressed bytes and can't be resumed): wipe any partial rows and redo from scratch.
  const table = tableForLogType(file.classified.logType)
  if (table) await conn.run(`DELETE FROM ${table} WHERE file_id = $fileId`, { fileId })
  return { fileId, startOffset: 0, needsIngest: file.size > 0 }
}
