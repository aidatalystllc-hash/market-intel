import * as XLSX from 'xlsx';

export interface RawSheet {
  columns: string[];
  rows: Record<string, unknown>[];
}

/**
 * Parse an Excel (.xlsx/.xls) or JSON file buffer into column names and row data.
 * For very large files, uses raw values for better performance.
 */
export function parseFile(buffer: Buffer, filename: string): RawSheet {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'json') {
    const text = buffer.toString('utf-8');
    const parsed = JSON.parse(text);
    const rows: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length === 0) return { columns: [], rows: [] };
    const columns = Object.keys(rows[0]);
    return { columns, rows };
  }

  // Excel file (.xlsx or .xls)
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { columns: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true, // Keep raw values (numbers stay numbers) for better performance
  });

  if (rows.length === 0) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);

  return { columns, rows };
}
