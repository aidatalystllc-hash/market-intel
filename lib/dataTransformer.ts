import type { Company, Location, ColumnMapping } from './types';
import { calcFootprint } from './footprintCalc';
import { calcMAScore } from './maScoreCalc';
import { cleanCompanyName } from './formatters';

function normalizeDomain(raw: unknown): string {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim();
  // Remove protocol
  s = s.replace(/^https?:\/\//, '');
  // Remove www. prefix
  s = s.replace(/^www\./, '');
  // Remove everything after the first slash (strip paths)
  s = s.split('/')[0];
  // Remove query strings and fragments
  s = s.split('?')[0].split('#')[0];
  // Remove port numbers
  s = s.replace(/:\d+$/, '');
  // Remove trailing dots
  s = s.replace(/\.$/, '');
  return s;
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function toStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function getMapped(row: Record<string, unknown>, mapping: ColumnMapping, field: string): unknown {
  for (const [col, mapped] of Object.entries(mapping)) {
    if (mapped === field) return row[col];
  }
  return undefined;
}

// Values that should NOT be treated as PE firm names
const NON_PE_VALUES = new Set([
  'private', 'privately held', 'self-owned', 'self owned', 'self-employed',
  'family owned', 'family-owned', 'independent', 'n/a', '—', '', 'public',
  'publicly traded', 'public company', 'government', 'nonprofit', 'non-profit',
  'educational', 'partnership',
]);

/**
 * Determine if a company is PE-backed using only the Investors (PEI) columns.
 * Never use "Ownership status" or "Company Type" for PE detection.
 */
function detectPE(row: Record<string, unknown>, mapping: ColumnMapping): {
  isPE: boolean;
  peFirm: string;
  peType: string;
} {
  const peTypeRaw = toStr(getMapped(row, mapping, 'is_pe_backed')).trim();
  const peFirmRaw = toStr(getMapped(row, mapping, 'pe_firm')).trim();

  // Check if the pe_type has a real value (not a generic ownership status)
  const peTypeLower = peTypeRaw.toLowerCase();
  const peFirmLower = peFirmRaw.toLowerCase();

  const hasRealType = peTypeLower.length > 0 && !NON_PE_VALUES.has(peTypeLower);
  const hasRealFirm = peFirmLower.length > 0 && !NON_PE_VALUES.has(peFirmLower)
    && !peFirmLower.startsWith('http');

  const isPE = hasRealType || hasRealFirm;
  // Strip URLs from PE firm name (e.g., "Main Post Partners (http://www.mainpostpartners.com)" → "Main Post Partners")
  const peFirm = hasRealFirm ? peFirmRaw.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim() : '';
  const peType = hasRealType ? peTypeRaw : (isPE ? 'Platform' : '');

  return { isPE, peFirm, peType };
}

/**
 * Extract a clean company name, preferring "Name" over URL-based "Company" column.
 */
function extractName(row: Record<string, unknown>, mapping: ColumnMapping, index: number): string {
  // Priority: name field (from "Name" column) > "Name (LinkedIn)" > domain-based fallback
  const rawName = toStr(getMapped(row, mapping, 'name'));

  // If the "name" field looks like a real name (not a URL), clean and return
  if (rawName && !rawName.startsWith('http') && !/\.(com|org|net|co|io|us|biz|info)\b/.test(rawName)) {
    return cleanCompanyName(rawName);
  }

  const name = rawName;

  // Fallback: clean up a URL into a readable name
  if (name) {
    const cleaned = name
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .replace(/\.(com|org|net|co|io|us).*$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (cleaned.length > 2) return cleaned;
  }

  return `Company ${index + 1}`;
}

export function transformCompanies(
  companyRows: Record<string, unknown>[],
  companyMapping: ColumnMapping,
  locationRows: Record<string, unknown>[] | null,
  locationMapping: ColumnMapping | null
): Company[] {
  // Build location lookup by domain
  const locationsByDomain = new Map<string, Location[]>();

  if (locationRows && locationMapping) {
    for (const row of locationRows) {
      // Try mapped domain first, then check common domain columns directly
      let domain = normalizeDomain(getMapped(row, locationMapping, 'domain'));
      if (!domain) {
        // Fallback: try raw column names that commonly contain domains
        for (const key of ['Domain', 'domain', 'Website', 'website', 'site', 'Site']) {
          if (row[key]) { domain = normalizeDomain(row[key]); break; }
        }
      }
      // Also index under alternative domain columns for better matching
      const altDomain = normalizeDomain(row['Domain'] || row['domain'] || '');

      if (!domain && !altDomain) continue;

      const loc: Location = {
        name: toStr(getMapped(row, locationMapping, 'name')),
        address: toStr(getMapped(row, locationMapping, 'address')),
        city: toStr(getMapped(row, locationMapping, 'city')),
        state: toStr(getMapped(row, locationMapping, 'state')),
        lat: toNum(getMapped(row, locationMapping, 'latitude')) ?? NaN,
        lng: toNum(getMapped(row, locationMapping, 'longitude')) ?? NaN,
        rating: toNum(getMapped(row, locationMapping, 'rating')),
        reviews: toNum(getMapped(row, locationMapping, 'reviews')),
        photosCount: toNum(getMapped(row, locationMapping, 'photos_count')),
        phone: toStr(getMapped(row, locationMapping, 'phone')),
        website: toStr(getMapped(row, locationMapping, 'domain')),
        hours: toStr(getMapped(row, locationMapping, 'hours') || row['working_hours'] || ''),
        photos: [],
        bookingLink: '',
        googleMapsLink: '',
      };

      // Index under both domain variants, but only if they're different
      const domainsToIndex = Array.from(new Set([domain, altDomain].filter(Boolean)));
      for (const d of domainsToIndex) {
        if (!locationsByDomain.has(d)) {
          locationsByDomain.set(d, []);
        }
        locationsByDomain.get(d)!.push(loc);
      }
    }
  }

  const companies: Company[] = [];

  for (let i = 0; i < companyRows.length; i++) {
    const row = companyRows[i];
    const domain = normalizeDomain(getMapped(row, companyMapping, 'domain'));
    const locations = locationsByDomain.get(domain) ?? [];

    // PE detection — uses ONLY Investors (PEI) columns
    const { isPE, peFirm, peType } = detectPE(row, companyMapping);

    // Services parsing
    const svcRaw = toStr(getMapped(row, companyMapping, 'services'));
    const services = svcRaw
      ? svcRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];

    // Location count
    const locationCountRaw = toNum(getMapped(row, companyMapping, 'location_count'));
    const locationCount = locationCountRaw ?? (locations.length || 1);

    // Ratings from locations or company data
    const companyRating = toNum(getMapped(row, companyMapping, 'rating'));
    const companyReviews = toNum(getMapped(row, companyMapping, 'reviews'));
    let avgRating = companyRating;
    let totalReviews = companyReviews;
    if (locations.length > 0) {
      const rated = locations.filter((l) => l.rating !== null);
      if (rated.length > 0) {
        avgRating = rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length;
        avgRating = Math.round(avgRating * 10) / 10;
      }
      const reviewed = locations.filter((l) => l.reviews !== null);
      if (reviewed.length > 0) {
        totalReviews = reviewed.reduce((s, l) => s + (l.reviews ?? 0), 0);
      }
    }

    // Total photos from locations
    let totalPhotos: number | null = null;
    if (locations.length > 0) {
      const withPhotos = locations.filter((l) => l.photosCount !== null);
      if (withPhotos.length > 0) {
        totalPhotos = withPhotos.reduce((s, l) => s + (l.photosCount ?? 0), 0);
      }
    }

    // Employee size — prefer LinkedIn size range
    const employeeSize = toStr(getMapped(row, companyMapping, 'employee_size'));

    // State — prefer HQ State (LinkedIn) for accuracy, fallback to mapped state
    const hqState = toStr(getMapped(row, companyMapping, 'hq_state'));
    const companyState = hqState || toStr(getMapped(row, companyMapping, 'state'));

    // City
    const companyCity = toStr(getMapped(row, companyMapping, 'city'));

    // Lat/lng — from company data or avg of locations
    let lat = toNum(getMapped(row, companyMapping, 'latitude'));
    let lng = toNum(getMapped(row, companyMapping, 'longitude'));
    if ((lat === null || lng === null) && locations.length > 0) {
      const validLocs = locations.filter((l) => isFinite(l.lat) && isFinite(l.lng));
      if (validLocs.length > 0) {
        lat = validLocs.reduce((s, l) => s + l.lat, 0) / validLocs.length;
        lng = validLocs.reduce((s, l) => s + l.lng, 0) / validLocs.length;
      }
    }

    // State count for footprint
    const states = new Set<string>();
    if (companyState) states.add(companyState.toLowerCase());
    locations.forEach((l) => { if (l.state) states.add(l.state.toLowerCase()); });

    const footprint = calcFootprint(locationCount, states.size, employeeSize);

    // Executive data — try mapped fields first, fall back to Apollo data
    let execName = toStr(getMapped(row, companyMapping, 'executive_name'));
    let execTitle = toStr(getMapped(row, companyMapping, 'executive_title'));
    let execEmail = toStr(getMapped(row, companyMapping, 'executive_email'));
    const execPhone = toStr(getMapped(row, companyMapping, 'executive_phone'));

    // Fall back to Apollo contact data if primary fields are empty
    const apolloFirst = toStr(getMapped(row, companyMapping, 'apollo_first_name'));
    const apolloLast = toStr(getMapped(row, companyMapping, 'apollo_last_name'));
    if (!execName && (apolloFirst || apolloLast)) {
      execName = [apolloFirst, apolloLast].filter(Boolean).join(' ');
    }
    // Apollo title fallback — check the raw column directly
    if (!execTitle) {
      execTitle = toStr(row['Apollo contact data_title_1']);
    }
    // Apollo email fallback
    if (!execEmail) {
      execEmail = toStr(row['Apollo contact data_email_1']);
    }

    const company: Company = {
      id: `company-${i}`,
      name: extractName(row, companyMapping, i),
      domain,
      lat,
      lng,
      city: companyCity,
      state: companyState,
      description: toStr(getMapped(row, companyMapping, 'description')),
      employees: toNum(getMapped(row, companyMapping, 'employees')),
      employeeSize,
      revenue: toStr(getMapped(row, companyMapping, 'revenue')),
      founded: toNum(getMapped(row, companyMapping, 'founded')),
      footprint,
      isPE,
      peFirm,
      peType,
      isFamily: false, // No reliable family-owned indicator in the data
      services,
      score: toNum(getMapped(row, companyMapping, 'score')) ?? 0,
      locationCount,
      avgRating,
      totalReviews,
      totalPhotos,
      linkedinUrl: toStr(getMapped(row, companyMapping, 'linkedin_url')),
      executiveName: execName,
      executiveTitle: execTitle,
      executiveEmail: execEmail,
      executivePhone: toStr(getMapped(row, companyMapping, 'executive_phone')),
      parentCompany: toStr(getMapped(row, companyMapping, 'parent_company')),
      locations,
      maScore: 0,
    };

    company.maScore = calcMAScore(company);
    companies.push(company);
  }

  return companies;
}
