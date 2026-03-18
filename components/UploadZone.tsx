'use client';

import { useCallback, useState } from 'react';

interface UploadZoneProps {
  label: string;
  description: string;
  required?: boolean;
  onFile: (file: File) => void;
  file: File | null;
  columns: string[];
  rowCount: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

type SizeWarning = 'none' | 'large' | 'very-large';

function getSizeWarning(bytes: number): SizeWarning {
  if (bytes > 300 * 1024 * 1024) return 'very-large'; // >300MB
  if (bytes > 50 * 1024 * 1024) return 'large'; // >50MB
  return 'none';
}

export default function UploadZone({
  label,
  description,
  required,
  onFile,
  file,
  columns,
  rowCount,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const sizeWarning = file ? getSizeWarning(file.size) : 'none';

  return (
    <div
      className={`relative flex-1 border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
        isDragging
          ? 'border-[var(--acc)] bg-[rgba(176,125,16,0.05)]'
          : file
          ? 'border-[#1a7040] bg-[rgba(26,112,64,0.03)]'
          : 'border-[var(--bd2)] bg-[var(--bg2)] hover:border-[var(--tx3)] hover:bg-[var(--bg3)]'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById(`upload-${label}`)?.click()}
    >
      <input
        id={`upload-${label}`}
        type="file"
        accept=".xlsx,.xls,.json"
        className="hidden"
        onChange={handleChange}
      />

      {!file ? (
        <>
          <div className="text-3xl mb-3 opacity-30">
            {label === 'Company Data' ? '🏢' : '📍'}
          </div>
          <div className="font-semibold text-[var(--tx)] text-sm mb-1">
            {label}
            {required && (
              <span className="text-[var(--nat)] ml-1 text-xs">Required</span>
            )}
          </div>
          <div className="text-[var(--tx3)] text-xs mb-3">{description}</div>
          <div className="font-mono text-[9px] text-[var(--tx3)] tracking-wider uppercase">
            .xlsx &middot; .json
          </div>
          <div className="font-mono text-[9px] text-[var(--tx3)] tracking-wider uppercase mt-1">
            Recommended: under 100MB
          </div>
          <div className="font-mono text-[9px] text-[var(--tx3)] tracking-wider uppercase">
            Max: ~300MB (processed in browser)
          </div>
        </>
      ) : (
        <>
          <div className="text-2xl mb-2">&#10003;</div>
          <div className="font-semibold text-[var(--tx)] text-sm mb-1 truncate">
            {file.name}
          </div>
          <div className="font-mono text-xs text-[var(--acc)] mb-1">
            {rowCount.toLocaleString()} rows &middot; {columns.length} columns
          </div>
          <div className="font-mono text-[10px] text-[var(--tx3)] mb-3">
            {formatSize(file.size)}
          </div>

          {/* Size warnings */}
          {sizeWarning === 'very-large' && (
            <div className="mb-3 px-3 py-1.5 rounded bg-[rgba(176,58,26,0.06)] border border-[rgba(176,58,26,0.2)] text-[10px] text-[var(--nat)] leading-relaxed">
              This file is very large ({formatSize(file.size)}). Processing may take over a minute and could slow your browser.
              Consider filtering your data to under 300MB before uploading.
            </div>
          )}
          {sizeWarning === 'large' && (
            <div className="mb-3 px-3 py-1.5 rounded bg-[rgba(176,125,16,0.06)] border border-[rgba(176,125,16,0.2)] text-[10px] text-[var(--acc)] leading-relaxed">
              Large file ({formatSize(file.size)}) — processing may take 15-30 seconds. This is normal.
            </div>
          )}

          <div className="flex flex-wrap gap-1 justify-center">
            {columns.slice(0, 8).map((col) => (
              <span
                key={col}
                className="font-mono text-[9px] px-2 py-0.5 rounded bg-[rgba(26,112,64,0.08)] text-[#1a7040] border border-[rgba(26,112,64,0.2)]"
              >
                {col}
              </span>
            ))}
            {columns.length > 8 && (
              <span className="font-mono text-[9px] px-2 py-0.5 text-[var(--tx3)]">
                +{columns.length - 8} more
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
