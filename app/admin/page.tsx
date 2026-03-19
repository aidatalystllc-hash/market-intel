'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UploadZone from '@/components/UploadZone';
import { COLOR_THEMES } from '@/lib/types';
import type { ColorTheme } from '@/lib/types';
import { storeData } from '@/lib/storage';

const LOADING_STEPS = [
  'Reading files...',
  'Mapping columns with AI...',
  'Calculating footprints...',
  'Computing M&A scores...',
  'Building your map...',
];

/* ── Password Gate ── */
function PasswordGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem('marketintel_admin', '1');
        onAuthenticated();
      } else {
        const data = await res.json();
        setError(data.error || 'Incorrect password.');
      }
    } catch {
      setError('Could not verify password.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-[var(--tx)] rounded-full flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
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
        <h1 className="font-display text-3xl font-semibold text-[var(--tx)] tracking-tight">
          Market<em className="italic text-[var(--acc)]">Intel</em>
        </h1>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <label className="font-mono text-[9px] text-[var(--tx3)] tracking-widest uppercase text-center">
          Admin Access
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
          className="w-full bg-[var(--bg2)] border border-[var(--bd2)] text-[var(--tx)] px-4 py-2.5 rounded-lg text-sm outline-none focus:border-[var(--acc)] font-sans text-center"
        />
        {error && (
          <p className="text-xs text-[var(--nat)] text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={checking || !password}
          className="bg-[var(--tx)] text-[var(--bg2)] px-6 py-2.5 rounded-lg font-semibold text-sm tracking-wide hover:bg-[#2d2a26] transition-colors disabled:opacity-40"
        >
          {checking ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

/* ── Upload Interface (moved from previous root page) ── */
export default function AdminPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  // Check if already authenticated this session
  useEffect(() => {
    if (sessionStorage.getItem('marketintel_admin') === '1') {
      setAuthenticated(true);
    }
  }, []);

  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [locationFile, setLocationFile] = useState<File | null>(null);
  const [companyColumns, setCompanyColumns] = useState<string[]>([]);
  const [locationColumns, setLocationColumns] = useState<string[]>([]);
  const [companyRows, setCompanyRows] = useState(0);
  const [locationRows, setLocationRows] = useState(0);
  const [industryName, setIndustryName] = useState('');
  const [colorTheme, setColorTheme] = useState<ColorTheme>(COLOR_THEMES[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const readFilePreview = useCallback(
    async (file: File): Promise<{ columns: string[]; rowCount: number }> => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const buffer = await file.arrayBuffer();

      if (ext === 'json') {
        const text = new TextDecoder().decode(buffer);
        const data = JSON.parse(text);
        const rows = Array.isArray(data) ? data : [data];
        return { columns: rows.length > 0 ? Object.keys(rows[0]) : [], rowCount: rows.length };
      }

      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      return {
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        rowCount: rows.length,
      };
    },
    []
  );

  const handleCompanyFile = useCallback(
    async (file: File) => {
      setCompanyFile(file);
      setError('');
      try {
        const { columns, rowCount } = await readFilePreview(file);
        setCompanyColumns(columns);
        setCompanyRows(rowCount);
      } catch {
        setError('Could not read company file. Check that it is a valid .xlsx or .json file.');
      }
    },
    [readFilePreview]
  );

  const handleLocationFile = useCallback(
    async (file: File) => {
      setLocationFile(file);
      setError('');
      try {
        const { columns, rowCount } = await readFilePreview(file);
        setLocationColumns(columns);
        setLocationRows(rowCount);
      } catch {
        setError('Could not read location file. Check that it is a valid .xlsx or .json file.');
      }
    },
    [readFilePreview]
  );

  // Store processed data using IndexedDB (handles any size)
  // After upload, redirect to / (the map dashboard)
  const storeAndNavigate = useCallback(
    async (companies: Record<string, unknown>[], warnings: string[]) => {
      await storeData({
        companies,
        industryName: industryName || 'Market',
        colorTheme,
        warnings,
        showTour: true,
      });
      router.push('/');
    },
    [industryName, colorTheme, router]
  );

  // Parse a file in the browser (no Node.js Buffer needed)
  const parseBrowserFile = useCallback(
    async (file: File): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> => {
      const ext = file.name.toLowerCase().split('.').pop();
      const arrayBuf = await file.arrayBuffer();

      if (ext === 'json') {
        const text = new TextDecoder().decode(arrayBuf);
        const parsed = JSON.parse(text);
        const rows: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
        if (rows.length === 0) return { columns: [], rows: [] };

        // Check for nested UDU format
        const { isNestedUduFormat, flattenUduJson } = await import('@/lib/flattenJson');
        if (isNestedUduFormat(rows)) {
          console.log(`Detected nested UDU format — flattening ${rows.length} rows...`);
          return flattenUduJson(rows);
        }

        return { columns: Object.keys(rows[0]), rows };
      }

      // Excel file — use xlsx in browser mode
      const XLSX = await import('xlsx');
      const wb = XLSX.read(arrayBuf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return { columns: [], rows: [] };
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
      if (rows.length === 0) return { columns: [], rows: [] };
      return { columns: Object.keys(rows[0]), rows };
    },
    []
  );

  // Client-side processing for large files (>4MB)
  const processClientSide = useCallback(async () => {
    if (!companyFile) return;

    setLoadingStep(0); // Reading files
    await new Promise((r) => setTimeout(r, 50));

    const companyData = await parseBrowserFile(companyFile);

    if (companyData.rows.length === 0) {
      throw new Error('No data found in company file.');
    }

    setLoadingStep(1); // Mapping columns
    await new Promise((r) => setTimeout(r, 50));
    const { autoDetectColumns } = await import('@/lib/claudeMapper');
    const companyMapping = autoDetectColumns(companyData.columns);

    // Parse location file
    let locationRows: Record<string, unknown>[] | null = null;
    let locationMapping: Record<string, string> | null = null;

    if (locationFile) {
      const locationData = await parseBrowserFile(locationFile);
      if (locationData.rows.length > 0) {
        locationMapping = autoDetectColumns(locationData.columns);
        locationRows = locationData.rows;
      }
    }

    setLoadingStep(2); // Calculating footprints
    await new Promise((r) => setTimeout(r, 50));

    setLoadingStep(3); // Computing M&A scores
    const { transformCompanies } = await import('@/lib/dataTransformer');
    const companies = transformCompanies(companyData.rows, companyMapping, locationRows, locationMapping);

    setLoadingStep(4); // Building map
    const valid = companies.filter((c) => c.name && c.name !== 'Company 0');

    // Strip heavy data for large datasets
    const stripped = valid.map((c) => ({
      ...c,
      locations: c.locations.slice(0, 50),
      description: c.description ? c.description.slice(0, 500) : '',
    }));

    const warnings: string[] = [];
    const withCoords = stripped.filter((c) => c.lat !== null && c.lng !== null);
    if (withCoords.length === 0) {
      warnings.push('No companies with location data. Upload a file with latitude/longitude columns.');
    } else if (withCoords.length < stripped.length) {
      warnings.push(`${stripped.length - withCoords.length} companies missing coordinates.`);
    }

    return { companies: stripped, warnings };
  }, [companyFile, locationFile, parseBrowserFile]);

  const handleGenerate = useCallback(async () => {
    if (!companyFile) return;
    setIsProcessing(true);
    setError('');

    // Decide: client-side or server-side processing
    const totalSize = companyFile.size + (locationFile?.size || 0);
    const useClientSide = totalSize > 4 * 1024 * 1024; // > 4MB → client-side

    try {
      if (useClientSide) {
        // Large files: process entirely in the browser
        console.log(`Large files (${(totalSize / 1024 / 1024).toFixed(1)}MB) — processing client-side`);
        const result = await processClientSide();
        if (!result) throw new Error('Processing returned no data.');
        storeAndNavigate(result.companies as Record<string, unknown>[], result.warnings);
      } else {
        // Small files: use server API (can use Claude for column mapping)
        const formData = new FormData();
        formData.append('companyFile', companyFile);
        if (locationFile) formData.append('locationFile', locationFile);

        // Animation + API in parallel
        const animPromise = (async () => {
          for (let i = 0; i < LOADING_STEPS.length - 1; i++) {
            setLoadingStep(i);
            await new Promise((r) => setTimeout(r, 800));
          }
        })();

        const [res] = await Promise.all([
          fetch('/api/process', { method: 'POST', body: formData }),
          animPromise,
        ]);
        setLoadingStep(LOADING_STEPS.length - 1);

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Processing failed.');

        storeAndNavigate(data.companies, data.warnings || []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process files.';
      setError(msg);
      setIsProcessing(false);
    }
  }, [companyFile, locationFile, processClientSide, storeAndNavigate]);

  // Show password gate if not authenticated
  if (!authenticated) {
    return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 bg-[var(--bg)] overflow-y-auto relative">
      {/* ADMIN label */}
      <div className="fixed top-3 right-4 z-50">
        <span className="font-mono text-[9px] tracking-widest uppercase text-[var(--tx3)] bg-[var(--bg2)] border border-[var(--bd)] px-2 py-1 rounded">
          ADMIN
        </span>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-3 mt-8">
        <div className="w-10 h-10 bg-[var(--tx)] rounded-full flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
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
        <h1 className="font-display text-3xl font-semibold text-[var(--tx)] tracking-tight">
          Market<em className="italic text-[var(--acc)]">Intel</em>
        </h1>
      </div>
      <p className="text-sm text-[var(--tx2)] mb-1 font-medium">
        M&A Intelligence for Any Industry
      </p>
      <p className="text-xs text-[var(--tx3)] mb-6 max-w-lg text-center leading-relaxed">
        Upload your company and location data. MarketIntel generates a professional, interactive
        market map — giving PE firms, investors, and executives instant visibility into competitive
        landscapes and acquisition targets.
      </p>

      {/* ── WHAT THIS APP DOES ── */}
      <div className="w-full max-w-2xl bg-[var(--bg2)] border border-[var(--bd)] rounded-lg p-5 mb-6 shadow-card">
        <h2 className="font-display text-base font-semibold text-[var(--tx)] mb-3 flex items-center gap-2">
          <span className="text-[var(--acc)]">&#9670;</span> What MarketIntel Does
        </h2>
        <div className="text-xs text-[var(--tx2)] leading-relaxed space-y-2.5">
          <p>
            MarketIntel transforms your raw spreadsheet data into a <strong className="text-[var(--tx)]">professional M&A intelligence dashboard</strong>.
            Upload Excel or JSON files containing company and location data for <em>any industry</em> — tanning salons, pest control, HVAC, dental,
            auto repair, and more — and MarketIntel will:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-1">
            <div className="flex items-start gap-2">
              <span className="text-[var(--acc)] mt-0.5 flex-shrink-0">&#10003;</span>
              <span>Auto-detect and map your columns to a standard schema using AI</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--acc)] mt-0.5 flex-shrink-0">&#10003;</span>
              <span>Plot every company on an interactive geographic map</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--acc)] mt-0.5 flex-shrink-0">&#10003;</span>
              <span>Classify companies as National, Regional, or Local</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--acc)] mt-0.5 flex-shrink-0">&#10003;</span>
              <span>Calculate M&A attractiveness scores (0-100)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--acc)] mt-0.5 flex-shrink-0">&#10003;</span>
              <span>Identify PE-backed vs. independent acquisition targets</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--acc)] mt-0.5 flex-shrink-0">&#10003;</span>
              <span>Show nearby competitors, ratings, and strategic positioning</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── WHAT FILES TO UPLOAD ── */}
      <div className="w-full max-w-2xl bg-[var(--bg2)] border border-[var(--bd)] rounded-lg p-5 mb-6 shadow-card">
        <h2 className="font-display text-base font-semibold text-[var(--tx)] mb-3 flex items-center gap-2">
          <span className="text-[var(--acc)]">&#9670;</span> What Files to Upload
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Company file */}
          <div className="bg-[var(--bg3)] border border-[var(--bd)] rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">&#127970;</span>
              <span className="font-semibold text-xs text-[var(--tx)]">Company Data <span className="text-[var(--nat)] text-[10px]">Required</span></span>
            </div>
            <p className="text-[10px] text-[var(--tx2)] mb-2 leading-relaxed">
              One row per company. This is your main dataset — it should contain company-level information.
            </p>
            <div className="space-y-1">
              <p className="font-mono text-[9px] text-[var(--tx3)] tracking-wider uppercase">Best columns to include:</p>
              <div className="flex flex-wrap gap-1">
                {['Company Name', 'Website/Domain', 'City', 'State', 'Employees', 'Founded Year', 'Rating', 'Reviews', 'Services', 'PE Investor', 'Latitude', 'Longitude'].map(c => (
                  <span key={c} className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[rgba(26,112,64,0.06)] text-[#1a7040] border border-[rgba(26,112,64,0.15)]">{c}</span>
                ))}
              </div>
            </div>
          </div>
          {/* Location file */}
          <div className="bg-[var(--bg3)] border border-[var(--bd)] rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">&#128205;</span>
              <span className="font-semibold text-xs text-[var(--tx)]">Location Data <span className="text-[var(--tx3)] text-[10px]">Optional</span></span>
            </div>
            <p className="text-[10px] text-[var(--tx2)] mb-2 leading-relaxed">
              One row per location/branch. Linked to companies by matching website/domain. Provides coordinates for the map.
            </p>
            <div className="space-y-1">
              <p className="font-mono text-[9px] text-[var(--tx3)] tracking-wider uppercase">Best columns to include:</p>
              <div className="flex flex-wrap gap-1">
                {['Location Name', 'Website/Domain', 'Latitude', 'Longitude', 'City', 'State', 'Rating', 'Reviews', 'Phone', 'Address'].map(c => (
                  <span key={c} className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[rgba(26,79,150,0.06)] text-[#1a4f96] border border-[rgba(26,79,150,0.15)]">{c}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 p-2.5 bg-[rgba(176,125,16,0.04)] border border-[rgba(176,125,16,0.15)] rounded text-[10px] text-[var(--tx2)] leading-relaxed">
          <strong className="text-[var(--acc)]">Tip:</strong> The most important column is <strong>Website/Domain</strong> — this is how MarketIntel links
          companies to their locations. Make sure both files share a common domain column (e.g., &quot;palmbeachtan.com&quot;).
          <strong> Latitude and Longitude</strong> are needed to place dots on the map. Without coordinates, companies appear in the table but not on the map.
        </div>
        <div className="mt-2 p-2.5 bg-[var(--bg3)] border border-[var(--bd)] rounded text-[10px] text-[var(--tx2)] leading-relaxed">
          <strong className="text-[var(--tx)]">File size limits:</strong> Files under <strong>100MB</strong> process quickly (a few seconds).
          Files up to <strong>300MB</strong> work but may take 15-60 seconds — processing happens in your browser, so nothing is uploaded to a server.
          Files above 300MB may crash the browser tab. If your data is very large, try filtering it in Excel first to include only the rows you need.
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <button
        onClick={() => setShowGuide(!showGuide)}
        className="w-full max-w-2xl text-left mb-4"
      >
        <div className="bg-[var(--bg2)] border border-[var(--bd)] rounded-lg px-5 py-3 shadow-card flex items-center justify-between hover:bg-[var(--bg3)] transition-colors cursor-pointer">
          <div className="flex items-center gap-2">
            <span className="text-[var(--acc)]">&#9670;</span>
            <span className="font-display text-base font-semibold text-[var(--tx)]">How to Use MarketIntel — Step by Step Guide</span>
          </div>
          <span className="text-[var(--tx3)] text-sm">{showGuide ? '▴ Hide' : '▾ Show'}</span>
        </div>
      </button>

      {showGuide && (
        <div className="w-full max-w-2xl bg-[var(--bg2)] border border-[var(--bd)] rounded-lg p-5 mb-6 shadow-card">
          <div className="space-y-5 text-xs text-[var(--tx2)] leading-relaxed">

            {/* Step 1 */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-[var(--tx)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                <span className="font-semibold text-sm text-[var(--tx)]">Prepare Your Data</span>
              </div>
              <p className="pl-7">
                You need at least one Excel (.xlsx) or JSON file with company data. Ideally, you have <strong>two files</strong>:
              </p>
              <ul className="pl-10 mt-1.5 space-y-1 list-disc">
                <li><strong className="text-[var(--tx)]">Company file:</strong> One row per company with names, websites, employee counts, ratings, services, investor info, etc.</li>
                <li><strong className="text-[var(--tx)]">Location file:</strong> One row per branch/store with coordinates (latitude, longitude), addresses, individual ratings. This is what puts dots on the map.</li>
              </ul>
              <p className="pl-7 mt-1.5">
                Column names don&apos;t need to be exact — MarketIntel uses AI to understand columns like
                &quot;HQ City (LinkedIn)&quot; or &quot;udu score&quot; and map them automatically.
              </p>
            </div>

            {/* Step 2 */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-[var(--tx)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                <span className="font-semibold text-sm text-[var(--tx)]">Upload Your Files</span>
              </div>
              <p className="pl-7">
                Drag and drop your files into the upload zones below, or click to browse. The <strong>Company Data</strong> file
                is required. The <strong>Location Data</strong> file is optional but highly recommended — without it, companies
                won&apos;t have coordinates for the map unless your company file already contains latitude/longitude columns.
              </p>
            </div>

            {/* Step 3 */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-[var(--tx)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                <span className="font-semibold text-sm text-[var(--tx)]">Configure Your Industry</span>
              </div>
              <p className="pl-7">
                After uploading, type your <strong>Industry Name</strong> (e.g., &quot;Tanning Salons&quot;, &quot;Pest Control&quot;) — this becomes
                the app title. Pick a <strong>Color Theme</strong> that fits your industry. Then click <strong>&quot;Generate Market Map&quot;</strong>.
              </p>
            </div>

            {/* Step 4 */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-[var(--tx)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">4</span>
                <span className="font-semibold text-sm text-[var(--tx)]">Explore the Map Dashboard</span>
              </div>
              <p className="pl-7">
                Your interactive market map loads with every company plotted geographically. Here&apos;s what you can do:
              </p>
              <ul className="pl-10 mt-1.5 space-y-1 list-disc">
                <li><strong className="text-[var(--tx)]">Hover</strong> over any dot to see a quick summary — name, rating, M&A score, services</li>
                <li><strong className="text-[var(--tx)]">Click</strong> any dot to open the full company profile panel on the right</li>
                <li><strong className="text-[var(--tx)]">Scroll to zoom</strong> in and out. Drag to pan. Use the +/- buttons or minimap for navigation</li>
                <li><strong className="text-[var(--tx)]">Filter</strong> by footprint (National/Regional/Local), PE ownership, services, or quality rating</li>
                <li><strong className="text-[var(--tx)]">Search</strong> (click the magnifying glass or press Cmd+K) to find any company instantly</li>
                <li><strong className="text-[var(--tx)]">Switch to Strategy View</strong> to see a bubble chart with configurable axes</li>
                <li><strong className="text-[var(--tx)]">Browse the table</strong> at the bottom — click any column header to sort, click a row to view details</li>
                <li><strong className="text-[var(--tx)]">Toggle Density mode</strong> (top-left button) to see a heatmap of company concentration</li>
                <li><strong className="text-[var(--tx)]">Export PDF</strong> to generate a printable market intelligence report</li>
              </ul>
            </div>

            {/* Step 5 */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-[var(--tx)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">5</span>
                <span className="font-semibold text-sm text-[var(--tx)]">Understanding the Color System</span>
              </div>
              <div className="pl-7 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#b03a1a] flex-shrink-0"></span>
                  <span><strong className="text-[#b03a1a]">Terracotta dots</strong> = National companies (20+ locations or 500+ employees)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#1a4f96] flex-shrink-0"></span>
                  <span><strong className="text-[#1a4f96]">Navy dots</strong> = Regional companies (3-19 locations or multi-state)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#1a7040] flex-shrink-0"></span>
                  <span><strong className="text-[#1a7040]">Green dots</strong> = Local companies (1-2 locations, single state)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-[#7a1050] flex-shrink-0"></span>
                  <span><strong className="text-[#7a1050]">Purple ring</strong> = PE-backed (private equity owned)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-[#b07d10] flex-shrink-0"></span>
                  <span><strong className="text-[#b07d10]">Gold ring</strong> = High quality (rating 4.8+)</span>
                </div>
                <p className="mt-1">Dot size indicates the number of locations — bigger dot = more locations.</p>
              </div>
            </div>

            {/* Step 6 */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-[var(--tx)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">6</span>
                <span className="font-semibold text-sm text-[var(--tx)]">Understanding M&A Scores</span>
              </div>
              <p className="pl-7 mb-1.5">
                Every company receives an <strong>M&A Attractiveness Score</strong> from 0 to 100. Higher = more attractive acquisition target:
              </p>
              <div className="pl-7 grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-[#1a7040] font-bold">+30</span> <span>Not PE-backed (available target)</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-[#1a7040] font-bold">+20</span> <span>3-20 locations (right size for roll-up)</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-[#1a7040] font-bold">+15</span> <span>Rating 4.5+ (quality brand)</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-[#1a7040] font-bold">+10</span> <span>50+ reviews (proven demand)</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-[#1a7040] font-bold">+15</span> <span>Membership/subscription model</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-[#1a7040] font-bold">+10</span> <span>Founded before 2015 (established)</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── UPLOAD ZONES ── */}
      <div className="flex gap-5 w-full max-w-2xl mb-8">
        <UploadZone
          label="Company Data"
          description="Company-level data with names, domains, ratings, etc."
          required
          onFile={handleCompanyFile}
          file={companyFile}
          columns={companyColumns}
          rowCount={companyRows}
        />
        <UploadZone
          label="Location Data"
          description="Individual locations with coordinates, addresses, ratings."
          onFile={handleLocationFile}
          file={locationFile}
          columns={locationColumns}
          rowCount={locationRows}
        />
      </div>

      {/* Config (shows after file upload) */}
      {companyFile && (
        <div className="w-full max-w-2xl bg-[var(--bg2)] border border-[var(--bd)] rounded-lg p-6 mb-6 shadow-card">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block font-mono text-[9px] text-[var(--tx3)] tracking-widest uppercase mb-2">
                Industry Name
              </label>
              <input
                type="text"
                value={industryName}
                onChange={(e) => setIndustryName(e.target.value)}
                placeholder="e.g., Tanning Salons, Pest Control"
                className="w-full bg-[var(--bg3)] border border-[var(--bd2)] text-[var(--tx)] px-3 py-2 rounded text-sm outline-none focus:border-[var(--acc)] font-sans font-medium"
              />
            </div>
            <div>
              <label className="block font-mono text-[9px] text-[var(--tx3)] tracking-widest uppercase mb-2">
                Color Theme
              </label>
              <div className="flex gap-2">
                {COLOR_THEMES.map((theme) => (
                  <button
                    key={theme.name}
                    onClick={() => setColorTheme(theme)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      colorTheme.name === theme.name
                        ? 'border-[var(--tx)] scale-110'
                        : 'border-[var(--bd)] hover:border-[var(--tx3)]'
                    }`}
                    style={{ background: theme.primary }}
                    title={theme.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="w-full max-w-2xl bg-[rgba(176,58,26,0.06)] border border-[rgba(176,58,26,0.2)] rounded-lg px-4 py-3 mb-4 text-sm text-[var(--nat)]">
          {error}
        </div>
      )}

      {/* Generate Button */}
      {companyFile && !isProcessing && (
        <button
          onClick={handleGenerate}
          className="bg-[var(--tx)] text-[var(--bg2)] px-10 py-3 rounded-lg font-semibold text-sm tracking-wide hover:bg-[#2d2a26] transition-colors shadow-card"
        >
          Generate Market Map &rarr;
        </button>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="w-full max-w-md text-center">
          <div className="flex flex-col gap-3">
            {LOADING_STEPS.map((step, i) => (
              <div
                key={step}
                className={`flex items-center gap-3 transition-opacity duration-300 ${
                  i <= loadingStep ? 'opacity-100' : 'opacity-20'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                    i < loadingStep
                      ? 'bg-[#1a7040] text-white'
                      : i === loadingStep
                      ? 'bg-[var(--acc)] text-white animate-pulse'
                      : 'bg-[var(--bg4)] text-[var(--tx3)]'
                  }`}
                >
                  {i < loadingStep ? '\u2713' : i + 1}
                </div>
                <span
                  className={`text-sm ${
                    i === loadingStep ? 'text-[var(--tx)] font-semibold' : 'text-[var(--tx2)]'
                  }`}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample data link */}
      <p className="text-[10px] text-[var(--tx3)] mt-10 mb-8 font-mono tracking-wider uppercase">
        No data? &nbsp;
        <button
          onClick={async () => {
            try {
              const res = await fetch('/sample-data/sample-companies.json');
              const data = await res.json();
              const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
              const file = new File([blob], 'sample-companies.json');
              handleCompanyFile(file);
              setIndustryName('Tanning Salons');
            } catch {
              setError('Sample data not available.');
            }
          }}
          className="text-[var(--acc)] hover:underline cursor-pointer"
        >
          Try with sample data
        </button>
      </p>
    </div>
  );
}
