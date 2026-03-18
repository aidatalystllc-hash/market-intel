import type { Company, Location, ColumnMapping } from './types';
import { calcFootprint } from './footprintCalc';
import { calcMAScore } from './maScoreCalc';

/**
 * Normalize a domain string for matching: lowercase, strip protocol/www/trailing slash/path.
 */
function normalizeDomain(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')  // strip query strings and fragments
    .replace(/\/.*$/, '')     // strip paths
    .replace(/\/$/, '')
    .trim();
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

/**
 * Transform raw company rows into Company objects using the column mapping.
 */
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
      const domain = normalizeDomain(getMapped(row, locationMapping, 'domain'));
      if (!domain) continue;

      const loc: Location = {
        name: toStr(getMapped(row, locationMapping, 'name')),
        address: toStr(getMapped(row, locationMapping, 'address')),
        city: toStr(getMapped(row, locationMapping, 'city')),
        state: toStr(getMapped(row, locationMapping, 'state')),
        lat: toNum(getMapped(row, locationMapping, 'latitude')) ?? NaN,
        lng: toNum(getMapped(row, locationMapping, 'longitude')) ?? NaN,
        rating: toNum(getMapped(row, locationMapping, 'rating')),
        reviews: toNum(getMapped(row, locationMapping, 'reviews')),
        phone: toStr(getMapped(row, locationMapping, 'phone')),
        website: toStr(getMapped(row, locationMapping, 'domain')),
        hours: '',
        photos: [],
        bookingLink: '',
        googleMapsLink: '',
      };

      if (!locationsByDomain.has(domain)) {
        locationsByDomain.set(domain, []);
      }
      locationsByDomain.get(domain)!.push(loc);
    }
  }

  const companies: Company[] = [];

  for (let i = 0; i < companyRows.length; i++) {
    const row = companyRows[i];
    const domain = normalizeDomain(getMapped(row, companyMapping, 'domain'));

    // Get matched locations
    const locations = locationsByDomain.get(domain) ?? [];

    // PE detection
    const peRaw = getMapped(row, companyMapping, 'is_pe_backed');
    const peFirm = toStr(getMapped(row, companyMapping, 'pe_firm'));
    let isPE = false;
    if (peRaw) {
      const peStr = toStr(peRaw).toLowerCase();
      isPE = peStr === 'true' || peStr === 'yes' || peStr === '1' || peFirm.length > 0;
      // If the pe_backed column contains a firm name
      if (!isPE && peStr.length > 3 && peStr !== 'false' && peStr !== 'no') {
        isPE = true;
      }
    }
    if (peFirm && !isPE) isPE = true;

    // Services parsing
    const svcRaw = toStr(getMapped(row, companyMapping, 'services'));
    const services = svcRaw
      ? svcRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];

    // Location count: from data or from matched locations
    const locationCountRaw = toNum(getMapped(row, companyMapping, 'location_count'));
    const locationCount = locationCountRaw ?? locations.length ?? 1;

    // Calculate avg rating from locations if available, otherwise from company data
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

    // Employee size
    const employeeSize = toStr(getMapped(row, companyMapping, 'employee_size'));

    // Calculate lat/lng: use company data or avg of locations
    let lat = toNum(getMapped(row, companyMapping, 'latitude'));
    let lng = toNum(getMapped(row, companyMapping, 'longitude'));
    if ((lat === null || lng === null) && locations.length > 0) {
      const validLocs = locations.filter((l) => isFinite(l.lat) && isFinite(l.lng));
      if (validLocs.length > 0) {
        lat = validLocs.reduce((s, l) => s + l.lat, 0) / validLocs.length;
        lng = validLocs.reduce((s, l) => s + l.lng, 0) / validLocs.length;
      }
    }

    // State count for footprint calculation
    const states = new Set<string>();
    const companyState = toStr(getMapped(row, companyMapping, 'state'));
    if (companyState) states.add(companyState.toLowerCase());
    locations.forEach((l) => {
      if (l.state) states.add(l.state.toLowerCase());
    });

    const footprint = calcFootprint(locationCount, states.size, employeeSize);

    const company: Company = {
      id: `company-${i}`,
      name: toStr(getMapped(row, companyMapping, 'name')) || `Company ${i + 1}`,
      domain,
      lat,
      lng,
      city: toStr(getMapped(row, companyMapping, 'city')),
      state: companyState,
      description: toStr(getMapped(row, companyMapping, 'description')),
      employees: toNum(getMapped(row, companyMapping, 'employees')),
      employeeSize,
      revenue: toStr(getMapped(row, companyMapping, 'revenue')),
      founded: toNum(getMapped(row, companyMapping, 'founded')),
      footprint,
      isPE,
      peFirm: peFirm || (() => {
        const raw = toStr(getMapped(row, companyMapping, 'is_pe_backed')).trim();
        // Don't use boolean-like values as firm names
        const skip = ['yes', 'no', 'true', 'false', '1', '0', ''];
        return skip.includes(raw.toLowerCase()) ? '' : raw;
      })(),
      peType: toStr(getMapped(row, companyMapping, 'pe_type')) || (isPE ? 'Platform' : ''),
      isFamily: !isPE,
      services,
      score: toNum(getMapped(row, companyMapping, 'score')) ?? 0,
      locationCount,
      avgRating,
      totalReviews,
      linkedinUrl: toStr(getMapped(row, companyMapping, 'linkedin_url')),
      executiveName: toStr(getMapped(row, companyMapping, 'executive_name')),
      executiveTitle: toStr(getMapped(row, companyMapping, 'executive_title')),
      executiveEmail: toStr(getMapped(row, companyMapping, 'executive_email')),
      parentCompany: toStr(getMapped(row, companyMapping, 'parent_company')),
      locations,
      maScore: 0, // calculated below
    };

    company.maScore = calcMAScore(company);
    companies.push(company);
  }

  return companies;
}
