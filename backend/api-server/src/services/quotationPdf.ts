/**
 * Customer-facing quotation PDF: one quotation, or a customer's whole rate
 * sheet. Letterhead from Settings (logo, legal name, VAT / CR), the customer,
 * then one row per rate — route (every stop), truck, trip type, billing, rate,
 * validity. Internal figures (driver pay, margin, usage) are never printed:
 * this document is sent to the customer.
 */
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { formatQuotationRef, lineTypeLabel, normalizeBillingTypeToken, normalizeLineTypeToken } from '@mercon/shared-types';
import { getUploadDir } from '../middlewares/upload';

export interface PdfQuotation {
  quotation_number: number | null;
  name: string;
  line_type: string | null;
  operation_type: string | null;
  pricing_basis: string | null;
  rate: unknown;
  currency: string;
  vehicle_class: string | null;
  source_vehicle_label: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  stops: { sequence: number; leg_index: number; source_label: string | null; location: { name: string } | null }[];
}

export interface PdfInput {
  title: string;
  settings: { companyLegalName: string; vatNumber: string | null; crNumber: string | null; logoUrl: string | null };
  customer: { name: string; logo_url: string | null };
  quotations: PdfQuotation[];
  timezone: string;
}

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const BRAND = '#FA634E';
const LINE = '#E4E4E8';

/** An uploaded image (`/uploads/x.png`) as a local file pdfkit can embed, or null. */
function localImage(url: string | null): string | null {
  if (!url) return null;
  const m = /\/uploads\/(?:s\/\d+\/[A-Za-z0-9_-]+\/)?([A-Za-z0-9._~ -]+)$/.exec(url.split('?')[0]);
  if (!m || m[1].includes('..') || !/\.(png|jpe?g)$/i.test(m[1])) return null;
  for (const dir of [getUploadDir(), path.resolve(process.cwd(), 'uploads')]) {
    const file = path.join(dir, m[1]);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function routeOf(q: PdfQuotation): string {
  const stops = [...q.stops].sort((a, b) => a.sequence - b.sequence);
  const out = stops.filter((s) => (s.leg_index ?? 0) === 0);
  const names = (out.length >= 2 ? out : stops).map((s) => titleCase(s.source_label || s.location?.name || ''));
  // The built-in PDF fonts have no arrow glyph; › is in their character set.
  if (names.length === 2 && names[0].toLowerCase() === names[1].toLowerCase()) return `Within ${names[0]}`;
  if (names.length >= 2) return names.join('  ›  ');
  return q.name.replace(/\s*->\s*/g, '  ›  ');
}

function money(v: unknown, cur: string) {
  return `${cur} ${Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function day(d: Date | null, tz: string) {
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: tz }) : null;
}

/** Writes the PDF to `out` (an HTTP response or file stream) and ends it. */
export function renderQuotationPdf(input: PdfInput, out: NodeJS.WritableStream) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: input.title, Author: input.settings.companyLegalName } });
  doc.pipe(out);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // Letterhead
  const logo = localImage(input.settings.logoUrl);
  let y = doc.y;
  if (logo) {
    try { doc.image(logo, left, y, { fit: [90, 44] }); } catch { /* unreadable image: letterhead without it */ }
  }
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(input.settings.companyLegalName, left, y, { width, align: 'right' });
  const ids = [input.settings.vatNumber && `VAT ${input.settings.vatNumber}`, input.settings.crNumber && `CR ${input.settings.crNumber}`].filter(Boolean).join('   ·   ');
  if (ids) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(ids, left, doc.y + 2, { width, align: 'right' });
  y = Math.max(doc.y, y + (logo ? 48 : 16)) + 14;
  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(2).strokeColor(BRAND).stroke();

  // Title + customer
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(input.title, left, y + 16);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`Prepared for`, left, doc.y + 8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(titleCase(input.customer.name));
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Issued ${day(new Date(), input.timezone)}   ·   ${input.quotations.length} ${input.quotations.length === 1 ? 'rate' : 'rates'}`, { width });

  // Table
  const cols = [
    { key: 'ref', label: 'Ref', w: 0.11 },
    { key: 'route', label: 'Route', w: 0.31 },
    { key: 'truck', label: 'Truck', w: 0.1 },
    { key: 'type', label: 'Trip type', w: 0.14 },
    { key: 'rate', label: 'Rate', w: 0.17, right: true },
    { key: 'valid', label: 'Valid', w: 0.17 },
  ].map((c) => ({ ...c, w: c.w * width }));

  const header = (top: number) => {
    doc.rect(left, top, width, 22).fill('#F4F4F5');
    let x = left;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
    for (const c of cols) {
      doc.text(c.label.toUpperCase(), x + 6, top + 7, { width: c.w - 12, align: c.right ? 'right' : 'left', characterSpacing: 0.4 });
      x += c.w;
    }
    return top + 22;
  };

  y = header(doc.y + 18);
  for (const q of input.quotations) {
    const monthly = q.pricing_basis === 'PER_MONTH' || (q.pricing_basis !== 'PER_TRIP' && normalizeBillingTypeToken(q.operation_type) === 'Monthly' && !!q.operation_type);
    const from = day(q.valid_from, input.timezone);
    const to = day(q.valid_to, input.timezone);
    const cells: Record<string, string> = {
      ref: formatQuotationRef(q.quotation_number) ?? '—',
      route: routeOf(q),
      truck: q.vehicle_class || q.source_vehicle_label || '—',
      type: `${lineTypeLabel(normalizeLineTypeToken(q.line_type) || 'SINGLE_TRIP')}\n${q.operation_type ? normalizeBillingTypeToken(q.operation_type) : 'Extra'}`,
      rate: `${money(q.rate, q.currency || 'SAR')}\n${monthly ? 'per month' : 'per trip'}`,
      valid: to ? `${from ? `${from} –\n` : 'Until '}${to}` : from ? `From ${from}` : 'Ongoing',
    };
    doc.font('Helvetica').fontSize(9.5);
    const h = Math.max(...cols.map((c) => doc.heightOfString(cells[c.key], { width: c.w - 12 }))) + 14;
    if (y + h > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      y = header(doc.page.margins.top);
    }
    let x = left;
    for (const c of cols) {
      const bold = c.key === 'rate' || c.key === 'route';
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(c.key === 'ref' ? MUTED : INK)
        .text(cells[c.key], x + 6, y + 7, { width: c.w - 12, align: c.right ? 'right' : 'left' });
      x += c.w;
    }
    y += h;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).strokeColor(LINE).stroke();
  }

  doc.end();
}
