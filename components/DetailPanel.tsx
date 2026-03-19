'use client';

import { useEffect, useRef, useState } from 'react';
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
}

/* ── Component ── */

export default function DetailPanel({
  company,
  allCompanies,
  onClose,
  onSelectCompany,
}: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');
  const [enrichedData, setEnrichedData] = useState<Record<string, unknown> | null>(null);
  const [showScoreInfo, setShowScoreInfo] = useState(false);

  // Reset state on company change
  useEffect(() => {
    if (!company) return;
    setAnimatedScore(0);
    setEnriching(false);
    setEnrichMsg('');
    setEnrichedData(null);
    const timer = setTimeout(() => setAnimatedScore(company.score), 60);
    return () => clearTimeout(timer);
  }, [company?.id, company?.score, company]);

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

  // Nearby competitors: within 80 km, sorted by distance
  const nearby =
    company.lat !== null && company.lng !== null
      ? allCompanies
          .filter(
            (c) =>
              c.id !== company.id &&
              c.lat !== null &&
              c.lng !== null &&
              haversineKm(company.lat!, company.lng!, c.lat!, c.lng!) <= 80
          )
          .map((c) => ({
            company: c,
            dist: haversineKm(company.lat!, company.lng!, c.lat!, c.lng!),
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 8)
      : [];

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
      value:
        company.footprint === 'national'
          ? 'Nationwide'
          : company.footprint === 'regional'
          ? 'Multi-state'
          : company.state || '—',
    },
    {
      label: 'Employees',
      value: company.employees
        ? company.employees.toLocaleString()
        : company.employeeSize || '—',
    },
    { label: 'Locations', value: String(company.locationCount || 1) },
    { label: 'Revenue', value: formatRevenue(company.revenue) },
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
            text={company.footprint}
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
        {company.isPE && (
          <Section title="PE Ownership">
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
          </Section>
        )}

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
          <Section title={`Locations (${company.locations.length})`}>
            <div
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {company.locations.map((loc, i) => (
                <LocationRow key={`${loc.name}-${i}`} location={loc} />
              ))}
            </div>
          </Section>
        )}

        {/* ── Nearby Competitors ── */}
        {nearby.length > 0 && (
          <Section title="Nearby Competitors">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nearby.map(({ company: c, dist }) => (
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
                    {dist < 1 ? '<1' : Math.round(dist)} km
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

        {/* ── Actions ── */}
        <Section title="Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            <button
              onClick={async () => {
                if (enriching || !company.domain) return;
                setEnriching(true);
                setEnrichMsg('');
                try {
                  const res = await fetch('/api/enrich', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: `https://${company.domain}`, type: 'company', domain: company.domain }),
                  });
                  const data = await res.json();
                  if (data.error) {
                    // Check for missing Firecrawl API key
                    const errLower = (data.error as string).toLowerCase();
                    if (errLower.includes('firecrawl') || errLower.includes('api key') || res.status === 403) {
                      setEnrichMsg('Enrichment requires a Firecrawl API key. Contact your administrator.');
                    } else {
                      setEnrichMsg(data.error);
                    }
                  } else if (data.enrichedData) {
                    const fields = Object.keys(data.enrichedData).filter(k => data.enrichedData[k]);
                    if (fields.length > 0) {
                      setEnrichedData(data.enrichedData);
                      setEnrichMsg(`Enriched! Found: ${fields.join(', ')}`);
                    } else {
                      setEnrichMsg('No additional data found.');
                    }
                  } else {
                    setEnrichMsg('No additional data found.');
                  }
                } catch {
                  setEnrichMsg('Could not enrich at this time.');
                } finally {
                  setEnriching(false);
                }
              }}
              style={{
                width: '100%',
                padding: '9px 0',
                border: '1px solid var(--acc)',
                borderRadius: 6,
                background: ACCENT_COLOR + '0a',
                color: ACCENT_COLOR,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "'Syne', system-ui, sans-serif",
                cursor: enriching ? 'wait' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'background 0.15s',
                opacity: enriching ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!enriching) e.currentTarget.style.background = ACCENT_COLOR + '1a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = ACCENT_COLOR + '0a';
              }}
            >
              {enriching ? '⟳ Enriching...' : '⟳ Enrich Company'}
            </button>
            {enrichMsg && (
              <div style={{ fontSize: 10, color: enrichedData ? '#1a7040' : 'var(--tx2)', marginTop: 4, textAlign: 'center' }}>{enrichMsg}</div>
            )}
          </div>
        </Section>

        {/* Enriched Data — shown inline after enrichment */}
        {enrichedData && Object.keys(enrichedData).length > 0 && (
          <Section title="Enriched from Website">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!!enrichedData.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📞</span>
                  <a href={`tel:${String(enrichedData.phone).replace(/[^\d+]/g, '')}`} style={{ fontSize: 12, color: 'var(--acc)', textDecoration: 'none', fontWeight: 500 }}>
                    {String(enrichedData.phone)}
                  </a>
                </div>
              )}
              {!!enrichedData.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>✉️</span>
                  <a href={`mailto:${String(enrichedData.email)}`} style={{ fontSize: 12, color: 'var(--acc)', textDecoration: 'none', fontWeight: 500 }}>
                    {String(enrichedData.email)}
                  </a>
                </div>
              )}
              {!!enrichedData.services && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 3, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>SERVICES FOUND</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {String(enrichedData.services).split(',').filter(s => s.trim().length > 1).slice(0, 10).map((s: string) => (
                      <span key={s} style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 3,
                        background: 'rgba(176,125,16,.08)', color: '#b07d10',
                        border: '1px solid rgba(176,125,16,.2)',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>{s.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              {!!enrichedData.hours && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 3, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>HOURS</div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{String(enrichedData.hours).slice(0, 200)}</div>
                </div>
              )}
              {!!enrichedData.description && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 3, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>FROM WEBSITE</div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.6 }}>
                    {String(enrichedData.description).slice(0, 250)}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, fontStyle: 'italic' }}>
                Enriched {new Date().toLocaleTimeString()}
              </div>
            </div>
          </Section>
        )}
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

function LocationRow({ location }: { location: Location }) {
  const hasCoords = isFinite(location.lat) && isFinite(location.lng);
  const handleClick = () => {
    if (!hasCoords) return;
    window.dispatchEvent(
      new CustomEvent('panToLocation', {
        detail: { lat: location.lat, lng: location.lng },
      })
    );
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
        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
          {[location.city, location.state].filter(Boolean).join(', ')}
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
