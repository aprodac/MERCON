import ExcelJS from 'exceljs';
import type { ReportFieldKey, ReportSource } from '@mercon/shared-types';
import { suggestField } from './aliases';

export interface InspectedColumn {
  colIndex: number;
  headerText: string;
  sampleValue: string;
  suggestedField: ReportFieldKey | null;
}

export interface InspectedSheet {
  sheetName: string;
  headerRowIdx: number;
  dataStartRow: number;
  dataEndRow: number;
  bandSize: number;
  columns: InspectedColumn[];
}

export interface TemplateInspection {
  allSheets: string[];
  bestSheet: InspectedSheet | null;
}

/**
 * Reads an uploaded .xlsx purely for analysis — this ExcelJS workbook object
 * is discarded afterwards, never re-serialized. Generation is handled
 * entirely by splice.ts's byte-preserving ZIP engine, so nothing lossy about
 * ExcelJS's writer ever runs against a customer's template.
 */
export async function inspectTemplate(buf: Buffer, source: ReportSource = 'trips'): Promise<TemplateInspection> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as any);

  const allSheets = workbook.worksheets.map((ws) => ws.name);
  let bestSheet: InspectedSheet | null = null;
  // Diversity-aware, not just raw hit count: a row where every cell
  // happens to match the same field (e.g. a merged banner title read as
  // N duplicate "headers") must never outrank a real header row with
  // fewer but more varied matches — see the merge-cell skip below for why
  // that duplication can occur in the first place.
  let bestScore: { uniqueFields: number; hits: number } | null = null;

  for (const worksheet of workbook.worksheets) {
    const maxScanRow = Math.min(worksheet.rowCount, 25);
    for (let r = 1; r <= maxScanRow; r++) {
      const row = worksheet.getRow(r);
      const headers: { colIndex: number; text: string }[] = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        // Follower cell of a merged range (e.g. a banner title merged
        // across many columns) — only the anchor cell carries real
        // content. ExcelJS's MergeValue makes every follower report the
        // anchor's value, and `includeEmpty:false` alone doesn't filter
        // these out since their type is Merge, not Null.
        if (cell.type === ExcelJS.ValueType.Merge) return;
        const text = cellDisplayText(cell);
        if (text) headers.push({ colIndex: colNumber, text });
      });
      if (headers.length < 2) continue;

      // Computed up front (not headerRowIdx + 1) so the sample-value column
      // below reads real data — a vertically-merged multi-row header would
      // otherwise show the header's own text as its "sample".
      const dataStartRow = headerBlockBottomRow(worksheet, r, headers.map((h) => h.colIndex)) + 1;

      let hits = 0;
      const columns: InspectedColumn[] = headers.map((h) => {
        const suggestedField = suggestField(h.text, source);
        if (suggestedField) hits++;
        const sampleCell = worksheet.getRow(dataStartRow).getCell(h.colIndex);
        return {
          colIndex: h.colIndex,
          headerText: h.text,
          sampleValue: cellDisplayText(sampleCell),
          suggestedField,
        };
      });
      if (hits < 2) continue;

      const uniqueFields = new Set(
        columns.map((c) => c.suggestedField).filter((f): f is ReportFieldKey => f !== null)
      ).size;
      const better =
        !bestScore ||
        uniqueFields > bestScore.uniqueFields ||
        (uniqueFields === bestScore.uniqueFields && hits > bestScore.hits);

      if (better) {
        bestScore = { uniqueFields, hits };
        bestSheet = {
          sheetName: worksheet.name,
          headerRowIdx: r,
          dataStartRow,
          dataEndRow: detectDataEndRow(worksheet, dataStartRow),
          bandSize: detectBandSize(worksheet, dataStartRow),
          columns,
        };
      }
    }
  }

  return { allSheets, bestSheet };
}

/**
 * ExcelJS represents a formula cell's `.value` as `{formula, result?}`, not a
 * primitive — `.toString()` on that object yields the literal string
 * "[object Object]". Read `.result` instead so formula columns (e.g. a VAT
 * column computed as `=K4*15/100`) show their computed value. Two cases
 * `.result` doesn't cover: it can itself be a `{error: string}` object (the
 * formula evaluated to an error) rather than a primitive, and it can be
 * absent entirely — a workbook that was saved without recalculating (or
 * whose referenced cell isn't numeric, e.g. an example/hint row) has no
 * cached result at all, only the formula text.
 */
function cellDisplayText(cell: ExcelJS.Cell): string {
  const v = cell.value as any;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) {
      const result = v.result;
      if (result && typeof result === 'object' && 'error' in result) {
        return String(result.error ?? '').trim();
      }
      return String(result ?? '').trim();
    }
    if ('formula' in v) {
      return `=${v.formula}`;
    }
    return '';
  }
  return String(v?.toString() ?? '').trim();
}

function letterToCol(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRange(range: string): { c1: number; r1: number; c2: number; r2: number } | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!m) return null;
  return { c1: letterToCol(m[1]), r1: parseInt(m[2], 10), c2: letterToCol(m[3]), r2: parseInt(m[4], 10) };
}

/**
 * If the detected header row is part of a vertically-merged header block
 * (e.g. a 2-row-tall header where each column's label is merged across rows
 * 2-3), returns the bottom row of that block; otherwise returns headerRow
 * unchanged. Getting this right matters: the row immediately below becomes
 * the "band row" whose style is cloned onto every generated row — cloning a
 * row that's still part of the header (background color, missing date
 * format, etc) makes the whole generated report look wrong.
 */
function headerBlockBottomRow(worksheet: ExcelJS.Worksheet, headerRow: number, headerCols: number[]): number {
  const merges: string[] = (worksheet as any).model?.merges ?? [];
  let bottom = headerRow;
  for (const range of merges) {
    const parsed = parseRange(range);
    if (!parsed) continue;
    if (parsed.r1 > headerRow || parsed.r2 <= headerRow) continue; // doesn't span through the header row
    if (headerCols.some((c) => c >= parsed.c1 && c <= parsed.c2)) bottom = Math.max(bottom, parsed.r2);
  }
  return bottom;
}

function rowHasAnyValue(worksheet: ExcelJS.Worksheet, rowIdx: number): boolean {
  let found = false;
  worksheet.getRow(rowIdx).eachCell({ includeEmpty: false }, (cell) => {
    if (cell.type === ExcelJS.ValueType.Merge) return; // same merge-follower issue as the header scanner above
    if (cellDisplayText(cell) !== '') found = true;
  });
  return found;
}

/**
 * The last row of the template's sample data block: scan down from the first
 * data row and stop at the first row with no values at all. Everything in
 * [dataStartRow, dataEndRow] gets replaced at generation time, so getting this
 * right is what stops the customer's own sample rows from surviving
 * underneath the real data. The operator can correct it in the mapping editor.
 */
function detectDataEndRow(worksheet: ExcelJS.Worksheet, dataStartRow: number): number {
  let last = dataStartRow;
  const limit = Math.max(worksheet.rowCount, dataStartRow);
  for (let r = dataStartRow; r <= limit; r++) {
    if (rowHasAnyValue(worksheet, r)) last = r;
    else if (r > dataStartRow) break;
  }
  return last;
}

/**
 * How many rows a striped/banded template repeats its style over, found by
 * comparing each row's per-cell style signature against the first data row.
 * Not scanned beyond 8 rows — real templates band at 1 or 2, rarely more.
 */
function detectBandSize(worksheet: ExcelJS.Worksheet, dataStartRow: number): number {
  const signature = (rowIdx: number): string => {
    const row = worksheet.getRow(rowIdx);
    const parts: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      // cell.style is the resolved style object; there is no `.id` on it, so
      // stringifying the object is what actually distinguishes banded rows.
      parts.push(JSON.stringify(cell.style ?? {}));
    });
    return parts.join('|');
  };

  const firstSig = signature(dataStartRow);
  if (!firstSig) return 1;
  for (let band = 2; band <= 8; band++) {
    if (signature(dataStartRow + band) === firstSig && signature(dataStartRow + 1) !== firstSig) {
      return band;
    }
  }
  return 1;
}
