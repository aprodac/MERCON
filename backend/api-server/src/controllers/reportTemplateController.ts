import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { prisma } from '../db';
import ExcelJS from 'exceljs';
import {
  LINE_TYPES,
  REPORT_FIELDS_BY_SOURCE,
  REPORT_SOURCE_LABELS,
  REPORT_SOURCES,
  type ReportSource,
  type TemplateLayout,
} from '@mercon/shared-types';
import { inspectTemplate } from '../services/reports/xlsxTemplate/inspect';
import { generateFromTemplate, type ReportRow } from '../services/reports/xlsxTemplate/splice';
import { fetchTripRows, TripReportFilters } from '../services/reports/xlsxTemplate/tripReportData';
import { fetchStatementRows } from '../services/reports/xlsxTemplate/statementData';
import { fetchRateRows } from '../services/reports/xlsxTemplate/rateData';

/*
 * A report template is one customer's own Excel layout for data MERCON sends
 * them — trips (the trip sheet that goes with an invoice), their statement of
 * account, or their rates. Managed on Customer → Excel exports; a trips
 * format can also be filled from an invoice (its exact trips).
 */

const fieldKeys = [...new Set(Object.values(REPORT_FIELDS_BY_SOURCE).flatMap((fields) => fields.map((f) => f.key)))] as [string, ...string[]];
const fieldsOf = (source: ReportSource) => new Set<string>(REPORT_FIELDS_BY_SOURCE[source].map((f) => f.key));
const INTERNAL_FIELDS = new Set(['driver_payout', 'balance_amount']);
const sourceSchema = z.enum(REPORT_SOURCES);

/** Every mapped field must belong to the format's data type. */
function checkLayoutFields(layout: TemplateLayout, source: ReportSource): string | null {
  const allowed = fieldsOf(source);
  const bad = layout.columns.find((c) => c.source.kind === 'field' && !allowed.has(c.source.key));
  return bad ? `Column “${bad.headerText}” is mapped to a field that isn’t part of ${REPORT_SOURCE_LABELS[source]}` : null;
}

/** MERCON's own layout: title, subtitle, a bold header row, then one row per record. */
async function buildStandardWorkbook(opts: {
  title: string;
  subtitle: string;
  fields: ReadonlyArray<{ key: string; label: string; type: string }>;
  rows: ReportRow[];
}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Export');
  ws.addRow([opts.title]).font = { bold: true, size: 14 };
  ws.addRow([opts.subtitle]).font = { color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const header = ws.addRow(opts.fields.map((f) => f.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  for (const row of opts.rows) {
    ws.addRow(
      opts.fields.map((f) => {
        const v = (row as Record<string, unknown>)[f.key];
        if (v === null || v === undefined || v === '') return null;
        if (f.type === 'date') return new Date(v as string);
        if (f.type === 'money' || f.type === 'number') return Number(v);
        return String(v);
      })
    );
  }
  opts.fields.forEach((f, i) => {
    const col = ws.getColumn(i + 1);
    if (f.type === 'date') col.numFmt = 'dd/mm/yyyy';
    if (f.type === 'money') col.numFmt = '#,##0.00';
    let width = f.label.length;
    col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 3) width = Math.max(width, String(cell.text ?? '').length);
    });
    col.width = Math.min(Math.max(width + 2, 8), 48);
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const layoutSchema = z.object({
  sheetName: z.string().min(1),
  headerRowIdx: z.number().int().min(1),
  dataStartRow: z.number().int().min(1),
  dataEndRow: z.number().int().min(1),
  bandSize: z.number().int().min(1).max(8),
  columns: z.array(
    z.object({
      colIndex: z.number().int().min(1),
      headerText: z.string(),
      source: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('field'), key: z.enum(fieldKeys) }),
        z.object({ kind: z.literal('const'), value: z.string() }),
        z.object({ kind: z.literal('formula') }),
        z.object({ kind: z.literal('blank') }),
      ]),
    })
  ),
  tokens: z.record(z.string(), z.string()).optional(),
});

/** Multipart bodies carry `layout` as a JSON string. */
const jsonLayout = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}, layoutSchema);

// The format's line-type filter (stored in the legacy rate_category column); '' / 'all' = every trip.
const optionalLineType = z.preprocess(
  (v) => (v === '' || v === 'all' ? null : v),
  z.enum(LINE_TYPES, { message: 'Unknown line type' }).nullable().optional()
);

const createBody = z.object({
  name: z.string().trim().min(1, 'Give the format a name'),
  customerId: z.string().uuid('Pick the customer this format belongs to'),
  source: sourceSchema.default('trips'),
  rate_category: optionalLineType,
  layout: jsonLayout,
});

const updateBody = z.object({
  name: z.string().trim().min(1).optional(),
  rate_category: optionalLineType,
  layout: jsonLayout.optional(),
});

const runBody = z.union([
  z.object({ invoiceId: z.string().uuid() }),
  z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.string().optional(),
  }),
  z.object({}), // rates: no period
]);

const summarySelect = {
  id: true,
  name: true,
  source: true,
  customerId: true,
  customer: { select: { name: true } },
  rate_category: true,
  original_filename: true,
  file_size: true,
  layout: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

const validationError = (res: Response, err: z.ZodError) =>
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid input' } });

const notFound = (res: Response, what = 'Trip sheet format') =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `${what} not found` } });

/* ─── Inspect (no persistence) ────────────────────────────────────────────── */
export const inspectUploadedTemplate = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    }
    const source = sourceSchema.safeParse(req.query.source ?? 'trips');
    if (!source.success) return validationError(res, source.error);
    const inspection = await inspectTemplate(req.file.buffer, source.data);
    res.json({ success: true, data: inspection });
  } catch (error) {
    logger.error({ err: error }, 'Template inspection error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to inspect template file' } });
  }
};

/* ─── CRUD ─────────────────────────────────────────────────────────────────── */
/**
 * `?customerId=` lists that customer's formats plus any older shared ones
 * (customerId null, from before formats belonged to a customer).
 */
export const listReportTemplates = async (req: Request, res: Response) => {
  try {
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    if (customerId && !z.string().uuid().safeParse(customerId).success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'customerId must be a UUID' } });
    }
    const templates = await prisma.reportTemplate.findMany({
      where: { deletedAt: null, ...(customerId ? { OR: [{ customerId }, { customerId: null }] } : {}) },
      select: summarySelect,
      orderBy: [{ name: 'asc' }],
    });
    res.json({ success: true, data: templates });
  } catch (error) {
    logger.error({ err: error }, 'List report templates error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to list trip sheet formats' } });
  }
};

export const getReportTemplate = async (req: Request, res: Response) => {
  try {
    const template = await prisma.reportTemplate.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: summarySelect,
    });
    if (!template) return notFound(res);
    res.json({ success: true, data: template });
  } catch (error) {
    logger.error({ err: error }, 'Get report template error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get trip sheet format' } });
  }
};

export const createReportTemplate = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    }
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { name, customerId, source, rate_category, layout } = parsed.data;
    const fieldError = checkLayoutFields(layout as TemplateLayout, source);
    if (fieldError) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: fieldError } });

    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
    if (!customer) return notFound(res, 'Customer');

    const userId = (req as any).user?.id;
    const template = await prisma.reportTemplate.create({
      data: {
        name,
        customerId,
        source,
        // Line-type filter: trips and rates only — a statement has no line type.
        rate_category: source === 'statement' ? null : rate_category ?? null,
        original_filename: req.file.originalname,
        file_data: req.file.buffer,
        file_size: req.file.size,
        layout: layout as any,
        created_by: userId,
        updated_by: userId,
      },
      select: summarySelect,
    });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    logger.error({ err: error }, 'Create report template error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to save trip sheet format' } });
  }
};

export const updateReportTemplate = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.reportTemplate.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) return notFound(res);

    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { name, rate_category, layout } = parsed.data;

    const source = specOf(existing).source;
    if (layout !== undefined) {
      const fieldError = checkLayoutFields(layout as TemplateLayout, source);
      if (fieldError) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: fieldError } });
    }

    const data: any = { updated_by: (req as any).user?.id, version: existing.version + 1 };
    if (name !== undefined) data.name = name;
    if (rate_category !== undefined && source !== 'statement') data.rate_category = rate_category;
    if (layout !== undefined) data.layout = layout;
    if (req.file) {
      data.original_filename = req.file.originalname;
      data.file_data = req.file.buffer;
      data.file_size = req.file.size;
    }

    const template = await prisma.reportTemplate.update({
      where: { id: existing.id },
      data,
      select: summarySelect,
    });
    res.json({ success: true, data: template });
  } catch (error) {
    logger.error({ err: error }, 'Update report template error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update trip sheet format' } });
  }
};

export const deleteReportTemplate = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.reportTemplate.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) return notFound(res);
    await prisma.reportTemplate.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deleted_by: (req as any).user?.id, isActive: false },
    });
    res.json({ success: true, data: { id: existing.id } });
  } catch (error) {
    logger.error({ err: error }, 'Delete report template error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete trip sheet format' } });
  }
};

/* ─── Preview & generate ──────────────────────────────────────────────────── */
class RunError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function dateText(d: Date | string | null | undefined, timeZone: string): string {
  if (!d) return '';
  // A picked calendar day ('2026-08-01') is already local — don't shift it through UTC.
  const day = typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
}

/** What a run exports: a saved format's settings, or a standard export's. */
interface RunSpec {
  source: ReportSource;
  /** null only for an old shared format, which can only run from an invoice. */
  customerId: string | null;
  lineType?: string;
}

const FILE_SLUG: Record<ReportSource, string> = { trips: 'trip_sheet', statement: 'statement', rates: 'rates' };
const safeName = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

async function deploymentTz() {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } });
  return settings?.timezone || 'Asia/Riyadh';
}

async function customerNameOf(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  if (!customer) throw new RunError(404, 'NOT_FOUND', 'Customer not found');
  return customer.name;
}

/**
 * Resolves the rows a run covers plus the `{{token}}` values for the sheet's
 * heading cells.
 *  - trips: `{ invoiceId }` takes exactly the invoice's trips; `{ startDate, endDate }` the customer's trips in that range.
 *  - statement: `{ startDate, endDate }` — opening balance carried in, running balance per row.
 *  - rates: the customer's active quotations; dates are ignored.
 */
async function resolveRun(spec: RunSpec, body: unknown) {
  const parsed = runBody.safeParse(body ?? {});
  if (!parsed.success) throw new RunError(400, 'VALIDATION_ERROR', 'Send an invoiceId, or a startDate and endDate (YYYY-MM-DD)');
  const run = parsed.data;
  const tz = await deploymentTz();
  const tokens: Record<string, string> = { generated_on: dateText(new Date(), tz) };
  const range = 'startDate' in run ? run : null;

  if (spec.source !== 'trips') {
    if ('invoiceId' in run) throw new RunError(400, 'VALIDATION_ERROR', 'Only a trips format can be filled from an invoice');
    if (!spec.customerId) throw new RunError(400, 'NO_CUSTOMER', 'This format isn’t linked to a customer');
    const customerName = await customerNameOf(spec.customerId);
    tokens.customer = customerName;

    if (spec.source === 'statement') {
      if (!range) throw new RunError(400, 'VALIDATION_ERROR', 'Pick the statement period');
      const { rows, openingBalance, closingBalance } = await fetchStatementRows(spec.customerId, range.startDate, range.endDate);
      Object.assign(tokens, {
        period_from: dateText(range.startDate, tz),
        period_to: dateText(range.endDate, tz),
        period: `${dateText(range.startDate, tz)} - ${dateText(range.endDate, tz)}`,
        row_count: String(rows.length),
        opening_balance: openingBalance.toFixed(2),
        closing_balance: closingBalance.toFixed(2),
      });
      return {
        rows: rows as ReportRow[],
        tokens,
        summary: { rows: rows.length, openingBalance, closingBalance },
        filename: `${safeName(customerName)}_statement_${range.startDate}_to_${range.endDate}.xlsx`,
      };
    }

    const rows = await fetchRateRows(spec.customerId, spec.lineType);
    tokens.row_count = String(rows.length);
    return {
      rows: rows as ReportRow[],
      tokens,
      summary: { rows: rows.length },
      filename: `${safeName(customerName)}_rates_${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }

  const lineType = spec.lineType;
  let filters: TripReportFilters;
  let customerName: string;
  let fileLabel: string;

  if ('invoiceId' in run) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: run.invoiceId },
      select: {
        id: true, ref_id: true, customerId: true, invoice_date: true, due_date: true, total_amount: true,
        customer: { select: { name: true } },
        lines: { select: { tripId: true } },
        trips: { select: { id: true } },
      },
    });
    if (!invoice) throw new RunError(404, 'NOT_FOUND', 'Invoice not found');
    if (spec.customerId && spec.customerId !== invoice.customerId) {
      throw new RunError(400, 'CUSTOMER_MISMATCH', "This format belongs to a different customer than the invoice");
    }
    // Draft invoices only link trips through their lines; issued ones also set Trip.invoiceId.
    const tripIds = [...new Set([...invoice.lines.map((l) => l.tripId), ...invoice.trips.map((t) => t.id)].filter((x): x is string => !!x))];
    if (tripIds.length === 0) throw new RunError(400, 'NO_TRIPS', 'This invoice has no trip lines to put in a trip sheet');

    filters = { tripIds, lineType };
    customerName = invoice.customer.name;
    fileLabel = invoice.ref_id || invoice.id.slice(0, 8);
    Object.assign(tokens, {
      invoice_no: invoice.ref_id ?? '',
      invoice_date: dateText(invoice.invoice_date, tz),
      due_date: dateText(invoice.due_date, tz),
      invoice_total: Number(invoice.total_amount).toFixed(2),
    });
  } else {
    if (!spec.customerId) throw new RunError(400, 'NO_CUSTOMER', 'A shared format can only be filled from an invoice');
    if (!range) throw new RunError(400, 'VALIDATION_ERROR', 'Send an invoiceId, or a startDate and endDate (YYYY-MM-DD)');
    const { startDate, endDate, status } = range;
    filters = { customerId: spec.customerId, startDate, endDate, status, lineType };
    customerName = await customerNameOf(spec.customerId);
    fileLabel = `${startDate}_to_${endDate}`;
  }

  const rows = await fetchTripRows(filters);
  const dates = rows.map((r) => new Date(r.date as Date).getTime()).filter((t) => !Number.isNaN(t));
  const periodFrom = range ? range.startDate : dates.length ? new Date(Math.min(...dates)) : null;
  const periodTo = range ? range.endDate : dates.length ? new Date(Math.max(...dates)) : null;
  const total = rows.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);

  Object.assign(tokens, {
    customer: customerName,
    period_from: dateText(periodFrom, tz),
    period_to: dateText(periodTo, tz),
    period: periodFrom && periodTo ? `${dateText(periodFrom, tz)} - ${dateText(periodTo, tz)}` : '',
    row_count: String(rows.length),
    trip_count: String(rows.length),
    total: total.toFixed(2),
  });

  return {
    rows: rows as ReportRow[],
    tokens,
    summary: { rows: rows.length, amount: total },
    filename: `${safeName(customerName) || 'trip'}_${FILE_SLUG.trips}_${safeName(fileLabel)}.xlsx`,
  };
}

const specOf = (t: { source: string; customerId: string | null; rate_category: string | null }): RunSpec => ({
  source: (REPORT_SOURCES as readonly string[]).includes(t.source) ? (t.source as ReportSource) : 'trips',
  customerId: t.customerId,
  // rate_category is the legacy column name for the trip's line type.
  lineType: t.rate_category ?? undefined,
});

function sendXlsx(res: Response, filename: string, buffer: Buffer | Uint8Array) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.send(Buffer.from(buffer));
}

function runFailure(res: Response, error: unknown, what: string) {
  if (error instanceof RunError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  logger.error({ err: error }, `${what} error:`);
  return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to ${what.toLowerCase()}` } });
}

/** Row count (and total / balance) for a format's run, so the page can show what will be exported. */
export const previewReportTemplate = async (req: Request, res: Response) => {
  try {
    const template = await prisma.reportTemplate.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!template) return notFound(res);
    const { summary } = await resolveRun(specOf(template), req.body);
    res.json({ success: true, data: summary });
  } catch (error) {
    runFailure(res, error, 'Preview export');
  }
};

export const generateReportTemplate = async (req: Request, res: Response) => {
  try {
    const template = await prisma.reportTemplate.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!template) return notFound(res);

    const { rows, tokens, filename } = await resolveRun(specOf(template), req.body);
    const layout = template.layout as unknown as TemplateLayout;
    const buffer = generateFromTemplate(Buffer.from(template.file_data), layout, rows, { tokens: { ...layout.tokens, ...tokens } });
    sendXlsx(res, filename, buffer);
  } catch (error) {
    runFailure(res, error, 'Generate export');
  }
};

const summaryBody = z.object({
  customerId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * What each data type holds for a customer over a period — the group
 * headers on Customer → Excel exports ("83 trips · SAR 60,392").
 */
export const summarizeCustomerExports = async (req: Request, res: Response) => {
  try {
    const parsed = summaryBody.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(res, parsed.error);
    const { customerId, startDate, endDate } = parsed.data;
    const range = { startDate, endDate };
    const [trips, statement, rates] = await Promise.all(
      REPORT_SOURCES.map((source) => resolveRun({ source, customerId }, range).then((r) => r.summary))
    );
    res.json({ success: true, data: { trips, statement, rates } });
  } catch (error) {
    runFailure(res, error, 'Summarize exports');
  }
};

const standardBody = z.object({
  customerId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * MERCON's own layout for a data type, for a customer without an uploaded
 * format: a title, then one column per field of that type.
 */
export const generateStandardExport = async (req: Request, res: Response) => {
  try {
    const source = req.params.source as ReportSource;
    if (!(REPORT_SOURCES as readonly string[]).includes(source)) return notFound(res, 'Export type');
    const parsed = standardBody.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(res, parsed.error);
    const { customerId, startDate, endDate } = parsed.data;

    const { rows, tokens, filename } = await resolveRun({ source, customerId }, startDate && endDate ? { startDate, endDate } : {});
    // Driver payout and balance are MERCON-internal; a standard export goes to the customer.
    const fields = REPORT_FIELDS_BY_SOURCE[source].filter((f) => !INTERNAL_FIELDS.has(f.key));
    const buffer = await buildStandardWorkbook({
      title: `${tokens.customer} — ${REPORT_SOURCE_LABELS[source]}`,
      subtitle: [tokens.period, source === 'statement' ? `Opening balance ${tokens.opening_balance} · Closing balance ${tokens.closing_balance}` : '']
        .filter(Boolean)
        .join(' · '),
      fields,
      rows,
    });
    sendXlsx(res, filename, buffer);
  } catch (error) {
    runFailure(res, error, 'Generate standard export');
  }
};
