import { beforeEach, describe, expect, it } from 'vitest'
import type { SeoIssue, SeoPage } from '#shared/types'
import { makeSite, resetDb } from '../helpers/db'
import {
  deleteSite,
  finishSeoCrawl,
  getDb,
  getLatestSeoCrawl,
  getSeoState,
  getSite,
  insertSeoCrawl,
  listSeoCrawls,
  listSeoIssues,
  listSeoPages,
  updateSite,
  upsertSeoState,
} from '../../server/utils/db'

beforeEach(resetDb)

const pageRow = (url: string): SeoPage => ({
  url,
  status: 200,
  redirectHops: 0,
  responseMs: 12,
  title: 'T',
  description: null,
  canonical: null,
  robots: null,
  h1Count: 1,
  inSitemap: true,
  depth: 0,
})

const issueRow = (code: SeoIssue['code'], severity: SeoIssue['severity']): SeoIssue => ({
  url: 'https://example.test/',
  code,
  severity,
  detail: 'd',
  sourceUrl: null,
})

describe('seo_enabled site setting', () => {
  it('defaults on and round-trips through updateSite', () => {
    const site = makeSite()
    expect(site.seoEnabled).toBe(true)
    expect(updateSite(site.id, { seoEnabled: false })!.seoEnabled).toBe(false)
    expect(getSite(site.id)!.seoEnabled).toBe(false)
  })
})

describe('seo_state', () => {
  it('upserts only the fields given', () => {
    const site = makeSite()
    expect(getSeoState(site.id)).toBeNull()
    upsertSeoState(site.id, { homepageRobots: 'index', homepageCanonical: 'https://example.test/' })
    const s = upsertSeoState(site.id, { robotsStatus: 200, robotsBlocked: true })
    expect(s).toMatchObject({
      homepageRobots: 'index',
      homepageCanonical: 'https://example.test/',
      robotsStatus: 200,
      robotsBlocked: true,
    })
  })
})

describe('seo crawls', () => {
  it('stores pages and issues, tallies by severity, and ignores unfinished crawls', () => {
    const site = makeSite()
    const pending = insertSeoCrawl(site.id)
    expect(getLatestSeoCrawl(site.id)).toBeNull()

    const done = finishSeoCrawl(pending.id, {
      pages: [pageRow('https://example.test/'), pageRow('https://example.test/a')],
      issues: [issueRow('broken_link', 'error'), issueRow('title_length', 'info'), issueRow('h1_missing', 'warn')],
      sitemapUrls: 2,
      error: null,
    })
    expect(done).toMatchObject({ pagesCrawled: 2, sitemapUrls: 2, issueCounts: { error: 1, warn: 1, info: 1 } })
    expect(done.finishedAt).not.toBeNull()
    expect(getLatestSeoCrawl(site.id)!.id).toBe(done.id)
    expect(listSeoPages(done.id).map((p) => p.url)).toEqual(['https://example.test/', 'https://example.test/a'])
    expect(listSeoIssues(done.id).map((i) => i.severity)).toEqual(['error', 'warn', 'info'])
  })

  it('prunes to the newest N crawls and cascades their rows', () => {
    const site = makeSite()
    const ids: number[] = []
    for (let i = 0; i < 4; i++) {
      const c = insertSeoCrawl(site.id)
      finishSeoCrawl(c.id, { pages: [pageRow('https://example.test/')], issues: [issueRow('h1_missing', 'warn')], sitemapUrls: 1, error: null }, 2)
      ids.push(c.id)
    }
    expect(listSeoCrawls(site.id).map((c) => c.id)).toEqual([ids[3], ids[2]])
    const orphans = getDb().prepare(`SELECT count(*) AS n FROM seo_pages WHERE crawl_id IN (?, ?)`).get(ids[0], ids[1]) as { n: number }
    expect(orphans.n).toBe(0)
  })

  it('cascades everything when the site is deleted', () => {
    const site = makeSite()
    upsertSeoState(site.id, { homepageRobots: 'index' })
    const c = insertSeoCrawl(site.id)
    finishSeoCrawl(c.id, { pages: [pageRow('https://example.test/')], issues: [issueRow('h1_missing', 'warn')], sitemapUrls: 1, error: null })
    deleteSite(site.id)
    const db = getDb()
    for (const t of ['seo_state', 'seo_crawls', 'seo_pages', 'seo_issues']) {
      expect((db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n).toBe(0)
    }
  })
})
