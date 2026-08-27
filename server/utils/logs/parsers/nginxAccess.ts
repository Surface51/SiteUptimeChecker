import type { AccessRow, LineParser } from './types'
import { parseNginxAccessTimestamp } from './dates'
import { normalizeUrl } from '../enrich/urlNormalize'
import { enrichUserAgent } from '../enrich/ua'
import { lookupCountry } from '../enrich/geo'

// $remote_addr - $remote_user [$time_local]  "$request" $status $bytes "$referer" "$user_agent" $request_time "$xff_chain"
// Note the double space after the timestamp bracket, and the trailing quoted XFF chain (non-standard).
const ACCESS_RE =
  /^(\S+) - \S+ \[([^\]]+)\]\s+"(\S+) (.*?) (HTTP\/[0-9.]+)" (\d{3}) (\d+|-) "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)" ([0-9.]+|-) "([^"]*)"$/

export class NginxAccessParser implements LineParser<AccessRow> {
  private errorCount = 0

  feedLine(line: string): AccessRow[] {
    if (!line) return []
    const m = ACCESS_RE.exec(line)
    if (!m) {
      this.errorCount++
      return []
    }

    const lbIp = m[1]!, tsRaw = m[2]!, method = m[3]!, rawUrl = m[4]!
    const statusRaw = m[6]!, bytesRaw = m[7]!, referer = m[8]!, userAgent = m[9]!, durationRaw = m[10]!, xffChain = m[11]!

    const ts = parseNginxAccessTimestamp(tsRaw)
    if (!ts) {
      this.errorCount++
      return []
    }

    const clientIp = xffChain && xffChain !== '-' ? (xffChain.split(',')[0] ?? lbIp).trim() : lbIp
    const { path, hasQuery, pathPattern } = normalizeUrl(rawUrl)
    const ua = enrichUserAgent(userAgent)
    const country = lookupCountry(clientIp)

    const row: AccessRow = {
      ts,
      clientIp,
      method,
      url: rawUrl,
      path,
      pathPattern,
      hasQuery,
      status: Number(statusRaw),
      bytes: bytesRaw === '-' ? 0 : Number(bytesRaw),
      referer,
      userAgent,
      duration: durationRaw === '-' ? null : Number(durationRaw),
      uaBrowser: ua.browser,
      uaOs: ua.os,
      uaDevice: ua.device,
      isBot: ua.isBot,
      botName: ua.botName,
      country
    }

    return [row]
  }

  flush(): AccessRow[] {
    return []
  }

  getErrorCount(): number {
    return this.errorCount
  }
}
