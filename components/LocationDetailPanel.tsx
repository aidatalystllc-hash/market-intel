'use client';

import { useState, useMemo } from 'react';
import type { Company, Location } from '@/lib/types';
import { ACCENT_COLOR } from '@/lib/types';
import { formatRevenue } from '@/lib/formatters';

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
}

const DISTANCE_FILTERS = [
  { label: '1 mi', miles: 1 },
  { label: '5 mi', miles: 5 },
  { label: '10 mi', miles: 10 },
  { label: '25 mi', miles: 25 },
  { label: 'All', miles: Infinity },
];

/* ── Component ── */

export default function LocationDetailPanel({
  data,
  allCompanies,
  onClose,
  onViewCompany,
}: LocationDetailPanelProps) {
  const { location, parentCompany } = data;
  const [distFilter, setDistFilter] = useState(25);

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
        if (distFilter === Infinity || distMi <= distFilter) {
          competitors.push({ company: c, loc: loc2, distKm });
        }
      }
    }

    return competitors.sort((a, b) => a.distKm - b.distKm);
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
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--acc)',
            fontWeight: 500,
            fontFamily: "'Syne', system-ui, sans-serif",
            marginBottom: 16,
            display: 'block',
          }}
        >
          Tap to view full company profile &rarr;
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
              <div style={labelStyle}>Employees</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {parentCompany.employeeSize || (parentCompany.employees ? parentCompany.employees.toLocaleString() : '—')}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Revenue</div>
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
      </div>
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
