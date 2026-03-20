'use client';

import type { Company } from '@/lib/types';
import { FOOTPRINT_COLORS, PE_COLOR, ACCENT_COLOR } from '@/lib/types';
import { getMALabel } from '@/lib/maScoreCalc';

interface TooltipProps {
  company: Company | null;
  x: number;
  y: number;
  onViewProfile: (company: Company) => void;
}

function StarRating({ rating }: { rating: number }) {
  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    const filled = rating >= i;
    const half = !filled && rating >= i - 0.5;
    stars.push(
      <span
        key={i}
        style={{
          color: filled || half ? ACCENT_COLOR : 'var(--bd2)',
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        {filled ? '\u2605' : half ? '\u2605' : '\u2606'}
      </span>
    );
  }
  return <span style={{ display: 'inline-flex', gap: 1 }}>{stars}</span>;
}

export default function Tooltip({ company, x, y, onViewProfile }: TooltipProps) {
  if (!company) return null;
  const ma = getMALabel(company.maScore);
  const barColor =
    company.maScore >= 70 ? '#1a7040' : company.maScore >= 40 ? ACCENT_COLOR : '#b03a1a';
  const serviceTags = (company.services || []).slice(0, 3);

  // Position: keep tooltip on screen
  const tooltipWidth = 280;
  const tooltipApproxHeight = 320;
  const left = x + tooltipWidth + 16 > window.innerWidth ? x - tooltipWidth - 12 : x + 12;
  const top = Math.min(y - 10, window.innerHeight - tooltipApproxHeight - 12);

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top: Math.max(8, top),
        width: tooltipWidth,
        pointerEvents: 'none',
        zIndex: 9999,
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
        boxShadow: 'var(--shadow2)',
        padding: '14px 16px 12px',
        fontFamily: "'Syne', system-ui, sans-serif",
      }}
    >
      {/* Header with logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        {company.domain && (
          <img
            src={`/api/logo?domain=${encodeURIComponent(company.domain)}`}
            alt=""
            width={32}
            height={32}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              objectFit: 'contain',
              background: 'var(--bg3)',
              border: '1px solid var(--bd)',
              flexShrink: 0,
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--tx)',
            lineHeight: 1.3,
          }}
        >
          {company.name}
        </div>
      </div>

      {/* City, State */}
      {(company.city || company.state) && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--tx3)',
            marginBottom: 8,
          }}
        >
          {[company.city, company.state].filter(Boolean).join(', ')}
        </div>
      )}

      {/* Badges */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#fff',
            background: FOOTPRINT_COLORS[company.footprint] || FOOTPRINT_COLORS.local,
          }}
        >
          {company.footprint === 'local' ? 'Single Loc' : company.footprint}
        </span>
        {company.isPE && (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 7px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#fff',
              background: PE_COLOR,
            }}
          >
            PE-BACKED
          </span>
        )}
      </div>

      {/* Star rating */}
      {company.avgRating !== null && company.avgRating > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
          }}
        >
          <StarRating rating={company.avgRating} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--tx2)',
            }}
          >
            {company.avgRating.toFixed(1)}
          </span>
          {company.totalReviews !== null && (
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>
              ({company.totalReviews?.toLocaleString()} reviews)
            </span>
          )}
        </div>
      )}

      {/* 2-column grid: Locations + Founded */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          marginBottom: 10,
          padding: '8px 0',
          borderTop: '1px solid var(--bd)',
          borderBottom: '1px solid var(--bd)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--tx3)',
              marginBottom: 2,
            }}
          >
            Locations
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>
            {company.locationCount || 1}
          </div>
        </div>
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--tx3)',
              marginBottom: 2,
            }}
          >
            Founded
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>
            {company.founded || '—'}
          </div>
        </div>
      </div>

      {/* M&A Attractiveness */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--tx3)',
            }}
          >
            M&A Attractiveness
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: barColor,
            }}
          >
            {company.maScore}/100
          </span>
        </div>
        <div
          style={{
            width: '100%',
            height: 5,
            borderRadius: 3,
            background: 'var(--bg3)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${company.maScore}%`,
              height: '100%',
              borderRadius: 3,
              background: barColor,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: barColor,
            marginTop: 2,
          }}
        >
          {ma.label}
        </div>
      </div>

      {/* Service tags */}
      {serviceTags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {serviceTags.map((svc) => (
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
      )}

      {/* Click hint */}
      <div
        style={{
          width: '100%',
          padding: '7px 0',
          borderRadius: 5,
          background: 'var(--tx)',
          color: 'var(--bg2)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "'Syne', system-ui, sans-serif",
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}
      >
        Click to View Full Profile &rarr;
      </div>
    </div>
  );
}
