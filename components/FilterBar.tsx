'use client';

import { useCallback } from 'react';
import type { FilterState } from '@/lib/types';

interface FilterBarProps {
  filters: FilterState;
  onFilter: (filters: Partial<FilterState>) => void;
  services: string[];
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: "'Syne', system-ui, sans-serif",
  fontWeight: 600,
  border: '1.5px solid var(--bd2)',
  borderRadius: 6,
  background: 'var(--bg2)',
  color: 'var(--tx2)',
  cursor: 'pointer',
  outline: 'none',
  minWidth: 0,
  maxWidth: 140,
  transition: 'all 0.15s ease',
  lineHeight: '20px',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239e9488' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 6px center',
  paddingRight: 22,
};

const activeSelectStyle: React.CSSProperties = {
  ...selectStyle,
  borderColor: 'var(--acc)',
  background: 'rgba(176,125,16,0.06)',
  color: 'var(--tx)',
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--tx3)',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

function Separator() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: 'var(--bd2)',
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
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
    <div
      style={{
        minHeight: 42,
        display: 'flex',
        alignItems: 'center',
        padding: '6px 16px',
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--bd)',
        gap: 8,
        fontFamily: "'Syne', system-ui, sans-serif",
        flexWrap: 'wrap',
      }}
    >
      {/* FOOTPRINT */}
      <span style={labelStyle}>Footprint</span>
      <select
        value={filters.footprint}
        onChange={(e) => onFilter({ footprint: e.target.value as FilterState['footprint'] })}
        style={filters.footprint !== 'all' ? activeSelectStyle : selectStyle}
      >
        <option value="all">All</option>
        <option value="local">Single Loc</option>
        <option value="regional">Regional</option>
        <option value="national">National</option>
      </select>

      <Separator />

      {/* OWNERSHIP */}
      <span style={labelStyle}>Ownership</span>
      <select
        value={filters.ownership}
        onChange={(e) => onFilter({ ownership: e.target.value as FilterState['ownership'] })}
        style={filters.ownership !== 'all' ? activeSelectStyle : selectStyle}
      >
        <option value="all">All</option>
        <option value="pe">PE-Backed</option>
        <option value="independent">Family/Indep.</option>
      </select>

      <Separator />

      {/* EMPLOYEES — ordered low to high */}
      <span style={labelStyle}>Employees</span>
      <select
        value={filters.employeeSizeFilter || ''}
        onChange={(e) => onFilter({ employeeSizeFilter: e.target.value || null })}
        style={filters.employeeSizeFilter ? activeSelectStyle : selectStyle}
      >
        <option value="">All</option>
        <option value="1-10">1-10</option>
        <option value="11-50">11-50</option>
        <option value="51-200">51-200</option>
        <option value="201-500">201-500</option>
        <option value="501-1,000">501-1,000</option>
        <option value="1,001+">1,001+</option>
      </select>

      <Separator />

      {/* # LOCATIONS — ordered low to high */}
      <span style={labelStyle}>Locations</span>
      <select
        value={filters.locationCountFilter || ''}
        onChange={(e) => onFilter({ locationCountFilter: e.target.value || null })}
        style={filters.locationCountFilter ? activeSelectStyle : selectStyle}
      >
        <option value="">All</option>
        <option value="1-2">1-2</option>
        <option value="3-9">3-9</option>
        <option value="10-19">10-19</option>
        <option value="20-49">20-49</option>
        <option value="50+">50+</option>
      </select>

      <Separator />

      {/* AVG RATING — ordered low to high */}
      <span style={labelStyle}>Rating</span>
      <select
        value={filters.ratingFilter || (filters.minRating >= 4.8 ? '4.8+' : '')}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '4.8+') {
            onFilter({ ratingFilter: null, minRating: 4.8 });
          } else if (val) {
            onFilter({ ratingFilter: val, minRating: 0 });
          } else {
            onFilter({ ratingFilter: null, minRating: 0 });
          }
        }}
        style={(filters.ratingFilter || filters.minRating >= 4.8) ? activeSelectStyle : selectStyle}
      >
        <option value="">All</option>
        <option value="< 3.0">&lt; 3.0</option>
        <option value="3.0-3.49">3.0-3.49</option>
        <option value="3.5-3.99">3.5-3.99</option>
        <option value="4.0-4.49">4.0-4.49</option>
        <option value="4.5-5.0">4.5-5.0</option>
        <option value="4.8+">&#9733; 4.8+</option>
      </select>

      <Separator />

      {/* # REVIEWS — ordered low to high */}
      <span style={labelStyle}>Reviews</span>
      <select
        value={filters.reviewsFilter || ''}
        onChange={(e) => onFilter({ reviewsFilter: e.target.value || null })}
        style={filters.reviewsFilter ? activeSelectStyle : selectStyle}
      >
        <option value="">All</option>
        <option value="< 50">&lt; 50</option>
        <option value="50-99">50-99</option>
        <option value="100-499">100-499</option>
        <option value="500-999">500-999</option>
        <option value="1,000+">1,000+</option>
      </select>

      <Separator />

      {/* # PHOTOS — ordered low to high */}
      <span style={labelStyle}>Photos</span>
      <select
        value={filters.photosFilter || ''}
        onChange={(e) => onFilter({ photosFilter: e.target.value || null })}
        style={filters.photosFilter ? activeSelectStyle : selectStyle}
      >
        <option value="">All</option>
        <option value="< 10">&lt; 10</option>
        <option value="10-49">10-49</option>
        <option value="50-99">50-99</option>
        <option value="100-499">100-499</option>
        <option value="500+">500+</option>
      </select>

      {/* SERVICES — only show if services exist */}
      {services.length > 0 && (
        <>
          <Separator />
          <span style={labelStyle}>Service</span>
          <select
            value={filters.service || ''}
            onChange={(e) => onFilter({ service: e.target.value || null })}
            style={filters.service ? activeSelectStyle : selectStyle}
          >
            <option value="">All</option>
            {services.map((svc) => (
              <option key={svc} value={svc}>{svc}</option>
            ))}
          </select>
        </>
      )}

      {/* Clear button */}
      {hasActiveFilters && (
        <>
          <div style={{ flex: 1, minWidth: 4 }} />
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
