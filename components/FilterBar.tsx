'use client';

import { useCallback } from 'react';
import type { FilterState } from '@/lib/types';

interface FilterBarProps {
  filters: FilterState;
  onFilter: (filters: Partial<FilterState>) => void;
  services: string[];
}

interface PillConfig {
  label: string;
  active: boolean;
  color?: string;
  activeBg?: string;
  onClick: () => void;
}

function Pill({ label, active, color, activeBg, onClick }: PillConfig) {
  const baseColor = color || 'var(--tx)';
  const bg = active ? (activeBg || baseColor) : 'transparent';
  const border = active ? (activeBg || baseColor) : 'var(--bd2)';
  const textColor = active
    ? '#fff'
    : (color || 'var(--tx2)');

  return (
    <button
      onClick={onClick}
      className="fbtn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        fontSize: 11,
        fontFamily: "'Syne', system-ui, sans-serif",
        fontWeight: 600,
        letterSpacing: '0.01em',
        border: `1.5px solid ${border}`,
        borderRadius: 9999,
        background: bg,
        color: textColor,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s ease',
        lineHeight: '18px',
      }}
    >
      {label}
    </button>
  );
}

function Separator() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: 'var(--bd2)',
        margin: '0 6px',
        flexShrink: 0,
      }}
    />
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--tx3)',
        marginRight: 4,
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );
}

export default function FilterBar({ filters, onFilter, services }: FilterBarProps) {
  const hasActiveFilters =
    filters.footprint !== 'all' ||
    filters.ownership !== 'all' ||
    filters.service !== null ||
    filters.minRating > 0 ||
    filters.employeeSizeFilter !== null ||
    filters.locationCountFilter !== null ||
    filters.ratingFilter !== null ||
    filters.reviewsFilter !== null ||
    filters.photosFilter !== null;

  const handleClear = useCallback(() => {
    onFilter({
      footprint: 'all',
      ownership: 'all',
      service: null,
      minRating: 0,
      employeeSizeFilter: null,
      locationCountFilter: null,
      ratingFilter: null,
      reviewsFilter: null,
      photosFilter: null,
    });
  }, [onFilter]);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Scroll fade indicator on right edge */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 40,
        background: 'linear-gradient(90deg, transparent, var(--bg2))',
        pointerEvents: 'none',
        zIndex: 2,
      }} />
    <div
      style={{
        height: 42,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        paddingRight: 50,
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--bd)',
        overflowX: 'auto',
        overflowY: 'hidden',
        gap: 4,
        fontFamily: "'Syne', system-ui, sans-serif",
      }}
    >
      {/* FOOTPRINT */}
      <SectionLabel text="FOOTPRINT" />
      <Pill
        label="All"
        active={filters.footprint === 'all'}
        color="var(--tx)"
        activeBg="var(--tx)"
        onClick={() => onFilter({ footprint: 'all' })}
      />
      <Pill
        label="National"
        active={filters.footprint === 'national'}
        color="var(--nat)"
        activeBg="var(--nat)"
        onClick={() => onFilter({ footprint: 'national' })}
      />
      <Pill
        label="Regional"
        active={filters.footprint === 'regional'}
        color="var(--reg)"
        activeBg="var(--reg)"
        onClick={() => onFilter({ footprint: 'regional' })}
      />
      <Pill
        label="Single Loc"
        active={filters.footprint === 'local'}
        color="var(--loc)"
        activeBg="var(--loc)"
        onClick={() => onFilter({ footprint: 'local' })}
      />

      <Separator />

      {/* OWNERSHIP */}
      <SectionLabel text="OWNERSHIP" />
      <Pill
        label="PE-Backed"
        active={filters.ownership === 'pe'}
        color="var(--pe)"
        activeBg="var(--pe)"
        onClick={() =>
          onFilter({ ownership: filters.ownership === 'pe' ? 'all' : 'pe' })
        }
      />
      <Pill
        label="Family/Indep."
        active={filters.ownership === 'independent'}
        onClick={() =>
          onFilter({
            ownership: filters.ownership === 'independent' ? 'all' : 'independent',
          })
        }
      />

      <Separator />

      {/* SERVICES */}
      <SectionLabel text="SERVICES" />
      {services.map((svc) => (
        <Pill
          key={svc}
          label={svc}
          active={filters.service === svc}
          onClick={() =>
            onFilter({ service: filters.service === svc ? null : svc })
          }
        />
      ))}

      <Separator />

      {/* QUALITY */}
      <SectionLabel text="QUALITY" />
      <Pill
        label={'\u2605 4.8+'}
        active={filters.minRating >= 4.8}
        color="var(--acc)"
        activeBg="var(--acc)"
        onClick={() =>
          onFilter({ minRating: filters.minRating >= 4.8 ? 0 : 4.8 })
        }
      />

      <Separator />

      {/* EMPLOYEES */}
      <SectionLabel text="EMPLOYEES" />
      {['1,001+', '501-1,000', '201-500', '51-200', '11-50', '1-10'].map((bucket) => (
        <Pill
          key={`emp-${bucket}`}
          label={bucket}
          active={filters.employeeSizeFilter === bucket}
          color="#b07d10"
          activeBg="#b07d10"
          onClick={() =>
            onFilter({ employeeSizeFilter: filters.employeeSizeFilter === bucket ? null : bucket })
          }
        />
      ))}

      <Separator />

      {/* # OF LOCATIONS */}
      <SectionLabel text="# LOCATIONS" />
      {['50+', '20-49', '10-19', '3-9', '1-2'].map((bucket) => (
        <Pill
          key={`loc-${bucket}`}
          label={bucket}
          active={filters.locationCountFilter === bucket}
          color="#b07d10"
          activeBg="#b07d10"
          onClick={() =>
            onFilter({ locationCountFilter: filters.locationCountFilter === bucket ? null : bucket })
          }
        />
      ))}

      <Separator />

      {/* AVG RATING */}
      <SectionLabel text="AVG RATING" />
      {['4.5-5.0', '4.0-4.49', '3.5-3.99', '3.0-3.49', '< 3.0'].map((bucket) => (
        <Pill
          key={`rat-${bucket}`}
          label={bucket}
          active={filters.ratingFilter === bucket}
          color="#b07d10"
          activeBg="#b07d10"
          onClick={() =>
            onFilter({ ratingFilter: filters.ratingFilter === bucket ? null : bucket })
          }
        />
      ))}

      <Separator />

      {/* # OF REVIEWS */}
      <SectionLabel text="# REVIEWS" />
      {['1,000+', '500-999', '100-499', '50-99', '< 50'].map((bucket) => (
        <Pill
          key={`rev-${bucket}`}
          label={bucket}
          active={filters.reviewsFilter === bucket}
          color="#b07d10"
          activeBg="#b07d10"
          onClick={() =>
            onFilter({ reviewsFilter: filters.reviewsFilter === bucket ? null : bucket })
          }
        />
      ))}

      <Separator />

      {/* # OF PHOTOS */}
      <SectionLabel text="# PHOTOS" />
      {['500+', '100-499', '50-99', '10-49', '< 10'].map((bucket) => (
        <Pill
          key={`pho-${bucket}`}
          label={bucket}
          active={filters.photosFilter === bucket}
          color="#b07d10"
          activeBg="#b07d10"
          onClick={() =>
            onFilter({ photosFilter: filters.photosFilter === bucket ? null : bucket })
          }
        />
      ))}

      {/* Clear */}
      {hasActiveFilters && (
        <>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleClear}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '3px 8px',
              fontSize: 11,
              fontFamily: "'Syne', system-ui, sans-serif",
              fontWeight: 600,
              border: '1.5px solid var(--bd2)',
              borderRadius: 9999,
              background: 'transparent',
              color: 'var(--tx3)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              lineHeight: '18px',
              flexShrink: 0,
            }}
          >
            &#10005; Clear
          </button>
        </>
      )}
    </div>
    </div>
  );
}
