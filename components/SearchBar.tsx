'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Company, Location } from '@/lib/types';

interface SearchResult {
  company: Company;
  type: 'company' | 'location';
  location?: Location;
  locDisplay?: string;
}

interface SearchBarProps {
  companies: Company[];
  onSelect: (company: Company) => void;
  onSelectLocation?: (company: Company, location: Location) => void;
  isOpen: boolean;
  onClose: () => void;
}

const FOOTPRINT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  national: { bg: 'rgba(176,58,26,0.10)', color: 'var(--nat)', label: 'NAT' },
  regional: { bg: 'rgba(26,79,150,0.10)', color: 'var(--reg)', label: 'REG' },
  local: { bg: 'rgba(26,112,64,0.10)', color: 'var(--loc)', label: 'SNGL' },
};

export default function SearchBar({ companies, onSelect, onSelectLocation, isOpen, onClose }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce 150ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Search results: company-level and location-level matches with clear separation
  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase().trim();
    const items: SearchResult[] = [];

    for (const c of companies) {
      // Company-level match
      const companyMatch =
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q) ||
        c.peFirm.toLowerCase().includes(q) ||
        c.services.some((s) => s.toLowerCase().includes(q)) ||
        c.executiveName.toLowerCase().includes(q) ||
        c.parentCompany.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q);

      if (companyMatch) {
        items.push({ company: c, type: 'company' });
      }

      // Location-level matches — show each matching location with its specific address
      const seenLocs = new Set<string>();
      for (const loc of c.locations) {
        const locText = `${loc.name} ${loc.address} ${loc.city} ${loc.state}`.toLowerCase();
        if (locText.includes(q)) {
          const locKey = `${loc.lat.toFixed(4)}|${loc.lng.toFixed(4)}|${loc.address}`;
          if (!seenLocs.has(locKey)) {
            seenLocs.add(locKey);
            // Build a display string: address, city, state
            const addrParts = [loc.address, loc.city, loc.state].filter(Boolean);
            items.push({
              company: c,
              type: 'location',
              location: loc,
              locDisplay: addrParts.join(', ') || loc.name || `${loc.city}, ${loc.state}`,
            });
          }
        }
      }

      if (items.length >= 50) break;
    }

    return items.slice(0, 50);
  }, [debouncedQuery, companies]);

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      if (result.type === 'location' && result.location && onSelectLocation) {
        onSelectLocation(result.company, result.location);
      } else {
        onSelect(result.company);
      }
      onClose();
    },
    [onSelect, onSelectLocation, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        handleResultClick(results[activeIndex]);
      }
    },
    [results, activeIndex, handleResultClick]
  );

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        zIndex: 9000,
        fontFamily: "'Syne', system-ui, sans-serif",
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          top: 56,
          zIndex: 8999,
          background: 'rgba(0,0,0,0.1)',
        }}
        onClick={onClose}
      />

      {/* Search panel */}
      <div
        style={{
          position: 'relative',
          zIndex: 9000,
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--bd)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
          padding: '12px 20px 16px',
          animation: 'searchSlideIn 0.18s ease-out',
        }}
      >
        <style>{`
          @keyframes searchSlideIn {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Input */}
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search companies, addresses, cities, services, PE firms..."
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 14,
              fontFamily: "'Syne', system-ui, sans-serif",
              fontWeight: 500,
              background: 'var(--bg3)',
              border: '1.5px solid var(--bd2)',
              borderRadius: 8,
              color: 'var(--tx)',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--acc)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--bd2)';
            }}
          />

          {/* Results */}
          {debouncedQuery.trim() && (
            <div
              ref={listRef}
              style={{
                marginTop: 8,
                maxHeight: 400,
                overflowY: 'auto',
                borderRadius: 8,
                border: '1px solid var(--bd)',
                background: 'var(--bg2)',
              }}
            >
              {results.length === 0 ? (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: 'var(--tx3)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 6, opacity: 0.4 }}>
                    No results
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                    No companies or locations match &ldquo;{debouncedQuery}&rdquo;
                  </div>
                </div>
              ) : (
                results.map((item, i) => {
                  const company = item.company;
                  const fp = FOOTPRINT_STYLES[company.footprint] || FOOTPRINT_STYLES.local;
                  const isActive = i === activeIndex;
                  const isLocation = item.type === 'location';

                  return (
                    <div
                      key={`${company.id}-${item.type}-${item.location?.lat || ''}-${i}`}
                      onClick={() => handleResultClick(item)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 14px',
                        cursor: 'pointer',
                        background: isActive ? 'var(--bg3)' : 'transparent',
                        borderBottom: i < results.length - 1 ? '1px solid var(--bd)' : 'none',
                        transition: 'background 0.1s',
                        borderLeft: isLocation ? '3px solid #1a7040' : '3px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg3)';
                        setActiveIndex(i);
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Type indicator */}
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          padding: '2px 5px',
                          borderRadius: 3,
                          flexShrink: 0,
                          textTransform: 'uppercase',
                          background: isLocation ? 'rgba(26,112,64,0.10)' : fp.bg,
                          color: isLocation ? '#1a7040' : fp.color,
                          minWidth: 28,
                          textAlign: 'center',
                        }}
                      >
                        {isLocation ? 'LOC' : fp.label}
                      </span>

                      {/* Name + address */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: 'var(--tx)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {company.name}
                        </div>
                        {isLocation && item.locDisplay && (
                          <div
                            style={{
                              fontSize: 10,
                              color: 'var(--tx3)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginTop: 1,
                            }}
                          >
                            {item.locDisplay}
                          </div>
                        )}
                        {!isLocation && (
                          <div
                            style={{
                              fontSize: 10,
                              color: 'var(--tx3)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginTop: 1,
                            }}
                          >
                            {company.locationCount > 1
                              ? `Company — ${company.locationCount} locations`
                              : [company.city, company.state].filter(Boolean).join(', ') || '—'}
                          </div>
                        )}
                      </div>

                      {/* Rating */}
                      {company.avgRating != null && (
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11,
                            color: 'var(--acc)',
                            flexShrink: 0,
                          }}
                        >
                          {isLocation && item.location?.rating != null
                            ? item.location.rating.toFixed(1)
                            : company.avgRating.toFixed(1)}
                        </span>
                      )}

                      {/* M&A Score */}
                      {!isLocation && (
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            color: 'var(--tx3)',
                            flexShrink: 0,
                          }}
                        >
                          M&A {company.maScore}
                        </span>
                      )}

                      {/* PE badge */}
                      {company.isPE && !isLocation && (
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9,
                            fontWeight: 500,
                            padding: '2px 5px',
                            borderRadius: 4,
                            background: 'rgba(122,16,80,0.10)',
                            color: 'var(--pe)',
                            flexShrink: 0,
                          }}
                        >
                          PE
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
