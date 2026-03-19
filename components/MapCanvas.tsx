'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { Company, Location } from '@/lib/types';
import { FOOTPRINT_COLORS } from '@/lib/types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationClickData {
  location: Location;
  parentCompany: Company;
}

interface MapCanvasProps {
  companies: Company[];
  onHover: (company: Company | null, x: number, y: number) => void;
  onClick: (company: Company) => void;
  onLocationClick?: (data: LocationClickData) => void;
  selectedId: string | null;
}

function getFootprintColor(fp: string): string {
  return FOOTPRINT_COLORS[fp as keyof typeof FOOTPRINT_COLORS] || FOOTPRINT_COLORS.local;
}

// Map view mode: company dots or individual location dots
type MapViewMode = 'company' | 'location';

export default function MapCanvas({ companies, onHover, onClick, onLocationClick, selectedId }: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const selectedMarkerRef = useRef<L.CircleMarker | null>(null);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('company');
  const [heatMode, setHeatMode] = useState(false);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);
  const initDone = useRef(false);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([39.8, -98.5], 4); // Center of US

    // Clean professional tile layer (CARTO Light)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Zoom controls (top-right)
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Attribution (bottom-right, small)
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

    mapRef.current = map;
    initDone.current = true;

    return () => {
      map.remove();
      mapRef.current = null;
      initDone.current = false;
    };
  }, []);

  // Build all location dots from company.locations arrays
  const getAllLocations = useCallback(() => {
    const locs: { company: Company; loc: { name: string; lat: number; lng: number; rating: number | null; reviews: number | null; photosCount: number | null; city: string; state: string; address: string; phone: string } }[] = [];
    for (const c of companies) {
      for (const loc of c.locations) {
        if (isFinite(loc.lat) && isFinite(loc.lng)) {
          locs.push({
            company: c,
            loc: {
              name: loc.name,
              lat: loc.lat,
              lng: loc.lng,
              rating: loc.rating,
              reviews: loc.reviews,
              photosCount: loc.photosCount,
              city: loc.city,
              state: loc.state,
              address: loc.address,
              phone: loc.phone,
            },
          });
        }
      }
    }
    return locs;
  }, [companies]);

  // Render markers on the map
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove();
      selectedMarkerRef.current = null;
    }

    if (mapViewMode === 'company') {
      // Company View: one dot per company
      const withCoords = companies.filter((c) => c.lat !== null && c.lng !== null);
      const isLarge = withCoords.length > 2000;

      // Sort: local first (bottom), national last (top)
      const sorted = [...withCoords].sort((a, b) => {
        const order: Record<string, number> = { local: 0, regional: 1, national: 2 };
        return (order[a.footprint] || 0) - (order[b.footprint] || 0);
      });

      for (const c of sorted) {
        const lc = Math.max(c.locationCount || 1, 1);
        const r = isLarge
          ? Math.min(Math.max(Math.sqrt(lc) * 2, 3), 14)
          : Math.min(Math.max(Math.sqrt(lc) * 3.5, 5), 24);
        const col = getFootprintColor(c.footprint);

        const marker = L.circleMarker([c.lat!, c.lng!], {
          radius: r,
          fillColor: col,
          fillOpacity: c.footprint === 'local' ? 0.5 : 0.8,
          color: c.isPE ? '#7a1050' : (c.avgRating && c.avgRating >= 4.8 ? '#b07d10' : col),
          weight: c.isPE || (c.avgRating && c.avgRating >= 4.8) ? 2.5 : 1,
          opacity: 0.8,
        });

        marker.on('mouseover', (e: L.LeafletMouseEvent) => {
          const pt = map.latLngToContainerPoint(e.latlng);
          const rect = mapContainerRef.current?.getBoundingClientRect();
          onHover(c, (rect?.left || 0) + pt.x, (rect?.top || 0) + pt.y);
        });
        marker.on('mouseout', () => onHover(null, 0, 0));
        marker.on('click', () => onClick(c));

        marker.addTo(map);
        markersRef.current.push(marker);

        // Highlight selected
        if (c.id === selectedId) {
          const sel = L.circleMarker([c.lat!, c.lng!], {
            radius: r + 6,
            fillColor: 'transparent',
            fillOpacity: 0,
            color: '#b07d10',
            weight: 2.5,
            opacity: 0.7,
            dashArray: '4 3',
          }).addTo(map);
          selectedMarkerRef.current = sel;
        }
      }

      // Fit bounds to data
      if (sorted.length > 0) {
        // Use percentile bounds to exclude outliers
        const lats = sorted.map((c) => c.lat!).sort((a, b) => a - b);
        const lngs = sorted.map((c) => c.lng!).sort((a, b) => a - b);
        const p1 = Math.floor(lats.length * 0.01);
        const p99 = Math.min(lats.length - 1, Math.floor(lats.length * 0.99));
        map.fitBounds(
          [[lats[p1], lngs[p1]], [lats[p99], lngs[p99]]],
          { padding: [50, 50], maxZoom: 12 }
        );
      }
    } else {
      // Location View: one dot per individual location
      const locs = getAllLocations();
      const isLarge = locs.length > 5000;

      for (const { company: c, loc } of locs) {
        const col = getFootprintColor(c.footprint);
        const r = isLarge ? 4 : 6;

        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius: r,
          fillColor: col,
          fillOpacity: 0.6,
          color: col,
          weight: 1,
          opacity: 0.7,
        });

        marker.on('mouseover', (e: L.LeafletMouseEvent) => {
          const pt = map.latLngToContainerPoint(e.latlng);
          const rect = mapContainerRef.current?.getBoundingClientRect();
          // For location view, we pass the parent company for the tooltip
          onHover(c, (rect?.left || 0) + pt.x, (rect?.top || 0) + pt.y);
        });
        marker.on('mouseout', () => onHover(null, 0, 0));
        // Capture loc in closure for location click
        const capturedLoc = loc;
        const capturedCompany = c;
        marker.on('click', () => {
          if (onLocationClick) {
            // Find the full Location object from the parent company
            const fullLoc = capturedCompany.locations.find(
              (l) => l.lat === capturedLoc.lat && l.lng === capturedLoc.lng && l.name === capturedLoc.name
            );
            if (fullLoc) {
              onLocationClick({ location: fullLoc, parentCompany: capturedCompany });
              return;
            }
          }
          onClick(capturedCompany);
        });

        marker.addTo(map);
        markersRef.current.push(marker);
      }

      // Fit bounds
      if (locs.length > 0) {
        const lats = locs.map((l) => l.loc.lat).sort((a, b) => a - b);
        const lngs = locs.map((l) => l.loc.lng).sort((a, b) => a - b);
        const p1 = Math.floor(lats.length * 0.01);
        const p99 = Math.min(lats.length - 1, Math.floor(lats.length * 0.99));
        map.fitBounds(
          [[lats[p1], lngs[p1]], [lats[p99], lngs[p99]]],
          { padding: [50, 50], maxZoom: 14 }
        );
      }
    }
  }, [companies, mapViewMode, selectedId, onHover, onClick, onLocationClick, getAllLocations]);

  // Render heat overlay
  const renderHeat = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (heatLayerRef.current) {
      heatLayerRef.current.remove();
      heatLayerRef.current = null;
    }

    if (!heatMode) return;

    const group = L.layerGroup();
    const withCoords = companies.filter((c) => c.lat !== null && c.lng !== null);

    for (const c of withCoords) {
      const weight = Math.max(c.locationCount || 1, 1);
      const r = Math.sqrt(weight) * 15000; // meters
      L.circle([c.lat!, c.lng!], {
        radius: r,
        fillColor: '#b07d10',
        fillOpacity: 0.12,
        stroke: false,
      }).addTo(group);
    }

    group.addTo(map);
    heatLayerRef.current = group;
  }, [companies, heatMode]);

  // Re-render when companies, view mode, or selection changes
  useEffect(() => {
    if (!mapRef.current) return;
    // Small delay to ensure map container is sized
    const timer = setTimeout(() => {
      renderMarkers();
      renderHeat();
    }, 50);
    return () => clearTimeout(timer);
  }, [renderMarkers, renderHeat]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      mapRef.current?.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" style={{ background: '#edeae2' }} />

      {/* View Mode Toggle */}
      <div className="absolute top-3 left-3 z-[1000] flex gap-1">
        <button
          onClick={() => setMapViewMode('company')}
          className={`px-3 py-1.5 rounded text-xs font-semibold border transition-all shadow-card ${
            mapViewMode === 'company'
              ? 'bg-[var(--tx)] text-white border-[var(--tx)]'
              : 'bg-white text-[var(--tx2)] border-[var(--bd2)] hover:bg-[var(--bg3)]'
          }`}
        >
          Company View
        </button>
        <button
          onClick={() => setMapViewMode('location')}
          className={`px-3 py-1.5 rounded text-xs font-semibold border transition-all shadow-card ${
            mapViewMode === 'location'
              ? 'bg-[var(--tx)] text-white border-[var(--tx)]'
              : 'bg-white text-[var(--tx2)] border-[var(--bd2)] hover:bg-[var(--bg3)]'
          }`}
        >
          Location View
        </button>
        <button
          onClick={() => setHeatMode(!heatMode)}
          className={`px-3 py-1.5 rounded text-xs font-semibold border transition-all shadow-card ${
            heatMode
              ? 'bg-[var(--acc)] text-white border-[var(--acc)]'
              : 'bg-white text-[var(--tx2)] border-[var(--bd2)] hover:bg-[var(--bg3)]'
          }`}
        >
          {heatMode ? '● Density' : '○ Density'}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-3.5 bg-white/[0.97] border border-[var(--bd2)] rounded-[7px] p-3 text-[11px] leading-[1.9] shadow-card min-w-[160px] z-[1000]">
        <div className="font-mono text-[9px] text-[var(--tx3)] tracking-widest uppercase font-medium mb-0.5">
          Footprint
        </div>
        <div className="flex items-center gap-[7px] text-[var(--tx2)] font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-[#b03a1a] inline-block flex-shrink-0" />
          National
        </div>
        <div className="flex items-center gap-[7px] text-[var(--tx2)] font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1a4f96] inline-block flex-shrink-0" />
          Regional
        </div>
        <div className="flex items-center gap-[7px] text-[var(--tx2)] font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1a7040] inline-block flex-shrink-0" />
          Local
        </div>
        <div className="font-mono text-[9px] text-[var(--tx3)] tracking-widest uppercase font-medium mt-1.5 mb-0.5">
          Indicators
        </div>
        <div className="flex items-center gap-[7px] text-[var(--tx2)] font-medium">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-[#7a1050] inline-block flex-shrink-0" />
          PE-Backed
        </div>
        <div className="flex items-center gap-[7px] text-[var(--tx2)] font-medium">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-[#b07d10] inline-block flex-shrink-0" />
          Rating ≥ 4.8
        </div>
        <div className="font-mono text-[9px] text-[var(--tx3)] tracking-widest uppercase font-medium mt-1.5 mb-0.5">
          View: {mapViewMode === 'company' ? 'Companies' : 'Locations'}
        </div>
      </div>
    </div>
  );
}
