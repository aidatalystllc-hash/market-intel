'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';

interface TourStep {
  icon: string;
  iconBg: string;
  title: string;
  body: ReactNode;
}

const Dot = ({ color, size = 12 }: { color: string; size?: number }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
    }}
  />
);

const Ring = ({ color, size = 12 }: { color: string; size?: number }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      border: `2.5px solid ${color}`,
      flexShrink: 0,
    }}
  />
);

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd
    style={{
      display: 'inline-block',
      padding: '1px 5px',
      borderRadius: 4,
      background: '#f0ece4',
      border: '1px solid #ddd8ce',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      fontWeight: 500,
      color: '#1c1814',
    }}
  >
    {children}
  </kbd>
);

const STEPS: TourStep[] = [
  {
    icon: '🗺️',
    iconBg: 'linear-gradient(135deg, #f0ece4, #e6e0d4)',
    title: 'Welcome to MarketIntel',
    body: (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          Your M&A intelligence dashboard is ready.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            marginBottom: 8,
          }}
        >
          {[
            { n: 'Interactive Map', icon: '🌍' },
            { n: 'M&A Scores', icon: '📊' },
            { n: 'Company Profiles', icon: '🏢' },
          ].map((f) => (
            <div
              key={f.n}
              style={{
                background: '#f6f3ee',
                border: '1px solid #ddd8ce',
                borderRadius: 6,
                padding: '10px 6px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6b6258' }}>
                {f.n}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9e9488' }}>
          Let&apos;s walk through the key features. Takes about 1 minute.
        </p>
      </div>
    ),
  },
  {
    icon: '🎯',
    iconBg: 'linear-gradient(135deg, #fdf5e6, #f5e6c8)',
    title: 'Reading the Map',
    body: (
      <>
        <p style={{ marginBottom: 10 }}>
          Each dot is a company. Size = number of locations.
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            background: '#f6f3ee',
            borderRadius: 6,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot color="#b03a1a" /> <strong style={{ color: '#b03a1a' }}>National</strong> <span style={{ color: '#9e9488', fontSize: 10 }}>20+ locations</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot color="#1a4f96" /> <strong style={{ color: '#1a4f96' }}>Regional</strong> <span style={{ color: '#9e9488', fontSize: 10 }}>3-19 locations</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot color="#1a7040" /> <strong style={{ color: '#1a7040' }}>Local</strong> <span style={{ color: '#9e9488', fontSize: 10 }}>1-2 locations</span>
          </div>
          <div style={{ height: 1, background: '#ddd8ce', margin: '2px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ring color="#7a1050" /> <span style={{ color: '#7a1050', fontWeight: 600 }}>Purple ring</span> <span style={{ color: '#9e9488', fontSize: 10 }}>= PE-backed</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ring color="#b07d10" /> <span style={{ color: '#b07d10', fontWeight: 600 }}>Gold ring</span> <span style={{ color: '#9e9488', fontSize: 10 }}>= Rating 4.8+</span>
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#6b6258' }}>
          <strong>Scroll</strong> to zoom &middot; <strong>Drag</strong> to pan &middot; <strong>Hover</strong> for preview
        </p>
      </>
    ),
  },
  {
    icon: '📋',
    iconBg: 'linear-gradient(135deg, #eef2ff, #dbe4ff)',
    title: 'Company Detail Panel',
    body: (
      <>
        <p style={{ marginBottom: 10 }}>
          <strong>Click any dot</strong> or table row to open a full profile.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            marginBottom: 6,
          }}
        >
          {[
            { icon: '🏷️', label: 'Logo & Badges' },
            { icon: '⭐', label: 'Ratings & Reviews' },
            { icon: '📈', label: 'M&A Score (0-100)' },
            { icon: '📍', label: 'Location List' },
            { icon: '🏁', label: 'Nearby Competitors' },
            { icon: '👤', label: 'Key Contacts' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#f6f3ee',
                border: '1px solid #ddd8ce',
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 11,
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9e9488' }}>
          Click a location in the panel to fly to it on the map.
        </p>
      </>
    ),
  },
  {
    icon: '📊',
    iconBg: 'linear-gradient(135deg, #fdf5e6, #fcebd0)',
    title: 'Header Stats',
    body: (
      <>
        <p style={{ marginBottom: 10 }}>
          The gold numbers in the header update in real-time as you filter.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 2,
            justifyContent: 'center',
            marginBottom: 6,
          }}
        >
          {[
            { n: '186', l: 'Companies' },
            { n: '24', l: 'PE-Backed' },
            { n: '8', l: 'National' },
            { n: '4.3', l: 'Avg Rating' },
          ].map((s, i) => (
            <div
              key={s.l}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '6px 12px',
                background: '#f0ece4',
                border: '1px solid #ddd8ce',
                minWidth: 70,
                borderRadius:
                  i === 0 ? '5px 0 0 5px' : i === 3 ? '0 5px 5px 0' : 0,
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 15,
                  color: '#b07d10',
                  fontWeight: 500,
                }}
              >
                {s.n}
              </span>
              <span
                style={{
                  fontSize: 8,
                  color: '#9e9488',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                {s.l}
              </span>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    icon: '🔍',
    iconBg: 'linear-gradient(135deg, #f0f9f4, #d4edda)',
    title: 'Filters & Search',
    body: (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {/* Filters */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#9e9488',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 6,
              }}
            >
              Filters
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {[
                { l: 'National', c: '#b03a1a' },
                { l: 'Regional', c: '#1a4f96' },
                { l: 'PE-Backed', c: '#7a1050' },
                { l: '★ 4.8+', c: '#b07d10' },
              ].map((f) => (
                <span
                  key={f.l}
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 20,
                    border: `1.5px solid ${f.c}40`,
                    color: f.c,
                    fontWeight: 600,
                  }}
                >
                  {f.l}
                </span>
              ))}
            </div>
          </div>
          {/* Search */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#9e9488',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 6,
              }}
            >
              Search
            </div>
            <p style={{ fontSize: 11 }}>
              Press <Kbd>Cmd</Kbd> + <Kbd>K</Kbd> or click{' '}
              <strong style={{ fontSize: 14 }}>⌕</strong> to search by name, city,
              or investor.
            </p>
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#9e9488' }}>
          Filters apply to the map, table, and stats simultaneously.
        </p>
      </>
    ),
  },
  {
    icon: '💡',
    iconBg: 'linear-gradient(135deg, #fff8e6, #ffedb3)',
    title: 'Strategy View',
    body: (
      <>
        <p style={{ marginBottom: 10 }}>
          Click <strong>&quot;Strategy View&quot;</strong> in the header to see a
          bubble chart with configurable axes.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            background: '#f6f3ee',
            borderRadius: 6,
            padding: 8,
            fontSize: 10,
            marginBottom: 6,
          }}
        >
          <div style={{ color: '#b07d10', fontStyle: 'italic' }}>
            ↖ Emerging Targets
          </div>
          <div style={{ color: '#b07d10', fontStyle: 'italic', textAlign: 'right' }}>
            Platform Companies ↗
          </div>
          <div style={{ color: '#9e9488' }}>↙ Early Stage</div>
          <div style={{ color: '#9e9488', textAlign: 'right' }}>
            Roll-Up Candidates ↘
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#9e9488' }}>
          Click any bubble to view that company&apos;s profile.
        </p>
      </>
    ),
  },
  {
    icon: '📑',
    iconBg: 'linear-gradient(135deg, #f0ece4, #e6e0d4)',
    title: 'Company Roster Table',
    body: (
      <>
        <p style={{ marginBottom: 8 }}>
          The bottom table lists every company. Click <strong>column headers</strong>{' '}
          to sort. Click a <strong>row</strong> to open the detail panel.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {['Company', 'Footprint', 'Locations', 'Rating', 'M&A Score'].map(
            (col) => (
              <span
                key={col}
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  padding: '3px 8px',
                  background: '#f0ece4',
                  border: '1px solid #ddd8ce',
                  borderRadius: 3,
                  color: '#6b6258',
                  fontWeight: 500,
                }}
              >
                {col} ▾
              </span>
            )
          )}
        </div>
      </>
    ),
  },
  {
    icon: '🧭',
    iconBg: 'linear-gradient(135deg, #eef6ff, #d0e8ff)',
    title: 'Map Controls',
    body: (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
        }}
      >
        {[
          { icon: '➕ ➖', label: 'Zoom in / out', sub: 'Top-right buttons' },
          { icon: '⊕', label: 'Reset view', sub: 'Fit all data' },
          { icon: '🌡️', label: 'Density heatmap', sub: 'Top-left toggle' },
          { icon: '🗺️', label: 'Minimap', sub: 'Bottom-right, click to jump' },
          { icon: '🖨️', label: 'Export PDF', sub: 'Print-ready report' },
          { icon: '❓', label: 'Reopen this tour', sub: '"?" button in header' },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#f6f3ee',
              border: '1px solid #ddd8ce',
              borderRadius: 5,
              padding: '7px 9px',
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#1c1814' }}>
                {item.label}
              </div>
              <div style={{ fontSize: 9, color: '#9e9488' }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '🚀',
    iconBg: 'linear-gradient(135deg, #f0f9f4, #c8f0d4)',
    title: "You're Ready!",
    body: (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, marginBottom: 14 }}>
          Start exploring your market landscape.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          {[
            { action: 'Hover dots', detail: 'Quick preview' },
            { action: 'Click dots', detail: 'Full profile' },
            { action: 'Use filters', detail: 'Find targets' },
          ].map((tip) => (
            <div
              key={tip.action}
              style={{
                padding: '8px 14px',
                background: '#f6f3ee',
                border: '1px solid #ddd8ce',
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1c1814' }}>
                {tip.action}
              </div>
              <div style={{ fontSize: 10, color: '#9e9488' }}>{tip.detail}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9e9488' }}>
          Click <strong>?</strong> in the header to reopen this tour anytime.
        </p>
      </div>
    ),
  },
];

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GuidedTour({ isOpen, onClose }: GuidedTourProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
    }
  }, [step, onClose]);

  const handlePrev = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen) return null;

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Tour Card */}
      <div
        className="relative bg-white rounded-xl border border-[var(--bd2)] max-w-md w-full mx-4 overflow-hidden"
        style={{ boxShadow: '0 4px 30px rgba(0,0,0,0.15), 0 12px 60px rgba(0,0,0,0.1)' }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-[var(--bg4)]">
          <div
            className="h-full bg-[var(--acc)] transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Icon + Header */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: current.iconBg }}
              >
                {current.icon}
              </div>
              <div>
                <div className="font-mono text-[9px] text-[var(--acc)] tracking-widest uppercase font-medium">
                  {step + 1} / {STEPS.length}
                </div>
                <h3 className="font-display text-base font-semibold text-[var(--tx)] italic leading-tight">
                  {current.title}
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--tx3)] hover:text-[var(--tx)] text-xs transition-colors font-medium"
            >
              Skip ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="px-6 pb-4 text-xs text-[var(--tx2)] leading-relaxed"
          style={{ fontFamily: "'Syne', system-ui, sans-serif" }}
        >
          {current.body}
        </div>

        {/* Footer */}
        <div className="px-6 pb-4 flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? 'bg-[var(--acc)] w-5'
                    : i < step
                    ? 'bg-[rgba(176,125,16,0.3)] w-1.5'
                    : 'bg-[var(--bg4)] w-1.5'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-md border border-[var(--bd2)] text-[var(--tx2)] text-[11px] font-semibold hover:bg-[var(--bg3)] hover:text-[var(--tx)] transition-all"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-1.5 rounded-md bg-[var(--tx)] text-white text-[11px] font-semibold hover:bg-[#2d2a26] transition-all"
            >
              {step === STEPS.length - 1 ? 'Get Started' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
