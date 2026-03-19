/**
 * Format raw revenue values into human-readable currency strings.
 * Handles raw numbers (100000000 → "$100.0M") and pre-formatted strings.
 */
export function formatRevenue(value: unknown): string {
  if (!value || value === '—' || value === '') return '—';

  const str = String(value).trim();

  // If already formatted with $ or M/K/B, pass through unchanged
  if (str.includes('$') || /\d[MKB]\b/.test(str)) {
    return str;
  }

  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num === 0) return '—';

  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

/**
 * Clean company names by stripping SEO boilerplate after | or " - ".
 * e.g., "Bronzier | Custom Airbrush Spray Tans In Austin, TX" → "Bronzier"
 */
export function cleanCompanyName(rawName: unknown): string {
  if (!rawName) return '';
  let name = String(rawName).trim();

  // Strip everything after a pipe character (SEO separator)
  if (name.includes('|')) {
    name = name.split('|')[0].trim();
  }

  // Strip everything after " - " dash separator (another common SEO pattern)
  if (name.includes(' - ')) {
    name = name.split(' - ')[0].trim();
  }

  // Trim excessive whitespace
  name = name.replace(/\s+/g, ' ').trim();

  // Fallback to original if cleaning produced empty string
  return name || String(rawName).trim();
}
