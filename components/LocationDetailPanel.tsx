'use client';

import { useState, useMemo, useRef } from 'react';
import type { Company, Location } from '@/lib/types';
import { ACCENT_COLOR } from '@/lib/types';
import { formatRevenue } from '@/lib/formatters';

// Module-level enrichment cache shared across component instances
const locationEnrichCache = new Map<string, Record<string, unknown>>();
const companyEnrichCache = new Map<string, Record<string, unknown>>();

/* ── Helpers ── */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToMiles(km: number): number {
  return km * 0.621371;
}

function formatMiles(km: number): string {
  const mi = kmToMiles(km);
  if (mi < 0.1) return '<0.1 mi';
  return `${mi.toFixed(1)} mi`;
}

function formatUSPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    const filled = rating >= i;
    const half = !filled && rating >= i - 0.5;
    stars.push(
      <span
        key={i}
        style={{
          color: filled || half ? ACCENT_COLOR : 'var(--bd2)',
          fontSize: size,
          lineHeight: 1,
        }}
      >
        {filled ? '\u2605' : half ? '\u2605' : '\u2606'}
      </span>
    );
  }
  return <span style={{ display: 'inline-flex', gap: 1 }}>{stars}</span>;
}

const labelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 9,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--tx3)',
  marginBottom: 2,
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--tx3)',
  marginBottom: 8,
};

/* ── Generic Enriched Data Renderer ── */

function isGarbageValue(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const lower = v.toLowerCase();
  return lower.includes('page not found') || lower.includes('404') ||
    lower.includes('access denied') || lower.includes('cookie') && lower.includes('close modal') && v.length < 200;
}

function EnrichedDataRenderer({ data, accentColor }: { data: Record<string, unknown>; accentColor: string }) {
  const entries = Object.entries(data).filter(([k, v]) => !k.startsWith('_') && v != null && v !== '' && !(Array.isArray(v) && v.length === 0) && !isGarbageValue(v));

  if (entries.length === 0) {
    return <div style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic' }}>No data returned.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([key, value]) => (
        <div key={key}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: accentColor,
            marginBottom: 3,
          }}>
            {key.replace(/_/g, ' ')}
          </div>
          <EnrichedFieldValue value={value} accentColor={accentColor} />
        </div>
      ))}
    </div>
  );
}

function tryParseJSON(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const s = val.trim();
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
    try { return JSON.parse(s); } catch { return val; }
  }
  return val;
}

function EnrichedFieldValue({ value: rawValue, accentColor }: { value: unknown; accentColor: string }) {
  // Auto-parse JSON strings (API sometimes returns stringified arrays/objects)
  const value = tryParseJSON(rawValue);

  // Array of objects (e.g. recent_news, pricing, services, membership_options)
  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    // Array of strings — render as tag pills
    if (typeof value[0] === 'string') {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {(value as string[]).slice(0, 12).map((item, i) => (
            <span key={i} style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 3,
              background: `${accentColor}12`,
              color: accentColor,
              border: `1px solid ${accentColor}25`,
              fontFamily: "'JetBrains Mono', monospace",
            }}>{item}</span>
          ))}
          {value.length > 12 && (
            <span style={{ fontSize: 9, color: 'var(--tx3)' }}>+{value.length - 12} more</span>
          )}
        </div>
      );
    }

    // Array of objects — render each as a mini card
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(value as Record<string, unknown>[]).slice(0, 8).map((item, i) => (
          <div key={i} style={{
            padding: '6px 10px',
            borderRadius: 5,
            background: `${accentColor}06`,
            border: `1px solid ${accentColor}15`,
            fontSize: 11,
          }}>
            {Object.entries(item).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
              <div key={k} style={{ marginBottom: 2 }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color: 'var(--tx)',
                  marginRight: 4,
                }}>{typeof v === 'string' ? v.slice(0, 250) : JSON.stringify(v)}</span>
                {k === 'headline' || k === 'name' || k === 'service' ? null : (
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 8,
                    color: 'var(--tx3)',
                    textTransform: 'uppercase',
                  }}> ({k.replace(/_/g, ' ')})</span>
                )}
              </div>
            ))}
          </div>
        ))}
        {(value as unknown[]).length > 8 && (
          <div style={{ fontSize: 9, color: 'var(--tx3)', fontStyle: 'italic' }}>+{(value as unknown[]).length - 8} more items</div>
        )}
      </div>
    );
  }

  // Plain string / number
  if (typeof value === 'string' || typeof value === 'number') {
    return <div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.5 }}>{String(value)}</div>;
  }

  // Object (non-array) — render as a card
  if (typeof value === 'object' && value !== null) {
    return (
      <div style={{ padding: '6px 10px', borderRadius: 5, background: `${accentColor}06`, border: `1px solid ${accentColor}15`, fontSize: 11 }}>
        {Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null && v !== '').map(([k, v]) => {
          const parsed = tryParseJSON(v);
          return (
            <div key={k} style={{ marginBottom: 3 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 1 }}>{k.replace(/_/g, ' ')}</div>
              {Array.isArray(parsed) ? (
                <EnrichedFieldValue value={parsed} accentColor={accentColor} />
              ) : (
                <div style={{ color: 'var(--tx2)', fontSize: 11 }}>{typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}</div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Boolean
  if (typeof value === 'boolean') {
    return <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{value ? 'Yes' : 'No'}</div>;
  }

  return null;
}

/* ── Types ── */

export interface ClickedLocationData {
  location: Location;
  parentCompany: Company;
}

interface LocationDetailPanelProps {
  data: ClickedLocationData;
  allCompanies: Company[];
  onClose: () => void;
  onViewCompany: (company: Company) => void;
  datasetId?: string | null;
}

const DISTANCE_FILTERS = [
  { label: '< 1 mi', miles: 1.0 },
  { label: '< 5 mi', miles: 5.0 },
  { label: '< 10 mi', miles: 10.0 },
  { label: '< 25 mi', miles: 25.0 },
  { label: 'All', miles: Infinity },
];

/* ── Component ── */

export default function LocationDetailPanel({
  data,
  allCompanies,
  onClose,
  onViewCompany,
  datasetId,
}: LocationDetailPanelProps) {
  const { location, parentCompany } = data;
  const [distFilter, setDistFilter] = useState(25.0);

  // Build nearby competitor locations from all companies
  const nearbyCompetitors = useMemo(() => {
    if (!isFinite(location.lat) || !isFinite(location.lng)) return [];

    const competitors: {
      company: Company;
      loc: Location;
      distKm: number;
    }[] = [];

    for (const c of allCompanies) {
      if (c.id === parentCompany.id) continue;
      for (const loc2 of c.locations) {
        if (!isFinite(loc2.lat) || !isFinite(loc2.lng)) continue;
        const distKm = haversineKm(location.lat, location.lng, loc2.lat, loc2.lng);
        const distMi = kmToMiles(distKm);
        if (distFilter === Infinity || distMi < distFilter) {
          competitors.push({ company: c, loc: loc2, distKm });
        }
      }
    }

    // Deduplicate: same name + same address = same location
    const seen = new Set<string>();
    const deduped = competitors.filter((c) => {
      const key = `${c.loc.name}|${c.loc.address}|${c.loc.lat.toFixed(4)}|${c.loc.lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.sort((a, b) => a.distKm - b.distKm);
  }, [location, parentCompany.id, allCompanies, distFilter]);

  // Competitor ranking stats
  const rankingStats = useMemo(() => {
    const thisRating = location.rating ?? 0;
    const thisReviews = location.reviews ?? 0;
    const thisPhotos = location.photosCount ?? 0;

    if (nearbyCompetitors.length === 0) {
      return {
        avgRating: { thisLoc: thisRating, areaAvg: 0, rank: 1 },
        reviews: { thisLoc: thisReviews, areaAvg: 0, rank: 1 },
        photos: { thisLoc: thisPhotos, areaAvg: 0, rank: 1 },
      };
    }

    const allRatings = nearbyCompetitors
      .map((c) => c.loc.rating ?? 0)
      .concat(thisRating);
    const allReviews = nearbyCompetitors
      .map((c) => c.loc.reviews ?? 0)
      .concat(thisReviews);
    const allPhotos = nearbyCompetitors
      .map((c) => c.loc.photosCount ?? 0)
      .concat(thisPhotos);

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

    // Rank: how many are better + 1
    const ratingRank = allRatings.filter((r) => r > thisRating).length + 1;
    const reviewRank = allReviews.filter((r) => r > thisReviews).length + 1;
    const photoRank = allPhotos.filter((r) => r > thisPhotos).length + 1;

    return {
      avgRating: { thisLoc: thisRating, areaAvg: avg(allRatings), rank: ratingRank },
      reviews: { thisLoc: thisReviews, areaAvg: avg(allReviews), rank: reviewRank },
      photos: { thisLoc: thisPhotos, areaAvg: avg(allPhotos), rank: photoRank },
    };
  }, [location, nearbyCompetitors]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100vh',
        background: 'var(--bg2)',
        borderLeft: '1px solid var(--bd)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
        zIndex: 10000,
        overflowY: 'auto',
        overflowX: 'hidden',
        fontFamily: "'Syne', system-ui, sans-serif",
        fontSize: 13,
        color: 'var(--tx)',
        animation: 'slideInRight 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Close button */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '10px 14px 0',
          background: 'var(--bg2)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid var(--bd)',
            background: 'var(--bg3)',
            color: 'var(--tx2)',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bd)';
            e.currentTarget.style.color = 'var(--tx)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg3)';
            e.currentTarget.style.color = 'var(--tx2)';
          }}
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>

      {/* ── Scope Banner: LOCATION-SPECIFIC (very prominent) ── */}
      <div style={{
        margin: '0 0 8px',
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #1a7040, #2a9050)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>📍</span>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#fff',
          }}>
            Location Profile
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
            {location.city && location.state ? `${location.city}, ${location.state}` : 'Individual branch'} &middot; Single location data
          </div>
        </div>
      </div>

      <div style={{ padding: '6px 20px 28px' }}>
        {/* ── Header: Parent company logo + name + link ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <img
            src={`/api/logo?domain=${encodeURIComponent(parentCompany.domain)}`}
            alt=""
            width={48}
            height={48}
            style={{
              borderRadius: 8,
              border: '1px solid var(--bd)',
              background: 'var(--bg3)',
              objectFit: 'contain',
              flexShrink: 0,
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 21,
                fontWeight: 700,
                color: 'var(--tx)',
                lineHeight: 1.2,
                wordBreak: 'break-word',
              }}
            >
              {parentCompany.name}
            </div>
          </div>
        </div>
        <button
          onClick={() => onViewCompany(parentCompany)}
          style={{
            width: '100%',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 11,
            color: '#1a4f96',
            fontWeight: 600,
            fontFamily: "'Syne', system-ui, sans-serif",
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: 'rgba(26,79,150,0.05)',
            border: '1.5px solid rgba(26,79,150,0.20)',
            borderRadius: 6,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(26,79,150,0.10)';
            e.currentTarget.style.borderColor = 'rgba(26,79,150,0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(26,79,150,0.05)';
            e.currentTarget.style.borderColor = 'rgba(26,79,150,0.20)';
          }}
        >
          🏢 View Full Company Profile &rarr;
        </button>

        {/* ── THIS LOCATION ── */}
        <Section title="This Location">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <div style={labelStyle}>Name</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{location.name || '—'}</div>
            </div>
            <div>
              <div style={labelStyle}>Address</div>
              <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
                {location.address || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
                {[location.city, location.state].filter(Boolean).join(', ')}
              </div>
            </div>
            {location.phone && (
              <div>
                <div style={labelStyle}>Phone</div>
                <a
                  href={`tel:${location.phone.replace(/[^\d+]/g, '')}`}
                  style={{ fontSize: 12, color: 'var(--tx2)', textDecoration: 'none', fontWeight: 500 }}
                >
                  {formatUSPhone(location.phone)}
                </a>
              </div>
            )}
            {location.hours && (
              <div>
                <div style={labelStyle}>Hours</div>
                <div style={{ fontSize: 11, color: 'var(--tx2)', whiteSpace: 'pre-wrap' }}>
                  {location.hours}
                </div>
              </div>
            )}
            {location.rating !== null && location.rating > 0 && (
              <div>
                <div style={labelStyle}>Rating</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StarRating rating={location.rating} size={14} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT_COLOR }}>
                    {location.rating.toFixed(1)}
                  </span>
                  {location.reviews !== null && (
                    <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                      ({location.reviews.toLocaleString()} reviews)
                    </span>
                  )}
                </div>
              </div>
            )}
            {location.photosCount !== null && location.photosCount > 0 && (
              <div>
                <div style={labelStyle}>Photos</div>
                <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
                  {location.photosCount.toLocaleString()} photos
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ── PARENT COMPANY OVERVIEW ── */}
        <Section title="Parent Company Overview">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px 16px',
            }}
          >
            <div>
              <div style={labelStyle}>Est. Employees</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {parentCompany.employeeSize || (parentCompany.employees ? `~${parentCompany.employees.toLocaleString()}` : '—')}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Est. Revenue</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {formatRevenue(parentCompany.revenue)}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Founded</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {parentCompany.founded ? String(parentCompany.founded) : '—'}
              </div>
            </div>
            <div>
              <div style={labelStyle}>HQ</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {[parentCompany.city, parentCompany.state].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
          </div>
        </Section>

        {/* ── NEARBY COMPETITORS ── */}
        <Section title="Nearby Competitors">
          {/* Distance filter buttons */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {DISTANCE_FILTERS.map((df) => (
              <button
                key={df.label}
                onClick={() => setDistFilter(df.miles)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: '1px solid',
                  borderColor: distFilter === df.miles ? ACCENT_COLOR : 'var(--bd)',
                  background: distFilter === df.miles ? ACCENT_COLOR + '18' : 'var(--bg)',
                  color: distFilter === df.miles ? ACCENT_COLOR : 'var(--tx2)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'all 0.12s',
                }}
              >
                {df.label}
              </button>
            ))}
          </div>

          {nearbyCompetitors.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic' }}>
              No competitors found within this range.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxHeight: 220,
                  overflowY: 'auto',
                  marginBottom: 14,
                }}
              >
                {nearbyCompetitors.slice(0, 20).map(({ company: c, loc, distKm }, idx) => (
                  <div
                    key={`${c.id}-${idx}`}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid var(--bd)',
                      borderRadius: 6,
                      background: 'var(--bg)',
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: 12 }}>
                        {loc.name || c.name}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: 'var(--tx3)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {formatMiles(distKm)}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 1 }}>
                      {loc.address ? `${loc.address}, ` : ''}
                      {[loc.city, loc.state].filter(Boolean).join(', ')}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 10, color: 'var(--tx2)' }}>
                      {loc.rating !== null && (
                        <span>
                          {'\u2605'} {loc.rating.toFixed(1)}
                        </span>
                      )}
                      {loc.reviews !== null && (
                        <span>{loc.reviews.toLocaleString()} reviews</span>
                      )}
                      {loc.photosCount !== null && (
                        <span>{loc.photosCount.toLocaleString()} photos</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Competitor Ranking Table */}
              <div style={sectionTitleStyle}>Competitor Ranking</div>
              <div
                style={{
                  border: '1px solid var(--bd)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  fontSize: 10,
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg3)' }}>
                      <th style={thStyle}>Metric</th>
                      <th style={thStyle}>This Location</th>
                      <th style={thStyle}>Area Avg</th>
                      <th style={thStyle}>Your Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: '1px solid var(--bd)' }}>
                      <td style={tdStyle}>Avg Rating</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {rankingStats.avgRating.thisLoc.toFixed(1)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {rankingStats.avgRating.areaAvg.toFixed(1)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: ACCENT_COLOR }}>
                        #{rankingStats.avgRating.rank}
                      </td>
                    </tr>
                    <tr style={{ borderTop: '1px solid var(--bd)' }}>
                      <td style={tdStyle}># Reviews</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {rankingStats.reviews.thisLoc.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {Math.round(rankingStats.reviews.areaAvg).toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: ACCENT_COLOR }}>
                        #{rankingStats.reviews.rank}
                      </td>
                    </tr>
                    <tr style={{ borderTop: '1px solid var(--bd)' }}>
                      <td style={tdStyle}># Photos</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {rankingStats.photos.thisLoc.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {Math.round(rankingStats.photos.areaAvg).toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: ACCENT_COLOR }}>
                        #{rankingStats.photos.rank}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        {/* ── Location Enrichment (prominent, green-themed) ── */}
        <div style={{
          margin: '0 0 20px',
          padding: 14,
          background: 'linear-gradient(135deg, rgba(26,112,64,0.04), rgba(26,112,64,0.01))',
          border: '2px solid rgba(26,112,64,0.20)',
          borderRadius: 10,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#1a7040',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>📍</span>
            Enrich This Location
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 10, lineHeight: 1.4 }}>
            Searches for this specific location&apos;s page to get hours, pricing, services, and amenities for <strong style={{ color: 'var(--tx2)' }}>{location.city ? `${location.name || parentCompany.name} in ${location.city}, ${location.state}` : 'this branch'}</strong>.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <LocationEnrichButton domain={parentCompany.domain} enrichType="location-news" label="📰 News" desc="Local news & events" locationName={location.name} locationCity={location.city} locationState={location.state} datasetId={datasetId} />
            <LocationEnrichButton domain={parentCompany.domain} enrichType="location-pricing" label="💰 Pricing" desc="Memberships & pricing" locationName={location.name} locationCity={location.city} locationState={location.state} datasetId={datasetId} />
            <LocationEnrichButton domain={parentCompany.domain} enrichType="location-detail" label="🛠 Services" desc="Hours, amenities, staff" locationName={location.name} locationCity={location.city} locationState={location.state} datasetId={datasetId} />
          </div>
        </div>

        {/* ── Company-Wide Enrichment (separate, blue-themed) ── */}
        <div style={{
          margin: '0 0 20px',
          padding: 14,
          background: 'linear-gradient(135deg, rgba(26,79,150,0.04), rgba(26,79,150,0.01))',
          border: '2px solid rgba(26,79,150,0.15)',
          borderRadius: 10,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#1a4f96',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>🏢</span>
            Company-Wide Enrichment
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 10, lineHeight: 1.4 }}>
            These enrich data about <strong style={{ color: 'var(--tx2)' }}>{parentCompany.name}</strong> as a whole — all locations, not just this one.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <CompanyEnrichButton domain={parentCompany.domain} enrichType="recent-news" label="📰 News" desc="Growth, openings" datasetId={datasetId} />
            <CompanyEnrichButton domain={parentCompany.domain} enrichType="services-pricing" label="💰 Pricing" desc="Plans & pricing" datasetId={datasetId} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Spinner ── */

function Spinner({ color }: { color: string }) {
  return (
    <>
      <style>{`
        @keyframes enrichSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <span style={{
        display: 'inline-block', width: 12, height: 12, border: `2px solid ${color}30`,
        borderTopColor: color, borderRadius: '50%', animation: 'enrichSpin 0.8s linear infinite',
        flexShrink: 0,
      }} />
    </>
  );
}

/* ── Enrich Button Components ── */

function LocationEnrichButton({ domain, enrichType, label, desc, locationName, locationCity, locationState, datasetId }: { domain: string; enrichType: string; label: string; desc: string; locationName: string; locationCity?: string; locationState?: string; datasetId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [isCached, setIsCached] = useState(false);

  const cacheKey = `${domain}:${enrichType}:${locationName}:${locationCity}:${locationState}`;

  const handleEnrich = async (forceRefresh = false) => {
    if (loading) return;
    if (!forceRefresh) {
      const cached = locationEnrichCache.get(cacheKey);
      if (cached) {
        setResult(cached);
        setIsCached(true);
        setError('');
        return;
      }
    }
    setLoading(true);
    setError('');
    setResult(null);
    setIsCached(false);
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, enrichType, locationName, locationCity, locationState, datasetId }),
      });
      if (!res.ok && res.status >= 500) {
        setError('The server took too long to respond. Try again in a moment.');
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.enrichedData && Object.keys(data.enrichedData).filter((k: string) => !k.startsWith('_') && data.enrichedData[k]).length > 0) {
        setResult(data.enrichedData);
        locationEnrichCache.set(cacheKey, data.enrichedData);
      } else {
        setError(`No ${enrichType === 'location-news' ? 'recent news' : enrichType === 'location-pricing' ? 'pricing info' : 'data'} found for this location. The website may not have a dedicated page for this branch.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('timeout') || msg.includes('AbortError')) {
        setError('Search timed out. The website may be slow or blocking automated access. Try again in a moment.');
      } else {
        setError(`Could not reach the enrichment service. Check your internet connection and try again.`);
      }
    } finally { setLoading(false); }
  };

  return (
    <div>
      <button onClick={() => handleEnrich(false)} disabled={loading} style={{
        width: '100%', padding: '7px 6px', border: '1px solid rgba(26,112,64,0.3)', borderRadius: 5,
        background: loading ? 'rgba(26,112,64,0.08)' : 'rgba(26,112,64,0.04)',
        cursor: loading ? 'default' : 'pointer',
        textAlign: 'left',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            <Spinner color="#1a7040" />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#1a7040' }}>Searching...</div>
              <div style={{ fontSize: 8, color: 'var(--tx3)' }}>This may take 15-30 seconds</div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1a7040' }}>{label}</div>
            <div style={{ fontSize: 9, color: 'var(--tx3)' }}>{desc}</div>
          </>
        )}
      </button>
      {error && (
        <div style={{ fontSize: 9, color: '#b03a1a', marginTop: 4, padding: '4px 8px', background: 'rgba(176,58,26,0.04)', border: '1px solid rgba(176,58,26,0.12)', borderRadius: 4, lineHeight: 1.4 }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 6, padding: 8, background: 'rgba(26,112,64,0.03)', border: '1px solid rgba(26,112,64,0.12)', borderRadius: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1a7040', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>📍 Location Data</span>
            {isCached && (
              <>
                <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(176,125,16,0.1)', color: '#b07d10', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 8 }}>Cached</span>
                <button onClick={() => handleEnrich(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: ACCENT_COLOR, fontSize: 9, fontWeight: 500 }}>Re-enrich</button>
              </>
            )}
          </div>
          <EnrichedDataRenderer data={result} accentColor="#1a7040" />
          <div style={{ fontSize: 9, color: 'var(--tx3)', fontStyle: 'italic', marginTop: 4 }}>Enriched {new Date().toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  );
}

function CompanyEnrichButton({ domain, enrichType, label, desc, datasetId }: { domain: string; enrichType: string; label: string; desc: string; datasetId?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [isCached, setIsCached] = useState(false);

  const cacheKey = `${domain}:${enrichType}`;

  const handleEnrich = async (forceRefresh = false) => {
    if (loading) return;
    if (!forceRefresh) {
      const cached = companyEnrichCache.get(cacheKey);
      if (cached) {
        setResult(cached);
        setIsCached(true);
        setError('');
        return;
      }
    }
    setLoading(true);
    setResult(null);
    setError('');
    setIsCached(false);
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, enrichType, datasetId }),
      });
      if (!res.ok && res.status >= 500) {
        setError('The server took too long to respond. Try again in a moment.');
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.enrichedData) {
        const fields = Object.keys(data.enrichedData).filter((k: string) => !k.startsWith('_') && data.enrichedData[k]);
        if (fields.length > 0) {
          setResult(data.enrichedData);
          companyEnrichCache.set(cacheKey, data.enrichedData);
        } else {
          setError(`No ${enrichType === 'recent-news' ? 'recent news' : 'pricing info'} found on ${domain}. The site may not publish this information online.`);
        }
      } else {
        setError(`No data found on ${domain}.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('timeout') || msg.includes('AbortError')) {
        setError('Search timed out. The website may be slow or blocking automated access. Try again in a moment.');
      } else {
        setError('Could not reach the enrichment service. Check your internet connection and try again.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div>
      <button onClick={() => handleEnrich(false)} disabled={loading} style={{
        width: '100%', padding: '7px 6px', border: '1px solid var(--bd)', borderRadius: 5,
        background: loading ? 'var(--bg4, var(--bg3))' : 'var(--bg3)',
        cursor: loading ? 'default' : 'pointer',
        textAlign: 'left',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            <Spinner color="#1a4f96" />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#1a4f96' }}>Searching...</div>
              <div style={{ fontSize: 8, color: 'var(--tx3)' }}>This may take 15-30 seconds</div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>{label}</div>
            <div style={{ fontSize: 9, color: 'var(--tx3)' }}>{desc}</div>
          </>
        )}
      </button>
      {error && (
        <div style={{ fontSize: 9, color: '#b03a1a', marginTop: 4, padding: '4px 8px', background: 'rgba(176,58,26,0.04)', border: '1px solid rgba(176,58,26,0.12)', borderRadius: 4, lineHeight: 1.4 }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 6, padding: 8, background: 'rgba(26,79,150,0.03)', border: '1px solid rgba(26,79,150,0.12)', borderRadius: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1a4f96', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>🏢 Company Data</span>
            {isCached && (
              <>
                <span style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(176,125,16,0.1)', color: '#b07d10', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 8 }}>Cached</span>
                <button onClick={() => handleEnrich(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: ACCENT_COLOR, fontSize: 9, fontWeight: 500 }}>Re-enrich</button>
              </>
            )}
          </div>
          <EnrichedDataRenderer data={result} accentColor="#1a4f96" />
          <div style={{ fontSize: 9, color: 'var(--tx3)', fontStyle: 'italic', marginTop: 4 }}>Enriched {new Date().toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 9,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--tx3)',
  textAlign: 'left',
};

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 11,
  color: 'var(--tx)',
  fontFamily: "'JetBrains Mono', monospace",
};
