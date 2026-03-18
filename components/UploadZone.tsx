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
          <div
            className="font-mono text-[9px] text-[var(--tx3)] tracking-wider uppercase"
          >
            .xlsx &middot; .json &middot; up to 500MB
          </div>
        </>
      ) : (
        <>
          <div className="text-2xl mb-2">&#10003;</div>
          <div className="font-semibold text-[var(--tx)] text-sm mb-1 truncate">
            {file.name}
          </div>
          <div className="font-mono text-xs text-[var(--acc)] mb-3">
            {rowCount.toLocaleString()} rows &middot; {columns.length} columns
          </div>
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
