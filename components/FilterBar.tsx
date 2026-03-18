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
    filters.minRating > 0;

  const handleClear = useCallback(() => {
    onFilter({ footprint: 'all', ownership: 'all', service: null, minRating: 0 });
  }, [onFilter]);

  return (
    <div
      style={{
        height: 42,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
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
        label="Local"
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
  );
}
