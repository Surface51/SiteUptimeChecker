export interface ExplorerTableConfig {
  timeColumn: 'ts' | 'bucket'
  columns: string[]
  hasClientIp: boolean
  hasStatus: boolean
  hasPathSearch: string | null // column name to LIKE-search, if any
}

export const EXPLORER_TABLES: Record<string, ExplorerTableConfig> = {
  access_log: {
    timeColumn: 'ts',
    columns: ['ts', 'client_ip', 'method', 'path', 'status', 'bytes', 'duration', 'user_agent', 'referer', 'is_bot', 'bot_name', 'country'],
    hasClientIp: true,
    hasStatus: true,
    hasPathSearch: 'path'
  },
  php_error: {
    timeColumn: 'ts',
    columns: ['ts', 'error_type', 'message', 'src_file', 'src_line', 'fingerprint'],
    hasClientIp: false,
    hasStatus: false,
    hasPathSearch: null
  },
  fpm_events: {
    timeColumn: 'ts',
    columns: ['ts', 'level', 'pool', 'event_type', 'pid', 'exit_code', 'lifetime_sec', 'slow_sec', 'request_url', 'message'],
    hasClientIp: false,
    hasStatus: false,
    hasPathSearch: 'request_url'
  },
  php_slow: {
    timeColumn: 'ts',
    columns: ['ts', 'pool', 'pid', 'script', 'fingerprint'],
    hasClientIp: false,
    hasStatus: false,
    hasPathSearch: 'script'
  },
  mysql_slow: {
    timeColumn: 'ts',
    columns: ['ts', 'db_user', 'db_host', 'query_time', 'lock_time', 'rows_examined', 'sql_text', 'fingerprint_hash'],
    hasClientIp: false,
    hasStatus: false,
    hasPathSearch: null
  },
  nginx_error_agg: {
    timeColumn: 'bucket',
    columns: ['bucket', 'level', 'fingerprint', 'count', 'sample_message', 'sample_request', 'sample_host'],
    hasClientIp: false,
    hasStatus: false,
    hasPathSearch: 'sample_request'
  },
  db_events: {
    timeColumn: 'ts',
    columns: ['ts', 'thread_id', 'level', 'message'],
    hasClientIp: false,
    hasStatus: false,
    hasPathSearch: null
  }
}
