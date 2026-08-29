/**
 * Content assertions for a check — "the page must contain / must not contain / must match / must
 * be at least N bytes". Pure and side-effect free, mirroring securityHeaders.ts. Any failure
 * makes the whole check `down` (see determineStatus), and `detail` becomes the incident cause.
 *
 * The regex is caller-supplied. It is length-capped at save time (parseSiteSettings) and only
 * ever run here against the already-capped body slice, so a pathological pattern can chew at most
 * a few hundred KB, not an unbounded stream.
 */
export interface AssertionConfig {
  expect: string | null
  forbid: string | null
  regex: string | null
  minBytes: number | null
}

export interface AssertionResult {
  failed: boolean
  detail: string | null
}

export function hasAnyAssertion(cfg: AssertionConfig): boolean {
  return !!(cfg.expect || cfg.forbid || cfg.regex || cfg.minBytes)
}

export function evaluateAssertions(
  body: string | null,
  contentLength: number | null,
  cfg: AssertionConfig,
): AssertionResult {
  if (!hasAnyAssertion(cfg)) return { failed: false, detail: null }

  // minBytes can be judged from Content-Length alone; the text checks need a body.
  if (cfg.minBytes !== null) {
    const size = contentLength ?? (body !== null ? Buffer.byteLength(body) : null)
    if (size !== null && size < cfg.minBytes) {
      return { failed: true, detail: `response was ${size} bytes, expected at least ${cfg.minBytes}` }
    }
  }

  if (cfg.expect || cfg.forbid || cfg.regex) {
    if (body === null) {
      return { failed: true, detail: 'no response body to check assertions against' }
    }
    if (cfg.expect && !body.includes(cfg.expect)) {
      return { failed: true, detail: `missing expected text "${truncate(cfg.expect)}"` }
    }
    if (cfg.forbid && body.includes(cfg.forbid)) {
      return { failed: true, detail: `found forbidden text "${truncate(cfg.forbid)}"` }
    }
    if (cfg.regex) {
      let re: RegExp
      try {
        re = new RegExp(cfg.regex)
      } catch {
        // A regex that no longer compiles shouldn't fail the check — treat as unconfigured.
        return { failed: false, detail: null }
      }
      if (!re.test(body)) {
        return { failed: true, detail: `response did not match /${truncate(cfg.regex)}/` }
      }
    }
  }

  return { failed: false, detail: null }
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
