import { describe, it, expect } from 'vitest'
import { classifyFilename } from '../../../server/utils/logs/discovery'

describe('classifyFilename', () => {
  it('classifies the nginx/php/mysqld names it always has', () => {
    expect(classifyFilename('nginx-access.log')?.logType).toBe('nginx_access')
    expect(classifyFilename('nginx-error.log')?.logType).toBe('nginx_error')
    expect(classifyFilename('error.log')?.logType).toBe('nginx_error')
    expect(classifyFilename('php-fpm-error.log')?.logType).toBe('php_fpm_error')
    expect(classifyFilename('php-slow.log')?.logType).toBe('php_slow')
  })

  it('still tells mysqld-slow-query.log apart from mysqld.log', () => {
    expect(classifyFilename('mysqld-slow-query.log')?.logType).toBe('mysqld_slow')
    expect(classifyFilename('mysqld.log')?.logType).toBe('mysqld')
  })

  it('classifies the Apache names', () => {
    expect(classifyFilename('apache-access.log')?.logType).toBe('apache_access')
    expect(classifyFilename('apache-error.log')?.logType).toBe('apache_error')
  })

  it('accepts an optional __tag on a base name', () => {
    expect(classifyFilename('apache-access__ssl.log')?.logType).toBe('apache_access')
    expect(classifyFilename('apache-access__example_com.log')?.logType).toBe('apache_access')
    const rotated = classifyFilename('apache-access__ssl.log-20260801.gz')
    expect(rotated?.logType).toBe('apache_access')
    expect(rotated?.rotatedDate).toBe('2026-08-01')
    expect(rotated?.compressed).toBe(true)
    expect(rotated?.mutable).toBe(false)
  })

  it('a tag does not make mysqld-slow-query.log ambiguous', () => {
    // "-slow-query" is not "__…", so this can only classify one way.
    expect(classifyFilename('mysqld-slow-query.log')?.logType).toBe('mysqld_slow')
    // and a genuine tag on mysqld still works
    expect(classifyFilename('mysqld__replica.log')?.logType).toBe('mysqld')
  })

  it('keeps the rotation / compression / epoch suffixes working', () => {
    const gz = classifyFilename('nginx-access.log-20260806.gz')
    expect(gz?.rotatedDate).toBe('2026-08-06')
    expect(gz?.compressed).toBe(true)
    expect(gz?.mutable).toBe(false)
    expect(classifyFilename('php-error.log 1754562000')?.logType).toBe('php_error')
  })

  it('rejects unrelated names', () => {
    expect(classifyFilename('access.log')).toBeNull()
    expect(classifyFilename('apache-access.txt')).toBeNull()
    expect(classifyFilename('apache-access-ssl.log')).toBeNull() // single dash is not the tag delimiter
  })
})
