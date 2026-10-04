import ExcelJS from 'exceljs';
import { formatQuotationRef } from '@mercon/shared-types';
import type { Quotation, SurchargeRule } from '@/services/quotationService';
import { isMonthlyQuotation, quotationOffLabel, quotationStopNames } from '@/components/quotations/QuotationRouteMatrix';

/** Same look as the other MERCON exports (exportUtils): orange header row, slate text, zebra rows. */
const C = {
  orange: 'FFE8450F',
  orangeDark: 'FFB93A0C',
  ink: 'FF1E293B',
  subtle: 'FF64748B',
  border: 'FFE2E8F0',
  zebra: 'FFF8FAFC',
  band: 'FFF1F5F9',
  good: 'FF166534',
  goodBg: 'FFDCFCE7',
  warn: 'FF92400E',
  warnBg: 'FFFEF3C7',
  bad: 'FF991B1B',
  badBg: 'FFFEE2E2',
  monthly: 'FF047857',
} as const;

const TRUCK_ORDER = ['3-4 TON', '5 TON', '8 TON', '10 TON', '20 TON', '40 FEET'];
const truckRank = (v?: string | null) => { const i = TRUCK_ORDER.indexOf(String(v || '').toUpperCase()); return i < 0 ? 99 : i; };
const thin = (argb: string) => ({ style: 'thin' as const, color: { argb } });
const box = (argb: string) => ({ top: thin(argb), bottom: thin(argb), left: thin(argb), right: thin(argb) });
const dateOnly = (v?: string | null) => (v ? new Date(v) : null);

export interface CustomerQuotations {
  name: string;
  quotations: Quotation[];
  charges: SurchargeRule[];
}

/** Excel sheet names: ≤31 chars, none of \ / ? * [ ] :, unique in the workbook. */
function sheetNameFor(name: string, used: Set<string>) {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Customer';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

const COLUMNS: Array<{ header: string; width: number; money?: boolean; date?: boolean; center?: boolean }> = [
  { header: 'QT No.', width: 10, center: true },
  { header: 'From', width: 18 },
  { header: 'Via', width: 22 },
  { header: 'To', width: 18 },
  { header: 'Stops', width: 7, center: true },
  { header: 'Truck', width: 10, center: true },
  { header: 'Line type', width: 14 },
  { header: 'Operation', width: 11, center: true },
  { header: 'Price (SAR)', width: 13, money: true },
  { header: 'Per', width: 7, center: true },
  { header: 'Driver pay (SAR)', width: 15, money: true },
  { header: 'Valid from', width: 12, date: true },
  { header: 'Valid to', width: 12, date: true },
  { header: 'Status', width: 10, center: true },
  { header: 'Quotation name', width: 34 },
];

function sortQuotations(list: Quotation[]) {
  return [...list].sort((a, b) => {
    const ma = Number(isMonthlyQuotation(a)), mb = Number(isMonthlyQuotation(b));
    if (ma !== mb) return ma - mb;
    const ra = quotationStopNames(a).join(' > '), rb = quotationStopNames(b).join(' > ');
    return ra.localeCompare(rb)
      || String(a.line_type || '').localeCompare(String(b.line_type || ''))
      || truckRank(a.vehicle_class) - truckRank(b.vehicle_class)
      || Number(a.rate ?? 0) - Number(b.rate ?? 0);
  });
}

function addCustomerSheet(wb: ExcelJS.Workbook, sheetName: string, c: CustomerQuotations, exportedAt: Date) {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { tabColor: { argb: C.orange } },
  });
  const cols = COLUMNS.length;
  COLUMNS.forEach((col, i) => { ws.getColumn(i + 1).width = col.width; });

  const qs = sortQuotations(c.quotations);
  const monthly = qs.filter(isMonthlyQuotation).length;
  const withPay = qs.filter((q) => q.driver_payout != null).length;

  ws.mergeCells(1, 1, 1, cols);
  Object.assign(ws.getCell(1, 1), { value: c.name, font: { name: 'Calibri', size: 16, bold: true, color: { argb: C.ink } }, alignment: { vertical: 'middle' } });
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, cols);
  Object.assign(ws.getCell(2, 1), {
    value: `Quotations · ${qs.length} total · ${qs.length - monthly} per trip · ${monthly} monthly · ${withPay} with driver pay · exported ${exportedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} from MERCON`,
    font: { name: 'Calibri', size: 10, italic: true, color: { argb: C.subtle } },
  });
  ws.getRow(3).height = 6;

  const head = ws.getRow(4);
  COLUMNS.forEach((col, i) => {
    const cell = head.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.orange } };
    cell.border = box(C.orangeDark);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  head.height = 22;

  qs.forEach((q, idx) => {
    const names = quotationStopNames(q);
    const off = quotationOffLabel(q);
    const isMonthly = isMonthlyQuotation(q);
    const pay = q.driver_payout != null && !isNaN(Number(q.driver_payout)) ? Number(q.driver_payout) : null;
    const values: Array<string | number | Date | null> = [
      formatQuotationRef((q as any).quotation_number) || '',
      names[0] || '',
      names.slice(1, -1).join(' → ') || null,
      names[names.length - 1] || '',
      names.length,
      q.vehicle_class || '',
      q.line_type || q.rate_category || 'Single Trip',
      isMonthly ? 'Monthly' : 'Extra',
      Number(q.rate ?? q.base_price ?? 0),
      isMonthly ? 'month' : 'trip',
      pay,
      dateOnly(q.valid_from),
      dateOnly(q.valid_to),
      off || 'Active',
      q.name || null,
    ];
    const row = ws.getRow(5 + idx);
    values.forEach((v, i) => {
      const col = COLUMNS[i];
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = box(C.border);
      cell.font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: 'middle', horizontal: col.money ? 'right' : col.center ? 'center' : 'left' };
      if (col.money) cell.numFmt = '#,##0.00';
      if (col.date) cell.numFmt = 'dd mmm yyyy';
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    });
    if (isMonthly) row.getCell(8).font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.monthly } };
    row.getCell(9).font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.ink } };
    if (pay == null) Object.assign(row.getCell(11), { value: 'at booking', font: { name: 'Calibri', size: 9, italic: true, color: { argb: C.subtle } }, alignment: { horizontal: 'right', vertical: 'middle' } });
    const status = row.getCell(14);
    const [fg, bg] = off == null ? [C.good, C.goodBg] : off === 'Expired' ? [C.bad, C.badBg] : [C.warn, C.warnBg];
    status.font = { name: 'Calibri', size: 10, bold: true, color: { argb: fg } };
    status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    row.height = 18;
  });

  const lastRow = 4 + Math.max(qs.length, 1);
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastRow, column: cols } };

  // Extra charges for this customer, under the quotations.
  if (c.charges.length > 0) {
    let r = lastRow + 3;
    ws.mergeCells(r, 1, r, 4);
    Object.assign(ws.getCell(r, 1), { value: 'Extra charges', font: { name: 'Calibri', size: 12, bold: true, color: { argb: C.ink } } });
    r++;
    // Spans over the quotation columns so each field has room: [first col, last col].
    const spans: Array<[number, number]> = [[1, 4], [5, 7], [8, 8], [9, 9], [10, 11]];
    const heads = ['Charge', 'Unit', 'Truck', 'Price (SAR)', 'Applies to'];
    const put = (row: number, values: Array<string | number | null>, header: boolean) => {
      values.forEach((v, i) => {
        const [c1, c2] = spans[i];
        if (c2 > c1) ws.mergeCells(row, c1, row, c2);
        const cell = ws.getCell(row, c1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 10, bold: header, color: { argb: C.ink } };
        cell.alignment = { vertical: 'middle', horizontal: i === 3 ? 'right' : 'left' };
        if (!header && i === 3) cell.numFmt = '#,##0.00';
        for (let c = c1; c <= c2; c++) {
          const part = ws.getCell(row, c);
          part.border = box(C.border);
          if (header) part.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.band } };
        }
      });
      ws.getRow(row).height = 18;
    };
    put(r, heads, true);
    for (const rule of [...c.charges].sort((x, y) => x.charge_type.localeCompare(y.charge_type))) {
      r++;
      put(r, [
        rule.charge_type,
        rule.unit || null,
        rule.vehicle_type || 'All',
        Number(rule.rate ?? 0),
        rule.quotationId ? formatQuotationRef((rule as any).quotation?.quotation_number) || 'One quotation' : 'All routes',
      ], false);
    }
  }
}

/**
 * Quotations as a styled workbook. With more than one customer it opens on an
 * "All customers" summary whose names link to each customer's own sheet.
 */
export function buildQuotationWorkbook(customers: CustomerQuotations[], exportedAt = new Date()): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MERCON Logistics Platform';
  wb.created = exportedAt;

  const list = customers.filter((c) => c.quotations.length > 0 || c.charges.length > 0).sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set<string>();
  const summary = list.length > 1 ? wb.addWorksheet(sheetNameFor('All customers', used), { views: [{ state: 'frozen', ySplit: 4 }], properties: { tabColor: { argb: C.ink } }, pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } }) : null;
  const names = list.map((c) => sheetNameFor(c.name, used));
  list.forEach((c, i) => addCustomerSheet(wb, names[i], c, exportedAt));

  if (summary) {
    const heads = ['Customer', 'Quotations', 'Per trip', 'Monthly', 'With driver pay', 'Trucks', 'Extra charges'];
    const widths = [36, 12, 10, 10, 15, 36, 14];
    widths.forEach((w, i) => { summary.getColumn(i + 1).width = w; });
    summary.mergeCells(1, 1, 1, heads.length);
    Object.assign(summary.getCell(1, 1), { value: 'MERCON quotations', font: { name: 'Calibri', size: 16, bold: true, color: { argb: C.ink } } });
    summary.getRow(1).height = 26;
    summary.mergeCells(2, 1, 2, heads.length);
    const total = list.reduce((n, c) => n + c.quotations.length, 0);
    Object.assign(summary.getCell(2, 1), {
      value: `${list.length} customers · ${total} quotations · exported ${exportedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · click a customer to open its sheet`,
      font: { name: 'Calibri', size: 10, italic: true, color: { argb: C.subtle } },
    });
    summary.getRow(3).height = 6;
    heads.forEach((h, i) => {
      const cell = summary.getCell(4, i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.orange } };
      cell.border = box(C.orangeDark);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    summary.getRow(4).height = 22;
    list.forEach((c, i) => {
      const monthly = c.quotations.filter(isMonthlyQuotation).length;
      const trucks = [...new Set(c.quotations.map((q) => q.vehicle_class).filter(Boolean) as string[])].sort((a, b) => truckRank(a) - truckRank(b)).join(', ');
      const row = summary.getRow(5 + i);
      const vals: Array<string | number> = [c.name, c.quotations.length, c.quotations.length - monthly, monthly, c.quotations.filter((q) => q.driver_payout != null).length, trucks || '—', c.charges.length];
      vals.forEach((v, j) => {
        const cell = row.getCell(j + 1);
        cell.value = v;
        cell.border = box(C.border);
        cell.font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
        cell.alignment = { vertical: 'middle', horizontal: j === 0 || j === 5 ? 'left' : 'center' };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      });
      const link = row.getCell(1);
      link.value = { text: c.name, hyperlink: `#'${names[i].replace(/'/g, "''")}'!A1` };
      link.font = { name: 'Calibri', size: 10, bold: true, underline: true, color: { argb: C.orangeDark } };
      row.height = 18;
    });
    const tr = summary.getRow(5 + list.length);
    const totals: Array<string | number> = ['Total', total, list.reduce((n, c) => n + c.quotations.filter((q) => !isMonthlyQuotation(q)).length, 0), list.reduce((n, c) => n + c.quotations.filter(isMonthlyQuotation).length, 0), list.reduce((n, c) => n + c.quotations.filter((q) => q.driver_payout != null).length, 0), '', list.reduce((n, c) => n + c.charges.length, 0)];
    totals.forEach((v, j) => {
      const cell = tr.getCell(j + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.ink } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.band } };
      cell.border = { ...box(C.border), top: { style: 'medium', color: { argb: C.subtle } } };
      cell.alignment = { horizontal: j === 0 ? 'left' : 'center' };
    });
  }
  return wb;
}

export async function downloadQuotationWorkbook(customers: CustomerQuotations[], filename: string) {
  const buffer = await buildQuotationWorkbook(customers).xlsx.writeBuffer();
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
