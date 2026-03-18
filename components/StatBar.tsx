'use client';

import { useMemo } from 'react';
import type { Company } from '@/lib/types';

interface StatBarProps {
  companies: Company[];
}

interface StatPill {
  label: string;
  value: string;
}

export default function StatBar({ companies }: StatBarProps) {
  const stats = useMemo((): StatPill[] => {
    const total = companies.length;
    const peBacked = companies.filter((c) => c.isPE).length;
    const national = companies.filter((c) => c.footprint === 'national').length;
    const regional = companies.filter((c) => c.footprint === 'regional').length;

    const ratingsArr = companies
      .map((c) => c.avgRating)
      .filter((r): r is number => r != null && r > 0);
    const avgRating =
      ratingsArr.length > 0
        ? (ratingsArr.reduce((a, b) => a + b, 0) / ratingsArr.length).toFixed(1)
        : '--';

    const totalLocations = companies.reduce((sum, c) => sum + (c.locationCount || 0), 0);

    return [
      { label: 'Companies', value: total.toLocaleString() },
      { label: 'PE-Backed', value: peBacked.toLocaleString() },
      { label: 'National', value: national.toLocaleString() },
      { label: 'Regional', value: regional.toLocaleString() },
      { label: 'Avg Rating', value: avgRating },
      { label: 'Total Locs', value: totalLocations.toLocaleString() },
    ];
  }, [companies]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
      }}
    >
      {stats.map((stat, i) => {
        const isFirst = i === 0;
        const isLast = i === stats.length - 1;

        return (
          <div
            key={stat.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 76,
              padding: '4px 10px',
              background: 'var(--bg3)',
              border: '1px solid var(--bd)',
              borderLeft: isFirst ? '1px solid var(--bd)' : 'none',
              borderRadius: isFirst
                ? '6px 0 0 6px'
                : isLast
                ? '0 6px 6px 0'
                : 0,
              cursor: 'default',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg3)';
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15,
                fontWeight: 500,
                color: '#b07d10',
                lineHeight: 1.2,
              }}
            >
              {stat.value}
            </span>
            <span
              style={{
                fontFamily: "'Syne', system-ui, sans-serif",
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--tx3)',
                lineHeight: 1.3,
              }}
            >
              {stat.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
