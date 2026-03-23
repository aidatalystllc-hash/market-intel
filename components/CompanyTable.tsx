'use client';

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import type { Company, Location, FilterState } from '@/lib/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type TableViewMode = 'company' | 'location';

interface FlatLocation {
  id: string;
  location: Location;
  parentCompany: Company;
}

interface CompanyTableProps {
  companies: Company[];
  selectedId: string | null;
  onSelect: (company: Company) => void;
  sortKey: string;
  sortAscending: boolean;
  onSort: (key: string) => void;
  activeFilters?: FilterState;
}

const FOOTPRINT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  national: { bg: 'rgba(176,58,26,0.10)', color: 'var(--nat)', label: 'National' },
  regional: { bg: 'rgba(26,79,150,0.10)', color: 'var(--reg)', label: 'Regional' },
  local: { bg: 'rgba(26,112,64,0.10)', color: 'var(--loc)', label: 'Single Loc' },
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
  { key: 'employeeSize', label: 'Employees', width: '80px', align: 'center' },
  { key: 'avgRating', label: 'Avg Rating', width: '80px', align: 'right' },
  { key: 'totalReviews', label: 'Reviews', width: '70px', align: 'right' },
  { key: 'totalPhotos', label: 'Photos', width: '65px', align: 'right' },
  { key: 'services', label: 'Services', width: '180px' },
  { key: 'score', label: 'Score', width: '65px', align: 'right' },
  { key: 'maScore', label: 'M&A Score', width: '80px', align: 'right' },
];

const LOCATION_COLUMNS: ColumnDef[] = [
  { key: 'locName', label: 'Location Name', width: '180px' },
  { key: 'locAddress', label: 'Address', width: '180px' },
  { key: 'parentCompany', label: 'Parent Company', width: '150px' },
  { key: 'locRating', label: 'Rating', width: '75px', align: 'right' },
  { key: 'locReviews', label: 'Reviews', width: '75px', align: 'right' },
  { key: 'locPhotos', label: 'Photos', width: '70px', align: 'right' },
  { key: 'locPhone', label: 'Phone', width: '120px' },
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

// Map active filter keys to column keys for gold highlight
function getFilteredColumnKeys(filters?: FilterState): Set<string> {
  const keys = new Set<string>();
  if (!filters) return keys;
  if (filters.footprint !== 'all') keys.add('footprint');
  if (filters.ownership !== 'all') keys.add('ownership');
  if (filters.service) keys.add('services');
  if (filters.minRating > 0) keys.add('avgRating');
  if (filters.employeeSizeFilter) keys.add('employeeSize');
  if (filters.locationCountFilter) keys.add('locationCount');
  if (filters.ratingFilter) keys.add('avgRating');
  if (filters.reviewsFilter) keys.add('totalReviews');
  if (filters.photosFilter) keys.add('totalPhotos');
  return keys;
}

export default function CompanyTable({
  companies,
  selectedId,
  onSelect,
  sortKey,
  sortAscending,
  onSort,
  activeFilters,
}: CompanyTableProps) {
  const [tableViewMode, setTableViewMode] = useState<TableViewMode>('company');
  const [isExporting, setIsExporting] = useState(false);
  const filteredCols = useMemo(() => getFilteredColumnKeys(activeFilters), [activeFilters]);

  // Flatten all locations for location view, sorted by rating descending
  const flatLocations = useMemo<FlatLocation[]>(() => {
    if (tableViewMode !== 'location') return [];
    const locs: FlatLocation[] = [];
    for (const c of companies) {
      for (let i = 0; i < c.locations.length; i++) {
        locs.push({
          id: `${c.id}-loc-${i}`,
          location: c.locations[i],
          parentCompany: c,
        });
      }
    }
    // Default sort: rating descending
    locs.sort((a, b) => (b.location.rating ?? 0) - (a.location.rating ?? 0));
    return locs;
  }, [companies, tableViewMode]);

  const handleDownloadPDF = useCallback(() => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      // Style guide colors (matching the app)
      const GOLD: [number, number, number] = [176, 125, 16];      // #b07d10 — accent
      const WARM_BG: [number, number, number] = [246, 243, 238];   // #f6f3ee — page background
      const WARM_BG3: [number, number, number] = [240, 236, 228];  // #f0ece4 — alt row
      const TX: [number, number, number] = [28, 24, 20];           // #1c1814 — primary text
      const TX2: [number, number, number] = [107, 98, 88];         // #6b6258 — secondary text
      const TX3: [number, number, number] = [158, 148, 136];       // #9e9488 — label text
      const NAT: [number, number, number] = [176, 58, 26];         // #b03a1a — national
      const REG: [number, number, number] = [26, 79, 150];         // #1a4f96 — regional
      const LOC: [number, number, number] = [26, 112, 64];         // #1a7040 — local
      const PE: [number, number, number] = [122, 16, 80];          // #7a1050 — PE
      const BD: [number, number, number] = [221, 216, 206];        // #ddd8ce — border

      // Page background
      doc.setFillColor(...WARM_BG);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Header bar — white strip with gold bottom border (matching app header)
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, 56, 'F');
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(1.5);
      doc.line(0, 56, pageWidth, 56);

      // Logo mark (small gold circle)
      doc.setFillColor(...GOLD);
      doc.circle(52, 28, 8, 'F');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('M', 49, 31);

      // Title
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(...TX);
      doc.text(tableViewMode === 'company' ? 'Company Roster' : 'Location Roster', 68, 26);

      // Subtitle — count + date
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TX2);
      const countStr = tableViewMode === 'company' ? `${companies.length} companies` : `${flatLocations.length} locations`;
      doc.text(`${countStr}  ·  ${dateStr}`, 68, 40);

      // "MarketIntel" branding on the right
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TX3);
      doc.text('MarketIntel', pageWidth - 40, 32, { align: 'right' });

      // Footprint color helper for cell rendering
      const footprintColor = (fp: string): [number, number, number] => {
        if (fp === 'national') return NAT;
        if (fp === 'regional') return REG;
        return LOC;
      };
      const footprintLabel = (fp: string): string => {
        if (fp === 'local') return 'Single Loc';
        return fp.charAt(0).toUpperCase() + fp.slice(1);
      };

      // Common table styles matching the app
      const baseStyles = {
        fontSize: 7.5,
        cellPadding: { top: 4, right: 5, bottom: 4, left: 5 },
        overflow: 'linebreak' as const,
        textColor: TX,
        lineColor: BD,
        lineWidth: 0.5,
      };

      // Header styles — warm off-white with gold text (matches app's filter bar style)
      const headerStyles = {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: TX2,
        fontSize: 7,
        fontStyle: 'bold' as const,
        cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
      };

      // Footer drawer
      const drawFooter = (data: { pageNumber: number }) => {
        const pc = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
        // Footer background
        doc.setFillColor(255, 255, 255);
        doc.rect(0, pageHeight - 30, pageWidth, 30, 'F');
        doc.setDrawColor(...BD);
        doc.setLineWidth(0.5);
        doc.line(40, pageHeight - 30, pageWidth - 40, pageHeight - 30);
        doc.setFontSize(6.5);
        doc.setTextColor(...TX3);
        doc.text('Confidential — Generated by MarketIntel', 40, pageHeight - 16);
        doc.text(`Page ${data.pageNumber} of ${pc}`, pageWidth - 40, pageHeight - 16, { align: 'right' });
      };

      // Background fill for each new page
      const drawPageBg = () => {
        doc.setFillColor(...WARM_BG);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
      };

      if (tableViewMode === 'company') {
        const head = [['COMPANY', 'LOCATION', 'FOOTPRINT', 'OWNERSHIP', 'LOCS', 'EMPLOYEES', 'AVG RATING', 'REVIEWS', 'PHOTOS', 'SERVICES', 'SCORE', 'M&A']];
        const body = companies.map(c => [
          c.name || '—',
          [c.city, c.state].filter(Boolean).join(', ') || '—',
          footprintLabel(c.footprint),
          c.isPE ? 'PE-Backed' : c.isFamily ? 'Family' : 'Independent',
          String(c.locationCount),
          c.employeeSize || '—',
          c.avgRating != null ? c.avgRating.toFixed(1) : '—',
          c.totalReviews != null ? c.totalReviews.toLocaleString() : '—',
          c.totalPhotos != null ? c.totalPhotos.toLocaleString() : '—',
          c.services.slice(0, 5).join(', ') || '—',
          c.score.toFixed(1),
          String(c.maScore),
        ]);

        autoTable(doc, {
          head,
          body,
          startY: 66,
          styles: baseStyles,
          headStyles: headerStyles,
          alternateRowStyles: { fillColor: WARM_BG3 },
          bodyStyles: { fillColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 100, fontStyle: 'bold' },
            1: { cellWidth: 68, textColor: TX2 },
            2: { cellWidth: 48, halign: 'center' },
            3: { cellWidth: 52, halign: 'center' },
            4: { cellWidth: 28, halign: 'right' },
            5: { cellWidth: 48, halign: 'center', textColor: TX2 },
            6: { cellWidth: 42, halign: 'right' },
            7: { cellWidth: 40, halign: 'right' },
            8: { cellWidth: 36, halign: 'right', textColor: TX2 },
            9: { cellWidth: 115, fontSize: 6.5, textColor: TX2 },
            10: { cellWidth: 34, halign: 'right' },
            11: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
          },
          margin: { left: 40, right: 40, bottom: 36 },
          didDrawPage: (data) => {
            if (data.pageNumber > 1) drawPageBg();
            drawFooter(data);
          },
          // Color-code footprint and ownership cells per row
          didParseCell: (data) => {
            if (data.section !== 'body') return;
            const rowIdx = data.row.index;
            const company = companies[rowIdx];
            if (!company) return;

            // Footprint column — colored text
            if (data.column.index === 2) {
              data.cell.styles.textColor = footprintColor(company.footprint);
              data.cell.styles.fontStyle = 'bold';
            }
            // Ownership column — PE gets burgundy
            if (data.column.index === 3) {
              if (company.isPE) {
                data.cell.styles.textColor = PE;
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = TX3;
              }
            }
            // Avg Rating — gold highlight for 4.8+
            if (data.column.index === 6 && company.avgRating != null && company.avgRating >= 4.8) {
              data.cell.styles.textColor = GOLD;
              data.cell.styles.fontStyle = 'bold';
            }
            // M&A Score — gold highlight for 70+
            if (data.column.index === 11 && company.maScore >= 70) {
              data.cell.styles.textColor = GOLD;
            }
          },
        });
      } else {
        // Build all locations for PDF
        const allLocs: FlatLocation[] = [];
        for (const c of companies) {
          for (let i = 0; i < c.locations.length; i++) {
            allLocs.push({ id: `${c.id}-loc-${i}`, location: c.locations[i], parentCompany: c });
          }
        }
        allLocs.sort((a, b) => (b.location.rating ?? 0) - (a.location.rating ?? 0));

        const head = [['LOCATION NAME', 'ADDRESS', 'PARENT COMPANY', 'RATING', 'REVIEWS', 'PHOTOS', 'PHONE']];
        const body = allLocs.map(fl => {
          const loc = fl.location;
          return [
            loc.name || '—',
            [loc.address, loc.city, loc.state].filter(Boolean).join(', ') || '—',
            fl.parentCompany.name || '—',
            loc.rating != null ? loc.rating.toFixed(1) : '—',
            loc.reviews != null ? loc.reviews.toLocaleString() : '—',
            loc.photosCount != null ? loc.photosCount.toLocaleString() : '—',
            loc.phone || '—',
          ];
        });

        autoTable(doc, {
          head,
          body,
          startY: 66,
          styles: baseStyles,
          headStyles: headerStyles,
          alternateRowStyles: { fillColor: WARM_BG3 },
          bodyStyles: { fillColor: [255, 255, 255] },
          columnStyles: {
            0: { cellWidth: 120, fontStyle: 'bold' },
            1: { cellWidth: 160, textColor: TX2 },
            2: { cellWidth: 110, fontStyle: 'bold' },
            3: { cellWidth: 45, halign: 'right' },
            4: { cellWidth: 50, halign: 'right' },
            5: { cellWidth: 45, halign: 'right', textColor: TX2 },
            6: { cellWidth: 90, textColor: TX2 },
          },
          margin: { left: 40, right: 40, bottom: 36 },
          didDrawPage: (data) => {
            if (data.pageNumber > 1) drawPageBg();
            drawFooter(data);
          },
          didParseCell: (data) => {
            if (data.section !== 'body') return;
            const fl = allLocs[data.row.index];
            if (!fl) return;
            // Rating — gold highlight for 4.8+
            if (data.column.index === 3 && fl.location.rating != null && fl.location.rating >= 4.8) {
              data.cell.styles.textColor = GOLD;
              data.cell.styles.fontStyle = 'bold';
            }
          },
        });
      }

      const filename = tableViewMode === 'company'
        ? `company-roster-${now.toISOString().slice(0, 10)}.pdf`
        : `location-roster-${now.toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [companies, flatLocations, tableViewMode]);

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
          {tableViewMode === 'company' ? 'COMPANY ROSTER' : 'LOCATION ROSTER'}
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            color: '#b07d10',
          }}
        >
          {tableViewMode === 'company' ? companies.length : flatLocations.length}
        </span>

        {/* Company / Location toggle */}
        <div style={{ display: 'flex', gap: 1, marginLeft: 10 }}>
          <button
            onClick={() => setTableViewMode('company')}
            style={{
              padding: '2px 8px',
              borderRadius: '4px 0 0 4px',
              border: '1px solid',
              borderColor: tableViewMode === 'company' ? '#b07d10' : 'var(--bd)',
              background: tableViewMode === 'company' ? 'rgba(176,125,16,0.12)' : 'var(--bg)',
              color: tableViewMode === 'company' ? '#b07d10' : 'var(--tx3)',
              fontSize: 9,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            Company View
          </button>
          <button
            onClick={() => setTableViewMode('location')}
            style={{
              padding: '2px 8px',
              borderRadius: '0 4px 4px 0',
              border: '1px solid',
              borderColor: tableViewMode === 'location' ? '#b07d10' : 'var(--bd)',
              background: tableViewMode === 'location' ? 'rgba(176,125,16,0.12)' : 'var(--bg)',
              color: tableViewMode === 'location' ? '#b07d10' : 'var(--tx3)',
              fontSize: 9,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            Location View
          </button>
        </div>

        <span style={{ flex: 1 }} />

        {/* Download PDF button */}
        <button
          onClick={handleDownloadPDF}
          disabled={isExporting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 4,
            border: '1px solid var(--bd)',
            background: isExporting ? 'var(--bg3)' : 'var(--bg)',
            color: isExporting ? 'var(--tx3)' : 'var(--tx2)',
            fontSize: 9,
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor: isExporting ? 'wait' : 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseEnter={(e) => {
            if (!isExporting) {
              e.currentTarget.style.background = 'var(--bg3)';
              e.currentTarget.style.borderColor = '#b07d10';
              e.currentTarget.style.color = '#b07d10';
            }
          }}
          onMouseLeave={(e) => {
            if (!isExporting) {
              e.currentTarget.style.background = 'var(--bg)';
              e.currentTarget.style.borderColor = 'var(--bd)';
              e.currentTarget.style.color = 'var(--tx2)';
            }
          }}
        >
          {isExporting ? (
            <>Exporting...</>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
              </svg>
              Download PDF
            </>
          )}
        </button>

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

      {/* Table — single scroll container for header + body alignment */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Column headers (sticky top) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            height: 26,
            minWidth: 'max-content',
            borderBottom: '1px solid var(--bd)',
            background: 'var(--bg3)',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 2,
          }}
        >
          {tableViewMode === 'company'
            ? COLUMNS.map((col) => (
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
                    color: sortKey === col.key || filteredCols.has(col.key) ? '#b07d10' : 'var(--tx3)',
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
              ))
            : LOCATION_COLUMNS.map((col) => (
                <div
                  key={col.key}
                  style={{
                    width: col.width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--tx3)',
                    textAlign: col.align || 'left',
                    userSelect: 'none',
                    padding: '0 4px',
                  }}
                >
                  {col.label}
                </div>
              ))}
        </div>

        {/* Scrollable body — virtualized for large datasets */}
        {tableViewMode === 'company' ? (
          <VirtualizedBody
            companies={companies}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ) : (
          <LocationVirtualizedBody
            locations={flatLocations}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

// Virtualized table body — only renders visible rows
const ROW_HEIGHT = 32;
const OVERSCAN = 10;

function VirtualizedBody({
  companies,
  selectedId,
  onSelect,
}: {
  companies: Company[];
  selectedId: string | null;
  onSelect: (c: Company) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(300);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const obs = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const totalHeight = companies.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(companies.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleCompanies = companies.slice(startIdx, endIdx);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
          {visibleCompanies.map((company) => {
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
                    loading="lazy"
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

                {/* Ownership — single-line only */}
                <div
                  style={{
                    width: COLUMNS[3].width,
                    flexShrink: 0,
                    textAlign: 'center',
                    padding: '0 4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 100,
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
                      PE
                    </span>
                  ) : company.isFamily ? (
                    <span style={{ fontSize: 10, color: 'var(--tx3)' }}>Family</span>
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

                {/* Employees */}
                <div
                  style={{
                    width: COLUMNS[5].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    color: 'var(--tx2)',
                    textAlign: 'center',
                    padding: '0 4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {company.employeeSize || '--'}
                </div>

                {/* Avg Rating */}
                <div
                  style={{
                    width: COLUMNS[6].width,
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

                {/* Reviews */}
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
                  {company.totalReviews != null ? company.totalReviews.toLocaleString() : '--'}
                </div>

                {/* Photos */}
                <div
                  style={{
                    width: COLUMNS[8].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--tx2)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {company.totalPhotos != null ? company.totalPhotos.toLocaleString() : '--'}
                </div>

                {/* Services */}
                <div
                  style={{
                    width: COLUMNS[9].width,
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

                {/* Score — rounded to 1 decimal */}
                <div
                  style={{
                    width: COLUMNS[10].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--tx)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {company.score.toFixed(1)}
                </div>

                {/* M&A Score */}
                <div
                  style={{
                    width: COLUMNS[11].width,
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

// Location view virtualized body
function LocationVirtualizedBody({
  locations,
  selectedId,
  onSelect,
}: {
  locations: FlatLocation[];
  selectedId: string | null;
  onSelect: (c: Company) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(300);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const obs = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const totalHeight = locations.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(locations.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleLocations = locations.slice(startIdx, endIdx);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
          {visibleLocations.map((fl) => {
            const isSelected = fl.parentCompany.id === selectedId;
            const loc = fl.location;
            const formatPhone = (phone: string) => {
              const digits = phone.replace(/\D/g, '');
              if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
              if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
              return phone;
            };

            return (
              <div
                key={fl.id}
                onClick={() => onSelect(fl.parentCompany)}
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
                {/* Location Name */}
                <div
                  style={{
                    width: LOCATION_COLUMNS[0].width,
                    flexShrink: 0,
                    fontWeight: 600,
                    fontSize: 12,
                    color: 'var(--tx)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 4px',
                  }}
                >
                  {loc.name || '—'}
                </div>

                {/* Address */}
                <div
                  style={{
                    width: LOCATION_COLUMNS[1].width,
                    flexShrink: 0,
                    fontSize: 11,
                    color: 'var(--tx2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 4px',
                  }}
                >
                  {[loc.address, loc.city, loc.state].filter(Boolean).join(', ') || '—'}
                </div>

                {/* Parent Company */}
                <div
                  style={{
                    width: LOCATION_COLUMNS[2].width,
                    flexShrink: 0,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--tx)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 4px',
                  }}
                >
                  {fl.parentCompany.name}
                </div>

                {/* Rating */}
                <div
                  style={{
                    width: LOCATION_COLUMNS[3].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: loc.rating != null && loc.rating >= 4.8 ? '#b07d10' : 'var(--tx)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {loc.rating != null ? loc.rating.toFixed(1) : '--'}
                </div>

                {/* Reviews */}
                <div
                  style={{
                    width: LOCATION_COLUMNS[4].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--tx)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {loc.reviews != null ? loc.reviews.toLocaleString() : '--'}
                </div>

                {/* Photos */}
                <div
                  style={{
                    width: LOCATION_COLUMNS[5].width,
                    flexShrink: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--tx2)',
                    textAlign: 'right',
                    padding: '0 4px',
                  }}
                >
                  {loc.photosCount != null ? loc.photosCount.toLocaleString() : '--'}
                </div>

                {/* Phone */}
                <div
                  style={{
                    width: LOCATION_COLUMNS[6].width,
                    flexShrink: 0,
                    fontSize: 11,
                    color: 'var(--tx2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 4px',
                  }}
                >
                  {loc.phone ? formatPhone(loc.phone) : '--'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
