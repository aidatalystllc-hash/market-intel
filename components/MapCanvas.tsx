'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { Company } from '@/lib/types';
import { FOOTPRINT_COLORS } from '@/lib/types';

interface MapCanvasProps {
  companies: Company[];
  onHover: (company: Company | null, x: number, y: number) => void;
  onClick: (company: Company) => void;
  selectedId: string | null;
}

interface MapState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

// US state outlines (simplified polygons for major states)
const US_STATES: Record<string, [number, number][]> = {
  texas: [
    [36.5,-103],[36.5,-100],[34,-100],[33.8,-99.5],[33.8,-99],[32,-100],
    [31.7,-106.6],[29.8,-104.5],[29.3,-103.2],[29.8,-99.4],[28.2,-96.6],
    [27.7,-97.5],[26.1,-97.2],[25.9,-97.1],[26,-97.4],[26.5,-98.2],
    [27,-99.5],[29.4,-100.4],[29.8,-101.5],[29.7,-103.9],[30.6,-104.4],
    [31.7,-106.6],[32,-106.6],[32,-103],[36.5,-103],
  ],
  florida: [
    [31,-87.6],[30.3,-86.1],[30.3,-85.0],[30,-84.0],[30.5,-82.0],
    [30.7,-81.5],[29.5,-81.1],[28,-80.5],[26.5,-80.1],[25.5,-80.3],
    [25,-80.8],[25.1,-81.2],[26,-81.8],[27,-82.6],[28,-82.8],
    [29,-83.0],[29.9,-83.5],[30,-84.5],[30.5,-85.5],[30.4,-87.4],[31,-87.6],
  ],
  california: [
    [42,-124.2],[41,-124.2],[40,-124.0],[39,-123.8],[38.5,-123.0],
    [37.8,-122.5],[37,-122.4],[36.5,-122],[35.5,-121.0],[34.5,-120.5],
    [34,-118.5],[33,-117.3],[32.5,-117.2],[32.7,-115.5],[33,-114.6],
    [34,-114.1],[35,-114.6],[36,-117],[37,-118],[38,-119],
    [39,-120],[40,-120],[41,-120],[42,-120],[42,-124.2],
  ],
};

function getFootprintColor(fp: string): string {
  return FOOTPRINT_COLORS[fp as keyof typeof FOOTPRINT_COLORS] || FOOTPRINT_COLORS.local;
}

export default function MapCanvas({ companies, onHover, onClick, selectedId }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mmCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapState = useRef<MapState>({ offsetX: 0, offsetY: 0, scale: 1 });
  const dragState = useRef({ on: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const [heatMode, setHeatMode] = useState(false);
  // dims removed — canvas dimensions stored directly on the canvas element
  const animFrameRef = useRef<number>(0);

  // Data bounds
  const bounds = useRef({ minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 });

  const calcBounds = useCallback(() => {
    const withCoords = companies.filter((c) => c.lat !== null && c.lng !== null);
    if (withCoords.length === 0) {
      bounds.current = { minLat: 25, maxLat: 50, minLng: -125, maxLng: -65 };
      return;
    }

    // Use percentile-based bounds to exclude outliers (e.g., companies in South America)
    // Sort lats and lngs separately and use 1st-99th percentile
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const c of withCoords) {
      lats.push(c.lat!);
      lngs.push(c.lng!);
    }
    lats.sort((a, b) => a - b);
    lngs.sort((a, b) => a - b);

    // Use 1st and 99th percentile to exclude extreme outliers
    const p1 = Math.floor(lats.length * 0.01);
    const p99 = Math.floor(lats.length * 0.99);
    const pad = 1;
    bounds.current = {
      minLat: lats[p1] - pad,
      maxLat: lats[p99] + pad,
      minLng: lngs[p1] - pad,
      maxLng: lngs[p99] + pad,
    };
  }, [companies]);

  // Projection: lng → x, lat → y
  const proj = useCallback(
    (lat: number, lng: number, state?: MapState): [number, number] => {
      const s = state || mapState.current;
      const b = bounds.current;
      const x = (lng - b.minLng) * 100 * s.scale + s.offsetX;
      const y = (b.maxLat - lat) * 100 * s.scale * 0.85 + s.offsetY;
      return [x, y];
    },
    []
  );

  const invProj = useCallback(
    (px: number, py: number): [number, number] => {
      const s = mapState.current;
      const b = bounds.current;
      const lng = (px - s.offsetX) / (s.scale * 100) + b.minLng;
      const lat = b.maxLat - (py - s.offsetY) / (s.scale * 100 * 0.85);
      return [lat, lng];
    },
    []
  );

  const fitToData = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cW = canvas.width;
    const cH = canvas.height;
    if (cW === 0 || cH === 0) return;
    const b = bounds.current;
    if (!isFinite(b.minLat) || !isFinite(b.maxLat) || !isFinite(b.minLng) || !isFinite(b.maxLng)) return;
    const PAD = 0.08;
    const latRange = b.maxLat - b.minLat;
    const lngRange = b.maxLng - b.minLng;
    if (latRange <= 0 || lngRange <= 0) return;

    const scaleX = (cW * (1 - PAD * 2)) / lngRange;
    const scaleY = (cH * (1 - PAD * 2)) / (latRange * 0.85);
    const rawScale = Math.min(scaleX, scaleY);
    mapState.current.scale = rawScale / 100;

    const centerLat = (b.minLat + b.maxLat) / 2;
    const centerLng = (b.minLng + b.maxLng) / 2;
    const [cx, cy] = proj(centerLat, centerLng, {
      offsetX: 0,
      offsetY: 0,
      scale: mapState.current.scale,
    });
    mapState.current.offsetX = cW / 2 - cx;
    mapState.current.offsetY = cH / 2 - cy;
  }, [proj]);

  // Detect which state outlines to draw based on data bounds
  const getRelevantStates = useCallback((): [number, number][][] => {
    const b = bounds.current;
    const result: [number, number][][] = [];
    for (const pts of Object.values(US_STATES)) {
      const stateLats = pts.map((p) => p[0]);
      const stateLngs = pts.map((p) => p[1]);
      const sMinLat = Math.min(...stateLats);
      const sMaxLat = Math.max(...stateLats);
      const sMinLng = Math.min(...stateLngs);
      const sMaxLng = Math.max(...stateLngs);
      // Check overlap
      if (sMaxLat >= b.minLat && sMinLat <= b.maxLat && sMaxLng >= b.minLng && sMinLng <= b.maxLng) {
        result.push(pts);
      }
    }
    return result;
  }, []);

  // Draw main canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cW = canvas.width;
    let cH = canvas.height;

    // If canvas has no size, try to get it from the container
    if (cW === 0 || cH === 0) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvas.width = rect.width;
          canvas.height = rect.height;
          cW = rect.width;
          cH = rect.height;
        } else {
          return; // Container truly has no size yet
        }
      } else {
        return;
      }
    }

    const s = mapState.current;
    const b = bounds.current;

    // If bounds are invalid, recalculate them
    if (!isFinite(b.minLat) || !isFinite(b.maxLat) || !isFinite(b.minLng) || !isFinite(b.maxLng)) {
      // Try to recalculate
      const withCoords = companies.filter((c) => c.lat !== null && c.lng !== null);
      if (withCoords.length > 0) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const c of withCoords) {
          if (c.lat! < minLat) minLat = c.lat!;
          if (c.lat! > maxLat) maxLat = c.lat!;
          if (c.lng! < minLng) minLng = c.lng!;
          if (c.lng! > maxLng) maxLng = c.lng!;
        }
        bounds.current = { minLat: minLat - 0.5, maxLat: maxLat + 0.5, minLng: minLng - 0.5, maxLng: maxLng + 0.5 };
      } else {
        // Show debug info on canvas
        ctx.fillStyle = '#edeae2';
        ctx.fillRect(0, 0, cW, cH);
        ctx.fillStyle = '#1c1814';
        ctx.font = '14px Syne, sans-serif';
        ctx.fillText(`${companies.length} companies loaded, 0 have coordinates`, 20, 30);
        return;
      }
    }

    // If scale is 0 or NaN, recalculate fitToData
    if (!isFinite(s.scale) || s.scale === 0) {
      const latRange = b.maxLat - b.minLat;
      const lngRange = b.maxLng - b.minLng;
      if (latRange > 0 && lngRange > 0) {
        const scaleX = (cW * 0.84) / lngRange;
        const scaleY = (cH * 0.84) / (latRange * 0.85);
        s.scale = Math.min(scaleX, scaleY) / 100;
        const centerLat = (b.minLat + b.maxLat) / 2;
        const centerLng = (b.minLng + b.maxLng) / 2;
        const cx = (centerLng - b.minLng) * 100 * s.scale;
        const cy = (b.maxLat - centerLat) * 100 * s.scale * 0.85;
        s.offsetX = cW / 2 - cx;
        s.offsetY = cH / 2 - cy;
      }
    }

    ctx.clearRect(0, 0, cW, cH);
    ctx.fillStyle = '#edeae2';
    ctx.fillRect(0, 0, cW, cH);

    // State outlines
    const states = getRelevantStates();
    for (const pts of states) {
      ctx.beginPath();
      const [x0, y0] = proj(pts[0][0], pts[0][1]);
      ctx.moveTo(x0, y0);
      for (const [la, lo] of pts) {
        const [x, y] = proj(la, lo);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#f5f2eb';
      ctx.fill();
      ctx.strokeStyle = 'rgba(28,24,20,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Grid lines — guard against NaN/infinite loop
    if (isFinite(b.minLng) && isFinite(b.maxLng) && isFinite(b.minLat) && isFinite(b.maxLat)) {
      ctx.strokeStyle = 'rgba(28,24,20,0.04)';
      ctx.lineWidth = 0.5;
      const gridStep = Math.max(1, Math.floor((b.maxLng - b.minLng) / 20));
      for (let lo = Math.floor(b.minLng); lo <= Math.ceil(b.maxLng); lo += gridStep) {
        const [x] = proj(b.minLat, lo);
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.lineTo(x, cH + 10);
        ctx.stroke();
      }
      for (let la = Math.floor(b.minLat); la <= Math.ceil(b.maxLat); la += gridStep) {
        const [, y] = proj(la, b.minLng);
        ctx.beginPath();
        ctx.moveTo(-10, y);
        ctx.lineTo(cW + 10, y);
        ctx.stroke();
      }
    }

    if (heatMode) {
      drawHeatmap(ctx, cW, cH);
      return;
    }

    // Determine if this is a large dataset — optimize rendering
    const isLargeDataset = companies.length > 2000;

    // City labels (at sufficient zoom, skip for large datasets at overview zoom)
    const scale100 = s.scale * 100;
    if (scale100 > 60 && (!isLargeDataset || scale100 > 200)) {
      const majorCities = [
        { n: 'Houston', la: 29.76, lo: -95.37 },
        { n: 'Dallas', la: 32.78, lo: -96.8 },
        { n: 'San Antonio', la: 29.42, lo: -98.49 },
        { n: 'Austin', la: 30.27, lo: -97.74 },
        { n: 'Fort Worth', la: 32.75, lo: -97.33 },
        { n: 'El Paso', la: 31.76, lo: -106.49 },
        { n: 'Phoenix', la: 33.45, lo: -112.07 },
        { n: 'Los Angeles', la: 34.05, lo: -118.24 },
        { n: 'Miami', la: 25.76, lo: -80.19 },
        { n: 'New York', la: 40.71, lo: -74.01 },
        { n: 'Chicago', la: 41.88, lo: -87.63 },
        { n: 'Denver', la: 39.74, lo: -104.99 },
        { n: 'Atlanta', la: 33.75, lo: -84.39 },
        { n: 'Seattle', la: 47.61, lo: -122.33 },
        { n: 'Orlando', la: 28.54, lo: -81.38 },
        { n: 'Tampa', la: 27.95, lo: -82.46 },
        { n: 'Nashville', la: 36.16, lo: -86.78 },
        { n: 'Charlotte', la: 35.23, lo: -80.84 },
      ];
      ctx.font = `${Math.min(11, scale100 / 10)}px 'Syne', sans-serif`;
      ctx.textAlign = 'center';
      for (const city of majorCities) {
        const [x, y] = proj(city.la, city.lo);
        if (x > 0 && x < cW && y > 0 && y < cH) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(28,24,20,0.18)';
          ctx.fill();
          ctx.fillStyle = 'rgba(28,24,20,0.28)';
          ctx.fillText(city.n, x, y - 6);
        }
      }
    }

    // Filter and sort companies with coordinates
    const withCoords = companies.filter((c) => c.lat !== null && c.lng !== null);
    const sorted = withCoords.sort((a, b) => {
      const order: Record<string, number> = { local: 0, regional: 1, national: 2 };
      return (order[a.footprint] || 0) - (order[b.footprint] || 0);
    });

    // Disable shadows for large datasets (major performance bottleneck)
    const useShadows = !isLargeDataset;

    for (const c of sorted) {
      const [x, y] = proj(c.lat!, c.lng!);
      if (x < -30 || x > cW + 30 || y < -30 || y > cH + 30) continue;

      const lc = Math.max(c.locationCount || 1, 1);
      // Smaller dots for large datasets to reduce overlap
      const r = isLargeDataset
        ? Math.min(Math.max(Math.sqrt(lc) * 2.5, 3), 18)
        : Math.min(Math.max(Math.sqrt(lc) * 4, 6), 28);
      const col = getFootprintColor(c.footprint);

      // Outer glow — skip for local companies in large datasets
      if (!isLargeDataset && (c.footprint !== 'local' || lc > 3)) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = col + '18';
        ctx.fill();
      }

      // Main circle
      if (useShadows) {
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.footprint === 'local' ? col + '99' : col + 'ee';
      ctx.fill();
      if (useShadows) {
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }

      // Stroke — skip for local in large datasets
      if (!isLargeDataset || c.footprint !== 'local') {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = col + '55';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Gold ring: high rating
      if (c.avgRating && c.avgRating >= 4.8) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(176,125,16,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Purple ring: PE-backed
      if (c.isPE) {
        ctx.beginPath();
        ctx.arc(x, y, r + (c.avgRating && c.avgRating >= 4.8 ? 6 : 3.5), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(122,16,80,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Selected indicator
      if (c.id === selectedId) {
        ctx.beginPath();
        ctx.arc(x, y, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(176,125,16,0.5)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Labels — only for national/large companies when zoomed in, skip in large datasets unless very zoomed
      if (scale100 > (isLargeDataset ? 300 : 100) && (c.footprint === 'national' || lc >= 5)) {
        ctx.font = `600 ${Math.min(11, r * 0.9)}px 'Syne', sans-serif`;
        ctx.fillStyle = 'rgba(28,24,20,0.75)';
        ctx.textAlign = 'center';
        const label = c.name.length > 20 ? c.name.slice(0, 18) + '…' : c.name;
        ctx.fillText(label, x, y + r + 12);
      }
    }

    // Debug info (temporary) — shows in bottom-left corner
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(`${sorted.length} dots | canvas: ${cW}x${cH} | scale: ${s.scale.toFixed(4)} | bounds: ${b.minLat.toFixed(1)},${b.minLng.toFixed(1)} → ${b.maxLat.toFixed(1)},${b.maxLng.toFixed(1)}`, 10, cH - 10);
    ctx.restore();
  }, [companies, heatMode, proj, getRelevantStates, selectedId]);

  // Heatmap
  const drawHeatmap = useCallback(
    (ctx: CanvasRenderingContext2D, cW: number, cH: number) => {
      const R = 60;
      const offscreen = document.createElement('canvas');
      offscreen.width = cW;
      offscreen.height = cH;
      const octx = offscreen.getContext('2d')!;

      for (const c of companies) {
        if (c.lat === null || c.lng === null) continue;
        const [x, y] = proj(c.lat, c.lng);
        const weight = Math.max(c.locationCount || 1, 1);
        const grad = octx.createRadialGradient(x, y, 0, x, y, R * Math.sqrt(weight));
        grad.addColorStop(0, 'rgba(176,125,16,0.5)');
        grad.addColorStop(0.4, 'rgba(176,125,16,0.15)');
        grad.addColorStop(1, 'rgba(176,125,16,0)');
        octx.fillStyle = grad;
        octx.fillRect(x - R * 2, y - R * 2, R * 4, R * 4);
      }
      ctx.drawImage(offscreen, 0, 0);

      // PE & national dots on top of heat
      for (const c of companies) {
        if (c.lat === null || c.lng === null) continue;
        if (!c.isPE && c.footprint !== 'national') continue;
        const [x, y] = proj(c.lat, c.lng);
        const r = Math.min(Math.max(Math.sqrt(Math.max(c.locationCount || 1, 1)) * 4, 6), 28);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = getFootprintColor(c.footprint) + 'cc';
        ctx.fill();
        if (c.isPE) {
          ctx.beginPath();
          ctx.arc(x, y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = '#7a1050' + '99';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    },
    [companies, proj]
  );

  // Minimap
  const drawMinimap = useCallback(() => {
    const mmCanvas = mmCanvasRef.current;
    if (!mmCanvas) return;
    const mmCtx = mmCanvas.getContext('2d');
    if (!mmCtx) return;
    const mw = 140;
    const mh = 88;
    const b = bounds.current;

    mmCtx.clearRect(0, 0, mw, mh);
    mmCtx.fillStyle = '#f0ece4';
    mmCtx.fillRect(0, 0, mw, mh);

    // State outlines on minimap
    const states = getRelevantStates();
    for (const pts of states) {
      mmCtx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = ((pts[i][1] - b.minLng) / (b.maxLng - b.minLng)) * mw;
        const y = ((b.maxLat - pts[i][0]) / (b.maxLat - b.minLat)) * mh;
        i === 0 ? mmCtx.moveTo(x, y) : mmCtx.lineTo(x, y);
      }
      mmCtx.closePath();
      mmCtx.fillStyle = '#f5f2eb';
      mmCtx.fill();
      mmCtx.strokeStyle = 'rgba(28,24,20,0.2)';
      mmCtx.lineWidth = 1;
      mmCtx.stroke();
    }

    // Dots
    for (const c of companies) {
      if (c.lat === null || c.lng === null) continue;
      const x = ((c.lng! - b.minLng) / (b.maxLng - b.minLng)) * mw;
      const y = ((b.maxLat - c.lat!) / (b.maxLat - b.minLat)) * mh;
      mmCtx.beginPath();
      mmCtx.arc(x, y, 2.5, 0, Math.PI * 2);
      mmCtx.fillStyle =
        getFootprintColor(c.footprint) + (c.footprint === 'local' ? '88' : 'cc');
      mmCtx.fill();
    }

    // Viewport indicator
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [la1, lo1] = invProj(0, 0);
    const [la2, lo2] = invProj(canvas.width, canvas.height);
    const vpEl = document.getElementById('mmvp');
    if (vpEl) {
      const x1 = Math.max(0, ((Math.min(lo1, lo2) - b.minLng) / (b.maxLng - b.minLng)) * mw);
      const y1 = Math.max(0, ((b.maxLat - Math.max(la1, la2)) / (b.maxLat - b.minLat)) * mh);
      const x2 = Math.min(mw, ((Math.max(lo1, lo2) - b.minLng) / (b.maxLng - b.minLng)) * mw);
      const y2 = Math.min(mh, ((b.maxLat - Math.min(la1, la2)) / (b.maxLat - b.minLat)) * mh);
      vpEl.style.left = x1 + 'px';
      vpEl.style.top = y1 + 'px';
      vpEl.style.width = Math.max(4, x2 - x1) + 'px';
      vpEl.style.height = Math.max(4, y2 - y1) + 'px';
    }
  }, [companies, invProj, getRelevantStates]);

  // Hit test — optimized: check national/regional first (drawn on top), skip off-screen
  const hitTest = useCallback(
    (mx: number, my: number): Company | null => {
      const isLarge = companies.length > 2000;
      const maxDist = 35; // max click radius in pixels
      let best: Company | null = null;
      let bestDist = maxDist * maxDist;
      // Prioritize national > regional > local
      const priorityOrder = ['national', 'regional', 'local'] as const;
      for (const fp of priorityOrder) {
        for (const c of companies) {
          if (c.lat === null || c.lng === null) continue;
          if (c.footprint !== fp) continue;
          const [x, y] = proj(c.lat, c.lng);
          // Quick bounding box check before expensive distance calc
          if (Math.abs(mx - x) > maxDist || Math.abs(my - y) > maxDist) continue;
          const r = isLarge
            ? Math.min(Math.max(Math.sqrt(Math.max(c.locationCount || 1, 1)) * 2.5, 3), 18) + 5
            : Math.min(Math.max(Math.sqrt(Math.max(c.locationCount || 1, 1)) * 4, 6), 28) + 5;
          const d = (mx - x) ** 2 + (my - y) ** 2;
          if (d <= r * r && d < bestDist) {
            best = c;
            bestDist = d;
            if (fp === 'national') return best; // National is on top, first match wins
          }
        }
        if (best) return best; // Found in this priority level
      }
      return null;
    },
    [companies, proj]
  );

  // Resize handler
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    // canvas dimensions are now on the canvas element directly
    const mmCanvas = mmCanvasRef.current;
    if (mmCanvas) {
      mmCanvas.width = 140;
      mmCanvas.height = 88;
    }
  }, []);

  // Store latest draw functions in refs so the init effect doesn't re-run on filter changes
  const drawRef = useRef(draw);
  const drawMinimapRef = useRef(drawMinimap);
  const calcBoundsRef = useRef(calcBounds);
  const fitToDataRef = useRef(fitToData);
  const resizeRef = useRef(resize);
  useEffect(() => { drawRef.current = draw; }, [draw]);
  useEffect(() => { drawMinimapRef.current = drawMinimap; }, [drawMinimap]);
  useEffect(() => { calcBoundsRef.current = calcBounds; }, [calcBounds]);
  useEffect(() => { fitToDataRef.current = fitToData; }, [fitToData]);
  useEffect(() => { resizeRef.current = resize; }, [resize]);

  // Initialize — runs once on mount
  useEffect(() => {
    calcBoundsRef.current();
    resizeRef.current();
    fitToDataRef.current();
    drawRef.current();
    drawMinimapRef.current();

    const handleResize = () => {
      resizeRef.current();
      fitToDataRef.current();
      drawRef.current();
      drawMinimapRef.current();
    };
    window.addEventListener('resize', handleResize);

    // Attach wheel listener with passive: false so preventDefault works
    const canvas = canvasRef.current;
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.82 : 1.22;
      const nx = mapState.current.scale * f;
      if (nx < 0.05 || nx > 5) return;
      const rect = canvas!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      mapState.current.offsetX = (mapState.current.offsetX - mx) * f + mx;
      mapState.current.offsetY = (mapState.current.offsetY - my) * f + my;
      mapState.current.scale = nx;
      drawRef.current();
      drawMinimapRef.current();
    };
    canvas?.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas?.removeEventListener('wheel', wheelHandler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate bounds and redraw when companies change
  const prevCompaniesRef = useRef(companies);
  const hasInitialFit = useRef(false);
  useEffect(() => {
    if (prevCompaniesRef.current !== companies) {
      const wasEmpty = prevCompaniesRef.current.length === 0;
      prevCompaniesRef.current = companies;
      calcBounds();
      // Fit viewport on first real data load (from IndexedDB async load)
      if (wasEmpty && companies.length > 0) {
        resize();
        fitToData();
        hasInitialFit.current = true;
        // Retry fit after a short delay in case canvas wasn't sized yet
        setTimeout(() => {
          resize();
          calcBounds();
          fitToData();
          draw();
          drawMinimap();
        }, 200);
      }
    }
    draw();
    drawMinimap();
  }, [companies, heatMode, selectedId, draw, drawMinimap, calcBounds, resize, fitToData]);

  // Mouse handlers
  // Throttle hover hit-testing for large datasets
  const lastHoverTime = useRef(0);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragState.current.on) {
        mapState.current.offsetX =
          dragState.current.ox + (e.clientX - dragState.current.sx);
        mapState.current.offsetY =
          dragState.current.oy + (e.clientY - dragState.current.sy);
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(() => draw());
        return;
      }
      // Throttle hit-testing to every 50ms for large datasets
      const now = Date.now();
      if (companies.length > 2000 && now - lastHoverTime.current < 50) return;
      lastHoverTime.current = now;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const c = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = c ? 'pointer' : 'crosshair';
      onHover(c, e.clientX, e.clientY);
    },
    [hitTest, onHover, draw, companies.length]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = {
        on: true,
        sx: e.clientX,
        sy: e.clientY,
        ox: mapState.current.offsetX,
        oy: mapState.current.offsetY,
      };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    if (dragState.current.on) {
      dragState.current.on = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
      drawMinimap();
    }
  }, [drawMinimap]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only register click if mouse didn't move much (not a drag)
      const dx = Math.abs(e.clientX - dragState.current.sx);
      const dy = Math.abs(e.clientY - dragState.current.sy);
      if (dx > 5 || dy > 5) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const c = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (c) onClick(c);
    },
    [hitTest, onClick]
  );


  const handleZoom = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const nx = mapState.current.scale * factor;
      if (nx < 0.05 || nx > 5) return;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      mapState.current.offsetX = (mapState.current.offsetX - cx) * factor + cx;
      mapState.current.offsetY = (mapState.current.offsetY - cy) * factor + cy;
      mapState.current.scale = nx;
      draw();
      drawMinimap();
    },
    [draw, drawMinimap]
  );

  const handleReset = useCallback(() => {
    calcBounds();
    fitToData();
    draw();
    drawMinimap();
  }, [calcBounds, fitToData, draw, drawMinimap]);

  const handleMinimapClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const b = bounds.current;
      const targetLng = b.minLng + (b.maxLng - b.minLng) * px;
      const targetLat = b.maxLat - (b.maxLat - b.minLat) * py;
      const [tx, ty] = proj(targetLat, targetLng);
      const canvas = canvasRef.current;
      if (!canvas) return;
      mapState.current.offsetX += canvas.width / 2 - tx;
      mapState.current.offsetY += canvas.height / 2 - ty;
      draw();
      drawMinimap();
    },
    [proj, draw, drawMinimap]
  );

  // Public method to pan to a specific company
  useEffect(() => {
    const handler = (e: CustomEvent<{ lat: number; lng: number }>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!isFinite(e.detail.lat) || !isFinite(e.detail.lng)) return;
      // Zoom in if needed
      if (mapState.current.scale < 1.5) {
        mapState.current.scale = 1.5;
      }
      // Center on target location
      const [tx, ty] = proj(e.detail.lat, e.detail.lng);
      mapState.current.offsetX = canvas.width / 2 - tx;
      mapState.current.offsetY = canvas.height / 2 - ty;
      draw();
      drawMinimap();
    };
    window.addEventListener('panToLocation' as string, handler as EventListener);
    return () =>
      window.removeEventListener('panToLocation' as string, handler as EventListener);
  }, [proj, draw, drawMinimap]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          onHover(null, 0, 0);
        }}
        onClick={handleClick}
        /* wheel handled via native addEventListener with passive:false */
      />

      {/* Zoom Controls */}
      <div className="absolute top-3.5 right-3.5 flex flex-col gap-0.5 z-10">
        <button
          onClick={() => handleZoom(1.3)}
          className="w-[30px] h-[30px] bg-white border border-[var(--bd2)] text-[var(--tx2)] rounded flex items-center justify-center text-base font-semibold hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-all shadow-card"
        >
          +
        </button>
        <button
          onClick={() => handleZoom(0.77)}
          className="w-[30px] h-[30px] bg-white border border-[var(--bd2)] text-[var(--tx2)] rounded flex items-center justify-center text-base font-semibold hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-all shadow-card"
        >
          −
        </button>
        <button
          onClick={handleReset}
          className="w-[30px] h-[30px] bg-white border border-[var(--bd2)] text-[var(--tx2)] rounded flex items-center justify-center text-sm font-semibold hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-all shadow-card"
          title="Reset view"
        >
          ⊕
        </button>
      </div>

      {/* Heat Toggle */}
      <div className="absolute top-3.5 left-3.5 z-10">
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
      <div className="absolute bottom-4 left-3.5 bg-white/[0.97] border border-[var(--bd2)] rounded-[7px] p-3 text-[11px] leading-[1.9] shadow-card min-w-[180px] z-10">
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
      </div>

      {/* Minimap */}
      <div
        className="absolute bottom-4 right-3.5 w-[140px] h-[88px] bg-white/95 border border-[var(--bd2)] rounded-[5px] shadow-card overflow-hidden cursor-pointer z-10"
        onClick={handleMinimapClick}
      >
        <canvas ref={mmCanvasRef} width={140} height={88} className="w-full h-full" />
        <div
          id="mmvp"
          className="absolute border-[1.5px] border-[var(--acc)] bg-[rgba(176,125,16,0.08)] pointer-events-none rounded-sm"
        />
        <div className="absolute bottom-1 left-1.5 font-mono text-[8px] text-[var(--tx3)] tracking-wider uppercase">
          Overview
        </div>
      </div>
    </div>
  );
}
