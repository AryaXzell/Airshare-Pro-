/**
 * AirShare Pro — Country Flags Asset Mapping
 * 
 * Provides mapping from ISO 3166-1 alpha-2 country codes to SVG vector flag assets.
 * Emojis are intentionally avoided to ensure pixel-crisp, OS-independent rendering.
 */

export const SUPPORTED_FLAG_CODES = new Set([
  'ID', 'US', 'SG', 'MY', 'JP', 'GB', 'DE', 'FR', 'NL', 'AU',
  'CA', 'BR', 'IN', 'KR', 'CN', 'RU', 'IT', 'ES', 'PH', 'TH',
  'VN', 'SA', 'AE', 'TR', 'MX', 'AR', 'PL', 'SE', 'NO', 'CH',
  'NZ', 'PK', 'BD', 'NG', 'ZA', 'CL', 'CO', 'TW', 'HK',
]);

export const DEFAULT_GLOBE_FLAG_PATH = '/flags/globe.svg';

/**
 * Returns the public URL path to a country's flag SVG asset.
 * Falls back to the generic globe SVG if the code is unknown or unmapped.
 */
export function getFlagAssetPath(countryCode?: string): string {
  if (!countryCode || typeof countryCode !== 'string') {
    return DEFAULT_GLOBE_FLAG_PATH;
  }
  const code = countryCode.trim().toUpperCase();
  if (SUPPORTED_FLAG_CODES.has(code)) {
    return `/flags/${code.toLowerCase()}.svg`;
  }
  return DEFAULT_GLOBE_FLAG_PATH;
}
