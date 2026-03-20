'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Company, FilterState, ViewMode, ColorTheme, SortKey } from '@/lib/types';
import { COLOR_THEMES } from '@/lib/types';
import StatBar from '@/components/StatBar';
import FilterBar from '@/components/FilterBar';
import SearchBar from '@/components/SearchBar';
import Tooltip from '@/components/Tooltip';
import DetailPanel from '@/components/DetailPanel';
import LocationDetailPanel from '@/components/LocationDetailPanel';
import type { ClickedLocationData } from '@/components/LocationDetailPanel';
import CompanyTable from '@/components/CompanyTable';
import GuidedTour from '@/components/GuidedTour';
import { loadData } from '@/lib/storage';

// Dynamic imports — ssr:false required for canvas/chart
const MapCanvas = dynamic(() => import('@/components/MapCanvas'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#edeae2' }}>
      <span style={{ color: '#9e9488', fontSize: 13 }}>Loading map...</span>
    </div>
  ),
});
const StrategyChart = dynamic(() => import('@/components/StrategyChart'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <span style={{ color: '#9e9488', fontSize: 13 }}>Loading chart...</span>
    </div>
  ),
});

function parseBucketRange(bucket: string): { min: number; max: number } {
  const s = bucket.trim();
  if (s.startsWith('<')) {
    return { min: -Infinity, max: parseFloat(s.slice(1).replace(/,/g, '').trim()) };
  }
  if (s.endsWith('+')) {
    return { min: parseFloat(s.slice(0, -1).replace(/,/g, '')), max: Infinity };
  }
  // Split on hyphen, but handle ranges like "501-1,000" by splitting on first hyphen only
  const dashIdx = s.indexOf('-');
  if (dashIdx > 0) {
    const left = s.slice(0, dashIdx).replace(/,/g, '').trim();
    const right = s.slice(dashIdx + 1).replace(/,/g, '').trim();
    return { min: parseFloat(left), max: parseFloat(right) };
  }
  const n = parseFloat(s.replace(/,/g, ''));
  return { min: n, max: n };
}

function inBucket(value: number | null | undefined, bucket: string): boolean {
  if (value == null) return false;
  const { min, max } = parseBucketRange(bucket);
  if (min === -Infinity) return value < max;
  if (max === Infinity) return value >= min;
  return value >= min && value <= max;
}

function applyFilters(companies: Company[], filters: FilterState): Company[] {
  return companies.filter((c) => {
    if (filters.footprint !== 'all' && c.footprint !== filters.footprint) return false;
    if (filters.ownership === 'pe' && !c.isPE) return false;
    if (filters.ownership === 'independent' && c.isPE) return false;
    if (filters.service && !c.services.some((s) => s.toLowerCase().includes(filters.service!.toLowerCase()))) return false;
    if (filters.minRating > 0 && (!c.avgRating || c.avgRating < filters.minRating)) return false;
    if (filters.employeeSizeFilter && !inBucket(c.employees, filters.employeeSizeFilter)) return false;
    if (filters.locationCountFilter && !inBucket(c.locationCount, filters.locationCountFilter)) return false;
    if (filters.ratingFilter && !inBucket(c.avgRating, filters.ratingFilter)) return false;
    if (filters.reviewsFilter && !inBucket(c.totalReviews, filters.reviewsFilter)) return false;
    if (filters.photosFilter && !inBucket(c.totalPhotos, filters.photosFilter)) return false;
    return true;
  });
}

function sortCompanies(companies: Company[], key: SortKey, asc: boolean): Company[] {
  return [...companies].sort((a, b) => {
    let av: number | string = 0;
    let bv: number | string = 0;
    switch (key) {
      case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
      case 'city': av = a.city.toLowerCase(); bv = b.city.toLowerCase(); break;
      case 'footprint': {
        const o = { national: 3, regional: 2, local: 1 };
        av = o[a.footprint]; bv = o[b.footprint]; break;
      }
      case 'ownership': av = a.isPE ? 1 : 0; bv = b.isPE ? 1 : 0; break;
      case 'services': av = a.services.length; bv = b.services.length; break;
      case 'locationCount': av = a.locationCount; bv = b.locationCount; break;
      case 'avgRating': av = a.avgRating ?? 0; bv = b.avgRating ?? 0; break;
      case 'score': av = a.score; bv = b.score; break;
      case 'maScore': av = a.maScore; bv = b.maScore; break;
      case 'employees':
      case 'employeeSize': av = a.employees ?? 0; bv = b.employees ?? 0; break;
      case 'totalReviews': av = a.totalReviews ?? 0; bv = b.totalReviews ?? 0; break;
      case 'totalPhotos': av = a.totalPhotos ?? 0; bv = b.totalPhotos ?? 0; break;
      case 'founded': av = a.founded ?? 9999; bv = b.founded ?? 9999; break;
    }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });
}

/* ── Empty State (no data loaded) ── */
function EmptyState() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#f6f3ee' }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-[#3d3831] rounded-full flex items-center justify-center flex-shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight" style={{ color: '#3d3831' }}>
          Market<em className="italic" style={{ color: '#b07d10' }}>Intel</em>
        </h1>
      </div>
      <p className="text-base mb-12" style={{ color: '#9e9488' }}>
        No data loaded yet. Contact your administrator.
      </p>
      <Link
        href="/admin"
        className="font-mono text-[10px] tracking-widest uppercase hover:underline"
        style={{ color: '#c4bdb4' }}
      >
        Admin
      </Link>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center" style={{ background: '#f6f3ee' }}>
        <div className="animate-pulse text-xl" style={{ color: '#3d3831' }}>Loading...</div>
      </div>
    }>
      <DashboardPage />
    </Suspense>
  );
}

function ShareBanner({ datasetId }: { datasetId: string }) {
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?d=${datasetId}`
    : `/?d=${datasetId}`;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 14px',
      background: 'linear-gradient(135deg, rgba(176,125,16,0.06), rgba(176,125,16,0.02))',
      borderBottom: '1px solid rgba(176,125,16,0.15)',
      fontSize: 11,
      flexShrink: 0,
      zIndex: 40,
    }}>
      <span style={{ fontSize: 13 }}>🔗</span>
      <span style={{ color: 'var(--tx2)', fontWeight: 500 }}>Share this map:</span>
      <code style={{
        flex: 1,
        padding: '3px 8px',
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 4,
        fontSize: 10,
        color: 'var(--acc)',
        fontFamily: "'JetBrains Mono', monospace",
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {shareUrl}
      </code>
      <button
        onClick={() => {
          try {
            navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Fallback for HTTP or unsupported browsers
            const input = document.createElement('input');
            input.value = shareUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }}
        style={{
          padding: '3px 10px',
          borderRadius: 4,
          border: '1px solid var(--acc)',
          background: copied ? 'var(--acc)' : 'transparent',
          color: copied ? 'white' : 'var(--acc)',
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'Syne', sans-serif",
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? '✓ Copied!' : 'Copy Link'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--tx3)',
          cursor: 'pointer',
          fontSize: 14,
          padding: '0 2px',
        }}
      >
        ×
      </button>
    </div>
  );
}

function DashboardPage() {
  const searchParams = useSearchParams();
  const urlDatasetId = searchParams.get('d');
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(urlDatasetId);
  const datasetId = activeDatasetId || urlDatasetId;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [industryName, setIndustryName] = useState('Market');
  const [colorTheme, setColorTheme] = useState<ColorTheme>(COLOR_THEMES[0]);
  const [filters, setFilters] = useState<FilterState>({
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
  const [currentView, setCurrentView] = useState<ViewMode>('map');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('maScore');
  const [sortAscending, setSortAscending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tooltipCompany, setTooltipCompany] = useState<Company | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [locationDetail, setLocationDetail] = useState<ClickedLocationData | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [hasData, setHasData] = useState(false);

  // Set body class for overflow:hidden on map page
  useEffect(() => {
    if (hasData) {
      document.body.classList.add('map-page');
      return () => document.body.classList.remove('map-page');
    }
  }, [hasData]);

  // Load data: if ?d= param exists, load that dataset from server.
  // Otherwise try local storage, then fall back to latest server dataset.
  useEffect(() => {
    (async () => {
      try {
        let data: Record<string, unknown> | null = null;

        if (datasetId) {
          // Shared link — load specific dataset from server
          try {
            const res = await fetch(`/api/load-data?d=${encodeURIComponent(datasetId)}`);
            const serverData = await res.json();
            if (serverData.data && serverData.data.companies) {
              data = serverData.data;
            }
          } catch {
            // Server not available
          }
        }

        // No dataset param or server failed — try local storage
        if (!data) {
          data = await loadData() as Record<string, unknown> | null;
        }
        if (!data) {
          const raw = sessionStorage.getItem('marketintel_data');
          if (raw) data = JSON.parse(raw);
        }

        // Last resort — load latest dataset from server
        if (!data) {
          try {
            const res = await fetch('/api/load-data');
            const serverData = await res.json();
            if (serverData.data && serverData.data.companies) {
              data = serverData.data;
            }
          } catch { /* OK */ }
        }

        if (!data) {
          setDataLoaded(true);
          setHasData(false);
          return;
        }

        setCompanies((data.companies as Company[]) || []);
        setIndustryName((data.industryName as string) || 'Market');
        if (data.colorTheme) setColorTheme(data.colorTheme as ColorTheme);
        if (data.warnings) setWarnings(data.warnings as string[]);
        // Store the dataset ID from the loaded data (in case URL param wasn't set)
        if (data.datasetId && typeof data.datasetId === 'string') {
          setActiveDatasetId(data.datasetId);
        }
        // Show tour on first visit only
        if (!localStorage.getItem('marketintel_tour_seen')) {
          setTimeout(() => setTourOpen(true), 800);
        }
        setHasData(true);
        setDataLoaded(true);
      } catch {
        setDataLoaded(true);
        setHasData(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSelectedCompany(null);
        setLocationDetail(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Derived state
  const filtered = useMemo(() => applyFilters(companies, filters), [companies, filters]);
  const sorted = useMemo(() => sortCompanies(filtered, sortKey, sortAscending), [filtered, sortKey, sortAscending]);

  // All unique services across companies
  const allServices = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.services.forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [companies]);

  const handleHover = useCallback((company: Company | null, x: number, y: number) => {
    setTooltipCompany(company);
    setTooltipPos({ x, y });
  }, []);

  const handleSelect = useCallback((company: Company) => {
    setSelectedCompany(company);
    setLocationDetail(null);
    setSearchOpen(false);
  }, []);

  const handleLocationClick = useCallback((data: ClickedLocationData) => {
    setLocationDetail(data);
    setSelectedCompany(null);
  }, []);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key as SortKey) {
        // Toggle direction
        setSortAscending((a) => !a);
        return prev;
      }
      // New sort key, default descending
      setSortAscending(false);
      return key as SortKey;
    });
  }, []);

  const handleFilterChange = useCallback((partial: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleExportPDF = useCallback(() => {
    document.title = `${industryName} Market Intelligence Report — ${new Date().toLocaleDateString()}`;
    window.print();
  }, [industryName]);

  // Format industry name for logo
  const logoText = useMemo(() => {
    const words = industryName.split(' ');
    if (words.length >= 2) return { prefix: words[0], suffix: 'Intel' };
    return { prefix: industryName, suffix: 'Intel' };
  }, [industryName]);

  // Still loading data
  if (!dataLoaded) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#f6f3ee' }}>
        <div className="text-center">
          <div className="animate-pulse text-2xl mb-4" style={{ color: '#3d3831' }}>Loading...</div>
          <p style={{ color: '#9e9488', fontSize: 13 }}>Preparing your market map</p>
        </div>
      </div>
    );
  }

  // No data — show empty state
  if (!hasData) {
    return <EmptyState />;
  }

  // Data exists but companies array still empty (edge case during hydration)
  if (companies.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="animate-pulse text-2xl mb-4">Loading...</div>
          <p className="text-[var(--tx3)] text-sm">Preparing your market map</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)] print-footer">
      {/* ── HEADER ── */}
      <header className="h-14 bg-white border-b-[1.5px] border-[var(--bd)] flex items-center px-[18px] gap-3 flex-shrink-0 z-50">
        {/* Logo */}
        <div className="flex items-center gap-0 flex-shrink-0">
          <div className="w-[30px] h-[30px] bg-[var(--tx)] rounded-full flex items-center justify-center mr-2.5 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
            </svg>
          </div>
          <span className="font-display text-[17px] font-semibold text-[var(--tx)] tracking-tight">
            {logoText.prefix}<em className="italic text-[var(--acc)]">{logoText.suffix}</em>
          </span>
          <span className="font-mono text-[9px] text-[var(--tx3)] tracking-widest uppercase ml-3 pl-3 border-l border-[var(--bd)] font-medium">
            M&A Market Landscape · {new Date().getFullYear()}
          </span>
        </div>

        {/* Stats */}
        <StatBar companies={filtered} />

        {/* View toggles + actions */}
        <div className="flex gap-1.5 flex-shrink-0 items-center">
          <button
            onClick={() => setCurrentView('map')}
            className={`px-3 py-[5px] rounded-[5px] border-[1.5px] text-xs font-semibold transition-all font-sans ${
              currentView === 'map'
                ? 'bg-[var(--tx)] text-white border-[var(--tx)] font-bold'
                : 'bg-transparent text-[var(--tx2)] border-[var(--bd2)] hover:bg-[var(--bg3)] hover:text-[var(--tx)]'
            }`}
          >
            Geographic
          </button>
          <button
            onClick={() => setCurrentView('strategy')}
            className={`px-3 py-[5px] rounded-[5px] border-[1.5px] text-xs font-semibold transition-all font-sans ${
              currentView === 'strategy'
                ? 'bg-[var(--tx)] text-white border-[var(--tx)] font-bold'
                : 'bg-transparent text-[var(--tx2)] border-[var(--bd2)] hover:bg-[var(--bg3)] hover:text-[var(--tx)]'
            }`}
          >
            Strategy View
          </button>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-8 h-8 bg-transparent border-[1.5px] border-[var(--bd2)] text-[var(--tx2)] rounded-[5px] flex items-center justify-center text-[17px] hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-all"
            title="Search (Cmd+K)"
          >
            ⌕
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3 py-[5px] rounded-[5px] border-[1.5px] bg-transparent text-[var(--tx2)] border-[var(--bd2)] text-xs font-semibold hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-all font-sans no-print"
          >
            Export PDF
          </button>
          <button
            onClick={() => setTourOpen(true)}
            className="w-8 h-8 bg-transparent border-[1.5px] border-[var(--bd2)] text-[var(--tx2)] rounded-[5px] flex items-center justify-center text-sm font-bold hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-all no-print"
            title="How to use — Open guided tour"
          >
            ?
          </button>
        </div>
      </header>

      {/* ── SHAREABLE LINK BANNER (visible when dataset has an ID) ── */}
      {datasetId && (
        <ShareBanner datasetId={datasetId} />
      )}

      {/* ── SEARCH OVERLAY ── */}
      <SearchBar
        companies={companies}
        onSelect={handleSelect}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* ── FILTER BAR ── */}
      <FilterBar
        filters={filters}
        onFilter={handleFilterChange}
        services={allServices}
      />

      {/* ── WARNINGS ── */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-[rgba(176,125,16,0.06)] border-b border-[rgba(176,125,16,0.15)] text-xs text-[var(--acc)] flex items-center gap-2 no-print">
          <span>⚠</span>
          {warnings.join(' · ')}
        </div>
      )}

      {/* ── MAIN AREA ── */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: 300 }}>
        {/* Geographic View */}
        <div
          className={`absolute inset-0 flex flex-col ${currentView === 'map' ? '' : 'hidden'}`}
        >
          <MapCanvas
            companies={filtered}
            onHover={handleHover}
            onClick={handleSelect}
            onLocationClick={handleLocationClick}
            selectedId={selectedCompany?.id ?? null}
          />
        </div>

        {/* Strategy View */}
        <div
          className={`absolute inset-0 flex flex-col ${currentView === 'strategy' ? '' : 'hidden'}`}
        >
          <StrategyChart companies={filtered} onSelect={handleSelect} />
        </div>
      </div>

      {/* ── TOOLTIP ── */}
      <Tooltip company={tooltipCompany} x={tooltipPos.x} y={tooltipPos.y} onViewProfile={handleSelect} />

      {/* ── DETAIL PANEL ── */}
      <DetailPanel
        company={selectedCompany}
        allCompanies={companies}
        onClose={() => setSelectedCompany(null)}
        onSelectCompany={handleSelect}
        datasetId={datasetId}
      />

      {/* ── LOCATION DETAIL PANEL ── */}
      {locationDetail && (
        <LocationDetailPanel
          data={locationDetail}
          allCompanies={companies}
          onClose={() => setLocationDetail(null)}
          onViewCompany={handleSelect}
          datasetId={datasetId}
        />
      )}

      {/* ── COMPANY TABLE ── */}
      <CompanyTable
        companies={sorted}
        selectedId={selectedCompany?.id ?? null}
        onSelect={handleSelect}
        sortKey={sortKey}
        sortAscending={sortAscending}
        onSort={handleSort}
        activeFilters={filters}
      />

      {/* ── GUIDED TOUR ── */}
      <GuidedTour isOpen={tourOpen} onClose={() => { setTourOpen(false); localStorage.setItem('marketintel_tour_seen', '1'); }} />
    </div>
  );
}
