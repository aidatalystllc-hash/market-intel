'use client';

import { useCallback, useMemo } from 'react';
import type { Company } from '@/lib/types';

interface CompanyTableProps {
  companies: Company[];
  selectedId: string | null;
  onSelect: (company: Company) => void;
  sortKey: string;
  sortAscending: boolean;
  onSort: (key: string) => void;
}

const FOOTPRINT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  national: { bg: 'rgba(176,58,26,0.10)', color: 'var(--nat)', label: 'National' },
  regional: { bg: 'rgba(26,79,150,0.10)', color: 'var(--reg)', label: 'Regional' },
  local: { bg: 'rgba(26,112,64,0.10)', color: 'var(--loc)', label: 'Local' },
};

interface ColumnDef {
  key: string;
  label: string;
  width: string;
  align?: 'left' | 'center' | 'right';
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Company', width: '200px' },
  { key: 'city', label: 'Location', width: '130px' },
  { key: 'footprint', label: 'Footprint', width: '85px', align: 'center' },
  { key: 'ownership', label: 'Ownership', width: '95px', align: 'center' },
  { key: 'locationCount', label: 'Locations', width: '75px', align: 'right' },
  { key: 'avgRating', label: 'Avg Rating', width: '80px', align: 'right' },
  { key: 'services', label: 'Services', width: '180px' },
  { key: 'score', label: 'Score', width: '65px', align: 'right' },
  { key: 'maScore', label: 'M&A Score', width: '80px', align: 'right' },
];

const SORT_DROPDOWN_OPTIONS = [
  { key: 'name', label: 'Name' },
  { key: 'locationCount', label: 'Locations' },
  { key: 'avgRating', label: 'Avg Rating' },
  { key: 'score', label: 'Platform Score' },
  { key: 'maScore', label: 'M&A Score' },
  { key: 'employees', label: 'Employees' },
  { key: 'founded', label: 'Founded' },
];

export default function CompanyTable({
  companies,
  selectedId,
  onSelect,
  sortKey,
  sortAscending,
  onSort,
}: CompanyTableProps) {
  const handleHeaderClick = useCallback(
    (key: string) => {
      onSort(key);
    },
    [onSort]
  );

  const sortIndicator = useCallback(
    (key: string) => {
      if (sortKey !== key) return '';
      return sortAscending ? ' \u25B4' : ' \u25BE';
    },
    [sortKey, sortAscending]
  );

  return (
    <div
      style={{
        height: 195,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg2)',
        borderTop: '1px solid var(--bd)',
        fontFamily: "'Syne', system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          height: 32,
          borderBottom: '1px solid var(--bd)',
          flexShrink: 0,
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--tx)',
          }}
        >
          COMPANY ROSTER
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            color: '#b07d10',
          }}
        >
          {companies.length}
        </span>

        <span style={{ flex: 1 }} />

        {/* Sort dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--tx3)',
            }}
          >
            SORT
          </span>
          <select
            value={sortKey}
            onChange={(e) => onSort(e.target.value)}
            style={{
              fontFamily: "'Syne', system-ui, sans-serif",
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 6px',
              background: 'var(--bg3)',
              border: '1px solid var(--bd)',
              borderRadius: 4,
              color: 'var(--tx)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {SORT_DROPDOWN_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Column headers (sticky) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            height: 26,
            borderBottom: '1px solid var(--bd)',
            background: 'var(--bg3)',
            flexShrink: 0,
          }}
        >
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onClick={() => handleHeaderClick(col.key)}
              style={{
                width: col.width,
                flexShrink: 0,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: sortKey === col.key ? '#b07d10' : 'var(--tx3)',
                textAlign: col.align || 'left',
                cursor: 'pointer',
                userSelect: 'none',
                padding: '0 4px',
                transition: 'color 0.12s',
              }}
            >
              {col.label}
              {sortIndicator(col.key)}
            </div>
          ))}
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          {companies.map((company) => {
            const isSelected = company.id === selectedId;
            const fp = FOOTPRINT_STYLES[company.footprint] || FOOTPRINT_STYLES.local;

            return (
              <div
                key={company.id}
                onClick={() => onSelect(company)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 14px',
                  height: 32,
                  borderBottom: '1px solid var(--bd)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(176,125,16,0.06)' : 'transparent',
                  borderLeft: isSelected ? '3px solid #b07d10' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--bg3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected
                    ? 'rgba(176,125,16,0.06)'
                    : 'transparent';
                }}
              >
                {/* Company (with logo) */}
                <div
                  style={{
                    width: COLUMNS[0].width,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '0 4px',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={`/api/logo?domain=${encodeURIComponent(company.domain)}`}
                    alt=""
                    width={24}
                    height={24}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      objectFit: 'contain',
                      background: 'var(--bg3)',
                      border: '1px solid var(--bd)',
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 12,
                      color: 'var(--tx)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {company.name}
                  </span>
                </div>

                {/* Location */}
                <div
                  style={{
                    width: COLUMNS[1].width,
                    flexShrink: 0,
                    fontSize: 11,
                    color: 'var(--tx2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 4px',
                  }}
                >
                  {[company.city, company.state].filter(Boolean).join(', ') || '—'}
                </div>

                {/* Footprint */}
                <div
                  style={{
                    width: COLUMNS[2].width,
                    flexShrink: 0,
                    textAlign: 'center',
                    padding: '0 4px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                      fontWeight: 500,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: fp.bg,
                      color: fp.color,
                      textTransform: 'capitalize',
                    }}
                  >
                    {fp.label}
                  </span>
                </div>

                {/* Ownership */}
                <div
                  style={{
                    width: COLUMNS[3].width,
                    flexShrink: 0,
                    textAlign: 'center',
                    padding: '0 4px',
                  }}
                >
                  {company.isPE ? (
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        fontWeight: 500,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'rgba(122,16,80,0.10)',
                        color: 'var(--pe)',
                      }}
                    >
                      PE {company.peFirm ? `\u00B7 ${company.peFirm}` : ''}
                    </span>
                  ) : company.isFamily ? (
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--tx3)',
                      }}
                    >
                      Family
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--tx3)' }}>Independent</span>
                  )}
                </div>

                {/* Locations */}
                <div
                  style={{
                    width: COLUMNS[4].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--tx)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {company.locationCount}
                </div>

                {/* Avg Rating */}
                <div
                  style={{
                    width: COLUMNS[5].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: company.avgRating != null && company.avgRating >= 4.8
                      ? '#b07d10'
                      : 'var(--tx)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {company.avgRating != null ? company.avgRating.toFixed(1) : '--'}
                </div>

                {/* Services */}
                <div
                  style={{
                    width: COLUMNS[6].width,
                    flexShrink: 0,
                    display: 'flex',
                    gap: 3,
                    overflow: 'hidden',
                    padding: '0 4px',
                  }}
                >
                  {company.services.slice(0, 3).map((svc) => (
                    <span
                      key={svc}
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'var(--bg3)',
                        color: 'var(--tx2)',
                        border: '1px solid var(--bd)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 70,
                      }}
                    >
                      {svc}
                    </span>
                  ))}
                  {company.services.length > 3 && (
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        color: 'var(--tx3)',
                        alignSelf: 'center',
                      }}
                    >
                      +{company.services.length - 3}
                    </span>
                  )}
                </div>

                {/* Score */}
                <div
                  style={{
                    width: COLUMNS[7].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--tx)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {company.score}
                </div>

                {/* M&A Score */}
                <div
                  style={{
                    width: COLUMNS[8].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    color: company.maScore >= 70 ? '#b07d10' : 'var(--tx)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {company.maScore}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
