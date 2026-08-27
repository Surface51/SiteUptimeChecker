import type { DuckDBAppender } from '@duckdb/node-api'
import type { LogType } from '../discovery'
import type { LineParser } from '../parsers/types'
import { NginxAccessParser } from '../parsers/nginxAccess'
import { NginxErrorParser } from '../parsers/nginxError'
import { PhpErrorParser } from '../parsers/phpError'
import { PhpFpmParser } from '../parsers/phpFpm'
import { PhpSlowParser } from '../parsers/phpSlow'
import { MysqlSlowParser } from '../parsers/mysqlSlow'
import { MysqldParser } from '../parsers/mysqld'
import {
  appendAccessRow,
  appendNginxErrorAggRow,
  appendPhpErrorRow,
  appendFpmEventRow,
  appendPhpSlowRow,
  appendMysqlSlowRow,
  appendDbEventRow,
} from './appenders'

export interface ParserSpec {
  table: string
  createParser: () => LineParser<any>
  appendRow: (appender: DuckDBAppender, row: any, serverId: number, fileId: number) => void
}

/**
 * Maps each recognized log type to its parser and its DuckDB target table. Deliberately kept
 * free of `logDb`, the ingest `EventEmitter`, and anything else that would open the log
 * database — the parallel CLI's worker threads import this module directly, and a worker must
 * never be able to open `logs.duckdb` (a second open of the same file inside one OS process
 * corrupts it).
 */
export const PARSER_REGISTRY: Partial<Record<LogType, ParserSpec>> = {
  nginx_access: { table: 'access_log', createParser: () => new NginxAccessParser(), appendRow: appendAccessRow },
  nginx_error: { table: 'nginx_error_agg', createParser: () => new NginxErrorParser(), appendRow: appendNginxErrorAggRow },
  php_error: { table: 'php_error', createParser: () => new PhpErrorParser(), appendRow: appendPhpErrorRow },
  php_fpm_error: { table: 'fpm_events', createParser: () => new PhpFpmParser(), appendRow: appendFpmEventRow },
  php_slow: { table: 'php_slow', createParser: () => new PhpSlowParser(), appendRow: appendPhpSlowRow },
  mysqld_slow: { table: 'mysql_slow', createParser: () => new MysqlSlowParser(), appendRow: appendMysqlSlowRow },
  mysqld: { table: 'db_events', createParser: () => new MysqldParser(), appendRow: appendDbEventRow },
}
