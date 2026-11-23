import type { SeoIssueCode, SeoSeverity } from '#shared/types'

export const seoIssueLabel: Record<SeoIssueCode, string> = {
  http_error: 'Page returns an error',
  broken_link: 'Broken internal link',
  redirect_chain: 'Redirect chain',
  redirect_loop: 'Redirect loop',
  title_missing: 'Missing title',
  title_length: 'Title length',
  title_duplicate: 'Duplicate title',
  description_missing: 'Missing meta description',
  description_length: 'Meta description length',
  description_duplicate: 'Duplicate meta description',
  h1_missing: 'Missing <h1>',
  h1_multiple: 'Multiple <h1>',
  sitemap_non_200: 'Sitemap URL not 200',
  sitemap_noindex: 'Sitemap URL is noindex',
  sitemap_canonicalised: 'Sitemap URL canonicalised elsewhere',
  sitemap_blocked: 'Sitemap URL blocked by robots.txt',
  sitemap_missing: 'No sitemap',
  canonical_broken: 'Canonical points to an error page',
  canonical_offsite: 'Canonical points off-site',
  hreflang_no_return: 'hreflang without return link',
  jsonld_invalid: 'Invalid JSON-LD',
  mixed_content: 'Mixed content',
  noindex: 'Noindex page',
}

export const seoSeverityTone: Record<SeoSeverity, 'down' | 'degraded' | 'neutral'> = {
  error: 'down',
  warn: 'degraded',
  info: 'neutral',
}

export const seoSeverityLabel: Record<SeoSeverity, string> = { error: 'Error', warn: 'Warning', info: 'Info' }
