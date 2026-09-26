import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInDeploymentTz } from '@/lib/datetime';

/** Default deployment timezone used by the exporters below when the caller
 *  doesn't have (or doesn't bother passing) the configured value from
 *  `useDeploymentTimezone()` — this is a plain utility file, not a component,
 *  so it has no hook access of its own. */
const DEFAULT_EXPORT_TZ = 'Asia/Riyadh';

const EXCLUDE_KEYS = new Set([
  'id', 'deletedAt', 'created_by', 'updated_by', 'deleted_by',
  'version', 'password_hash', 'userId', 'driverId', 'vehicleId',
  'customerId', 'tripId', 'isActive'
]);

// ─── MERCON brand palette (kept in sync with the app's Tailwind theme) ──────
const BRAND = {
  primary: 'FFE8450F',   // MERCON orange — table headers, PDF headers
  primaryDark: 'FFB93A0C',
  ink: 'FF1E293B',        // slate-800 — titles
  subtle: 'FF64748B',     // slate-500 — subtitles/meta
  border: 'FFE2E8F0',     // slate-200
  zebra: 'FFF8FAFC',      // slate-50
  totalsBg: 'FFF1F5F9',   // slate-100
  totalsBorder: 'FF475569', // slate-600
  good: 'FFDCFCE7',       // green-100
  goodText: 'FF166534',   // green-800
  bad: 'FFFEE2E2',        // red-100
  badText: 'FF991B1B',    // red-800
} as const;

const BRAND_HEX = '#E8450F';
const INK_HEX = '#1E293B';
const SUBTLE_HEX = '#64748B';
const BORDER_RGB: [number, number, number] = [226, 232, 240];
const ZEBRA_RGB: [number, number, number] = [248, 250, 252];

function formatHeaderLabel(key: string): string {
  const map: Record<string, string> = {
    ref_id: 'Job / Ref ID',
    first_name: 'First Name',
    last_name: 'Last Name',
    phone_primary: 'Primary Phone',
    contact_phone: 'Contact Phone',
    plate_number: 'Plate Number',
    capacity_kg: 'Capacity (KG)',
    asset_type: 'Vehicle Type',
    total_amount: 'Total Amount (SAR)',
    subtotal: 'Subtotal (SAR)',
    billing_amount: 'Billing Rate (SAR)',
    total_charges: 'Extra Charges (SAR)',
    trip_charges: 'Driver Charge (SAR)',
    balance_amount: 'Balance (SAR)',
    carrier_name: 'Carrier / Provider',
    createdAt: 'Created Date',
    updatedAt: 'Updated Date',
    actual_start: 'Start Date',
    actual_end: 'End Date',
    planned_start: 'Planned Start',
    planned_end: 'Planned End',
    due_date: 'Due Date',
    issue_date: 'Issue Date',
    expiry_date: 'Expiry Date',
    status: 'Status',
    cost: 'Maintenance Cost (SAR)',
    service_date: 'Service Date',
    odometer_reading: 'Odometer Reading (KM)',
    workshop_name: 'Workshop Name',
  };

  if (map[key]) return map[key];
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function extractValue(val: any, tz: string = DEFAULT_EXPORT_TZ): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return String(val);

  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.map((item) => extractValue(item, tz)).filter(Boolean).join('; ');
    }
    // Unwrap nested relational objects nicely
    if (val.name) return String(val.name);
    if (val.first_name || val.last_name) {
      return `${val.first_name || ''} ${val.last_name || ''}`.trim();
    }
    if (val.plate_number) return String(val.plate_number);
    if (val.ref_id) return String(val.ref_id);
    if (val.username) return String(val.username);
    if (val.title) return String(val.title);
    return '';
  }

  // Format ISO Dates in the deployment's configured display timezone
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return formatInDeploymentTz(d, tz, 'yyyy-MM-dd');
      }
    } catch (e) {
      // fallback
    }
  }

  return String(val);
}

export function downloadCSV<T extends Record<string, any>>(data: T[], filename: string = 'mercon_export.csv', timezone: string = DEFAULT_EXPORT_TZ) {
  if (!data || !data.length) {
    return;
  }

  // Filter raw keys to exclude internal system fields unless specifically mapped
  const rawKeys = Object.keys(data[0]).filter(k => !EXCLUDE_KEYS.has(k));
  const headers = rawKeys.map(formatHeaderLabel);

  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.join(','));

  // Add data rows
  for (const row of data) {
    const values = rawKeys.map(key => {
      let val = extractValue(row[key], timezone);
      val = val.replace(/"/g, '""'); // Escape double quotes for CSV
      if (/[",\n]/.test(val)) {
        val = `"${val}"`;
      }
      return val;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM for Excel compatibility

  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * CSV export with an explicit header/row set — the table-shaped sibling of
 * `downloadCSV`, for callers that already curated their own columns (e.g. to
 * avoid dumping every raw field of a wide entity into the file) rather than
 * deriving them from an object's own keys.
 */
export function downloadCSVTable(headers: string[], rows: any[][], filename: string = 'mercon_export.csv') {
  const csvRows: string[] = [headers.join(',')];
  for (const row of rows) {
    const values = row.map(cell => {
      let val = cell === null || cell === undefined ? '' : String(cell);
      val = val.replace(/"/g, '""');
      if (/[",\n]/.test(val)) val = `"${val}"`;
      return val;
    });
    csvRows.push(values.join(','));
  }
  const csvString = csvRows.join('\n');
  const blob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Cell classification (shared by the real .xlsx and .pdf engines) ───────
type CellKind = 'text' | 'number' | 'currency' | 'date' | 'status-good' | 'status-bad' | 'center';

const MONEY_WORDS = ['charges', 'amount', 'billing', 'revenue', 'cost', 'total', 'balance', 'credit', 'limit', 'payout'];
const GOOD_WORDS = ['active', 'completed', 'delivered', 'paid', 'clear', 'approved', 'available'];
const BAD_WORDS = ['inactive', 'cancelled', 'overdue', 'expired', 'rejected', 'blocked', 'suspended'];

function classifyCell(cell: any, headerLower: string): CellKind {
  if (typeof cell === 'number') {
    return MONEY_WORDS.some(w => headerLower.includes(w)) ? 'currency' : 'number';
  }
  if (typeof cell === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(cell) || /^\d{2}-\d{2}-\d{4}$/.test(cell) || /^\d{2}\/\d{2}\/\d{4}$/.test(cell)) {
      return 'date';
    }
    if (headerLower.includes('status')) {
      const lower = cell.toLowerCase();
      if (GOOD_WORDS.some(w => lower.includes(w))) return 'status-good';
      if (BAD_WORDS.some(w => lower.includes(w))) return 'status-bad';
      return 'center';
    }
  }
  return 'text';
}

function isTotalsRow(row: any[]): boolean {
  const first = String(row[0] ?? '').trim().toUpperCase();
  return first === 'TOTALS' || first === 'TOTAL' || first === 'GRAND TOTAL';
}

interface TableExportOptions {
  /** Extra descriptive line under the title (defaults to a generated-on stamp). */
  subtitle?: string;
  /** Sheet tab name (Excel only, 31-char limit enforced automatically). */
  sheetName?: string;
  /** Force landscape/portrait for the PDF; auto-detected from column count if omitted. */
  orientation?: 'portrait' | 'landscape';
  /** Visual theme for Excel exports */
  theme?: 'standard' | 'jd-monthly';
}

/**
 * Builds a real, styled .xlsx workbook (brand header row, zebra striping,
 * per-column number/currency/date formats, a bold totals row, frozen header,
 * autofilter, and auto-sized columns) and downloads it.
 */
export async function exportExcelTable(
  title: string,
  headers: string[],
  rows: any[][],
  filename: string = 'mercon_export.xlsx',
  options: TableExportOptions = {}
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MERCON Logistics Platform';
  workbook.created = new Date();

  const sheetName = (options.sheetName || title).replace(/[\\*?:/[\]]/g, '').slice(0, 31) || 'Report';
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const colCount = headers.length;

  const isJdMonthly = options.theme === 'jd-monthly';

  // ── Title & subtitle band ────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  
  if (isJdMonthly) {
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF000000' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C9AD6' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    sheet.getRow(1).height = 32;
  } else {
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BRAND.ink } };
    titleCell.alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 26;
  }

  sheet.mergeCells(2, 1, 2, colCount);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = options.subtitle
    || `Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} · MERCON Logistics Platform · ${rows.length} record${rows.length === 1 ? '' : 's'}`;
  subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: BRAND.subtle } };
  sheet.getRow(2).height = isJdMonthly ? 0 : 16; // Hide subtitle in JD Monthly

  sheet.getRow(3).height = isJdMonthly ? 0 : 6; // Hide spacer in JD Monthly

  // ── Header row ────────────────────────────────────────────────────────
  const headerRowIdx = isJdMonthly ? 2 : 4; // Move headers up in JD Monthly
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    if (isJdMonthly) {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    } else {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.primary } };
      cell.border = {
        top: { style: 'thin', color: { argb: BRAND.primaryDark } },
        bottom: { style: 'thin', color: { argb: BRAND.primaryDark } },
        left: { style: 'thin', color: { argb: BRAND.primaryDark } },
        right: { style: 'thin', color: { argb: BRAND.primaryDark } },
      };
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = isJdMonthly ? 28 : 22;

  // ── Data rows ─────────────────────────────────────────────────────────
  rows.forEach((row, rIdx) => {
    const totals = isTotalsRow(row);
    const excelRow = sheet.getRow(headerRowIdx + 1 + rIdx);
    row.forEach((value, cIdx) => {
      const headerLower = (headers[cIdx] || '').toLowerCase();
      const kind = classifyCell(value, headerLower);
      const cell = excelRow.getCell(cIdx + 1);
      cell.value = value === null || value === undefined || value === '' ? null : value;

      switch (kind) {
        case 'currency':
          cell.numFmt = '#,##0.00 "SAR"';
          cell.alignment = { horizontal: isJdMonthly ? 'center' : 'right', vertical: 'middle' };
          break;
        case 'number':
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          break;
        case 'date':
          cell.alignment = { horizontal: isJdMonthly ? 'center' : 'left', vertical: 'middle' };
          break;
        case 'status-good':
          if (!isJdMonthly) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.good } };
            cell.font = { bold: true, color: { argb: BRAND.goodText } };
          }
          cell.alignment = { horizontal: isJdMonthly ? 'center' : 'left', vertical: 'middle' };
          break;
        case 'status-bad':
          if (!isJdMonthly) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bad } };
            cell.font = { bold: true, color: { argb: BRAND.badText } };
          }
          cell.alignment = { horizontal: isJdMonthly ? 'center' : 'left', vertical: 'middle' };
          break;
        case 'center':
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          break;
        default:
          cell.alignment = { horizontal: isJdMonthly ? 'center' : 'left', vertical: 'middle', wrapText: true };
      }

      if (isJdMonthly) {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
        if (headerLower.includes('charge')) {
          cell.font = { ...(cell.font || {}), color: { argb: 'FFFF0000' } }; // Red text
        }
      } else {
        cell.border = {
          top: { style: 'thin', color: { argb: BRAND.border } },
          bottom: { style: 'thin', color: { argb: BRAND.border } },
          left: { style: 'thin', color: { argb: BRAND.border } },
          right: { style: 'thin', color: { argb: BRAND.border } },
        };
      }

      if (totals) {
        cell.font = { ...(cell.font || {}), bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.totalsBg } };
        cell.border = {
          ...cell.border,
          top: { style: 'medium', color: { argb: BRAND.totalsBorder } },
          bottom: { style: 'double', color: { argb: BRAND.totalsBorder } },
        };
      } else if (rIdx % 2 === 0) {
        cell.fill = cell.fill || { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      }
    });
    excelRow.height = 18;
  });

  // ── Column widths (auto-fit from header + sampled content) ─────────────
  headers.forEach((h, i) => {
    let maxLen = h.length;
    for (const row of rows.slice(0, 200)) {
      const v = row[i];
      const len = v === null || v === undefined ? 0 : String(v).length;
      if (len > maxLen) maxLen = len;
    }
    sheet.getColumn(i + 1).width = Math.min(38, Math.max(10, maxLen + 3));
  });

  // ── Autofilter across the header row ────────────────────────────────
  sheet.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: colCount },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Excel export for a plain array of record objects (mirrors downloadCSV's
 * header derivation) — a one-line drop-in wherever a CSV export already
 * exists but a styled, real .xlsx is wanted instead.
 */
export async function exportExcel<T extends Record<string, any>>(
  data: T[],
  filename: string = 'mercon_export.xlsx',
  title: string = 'MERCON Export',
  options: TableExportOptions = {},
  timezone: string = DEFAULT_EXPORT_TZ
) {
  if (!data || !data.length) return;
  const rawKeys = Object.keys(data[0]).filter(k => !EXCLUDE_KEYS.has(k));
  const headers = rawKeys.map(formatHeaderLabel);
  const rows = data.map(row => rawKeys.map(key => {
    const v = extractValue(row[key], timezone);
    const num = Number(v);
    return v !== '' && !Number.isNaN(num) && typeof row[key] === 'number' ? num : v;
  }));
  await exportExcelTable(title, headers, rows, filename, options);
}

/**
 * Builds a real, styled PDF (branded header band, zebra rows, bold totals
 * row, footer with page numbers + generated-on stamp) and downloads it —
 * no browser print dialog involved.
 */
export function exportPDFTable(
  title: string,
  headers: string[],
  rows: any[][],
  filename: string = 'mercon_export.pdf',
  options: TableExportOptions = {}
) {
  const orientation = options.orientation || (headers.length > 6 ? 'landscape' : 'portrait');
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;

  // ── Brand header band ───────────────────────────────────────────────
  doc.setFillColor(BRAND_HEX);
  doc.rect(0, 0, pageWidth, 56, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('MERCON LOGISTICS PLATFORM', margin, 22);
  doc.setFontSize(15);
  doc.text(title, margin, 42);

  const subtitle = options.subtitle
    || `Generated on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} · ${rows.length} record${rows.length === 1 ? '' : 's'}`;

  const bodyRows = rows.filter(r => !isTotalsRow(r));
  const totalsRows = rows.filter(r => isTotalsRow(r));

  autoTable(doc, {
    head: [headers],
    body: bodyRows,
    foot: totalsRows.length ? totalsRows : undefined,
    startY: 68,
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, textColor: INK_HEX, lineColor: BORDER_RGB, lineWidth: 0.5 },
    headStyles: { fillColor: BRAND_HEX, textColor: '#FFFFFF', fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: '#0F172A', fontStyle: 'bold', lineWidth: { top: 1 } },
    alternateRowStyles: { fillColor: ZEBRA_RGB },
    didParseCell: (data: any) => {
      if (data.section !== 'body' && data.section !== 'foot') return;
      const headerLower = (headers[data.column.index] || '').toLowerCase();
      const raw = data.cell.raw;
      const kind = classifyCell(raw, headerLower);
      if (kind === 'currency' || kind === 'number') {
        data.cell.styles.halign = 'right';
        if (typeof raw === 'number' && kind === 'currency') {
          data.cell.text = [`SAR ${raw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`];
        }
      } else if (kind === 'date' || kind === 'center') {
        data.cell.styles.halign = 'center';
      } else if (kind === 'status-good') {
        data.cell.styles.halign = 'center';
        data.cell.styles.fillColor = data.section === 'body' ? [220, 252, 231] : data.cell.styles.fillColor;
        data.cell.styles.textColor = [22, 101, 52];
        data.cell.styles.fontStyle = 'bold';
      } else if (kind === 'status-bad') {
        data.cell.styles.halign = 'center';
        data.cell.styles.fillColor = data.section === 'body' ? [254, 226, 226] : data.cell.styles.fillColor;
        data.cell.styles.textColor = [153, 27, 27];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: () => {
      // Subtitle only needs to be drawn once, right under the header band
      if (doc.getNumberOfPages() === 1) {
        doc.setTextColor(SUBTLE_HEX);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(subtitle, margin, 64);
      }

      const pageCount = doc.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...BORDER_RGB);
      doc.setLineWidth(0.5);
      doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);
      doc.setTextColor(SUBTLE_HEX);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('MERCON Logistics Platform', margin, pageHeight - 16);
      doc.text(
        `Page ${doc.getCurrentPageInfo().pageNumber} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 16,
        { align: 'right' }
      );
    },
  });

  doc.save(filename);
}

/**
 * PDF export for a plain array of record objects (mirrors downloadCSV's
 * header derivation) — real generated PDF, branded and paginated, downloaded
 * directly (no print dialog).
 */
export function exportPDF<T extends Record<string, any>>(
  data: T[],
  title: string = 'MERCON Export',
  filename?: string,
  options: TableExportOptions = {},
  timezone: string = DEFAULT_EXPORT_TZ
) {
  if (!data || !data.length) return;
  const rawKeys = Object.keys(data[0]).filter(k => !EXCLUDE_KEYS.has(k));
  const headers = rawKeys.map(formatHeaderLabel);
  const rows = data.map(row => rawKeys.map(key => extractValue(row[key], timezone)));
  const safeName = filename
    || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  exportPDFTable(title, headers, rows, safeName, options);
}

export const exportToCSV = downloadCSV;

/** Parses one CSV line respecting double-quoted fields (with "" escaping),
 *  since values can legitimately contain commas (e.g. "Acme, Inc."). */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

/** Reads an uploaded CSV file into an array of plain objects keyed by a
 *  normalized version of the header row (lowercase, spaces → underscores),
 *  so "Customer Name" and "customer_name" both resolve to `customer_name`. */
export function parseCSVFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      try {
        const text = String(reader.result || '').replace(/^﻿/, '');
        const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
        if (!lines.length) {
          resolve([]);
          return;
        }

        const headers = parseCSVLine(lines[0]).map(h =>
          h.trim().toLowerCase().replace(/\s+/g, '_')
        );

        const rows: Record<string, string>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            row[h] = (values[idx] ?? '').trim();
          });
          rows.push(row);
        }
        resolve(rows);
      } catch (e) {
        reject(e as Error);
      }
    };
    reader.readAsText(file);
  });
}
