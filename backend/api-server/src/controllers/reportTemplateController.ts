import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { prisma } from '../db';
import { LINE_TYPES, TRIP_REPORT_FIELDS, type TemplateLayout } from '@mercon/shared-types';
import { inspectTemplate } from '../services/reports/xlsxTemplate/inspect';
import { generateFromTemplate } from '../services/reports/xlsxTemplate/splice';
import { fetchTripRows, TripReportFilters } from '../services/reports/xlsxTemplate/tripReportData';

/*
 * A report template is one customer's own Excel layout for the trip sheet
 * that goes with their invoice. It's managed on the customer page and filled
 * from an invoice (its exact trips) or a date range (Customer → Trip sheets).
 */

const fieldKeys = TRIP_REPORT_FIELDS.map((f) => f.key) as [string, ...string[]];

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
    const inspection = await inspectTemplate(req.file.buffer);
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
    const { name, customerId, rate_category, layout } = parsed.data;

    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
    if (!customer) return notFound(res, 'Customer');

    const userId = (req as any).user?.id;
    const template = await prisma.reportTemplate.create({
      data: {
        name,
        customerId,
        rate_category: rate_category ?? null,
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

    const data: any = { updated_by: (req as any).user?.id, version: existing.version + 1 };
    if (name !== undefined) data.name = name;
    if (rate_category !== undefined) data.rate_category = rate_category;
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
type TemplateRow = NonNullable<Awaited<ReturnType<typeof prisma.reportTemplate.findFirst>>>;

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

/**
 * Resolves which trips a run covers plus the `{{token}}` values for the
 * sheet's banner cells. An invoice run takes exactly the invoice's trips; a
 * range run takes the template customer's trips in that range.
 */
async function resolveRun(template: TemplateRow, body: unknown) {
  const parsed = runBody.safeParse(body ?? {});
  if (!parsed.success) throw new RunError(400, 'VALIDATION_ERROR', 'Send an invoiceId, or a startDate and endDate (YYYY-MM-DD)');

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } });
  const tz = settings?.timezone || 'Asia/Riyadh';
  // rate_category is the legacy column name for the trip's line type.
  const lineType = template.rate_category ?? undefined;
  const tokens: Record<string, string> = { generated_on: dateText(new Date(), tz) };

  let filters: TripReportFilters;
  let customerName: string;
  let fileLabel: string;

  if ('invoiceId' in parsed.data) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.invoiceId },
      select: {
        id: true, ref_id: true, customerId: true, invoice_date: true, due_date: true, total_amount: true,
        customer: { select: { name: true } },
        lines: { select: { tripId: true } },
        trips: { select: { id: true } },
      },
    });
    if (!invoice) throw new RunError(404, 'NOT_FOUND', 'Invoice not found');
    if (template.customerId && template.customerId !== invoice.customerId) {
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
    if (!template.customerId) throw new RunError(400, 'NO_CUSTOMER', 'A shared format can only be filled from an invoice');
    const { startDate, endDate, status } = parsed.data;
    const customer = await prisma.customer.findUnique({ where: { id: template.customerId }, select: { name: true } });
    filters = { customerId: template.customerId, startDate, endDate, status, lineType };
    customerName = customer?.name ?? '';
    fileLabel = `${startDate}_to_${endDate}`;
  }

  const rows = await fetchTripRows(filters);
  const dates = rows.map((r) => new Date(r.date as Date).getTime()).filter((t) => !Number.isNaN(t));
  const periodFrom = 'startDate' in parsed.data ? parsed.data.startDate : dates.length ? new Date(Math.min(...dates)) : null;
  const periodTo = 'endDate' in parsed.data ? parsed.data.endDate : dates.length ? new Date(Math.max(...dates)) : null;
  const total = rows.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);

  Object.assign(tokens, {
    customer: customerName,
    period_from: dateText(periodFrom, tz),
    period_to: dateText(periodTo, tz),
    period: periodFrom && periodTo ? `${dateText(periodFrom, tz)} - ${dateText(periodTo, tz)}` : '',
    trip_count: String(rows.length),
    total: total.toFixed(2),
  });

  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return { rows, tokens, total, filename: `${safe(customerName) || 'trip'}_trip_sheet_${safe(fileLabel)}.xlsx` };
}

function runFailure(res: Response, error: unknown, what: string) {
  if (error instanceof RunError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  logger.error({ err: error }, `${what} error:`);
  return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to ${what.toLowerCase()}` } });
}

/** Trip count and total for a run, so the page can show what will be exported. */
export const previewReportTemplate = async (req: Request, res: Response) => {
  try {
    const template = await prisma.reportTemplate.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!template) return notFound(res);
    const { rows, total } = await resolveRun(template, req.body);
    res.json({ success: true, data: { total: rows.length, amount: total, rows: rows.slice(0, 50) } });
  } catch (error) {
    runFailure(res, error, 'Preview trip sheet');
  }
};

export const generateReportTemplate = async (req: Request, res: Response) => {
  try {
    const template = await prisma.reportTemplate.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!template) return notFound(res);

    const { rows, tokens, filename } = await resolveRun(template, req.body);
    const layout = template.layout as unknown as TemplateLayout;
    const buffer = generateFromTemplate(Buffer.from(template.file_data), layout, rows, { tokens: { ...layout.tokens, ...tokens } });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  } catch (error) {
    runFailure(res, error, 'Generate trip sheet');
  }
};
