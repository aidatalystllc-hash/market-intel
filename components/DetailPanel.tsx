'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Company, Location } from '@/lib/types';
import { FOOTPRINT_COLORS, PE_COLOR, ACCENT_COLOR } from '@/lib/types';
import { getMALabel } from '@/lib/maScoreCalc';
import { formatRevenue } from '@/lib/formatters';

/* ── Helpers ── */

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

function getStatesServedLabel(company: Company): string {
  const states = new Set();
  if (company.state) states.add(company.state.toLowerCase());
  company.locations.forEach((l) => { if (l.state) states.add(l.state.toLowerCase()); });
  const count = states.size;
  if (count >= 10) return `Nationwide (${count} states)`;
  if (count >= 2) return `${count} states`;
  return company.state || '—';
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

const label: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 9,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--tx3)',
  marginBottom: 2,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--tx3)',
  marginBottom: 8,
};

/* ── Props ── */

interface DetailPanelProps {
  company: Company | null;
  allCompanies: Company[];
  onClose: () => void;
  onSelectCompany: (company: Company) => void;
  onSelectLocation?: (company: Company, location: Location) => void;
  datasetId?: string | null;
}

// Module-level enrichment cache — persists across component unmount/remount
const detailPanelEnrichCache = new Map<string, Record<string, unknown>>();

/* ── Component ── */

export default function DetailPanel({
  company,
  allCompanies,
  onClose,
  onSelectCompany,
  onSelectLocation,
  datasetId,
}: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');
  const [enrichedData, setEnrichedData] = useState<Record<string, unknown> | null>(null);
  const [lastEnrichType, setLastEnrichType] = useState<string>('');
  const [isCachedResult, setIsCachedResult] = useState(false);
  const [showScoreInfo, setShowScoreInfo] = useState(false);

  // Cache ref points to module-level cache so it persists across unmount/remount
  const enrichCacheRef = useRef(detailPanelEnrichCache);

  // Reset state on company change
  useEffect(() => {
    if (!company) return;
    setAnimatedScore(0);
    setEnriching(false);
    setEnrichMsg('');
    setEnrichedData(null);
    setLastEnrichType('');
    setIsCachedResult(false);
    const timer = setTimeout(() => setAnimatedScore(company.score), 60);
    return () => clearTimeout(timer);
  }, [company?.id, company?.score, company]);

  // Top competitors: ranked by relevance (overlapping states, similar size)
  // Must be before any early returns to satisfy Rules of Hooks
  const topCompetitors = useMemo(() => {
    if (!company) return [];
    const companyStates = new Set();
    if (company.state) companyStates.add(company.state.toLowerCase());
    company.locations.forEach((l) => { if (l.state) companyStates.add(l.state.toLowerCase()); });

    return allCompanies
      .filter((c) => c.id !== company.id)
      .map((c) => {
        let score = 0;
        const cStates = new Set();
        if (c.state) cStates.add(c.state.toLowerCase());
        c.locations.forEach((l) => { if (l.state) cStates.add(l.state.toLowerCase()); });
        const overlap = Array.from(companyStates).filter((s) => cStates.has(s)).length;
        score += overlap * 10;
        const locDiff = Math.abs(c.locationCount - company.locationCount);
        score += Math.max(0, 20 - locDiff);
        if (c.footprint === company.footprint) score += 5;
        return { company: c, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [company, allCompanies]);

  if (!company) {
    return (
      <div
        style={{
          position: 'fixed',
          right: -400,
          top: 0,
          bottom: 0,
          width: 380,
        }}
      />
    );
  }

  const ma = getMALabel(company.maScore);
  const barColor =
    company.maScore >= 70 ? '#1a7040' : company.maScore >= 40 ? ACCENT_COLOR : '#b03a1a';

  // M&A breakdown factors
  const maFactors: { name: string; met: boolean }[] = [
    { name: 'Not PE-backed', met: !company.isPE },
    {
      name: '3-20 locations',
      met: company.locationCount >= 3 && company.locationCount <= 20,
    },
    { name: 'Avg rating >= 4.5', met: (company.avgRating ?? 0) >= 4.5 },
    { name: '50+ reviews', met: (company.totalReviews ?? 0) >= 50 },
    {
      name: 'Recurring revenue signal',
      met: (company.services || []).some(
        (s) =>
          s.toLowerCase().includes('membership') || s.toLowerCase().includes('subscription')
      ),
    },
    { name: 'Founded before 2015', met: (company.founded ?? 9999) < 2015 },
  ];

  const overviewItems = [
    {
      label: 'Location',
      value: [company.city, company.state].filter(Boolean).join(', ') || '—',
    },
    {
      label: 'States Served',
      value: getStatesServedLabel(company),
    },
    {
      label: 'Est. Employees',
      value: company.employeeSize
        || (company.employees ? `~${company.employees.toLocaleString()}` : '—'),
    },
    { label: 'Locations', value: String(company.locationCount || 1) },
    { label: 'Est. Revenue', value: formatRevenue(company.revenue) },
    { label: 'Founded', value: company.founded ? String(company.founded) : '—' },
    { label: 'Parent Company', value: company.parentCompany || '—' },
  ];

  return (
    <div
      ref={panelRef}
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

      {/* ── Close button (sticky) ── */}
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

      {/* ── Scope Banner: COMPANY-WIDE (very prominent) ── */}
      <div style={{
        margin: '0 0 8px',
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #1a4f96, #2a6fc6)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>🏢</span>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#fff',
          }}>
            Company Profile
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
            All {company.locationCount || 1} locations &middot; Company-wide data
          </div>
        </div>
      </div>

      {/* ── Content wrapper ── */}
      <div style={{ padding: '6px 20px 28px' }}>
        {/* ── Header: logo + name + domain ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <img
            src={`/api/logo?domain=${encodeURIComponent(company.domain)}`}
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
              {company.name}
            </div>
            {company.domain && (
              <a
                href={`https://${company.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11,
                  color: 'var(--acc)',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                {company.domain}
              </a>
            )}
          </div>
        </div>

        {/* ── Badges ── */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
          <Badge
            text={company.footprint === 'local' ? 'Single Loc' : company.footprint}
            bg={FOOTPRINT_COLORS[company.footprint] || FOOTPRINT_COLORS.local}
          />
          {company.isPE && <Badge text="PE-BACKED" bg={PE_COLOR} />}
          {(company.services || []).slice(0, 4).map((svc) => (
            <span
              key={svc}
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--tx2)',
                background: 'var(--bg3)',
                border: '1px solid var(--bd)',
              }}
            >
              {svc}
            </span>
          ))}
        </div>

        {/* ── About ── */}
        {company.description && (
          <Section title="About">
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--tx2)',
                margin: 0,
              }}
            >
              {company.description}
            </p>
          </Section>
        )}

        {/* ── Overview grid ── */}
        <Section title="Overview">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px 16px',
            }}
          >
            {overviewItems.map((item) => (
              <div key={item.label}>
                <div style={label}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Rating widget ── */}
        {company.avgRating !== null && company.avgRating > 0 && (
          <Section title="Rating">
            <div
              style={{
                background: `linear-gradient(135deg, rgba(176,125,16,0.08), rgba(176,125,16,0.03))`,
                border: '1px solid rgba(176,125,16,0.18)',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: ACCENT_COLOR,
                  lineHeight: 1,
                  fontFamily: "'Syne', system-ui, sans-serif",
                }}
              >
                {company.avgRating.toFixed(1)}
              </div>
              <div>
                <StarRating rating={company.avgRating} size={16} />
                {company.totalReviews !== null && (
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                    {company.totalReviews.toLocaleString()} total reviews
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* ── M&A Attractiveness Score ── */}
        <Section title="M&A Attractiveness Score">
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 5,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 800, color: barColor }}>
                {company.maScore}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: barColor,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: barColor + '14',
                }}
              >
                {ma.label}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 7,
                borderRadius: 4,
                background: 'var(--bg3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${company.maScore}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: barColor,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
          {/* Breakdown factors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {maFactors.map((f) => (
              <div
                key={f.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: f.met ? '#1a7040' : 'var(--tx3)',
                }}
              >
                <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>
                  {f.met ? '\u2713' : '\u2717'}
                </span>
                <span style={{ fontWeight: f.met ? 600 : 400 }}>{f.name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── PE Ownership ── */}
        <Section title="PE Ownership">
          {company.isPE && company.peFirm ? (
            <div
              style={{
                background: 'rgba(122,16,80,0.06)',
                border: `1px solid rgba(122,16,80,0.18)`,
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 16px',
                }}
              >
                <div>
                  <div style={label}>PE Firm</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: PE_COLOR }}>
                    {company.peFirm || '—'}
                  </div>
                </div>
                <div>
                  <div style={label}>Type</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>
                    {company.peType || '—'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: 'rgba(26,112,64,0.05)',
                border: '1px solid rgba(26,112,64,0.18)',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 16 }}>&#10003;</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a7040' }}>
                  Independent / Not PE-Backed
                </div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                  {company.isFamily ? 'Family-owned or independently operated' : 'No private equity investors identified'}
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* ── Company Hierarchy ── */}
        <Section title="Company Hierarchy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Level 1: PE Firm / Super Firm (if PE-backed) */}
            {company.isPE && company.peFirm && (
              <HierarchyLevel
                level="PE Firm"
                name={company.peFirm}
                icon="🏦"
                color="#7a1050"
                isTop
              />
            )}

            {/* Level 2: Parent / Holding Company (if exists) */}
            {company.parentCompany && (
              <HierarchyLevel
                level={company.isPE ? 'Holding Company' : 'Parent Company'}
                name={company.parentCompany}
                icon="🏛️"
                color="#1a4f96"
                isTop={!company.isPE || !company.peFirm}
              />
            )}

            {/* Level 3: This Company */}
            <HierarchyLevel
              level="Company"
              name={company.name}
              icon="🏢"
              color="var(--tx)"
              isTop={!company.parentCompany && (!company.isPE || !company.peFirm)}
              isBottom={company.locationCount <= 0}
              isCurrent
            />

            {/* Level 4: Locations */}
            {company.locationCount > 0 && (
              <HierarchyLevel
                level={`${company.locationCount} Location${company.locationCount !== 1 ? 's' : ''}`}
                name={company.locations.length > 0
                  ? company.locations.slice(0, 3).map(l => l.name || `${l.city}, ${l.state}`).join(' · ')
                  : `${company.city}, ${company.state}`}
                icon="📍"
                color="#1a7040"
                isBottom
              />
            )}
          </div>
        </Section>

        {/* ── Platform Score ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
            Platform Score
            <button
              onClick={() => setShowScoreInfo((v) => !v)}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '1px solid var(--bd2)',
                background: showScoreInfo ? 'var(--acc)' : 'var(--bg3)',
                color: showScoreInfo ? '#fff' : 'var(--tx3)',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                padding: 0,
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
              title="What is Platform Score?"
            >
              &#8505;
            </button>
          </div>
          {showScoreInfo && (
            <div
              style={{
                background: 'rgba(176,125,16,0.06)',
                border: '1px solid rgba(176,125,16,0.18)',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 8,
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--tx2)',
              }}
            >
              Platform Score reflects digital presence signals, keyword matches, LinkedIn engagement, website maturity, and data completeness. Higher = stronger platform candidate.
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--acc)' }}>
              {company.score.toFixed(1)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>/100</span>
          </div>
          <div
            style={{
              width: '100%',
              height: 7,
              borderRadius: 4,
              background: 'var(--bg3)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${animatedScore}%`,
                height: '100%',
                borderRadius: 4,
                background: `linear-gradient(90deg, ${ACCENT_COLOR}, #d4a020)`,
                transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)',
              }}
            />
          </div>
        </div>

        {/* ── Locations ── */}
        {company.locations && company.locations.length > 0 && (
          <Section title={`Locations (${company.locationCount || company.locations.length})`}>
            <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 6 }}>
              Click any location to view its detailed profile.
            </div>
            <div
              style={{
                maxHeight: 340,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {company.locations.map((loc, i) => (
                <LocationRow
                  key={`${loc.name}-${i}`}
                  location={loc}
                  onClick={() => {
                    if (onSelectLocation) {
                      onSelectLocation(company, loc);
                    }
                  }}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── Top Competitors (Company-Wide) ── */}
        {topCompetitors.length > 0 && (
          <Section title="Top Competitors">
            <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 8, lineHeight: 1.4 }}>
              Companies with overlapping markets and similar scale.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {topCompetitors.map(({ company: c }) => (
                <button
                  key={c.id}
                  onClick={() => onSelectCompany(c)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 10px',
                    border: '1px solid var(--bd)',
                    borderRadius: 6,
                    background: 'var(--bg)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    fontFamily: "'Syne', system-ui, sans-serif",
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--acc)';
                    e.currentTarget.style.background = 'var(--highlight)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--bd)';
                    e.currentTarget.style.background = 'var(--bg)';
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--tx)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
                      {[c.city, c.state].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: 'var(--tx3)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {c.locationCount} loc{c.locationCount !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ── Key Contacts ── */}
        {company.executiveName && (
          <Section title="Key Contacts">
            <div
              style={{
                padding: '10px 12px',
                border: '1px solid var(--bd)',
                borderRadius: 6,
                background: 'var(--bg)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--tx)',
                  marginBottom: 1,
                }}
              >
                {company.executiveName}
              </div>
              {company.executiveTitle && (
                <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 3 }}>
                  {company.executiveTitle}
                </div>
              )}
              {company.executiveEmail && (
                <div style={{ marginBottom: 2 }}>
                  <a
                    href={`mailto:${company.executiveEmail}`}
                    style={{
                      fontSize: 11,
                      color: 'var(--acc)',
                      textDecoration: 'none',
                      fontWeight: 500,
                      wordBreak: 'break-all',
                    }}
                  >
                    {company.executiveEmail}
                  </a>
                </div>
              )}
              {company.executivePhone && (
                <a
                  href={`tel:${company.executivePhone.replace(/[^\d+]/g, '')}`}
                  style={{
                    fontSize: 11,
                    color: 'var(--tx2)',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {formatUSPhone(company.executivePhone)}
                </a>
              )}
            </div>
          </Section>
        )}

        {/* ── Links ── */}
        {(company.linkedinUrl || company.domain) && (
          <Section title="Links">
            <div style={{ display: 'flex', gap: 6 }}>
              {company.linkedinUrl && (
                <ActionButton
                  href={company.linkedinUrl}
                  label="LinkedIn"
                  icon="\ud83d\udcbc"
                />
              )}
              {company.domain && (
                <ActionButton
                  href={`https://${company.domain}`}
                  label="Website"
                  icon="\ud83c\udf10"
                />
              )}
            </div>
          </Section>
        )}

        {/* ── Company-Wide Enrichment (blue-themed, clearly separate) ── */}
        <div style={{
          margin: '0 0 18px',
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
            Enrich Company-Wide Data
          </div>
          <div style={{ fontSize: 9, color: 'var(--tx3)', marginBottom: 10, lineHeight: 1.4 }}>
            Searches {company.domain} for data about the entire company — all locations.
          </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {([
                { key: 'pe-news', label: '🏦 PE & M&A', desc: 'Investors, acquisitions' },
                { key: 'recent-news', label: '📰 News', desc: 'Growth, openings, press' },
                { key: 'services-pricing', label: '💰 Pricing', desc: 'Services & pricing' },
                { key: 'location-detail', label: '📍 Location', desc: 'Hours, staff, amenities' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  disabled={enriching}
                  onClick={async () => {
                    if (enriching || !company.domain) return;
                    const cacheKey = `${company.domain}:${opt.key}`;
                    // Check cache first
                    const cached = enrichCacheRef.current.get(cacheKey);
                    if (cached) {
                      setEnrichedData(cached);
                      setLastEnrichType(opt.key);
                      setIsCachedResult(true);
                      setEnrichMsg('');
                      return;
                    }
                    setEnriching(true);
                    setIsCachedResult(false);
                    setEnrichMsg(`Searching ${opt.label.slice(2)}...`);
                    try {
                      const res = await fetch('/api/enrich', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domain: company.domain, enrichType: opt.key, datasetId }),
                      });
                      const data = await res.json();
                      if (data.error) {
                        setEnrichMsg(data.error);
                      } else if (data.enrichedData && Object.keys(data.enrichedData).filter(k => !k.startsWith('_') && data.enrichedData[k]).length > 0) {
                        setEnrichedData(data.enrichedData);
                        setLastEnrichType(opt.key);
                        setIsCachedResult(false);
                        enrichCacheRef.current.set(cacheKey, data.enrichedData);
                        setEnrichMsg('');
                      } else {
                        setEnrichMsg('No data found for this category.');
                      }
                    } catch {
                      setEnrichMsg('Enrichment failed. Try again.');
                    } finally {
                      setEnriching(false);
                    }
                  }}
                  style={{
                    padding: '8px 6px',
                    border: '1px solid var(--bd)',
                    borderRadius: 5,
                    background: 'var(--bg3)',
                    cursor: enriching ? 'wait' : 'pointer',
                    opacity: enriching ? 0.5 : 1,
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { if (!enriching) { e.currentTarget.style.borderColor = ACCENT_COLOR; e.currentTarget.style.background = 'var(--bg4)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.background = 'var(--bg3)'; }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 1 }}>{opt.label}</div>
                  <div style={{ fontSize: 9, color: 'var(--tx3)' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            {enrichMsg && (
              <div style={{ fontSize: 10, color: enrichedData ? '#1a7040' : 'var(--tx2)', marginTop: 6, textAlign: 'center' }}>{enrichMsg}</div>
            )}
            <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 8, textAlign: 'center', lineHeight: 1.4, fontStyle: 'italic' }}>
              Limit: ~5 enrichments per minute. Wait a few seconds between clicks for best results.
            </div>
        </div>

        {/* Enriched Data — shown inline after enrichment */}
        {enrichedData && Object.keys(enrichedData).filter(k => !k.startsWith('_')).length > 0 && (
          <Section title={
            lastEnrichType === 'pe-news' ? '🏦 PE & M&A Intel' :
            lastEnrichType === 'recent-news' ? '📰 Recent News' :
            lastEnrichType === 'services-pricing' ? '💰 Services & Pricing' :
            lastEnrichType === 'location-detail' ? '📍 Location Details' :
            '🏢 Enriched — Company-Wide'
          }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isCachedResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                  <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(176,125,16,0.1)', color: '#b07d10', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>Cached</span>
                  <button
                    onClick={async () => {
                      if (enriching || !company.domain) return;
                      const cacheKey = `${company.domain}:${lastEnrichType}`;
                      enrichCacheRef.current.delete(cacheKey);
                      setEnriching(true);
                      setIsCachedResult(false);
                      setEnrichMsg(`Re-enriching...`);
                      try {
                        const res = await fetch('/api/enrich', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ domain: company.domain, enrichType: lastEnrichType, datasetId }),
                        });
                        const data = await res.json();
                        if (data.error) {
                          setEnrichMsg(data.error);
                        } else if (data.enrichedData && Object.keys(data.enrichedData).filter(k => !k.startsWith('_') && data.enrichedData[k]).length > 0) {
                          setEnrichedData(data.enrichedData);
                          enrichCacheRef.current.set(cacheKey, data.enrichedData);
                          setEnrichMsg('');
                        } else {
                          setEnrichMsg('No data found for this category.');
                        }
                      } catch {
                        setEnrichMsg('Re-enrichment failed.');
                      } finally {
                        setEnriching(false);
                      }
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--acc)', fontSize: 10, fontWeight: 500, fontFamily: "'Syne', system-ui, sans-serif" }}
                  >
                    Re-enrich &rarr;
                  </button>
                </div>
              )}
              <EnrichedFields data={enrichedData} />
              <div style={{ fontSize: 9, color: 'var(--tx3)', fontStyle: 'italic' }}>
                Enriched {new Date().toLocaleTimeString()}
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

/* ── Enriched Data Display ── */

function EnrichedLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 3, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function EnrichedFields({ data }: { data: Record<string, unknown> }) {
  const items: React.ReactNode[] = [];

  // Contact info
  if (data.phone) items.push(
    <div key="phone" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>📞</span>
      <a href={`tel:${String(data.phone).replace(/[^\d+]/g, '')}`} style={{ fontSize: 12, color: ACCENT_COLOR, textDecoration: 'none', fontWeight: 500 }}>{String(data.phone)}</a>
    </div>
  );
  if (data.email) items.push(
    <div key="email" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>✉️</span>
      <a href={`mailto:${String(data.email)}`} style={{ fontSize: 12, color: ACCENT_COLOR, textDecoration: 'none', fontWeight: 500 }}>{String(data.email)}</a>
    </div>
  );
  if (data.address) items.push(
    <div key="address" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>📍</span>
      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(data.address)}</span>
    </div>
  );

  // Social links
  if (data.social && typeof data.social === 'object') {
    const social = data.social as Record<string, string>;
    const links = Object.entries(social).filter(([, v]) => v);
    if (links.length > 0) items.push(
      <div key="social">
        <EnrichedLabel>Social Media</EnrichedLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {links.map(([platform, url]) => (
            <a key={platform} href={String(url)} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 10, color: ACCENT_COLOR, textDecoration: 'none', fontWeight: 500, textTransform: 'capitalize' }}>
              {platform} ↗
            </a>
          ))}
        </div>
      </div>
    );
  }

  // Services
  if (data.services) {
    const svcs = Array.isArray(data.services) ? data.services : String(data.services).split(',');
    items.push(
      <div key="services">
        <EnrichedLabel>Services</EnrichedLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {svcs.filter((s: string) => String(s).trim().length > 1).slice(0, 12).map((s: string, i: number) => (
            <span key={i} style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 3,
              background: 'rgba(176,125,16,.08)', color: '#b07d10',
              border: '1px solid rgba(176,125,16,.2)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>{String(s).trim()}</span>
          ))}
        </div>
      </div>
    );
  }

  // Pricing
  if (data.pricing && Array.isArray(data.pricing) && data.pricing.length > 0) {
    items.push(
      <div key="pricing">
        <EnrichedLabel>Pricing</EnrichedLabel>
        {(data.pricing as { service?: string; price?: string; details?: string }[]).slice(0, 5).map((p, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 2 }}>
            <strong style={{ color: 'var(--tx)' }}>{p.service || 'Service'}</strong>: {p.price || '—'} {p.details ? `(${p.details})` : ''}
          </div>
        ))}
      </div>
    );
  }

  // Leadership
  if (data.leadership && Array.isArray(data.leadership) && data.leadership.length > 0) {
    items.push(
      <div key="leadership">
        <EnrichedLabel>Leadership</EnrichedLabel>
        {(data.leadership as { name?: string; title?: string }[]).slice(0, 5).map((p, i) => (
          <div key={i} style={{ fontSize: 11, marginBottom: 2 }}>
            <strong style={{ color: 'var(--tx)' }}>{p.name}</strong> <span style={{ color: 'var(--tx2)' }}>— {p.title}</span>
          </div>
        ))}
      </div>
    );
  }

  // Description / Specialties / Differentiators
  if (data.specialties) items.push(
    <div key="specialties"><EnrichedLabel>Specialties</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.5 }}>{String(data.specialties).slice(0, 200)}</div></div>
  );
  if (data.differentiators) items.push(
    <div key="diff"><EnrichedLabel>Differentiators</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.5 }}>{String(data.differentiators).slice(0, 200)}</div></div>
  );
  if (data.certifications) items.push(
    <div key="certs"><EnrichedLabel>Certifications</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(data.certifications)}</div></div>
  );
  if (data.description) items.push(
    <div key="desc"><EnrichedLabel>About</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.5 }}>{String(data.description).slice(0, 250)}</div></div>
  );

  // Customer sentiment
  if (data.sentiment) items.push(
    <div key="sentiment" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <EnrichedLabel>Sentiment</EnrichedLabel>
      <span style={{ fontSize: 11, fontWeight: 600, color: data.sentiment === 'positive' ? '#1a7040' : data.sentiment === 'negative' ? '#b03a1a' : '#b07d10' }}>
        {String(data.sentiment).toUpperCase()}
      </span>
    </div>
  );
  if (data.highlights && Array.isArray(data.highlights)) items.push(
    <div key="highlights"><EnrichedLabel>What Customers Love</EnrichedLabel>
      {(data.highlights as string[]).slice(0, 5).map((h, i) => (
        <div key={i} style={{ fontSize: 11, color: '#1a7040', marginBottom: 1 }}>✓ {h}</div>
      ))}
    </div>
  );
  if (data.concerns && Array.isArray(data.concerns) && data.concerns.length > 0) items.push(
    <div key="concerns"><EnrichedLabel>Concerns</EnrichedLabel>
      {(data.concerns as string[]).slice(0, 3).map((c, i) => (
        <div key={i} style={{ fontSize: 11, color: '#b03a1a', marginBottom: 1 }}>⚠ {c}</div>
      ))}
    </div>
  );
  if (data.sample_quotes && Array.isArray(data.sample_quotes)) items.push(
    <div key="quotes"><EnrichedLabel>Customer Quotes</EnrichedLabel>
      {(data.sample_quotes as string[]).slice(0, 3).map((q, i) => (
        <div key={i} style={{ fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic', marginBottom: 3, lineHeight: 1.5, paddingLeft: 8, borderLeft: '2px solid var(--bd)' }}>&ldquo;{q}&rdquo;</div>
      ))}
    </div>
  );

  // Hours
  if (data.hours) items.push(
    <div key="hours"><EnrichedLabel>Hours</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(data.hours).slice(0, 200)}</div></div>
  );

  // PE & M&A Intel
  if (data.pe_backed !== undefined) {
    items.push(
      <div key="pe-status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: data.pe_backed ? '#7a1050' : '#1a7040' }}>
          {data.pe_backed ? '● PE-Backed' : '● Not PE-Backed'}
        </span>
        {!!data.pe_firm && <span style={{ fontSize: 11, color: 'var(--tx2)' }}>({String(data.pe_firm)})</span>}
      </div>
    );
  }
  if (data.investors && Array.isArray(data.investors) && data.investors.length > 0) {
    items.push(
      <div key="investors"><EnrichedLabel>Investors</EnrichedLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {(data.investors as string[]).map((inv, i) => (
            <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(122,16,80,.08)', color: '#7a1050', border: '1px solid rgba(122,16,80,.2)', fontFamily: "'JetBrains Mono', monospace" }}>{inv}</span>
          ))}
        </div>
      </div>
    );
  }
  if (data.acquisitions && Array.isArray(data.acquisitions) && data.acquisitions.length > 0) {
    items.push(
      <div key="acquisitions"><EnrichedLabel>Acquisitions</EnrichedLabel>
        {(data.acquisitions as { company?: string; date?: string; details?: string }[]).slice(0, 5).map((a, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 3, paddingLeft: 8, borderLeft: '2px solid #7a1050' }}>
            <strong style={{ color: 'var(--tx)' }}>{a.company}</strong> {a.date && <span style={{ color: 'var(--tx3)' }}>({a.date})</span>}
            {a.details && <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{a.details}</div>}
          </div>
        ))}
      </div>
    );
  }
  if (data.funding) items.push(
    <div key="funding"><EnrichedLabel>Funding</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(data.funding)}</div></div>
  );
  if (data.ownership_notes) items.push(
    <div key="ownership"><EnrichedLabel>Ownership Notes</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.5 }}>{String(data.ownership_notes)}</div></div>
  );

  // Recent News
  if (data.recent_news && Array.isArray(data.recent_news) && data.recent_news.length > 0) {
    items.push(
      <div key="news"><EnrichedLabel>Recent News</EnrichedLabel>
        {(data.recent_news as { headline?: string; date?: string; summary?: string }[]).slice(0, 5).map((n, i) => (
          <div key={i} style={{ fontSize: 11, marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid var(--acc)' }}>
            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>{n.headline}</div>
            {n.date && <div style={{ fontSize: 9, color: 'var(--tx3)' }}>{n.date}</div>}
            {n.summary && <div style={{ color: 'var(--tx2)', lineHeight: 1.4 }}>{n.summary}</div>}
          </div>
        ))}
      </div>
    );
  }
  if (data.new_locations) items.push(
    <div key="new-locs"><EnrichedLabel>New Locations / Expansion</EnrichedLabel><div style={{ fontSize: 11, color: '#1a7040', lineHeight: 1.5 }}>{String(data.new_locations)}</div></div>
  );
  if (data.partnerships) items.push(
    <div key="partnerships"><EnrichedLabel>Partnerships</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(data.partnerships)}</div></div>
  );
  if (data.awards) items.push(
    <div key="awards"><EnrichedLabel>Awards & Recognition</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--acc)' }}>{String(data.awards)}</div></div>
  );
  if (data.growth_signals) items.push(
    <div key="growth"><EnrichedLabel>Growth Signals</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.5 }}>{String(data.growth_signals)}</div></div>
  );

  // Location-specific
  if (data.services_at_location) {
    const svcs = Array.isArray(data.services_at_location) ? data.services_at_location : [String(data.services_at_location)];
    items.push(
      <div key="loc-svcs"><EnrichedLabel>Services at This Location</EnrichedLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {svcs.filter((s: string) => String(s).trim().length > 1).slice(0, 12).map((s: string, i: number) => (
            <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(26,112,64,.08)', color: '#1a7040', border: '1px solid rgba(26,112,64,.2)', fontFamily: "'JetBrains Mono', monospace" }}>{String(s).trim()}</span>
          ))}
        </div>
      </div>
    );
  }
  if (data.local_pricing) items.push(
    <div key="loc-price"><EnrichedLabel>Location Pricing</EnrichedLabel><div style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(data.local_pricing)}</div></div>
  );
  if (data.staff && Array.isArray(data.staff) && data.staff.length > 0) {
    items.push(
      <div key="staff"><EnrichedLabel>Staff</EnrichedLabel>
        {(data.staff as { name?: string; role?: string }[]).slice(0, 5).map((s, i) => (
          <div key={i} style={{ fontSize: 11, marginBottom: 1 }}><strong style={{ color: 'var(--tx)' }}>{s.name}</strong> <span style={{ color: 'var(--tx2)' }}>— {s.role}</span></div>
        ))}
      </div>
    );
  }
  if (data.amenities && Array.isArray(data.amenities)) {
    items.push(
      <div key="amenities"><EnrichedLabel>Amenities</EnrichedLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {(data.amenities as string[]).slice(0, 10).map((a, i) => (
            <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'var(--bg3)', color: 'var(--tx2)', border: '1px solid var(--bd)' }}>{a}</span>
          ))}
        </div>
      </div>
    );
  }
  if (data.membership_options && Array.isArray(data.membership_options) && data.membership_options.length > 0) {
    items.push(
      <div key="memberships"><EnrichedLabel>Membership Plans</EnrichedLabel>
        {(data.membership_options as { name?: string; price?: string; benefits?: string }[]).slice(0, 5).map((m, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 4, padding: '4px 8px', background: 'var(--bg3)', borderRadius: 4, border: '1px solid var(--bd)' }}>
            <div><strong style={{ color: 'var(--tx)' }}>{m.name}</strong> {m.price && <span style={{ color: ACCENT_COLOR, fontWeight: 600 }}>{m.price}</span>}</div>
            {m.benefits && <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{m.benefits}</div>}
          </div>
        ))}
      </div>
    );
  }
  if (data.specials) items.push(
    <div key="specials"><EnrichedLabel>Current Specials</EnrichedLabel><div style={{ fontSize: 11, color: ACCENT_COLOR, fontWeight: 500 }}>{String(data.specials)}</div></div>
  );
  if (data.booking_link) items.push(
    <div key="booking"><a href={String(data.booking_link)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: ACCENT_COLOR, fontWeight: 500, textDecoration: 'none' }}>Book Appointment ↗</a></div>
  );

  // Membership options from services-pricing
  if (data.local_phone) items.push(
    <div key="loc-phone" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>📞</span>
      <a href={`tel:${String(data.local_phone).replace(/[^\d+]/g, '')}`} style={{ fontSize: 12, color: ACCENT_COLOR, textDecoration: 'none', fontWeight: 500 }}>{String(data.local_phone)}</a>
    </div>
  );
  if (data.local_address) items.push(
    <div key="loc-addr" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>📍</span>
      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(data.local_address)}</span>
    </div>
  );

  // Note (fallback mode)
  if (data._note) items.push(
    <div key="note" style={{ fontSize: 9, color: 'var(--tx3)', fontStyle: 'italic' }}>{String(data._note)}</div>
  );

  if (items.length === 0) return <div style={{ fontSize: 11, color: 'var(--tx3)' }}>No structured data found.</div>;
  return <>{items}</>;
}

/* ── Hierarchy Level ── */

function HierarchyLevel({
  level,
  name,
  icon,
  color,
  isTop,
  isBottom,
  isCurrent,
}: {
  level: string;
  name: string;
  icon: string;
  color: string;
  isTop?: boolean;
  isBottom?: boolean;
  isCurrent?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      {/* Vertical connector line */}
      <div style={{ width: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 2,
          flex: 1,
          background: isTop ? 'transparent' : 'var(--bd2)',
        }} />
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: isCurrent ? color : 'var(--bg3)',
          border: `2px solid ${color}`,
          flexShrink: 0,
        }} />
        <div style={{
          width: 2,
          flex: 1,
          background: isBottom ? 'transparent' : 'var(--bd2)',
        }} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        padding: '6px 10px',
        margin: '2px 0',
        borderRadius: 6,
        background: isCurrent ? 'rgba(176,125,16,0.04)' : 'transparent',
        border: isCurrent ? '1px solid rgba(176,125,16,0.15)' : '1px solid transparent',
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: color,
          marginBottom: 1,
        }}>
          {icon} {level}
        </div>
        <div style={{
          fontSize: 12,
          fontWeight: isCurrent ? 700 : 500,
          color: isCurrent ? 'var(--tx)' : 'var(--tx2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Badge({ text, bg }: { text: string; bg: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#fff',
        background: bg,
      }}
    >
      {text}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function LocationRow({ location, onClick }: { location: Location; onClick?: () => void }) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      const hasCoords = isFinite(location.lat) && isFinite(location.lng);
      if (!hasCoords) return;
      window.dispatchEvent(
        new CustomEvent('panToLocation', {
          detail: { lat: location.lat, lng: location.lng },
        })
      );
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '5px 8px',
        border: 'none',
        borderRadius: 4,
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        fontFamily: "'Syne', system-ui, sans-serif",
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--tx)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {location.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {location.address ? `${location.address}, ` : ''}{[location.city, location.state].filter(Boolean).join(', ')}
        </div>
      </div>
      {location.rating !== null && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: ACCENT_COLOR,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <span style={{ fontSize: 11 }}>{'\u2605'}</span>
          {location.rating.toFixed(1)}
        </div>
      )}
    </button>
  );
}

function ActionButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
        padding: '9px 0',
        border: '1px solid var(--bd)',
        borderRadius: 6,
        background: 'var(--bg)',
        color: 'var(--tx)',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "'Syne', system-ui, sans-serif",
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--acc)';
        e.currentTarget.style.background = 'var(--highlight)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--bd)';
        e.currentTarget.style.background = 'var(--bg)';
      }}
    >
      <span>{icon}</span>
      {label}
    </a>
  );
}
