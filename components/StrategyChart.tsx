'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Chart,
  BubbleController,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bubble } from 'react-chartjs-2';
import type { Company } from '@/lib/types';

Chart.register(BubbleController, LinearScale, PointElement, Tooltip, Legend);

interface StrategyChartProps {
  companies: Company[];
  onSelect: (company: Company) => void;
}

type MetricKey = 'locationCount' | 'score' | 'avgRating' | 'totalReviews' | 'employees' | 'maScore' | 'founded';

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'locationCount', label: 'Locations' },
  { key: 'score', label: 'Platform Score' },
  { key: 'avgRating', label: 'Avg Rating' },
  { key: 'totalReviews', label: 'Total Reviews' },
  { key: 'employees', label: 'Employees' },
  { key: 'maScore', label: 'M&A Score' },
  { key: 'founded', label: 'Founded Year' },
];

const FOOTPRINT_COLORS: Record<string, string> = {
  national: '#b03a1a',
  regional: '#1a4f96',
  local: '#1a7040',
};

function getVal(company: Company, key: MetricKey): number {
  const v = company[key];
  if (v == null) return 0;
  return typeof v === 'number' ? v : 0;
}

function AxisSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MetricKey;
  onChange: (v: MetricKey) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MetricKey)}
        style={{
          fontFamily: "'Syne', system-ui, sans-serif",
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 8px',
          background: 'var(--bg3)',
          border: '1px solid var(--bd)',
          borderRadius: 5,
          color: 'var(--tx)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {METRIC_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function StrategyChart({ companies, onSelect }: StrategyChartProps) {
  const [xKey, setXKey] = useState<MetricKey>('locationCount');
  const [yKey, setYKey] = useState<MetricKey>('score');
  const [sizeKey, setSizeKey] = useState<MetricKey>('locationCount');
  const chartRef = useRef<Chart<'bubble'> | null>(null);

  // Company lookup for click handler
  const companyLookup = useMemo(() => {
    const map: Record<string, Company> = {};
    companies.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [companies]);

  const chartData = useMemo(() => {
    const footprints = ['national', 'regional', 'local'] as const;
    const labels: Record<string, string> = {
      national: 'National',
      regional: 'Regional',
      local: 'Single Loc',
    };

    // Exclude companies with null values for selected axes
    const validCompanies = companies.filter((c) => {
      if (xKey === 'founded' && c.founded == null) return false;
      if (yKey === 'founded' && c.founded == null) return false;
      if (xKey === 'avgRating' && c.avgRating == null) return false;
      if (yKey === 'avgRating' && c.avgRating == null) return false;
      if (xKey === 'employees' && c.employees == null) return false;
      if (yKey === 'employees' && c.employees == null) return false;
      return true;
    });

    return {
      datasets: footprints.map((fp) => {
        const group = validCompanies.filter((c) => c.footprint === fp);
        const maxSize = Math.max(
          1,
          ...validCompanies.map((c) => getVal(c, sizeKey))
        );
        return {
          label: labels[fp],
          data: group.map((c) => ({
            x: getVal(c, xKey),
            y: getVal(c, yKey),
            r: Math.max(4, Math.min(28, (getVal(c, sizeKey) / maxSize) * 28)),
            _companyId: c.id,
          })),
          backgroundColor: FOOTPRINT_COLORS[fp] + '55',
          borderColor: FOOTPRINT_COLORS[fp] + 'cc',
          borderWidth: 1.5,
          hoverBackgroundColor: FOOTPRINT_COLORS[fp] + '88',
          hoverBorderColor: FOOTPRINT_COLORS[fp],
          hoverBorderWidth: 2,
        };
      }),
    };
  }, [companies, xKey, yKey, sizeKey]);

  const chartOptions = useMemo(() => {
    const xLabel = METRIC_OPTIONS.find((o) => o.key === xKey)?.label || '';
    const yLabel = METRIC_OPTIONS.find((o) => o.key === yKey)?.label || '';

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 } as const,
      plugins: {
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
            font: {
              family: "'Syne', system-ui, sans-serif",
              size: 11,
              weight: '600' as const,
            },
            color: '#6b6258',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(28,24,20,0.92)',
          titleFont: {
            family: "'Syne', system-ui, sans-serif",
            size: 12,
            weight: '600' as const,
          },
          bodyFont: {
            family: "'JetBrains Mono', monospace",
            size: 11,
          },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            title: (items: { datasetIndex: number; dataIndex: number }[]) => {
              if (!items.length) return '';
              const item = items[0];
              const point = chartData.datasets[item.datasetIndex]?.data[item.dataIndex] as
                | { _companyId?: string }
                | undefined;
              if (!point?._companyId) return '';
              const co = companyLookup[point._companyId];
              return co ? co.name : '';
            },
            label: (ctx: { raw: { x: number; y: number } }) => {
              const raw = ctx.raw;
              return `${xLabel}: ${raw.x}  |  ${yLabel}: ${raw.y}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: xLabel,
            font: {
              family: "'Syne', system-ui, sans-serif",
              size: 11,
              weight: '600' as const,
            },
            color: '#6b6258',
          },
          grid: { color: 'rgba(28,24,20,0.05)' },
          ticks: {
            font: {
              family: "'JetBrains Mono', monospace",
              size: 10,
            },
            color: '#9e9488',
          },
        },
        y: {
          title: {
            display: true,
            text: yLabel,
            font: {
              family: "'Syne', system-ui, sans-serif",
              size: 11,
              weight: '600' as const,
            },
            color: '#6b6258',
          },
          grid: { color: 'rgba(28,24,20,0.05)' },
          ticks: {
            font: {
              family: "'JetBrains Mono', monospace",
              size: 10,
            },
            color: '#9e9488',
          },
        },
      },
      onClick: (_event: unknown, elements: { datasetIndex: number; index: number }[]) => {
        if (!elements.length) return;
        const el = elements[0];
        const point = chartData.datasets[el.datasetIndex]?.data[el.index] as
          | { _companyId?: string }
          | undefined;
        if (!point?._companyId) return;
        const co = companyLookup[point._companyId];
        if (co) onSelect(co);
      },
    };
  }, [xKey, yKey, chartData, companyLookup, onSelect]);

  // Quadrant labels
  const xLabel = METRIC_OPTIONS.find((o) => o.key === xKey)?.label || '';
  const yLabel = METRIC_OPTIONS.find((o) => o.key === yKey)?.label || '';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg2)',
        fontFamily: "'Syne', system-ui, sans-serif",
      }}
    >
      {/* Header with axis selectors */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 14px',
          borderBottom: '1px solid var(--bd)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--tx)',
            marginRight: 8,
          }}
        >
          Strategy Matrix
        </span>
        <AxisSelect label="X-AXIS" value={xKey} onChange={setXKey} />
        <AxisSelect label="Y-AXIS" value={yKey} onChange={setYKey} />
        <AxisSelect label="BUBBLE SIZE" value={sizeKey} onChange={setSizeKey} />
      </div>

      {/* Chart area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          padding: '12px 14px',
          minHeight: 0,
        }}
      >
        {/* Quadrant labels */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 28,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            color: 'var(--tx3)',
            opacity: 0.45,
            lineHeight: 1.5,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          HIGH {yLabel.toUpperCase()} / LOW {xLabel.toUpperCase()}
          <br />
          Emerging Targets
        </div>
        <div
          style={{
            position: 'absolute',
            top: 24,
            right: 28,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            color: 'var(--tx3)',
            opacity: 0.45,
            lineHeight: 1.5,
            textAlign: 'right',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          HIGH {yLabel.toUpperCase()} / HIGH {xLabel.toUpperCase()}
          <br />
          Platform Companies
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            left: 28,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            color: 'var(--tx3)',
            opacity: 0.45,
            lineHeight: 1.5,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          LOW {yLabel.toUpperCase()} / LOW {xLabel.toUpperCase()}
          <br />
          Early Stage
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            right: 28,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            color: 'var(--tx3)',
            opacity: 0.45,
            lineHeight: 1.5,
            textAlign: 'right',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          LOW {yLabel.toUpperCase()} / HIGH {xLabel.toUpperCase()}
          <br />
          Roll-Up Candidates
        </div>

        <Bubble
          ref={chartRef as any}
          data={chartData as Parameters<typeof Bubble>[0]['data']}
          options={chartOptions as any}
        />
      </div>
    </div>
  );
}
