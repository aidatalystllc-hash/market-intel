import * as XLSX from 'xlsx';
import { flattenUduJson, isNestedUduFormat } from './flattenJson';

export interface RawSheet {
  columns: string[];
  rows: Record<string, unknown>[];
}

/**
 * Parse an Excel (.xlsx/.xls) or JSON file buffer into column names and row data.
 * Automatically detects and flattens nested UDU-style JSON.
 */
export function parseFile(buffer: Buffer, filename: string): RawSheet {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'json') {
    const text = buffer.toString('utf-8');
    const parsed = JSON.parse(text);
    const rows: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length === 0) return { columns: [], rows: [] };

    // Check if this is nested UDU format and flatten it
    if (isNestedUduFormat(rows)) {
      console.log(`Detected nested UDU format — flattening ${rows.length} rows...`);
      return flattenUduJson(rows);
    }

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
    raw: true,
  });

  if (rows.length === 0) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);

  return { columns, rows };
}
