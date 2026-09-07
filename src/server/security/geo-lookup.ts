/**
 * AirShare Pro — Server-Side IP Geolocation Lookup
 * Resolves client country for display on public share pages.
 * 
 * Privacy & Security Guarantees:
 * - Raw client IPs are NEVER persisted in databases, logs, or exposed to clients.
 * - Only anonymized country metadata (countryCode, countryName) is preserved.
 * - Private, local, loopback, and carrier-grade NAT addresses are filtered out before making any network calls.
 * - External queries to ip-api.com use a strict 3-second timeout and fail gracefully (fail-open)
 *   so uploads never fail due to geolocation service outages.
 */

export interface GeoLocationResult {
  countryCode: string; // ISO 3166-1 alpha-2, uppercase (e.g. "ID", "US")
  countryName: string; // Friendly name (e.g. "Indonesia", "United States")
}

/**
 * Checks whether an IP address belongs to local, loopback, or private RFC ranges.
 */
export function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;

  const clean = ip.trim().replace(/^::ffff:/i, ''); // Strip IPv4-mapped IPv6 prefix

  if (
    clean === 'localhost' ||
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === '0.0.0.0' ||
    clean === 'unknown-ip'
  ) {
    return true;
  }

  // IPv4 Private & Reserved Ranges:
  // 10.0.0.0 - 10.255.255.255 (10.0.0.0/8)
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;

  // 172.16.0.0 - 172.31.255.255 (172.16.0.0/12)
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;

  // 192.168.0.0 - 192.168.255.255 (192.168.0.0/16)
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;

  // 169.254.0.0 - 169.254.255.255 (Link-Local / APIPA)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;

  // 100.64.0.0 - 100.127.255.255 (Carrier-Grade NAT, RFC 6598)
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;

  // IPv6 Unique Local Address (fc00::/7) or Link-Local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/i.test(clean) || /^fe80:/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Resolves country code and country name from an IP address using ip-api.com.
 * Returns null if the IP is private/local, if the service is unreachable,
 * or if the response indicates failure.
 */
export async function lookupCountryFromIp(ip: string): Promise<GeoLocationResult | null> {
  try {
    if (!ip || isPrivateOrLocalIp(ip)) {
      return null;
    }

    const cleanIp = ip.trim().replace(/^::ffff:/i, '');
    const url = `http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=status,countryCode,country`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AirShare-Pro/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data && data.status === 'success' && data.countryCode && data.country) {
      return {
        countryCode: String(data.countryCode).toUpperCase(),
        countryName: String(data.country),
      };
    }

    return null;
  } catch {
    // Fail silently and return null without disrupting the main upload flow
    return null;
  }
}

/**
 * Safely resolves human-readable country name from ISO 3166-1 alpha-2 code
 * using standard ECMAScript Intl.DisplayNames API.
 */
export function getCountryNameFromCode(countryCode: string): string {
  if (!countryCode || typeof countryCode !== 'string') return '';
  const code = countryCode.trim().toUpperCase();
  try {
    const dn = new Intl.DisplayNames(['id', 'en'], { type: 'region' });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

/**
 * Resolves geolocation country from request headers (Cloudflare, Vercel, GCP, client hints)
 * with graceful fallback to IP lookup and client timezone.
 */
export async function resolveCountryFromRequest(
  req: { headers: Record<string, string | string[] | undefined> },
  clientIp: string
): Promise<GeoLocationResult | null> {
  // 1. Check authoritative reverse-proxy geo headers first (0ms latency)
  const rawCountry =
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    req.headers['x-appengine-country'] ||
    req.headers['x-client-country'];

  const headerCountry = Array.isArray(rawCountry) ? rawCountry[0] : rawCountry;

  if (typeof headerCountry === 'string') {
    const code = headerCountry.trim().toUpperCase();
    if (code.length === 2 && /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') {
      return {
        countryCode: code,
        countryName: getCountryNameFromCode(code),
      };
    }
  }

  // 2. Perform external IP lookup if IP is public
  if (clientIp && !isPrivateOrLocalIp(clientIp)) {
    const ipGeo = await lookupCountryFromIp(clientIp);
    if (ipGeo) {
      return ipGeo;
    }
  }

  // 3. Fallback for localhost / private networks: resolve from client-reported timezone header
  const rawTz = req.headers['x-client-timezone'];
  const tzHeader = Array.isArray(rawTz) ? rawTz[0] : rawTz;
  if (typeof tzHeader === 'string' && tzHeader.trim()) {
    const tz = tzHeader.trim().toLowerCase();
    if (
      tz.includes('jakarta') ||
      tz.includes('pontianak') ||
      tz.includes('makassar') ||
      tz.includes('jayapura') ||
      tz.includes('indonesia')
    ) {
      return { countryCode: 'ID', countryName: 'Indonesia' };
    }
    if (tz.includes('singapore')) return { countryCode: 'SG', countryName: 'Singapura' };
    if (tz.includes('kuala_lumpur')) return { countryCode: 'MY', countryName: 'Malaysia' };
    if (tz.includes('tokyo')) return { countryCode: 'JP', countryName: 'Jepang' };
    if (tz.includes('bangkok')) return { countryCode: 'TH', countryName: 'Thailand' };
  }

  return null;
}
