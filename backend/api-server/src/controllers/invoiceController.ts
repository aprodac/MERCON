import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { generateRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { issueInvoice, recordInvoicePayment, voidInvoice } from '../utils/invoiceEngine';
import { issueCreditNote, voidCreditNote } from '../utils/creditNoteEngine';
import { AccountingError } from '../utils/accountingEngine';
import { logAuditEvent } from '../services/auditService';
import { baseInvoiceWhere, invoiceOrderBy, invoiceWhere, statusWhere } from '../utils/invoiceQuery';
import { invoiceTotals, lineAmounts, type LineAmounts } from '../utils/invoiceMath';

/** Next invoice number from the Settings numbering (prefix, padding, optional year). */
export const nextInvoiceRefId = async () => {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { invoicePrefix: true, invoiceNumberPadding: true, invoiceNumberYearly: true },
  });
  return generateRefId(
    (settings?.invoicePrefix || 'INV').trim(),
    () => prisma.invoice.findMany({ select: { ref_id: true } }),
    { padLength: settings?.invoiceNumberPadding ?? 4, year: settings?.invoiceNumberYearly ?? false },
  );
};

/** A stored invoice line: description and trip plus the computed amounts. */
type StoredLine = LineAmounts & { tripId: string | null; description: string };

/** Per-trip overrides sent with `tripIds` (e.g. 0% VAT on an international trip, a discount). */
type TripOptions = Record<string, { tax_rate?: number; discount_pct?: number }>;

/**
 * Invoice lines for the selected trips: the rate is always the trip's billing amount (never taken
 * from the browser); VAT is the invoice's default unless the trip has an override.
 */
export async function populateLinesFromTrips(tripIds: string[], defaultTaxRate = 0, options: TripOptions = {}): Promise<StoredLine[]> {
  if (!tripIds || tripIds.length === 0) return [];

  const trips = await prisma.trip.findMany({
    where: { id: { in: tripIds } },
    include: {
      customer: true,
    },
  });

  const lines: StoredLine[] = [];

  for (const trip of trips) {
    const o = options[trip.id] ?? {};
    lines.push({
      tripId: trip.id,
      description: `Freight Service: Trip ${trip.ref_id || trip.id.slice(0, 8)} (${trip.vehicle_type || 'Standard'})`,
      ...lineAmounts({ quantity: 1, rate: Number(trip.billing_amount) || 0, discount_pct: o.discount_pct, tax_rate: o.tax_rate ?? defaultTaxRate }),
    });
  }

  return lines;
}

/** Manual lines as sent, recomputed on the server (VAT defaults to the invoice's rate). */
function manualLines(lines: z.infer<typeof invoiceLineSchema>[] | undefined, defaultTaxRate: number): StoredLine[] {
  return (lines ?? []).map((l) => ({
    tripId: l.tripId || null,
    description: l.description,
    ...lineAmounts({ quantity: l.quantity, rate: l.rate, discount_pct: l.discount_pct, tax_rate: l.tax_rate ?? defaultTaxRate }),
  }));
}

const lineCreate = (l: StoredLine) => ({
  tripId: l.tripId,
  description: l.description,
  quantity: l.quantity,
  rate: l.rate,
  discount_pct: l.discount_pct,
  amount: l.amount,
  tax_rate: l.tax_rate,
  tax_amount: l.tax_amount,
});

const pct = z.number().min(0).max(100);

const invoiceLineSchema = z.object({
  tripId: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'Line description is required'),
  quantity: z.number().positive().default(1),
  rate: z.number().min(0, 'Rate cannot be negative'),
  /** Ignored: recomputed from quantity, rate and discount. Accepted for older clients. */
  amount: z.number().min(0, 'Amount cannot be negative').optional(),
  discount_pct: pct.optional(),
  /** Defaults to the invoice's VAT rate. */
  tax_rate: pct.optional(),
});

const tripOptionsSchema = z.record(z.string().uuid(), z.object({ tax_rate: pct.optional(), discount_pct: pct.optional() })).optional();
const textField = z.string().max(4000).nullable().optional();

const createInvoiceSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  invoice_date: z.string().min(1, 'Invoice date is required'),
  due_date: z.string().nullable().optional(),
  tax_rate: z.number().min(0).max(100).default(0),
  currency: z.string().default('SAR'),
  tripIds: z.array(z.string().uuid()).optional(),
  tripOptions: tripOptionsSchema,
  lines: z.array(invoiceLineSchema).optional(),
  notes: textField,
  terms: textField,
});

const updateInvoiceSchema = z.object({
  invoice_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  currency: z.string().optional(),
  /** Trips to bill; their lines are rebuilt from the trips, as on create. Sent with `lines` (manual lines only). */
  tripIds: z.array(z.string().uuid()).optional(),
  tripOptions: tripOptionsSchema,
  lines: z.array(invoiceLineSchema).optional(),
  notes: textField,
  terms: textField,
});

const paymentSchema = z.object({
  amount: z.number().positive('Payment amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  accountId: z.string().uuid('Invalid account ID'),
  payment_method: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
});

/**
 * List invoices with filters
 */
export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { page = '1', per_page = '50', sort } = req.query;

    const pageNumber = Math.max(1, parseInt(page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(per_page as string) || 50));
    const skip = (pageNumber - 1) * limit;

    const whereClause = invoiceWhere(req.query);

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          customer: { select: { id: true, name: true, contact_phone: true, whatsapp_number: true, payment_terms: true } },
          _count: { select: { lines: true, payments: true, trips: true } },
        },
        orderBy: invoiceOrderBy(sort, req.query.status),
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where: whereClause }),
    ]);

    return res.json({
      success: true,
      data: invoices,
      pagination: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch invoices');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Counts and totals for the invoice list's summary row and status tabs. Honours the same customer,
 * date and search filters as the list, so the tab counts match what the tabs will show.
 */
export const getInvoiceSummary = async (req: Request, res: Response) => {
  try {
    const base = baseInvoiceWhere(req.query);
    const now = new Date();
    const count = (status: string) => prisma.invoice.count({ where: { ...base, ...statusWhere(status, now) } });
    const balance = (status: string) =>
      prisma.invoice.aggregate({ where: { ...base, ...statusWhere(status, now) }, _sum: { balance_due: true } });

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const paymentWhere: Record<string, any> = { payment_date: { gte: monthStart }, invoice: { status: { not: 'Void' } } };
    if (base.customerId) paymentWhere.invoice.customerId = base.customerId;

    const [all, draft, unpaid, overdue, paid, voided, unpaidSum, overdueSum, paidThisMonth] = await Promise.all([
      count('all'),
      count('Draft'),
      count('unpaid'),
      count('overdue'),
      count('Paid'),
      count('Void'),
      balance('unpaid'),
      balance('overdue'),
      prisma.invoicePayment.aggregate({ where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
    ]);

    return res.json({
      success: true,
      data: {
        counts: { all, Draft: draft, unpaid, overdue, Paid: paid, Void: voided },
        unpaid_balance: Number(unpaidSum._sum.balance_due ?? 0),
        overdue_balance: Number(overdueSum._sum.balance_due ?? 0),
        paid_this_month: Number(paidThisMonth._sum.amount ?? 0),
        payments_this_month: paidThisMonth._count._all,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to build invoice summary');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Completed trips that are not on any invoice yet (issued or draft), grouped by customer —
 * the "ready to bill" queue.
 */
export const getUnbilledTrips = async (_req: Request, res: Response) => {
  try {
    const trips = await prisma.trip.findMany({
      where: {
        status: 'Completed',
        invoiceId: null,
        deletedAt: null,
        invoiceLines: { none: { invoice: { status: { not: 'Void' } } } },
      },
      select: { id: true, ref_id: true, billing_amount: true, customerId: true, customer: { select: { id: true, name: true, payment_terms: true } } },
      orderBy: { actual_end: 'asc' },
    });

    const byCustomer = new Map<string, { customer_id: string; customer_name: string; payment_terms: string | null; trip_ids: string[]; amount: number; missing_amount: number }>();
    for (const t of trips) {
      const row = byCustomer.get(t.customerId) ?? {
        customer_id: t.customerId,
        customer_name: t.customer?.name ?? 'Unknown customer',
        payment_terms: t.customer?.payment_terms ?? null,
        trip_ids: [],
        amount: 0,
        missing_amount: 0,
      };
      const amount = Number(t.billing_amount ?? 0);
      if (amount > 0) {
        row.trip_ids.push(t.id);
        row.amount += amount;
      } else {
        // Can't be invoiced until someone sets a billing amount
        row.missing_amount += 1;
      }
      byCustomer.set(t.customerId, row);
    }

    const customers = [...byCustomer.values()].sort((a, b) => b.amount - a.amount);
    return res.json({
      success: true,
      data: {
        customers,
        trip_count: customers.reduce((n, c) => n + c.trip_ids.length, 0),
        amount: customers.reduce((n, c) => n + c.amount, 0),
        missing_amount_count: customers.reduce((n, c) => n + c.missing_amount, 0),
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to list unbilled trips');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Activity for one invoice, from the audit log (created, issued, payments, sent, voided).
 */
export const getInvoiceActivity = async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Invoice', entityId: req.params.id as string },
      include: { user: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({
      success: true,
      data: logs.map((l) => {
        // Only the business fields go back to the browser, never IP / user agent
        const m = (l.metadata ?? {}) as Record<string, any>;
        return {
          id: l.id,
          action: l.action,
          at: l.createdAt,
          by: l.user ? l.user.name || l.user.username : null,
          details: { channel: m.channel, amount: m.amount ?? m.total_amount, ref_id: m.ref_id },
        };
      }),
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to load invoice activity');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

const activitySchema = z.object({
  action: z.enum(['SENT']),
  channel: z.enum(['whatsapp', 'email', 'copy', 'download', 'print']),
});

/**
 * Record that an invoice was sent or shared from the app (WhatsApp, email, copied text, PDF).
 */
export const logInvoiceActivity = async (req: Request, res: Response) => {
  try {
    const parsed = activitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    }
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id as string }, select: { id: true, ref_id: true } });
    if (!invoice) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    }
    await logAuditEvent({
      req,
      action: `INVOICE_${parsed.data.action}`,
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { ref_id: invoice.ref_id, channel: parsed.data.channel },
    });
    return res.status(201).json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to record invoice activity');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Get single invoice by ID with lines and payments
 */
export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: {
          include: { trip: { select: { id: true, ref_id: true, vehicle_type: true, billing_amount: true, status: true, awb_number: true, actual_start: true } } },
        },
        payments: {
          include: { account: { select: { id: true, account_code: true, name: true } } },
          orderBy: { payment_date: 'desc' },
        },
        journalEntry: {
          include: { lines: { include: { account: true } } },
        },
        trips: {
          select: { id: true, ref_id: true, status: true, billing_amount: true },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    }

    return res.json({ success: true, data: invoice });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch invoice');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Create a new Draft invoice
 */
export const createDraftInvoice = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const parseResult = createInvoiceSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const { customerId, invoice_date, due_date, tax_rate, currency, tripIds, tripOptions, lines, notes, terms } = parseResult.data;

    // Verify customer exists
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CUSTOMER', message: 'Customer not found' },
      });
    }

    // Build line items (manual lines plus lines generated from the trips)
    const finalLines: StoredLine[] = [...manualLines(lines, tax_rate), ...(await populateLinesFromTrips(tripIds ?? [], tax_rate, tripOptions))];

    if (finalLines.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_LINES', message: 'Invoice must contain at least 1 line item or selected trip' },
      });
    }

    const totals = invoiceTotals(finalLines);
    const totalAmount = totals.total;
    const ref_id = await nextInvoiceRefId();

    const invoice = await prisma.invoice.create({
      data: {
        ref_id,
        customerId,
        invoice_date: new Date(invoice_date),
        due_date: due_date ? new Date(due_date) : null,
        status: 'Draft',
        subtotal: totals.subtotal,
        tax_rate,
        tax_amount: totals.tax_amount,
        total_amount: totalAmount,
        paid_amount: 0,
        balance_due: totalAmount,
        currency: currency || 'SAR',
        notes: notes ?? null,
        terms: terms ?? null,
        created_by: userId,
        updated_by: userId,
        lines: { create: finalLines.map(lineCreate) },
      },
      include: {
        customer: true,
        lines: true,
      },
    });

    await logAuditEvent({
      req,
      action: 'INVOICE_DRAFT_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { ref_id: invoice.ref_id, customerId, total_amount: totalAmount },
    });

    return res.status(201).json({ success: true, data: invoice });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create draft invoice');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Update a Draft invoice
 */
export const updateDraftInvoice = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    }

    if (existing.status !== 'Draft') {
      return res.status(403).json({
        success: false,
        error: { code: 'INVOICE_NOT_DRAFT', message: `Cannot modify invoice because status is '${existing.status}'` },
      });
    }

    const parseResult = updateInvoiceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const data = parseResult.data;

    const taxRate = data.tax_rate !== undefined ? data.tax_rate : Number(existing.tax_rate);
    // Lines are rebuilt when sent: manual lines as given, trip lines from the trips (same as create).
    // A VAT change on its own re-rates the existing lines.
    const newLines: StoredLine[] | undefined =
      data.lines || data.tripIds
        ? [...manualLines(data.lines, taxRate), ...(await populateLinesFromTrips(data.tripIds ?? [], taxRate, data.tripOptions))]
        : data.tax_rate !== undefined
          ? existing.lines.map((l) => ({
              tripId: l.tripId,
              description: l.description,
              ...lineAmounts({ quantity: l.quantity, rate: Number(l.rate), discount_pct: Number(l.discount_pct), tax_rate: taxRate }),
            }))
          : undefined;
    if (newLines && newLines.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_LINES', message: 'Invoice must contain at least 1 line item or selected trip' },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newLines) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      }

      const totals = invoiceTotals(newLines ?? existing.lines);

      return await tx.invoice.update({
        where: { id },
        data: {
          invoice_date: data.invoice_date ? new Date(data.invoice_date) : undefined,
          due_date: data.due_date !== undefined ? (data.due_date ? new Date(data.due_date) : null) : undefined,
          tax_rate: data.tax_rate !== undefined ? data.tax_rate : undefined,
          subtotal: totals.subtotal,
          tax_amount: totals.tax_amount,
          total_amount: totals.total,
          balance_due: totals.total,
          currency: data.currency || undefined,
          notes: data.notes !== undefined ? data.notes : undefined,
          terms: data.terms !== undefined ? data.terms : undefined,
          updated_by: userId,
          lines: newLines ? { create: newLines.map(lineCreate) } : undefined,
        },
        include: {
          customer: true,
          lines: true,
        },
      });
    });

    await logAuditEvent({
      req,
      action: 'INVOICE_DRAFT_UPDATED',
      entityType: 'Invoice',
      entityId: id,
      metadata: { ref_id: updated.ref_id, total_amount: updated.total_amount },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to update draft invoice');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Hard delete a Draft invoice
 */
export const deleteDraftInvoice = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    }

    if (existing.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_ISSUED', message: `Issued or Paid invoices cannot be deleted. Void the invoice instead.` },
      });
    }

    await prisma.invoice.delete({ where: { id } });

    await logAuditEvent({
      req,
      action: 'INVOICE_DRAFT_DELETED',
      entityType: 'Invoice',
      entityId: existing.id,
      metadata: { ref_id: existing.ref_id, customerId: existing.customerId },
    });

    return res.json({ success: true, message: `Draft invoice ${existing.ref_id || existing.id} deleted` });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to delete draft invoice');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Issue a Draft invoice
 */
export const issueInvoiceHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const issued = await issueInvoice(id, userId);

    await logAuditEvent({
      req,
      action: 'INVOICE_ISSUED',
      entityType: 'Invoice',
      entityId: issued.id,
      metadata: { ref_id: issued.ref_id, customerId: issued.customerId, total_amount: issued.total_amount, journalEntryId: issued.journalEntryId },
    });

    return res.json({ success: true, data: issued });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error({ err: error }, 'Failed to issue invoice');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Record payment on an Issued / PartiallyPaid invoice
 */
export const recordInvoicePaymentHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const parseResult = paymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const result = await recordInvoicePayment(id, userId, parseResult.data);

    await logAuditEvent({
      req,
      action: 'INVOICE_PAYMENT_RECORDED',
      entityType: 'Invoice',
      entityId: id,
      metadata: {
        ref_id: result.invoice.ref_id,
        amount: result.payment.amount,
        accountId: result.payment.accountId,
        newBalanceDue: result.invoice.balance_due,
        newStatus: result.invoice.status,
      },
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error({ err: error }, 'Failed to record invoice payment');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Void an Issued invoice
 */
export const voidInvoiceHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const voided = await voidInvoice(id, userId);

    await logAuditEvent({
      req,
      action: 'INVOICE_VOIDED',
      entityType: 'Invoice',
      entityId: voided.id,
      metadata: { ref_id: voided.ref_id, customerId: voided.customerId, journalEntryId: voided.journalEntryId },
    });

    return res.json({ success: true, data: voided });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error({ err: error }, 'Failed to void invoice');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/** GET /invoices/ledger/setup: the accounts issuing an invoice posts to (receivable Dr, revenue and VAT Cr). */
export const getInvoiceLedgerSetup = async (_req: Request, res: Response) => {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    res.json({
      success: true,
      data: {
        receivable_account_id: s?.defaultReceivableAccountId ?? null,
        revenue_account_id: s?.defaultRevenueAccountId ?? null,
        vat_output_account_id: s?.defaultVatOutputAccountId ?? null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

const ledgerSetupSchema = z.object({
  receivable_account_id: z.string().uuid().nullable().optional(),
  revenue_account_id: z.string().uuid().nullable().optional(),
  vat_output_account_id: z.string().uuid().nullable().optional(),
});

// Each slot takes one kind of account: what the invoice engine posts it as
const SLOT_TYPE = { receivable_account_id: 'Asset', revenue_account_id: 'Revenue', vat_output_account_id: 'Liability' } as const;
const SLOT_NAME = { receivable_account_id: 'Accounts receivable', revenue_account_id: 'Revenue', vat_output_account_id: 'VAT output' } as const;

/** PUT /invoices/ledger/setup (Admin): set any of the three; a field left out is kept. */
export const updateInvoiceLedgerSetup = async (req: Request, res: Response) => {
  try {
    const parsed = ledgerSetupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    const slots = Object.keys(SLOT_TYPE) as (keyof typeof SLOT_TYPE)[];
    for (const slot of slots) {
      const id = parsed.data[slot];
      if (!id) continue;
      const a = await prisma.account.findUnique({ where: { id } });
      if (!a || a.account_type !== SLOT_TYPE[slot] || !a.is_postable || !a.isActive || a.deletedAt) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `${SLOT_NAME[slot]} must be an active, postable ${SLOT_TYPE[slot]} account.` },
        });
      }
    }
    const { receivable_account_id, revenue_account_id, vat_output_account_id } = parsed.data;
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        ...(receivable_account_id !== undefined ? { defaultReceivableAccountId: receivable_account_id } : {}),
        ...(revenue_account_id !== undefined ? { defaultRevenueAccountId: revenue_account_id } : {}),
        ...(vat_output_account_id !== undefined ? { defaultVatOutputAccountId: vat_output_account_id } : {}),
        updated_by: (req as any).user?.id,
      },
    });
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to save invoice ledger setup');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

const creditNoteSchema = z.object({
  credit_date: z.string().min(8),
  reason: z.string().trim().min(1, 'Say why the credit note is issued').max(500),
  lines: z
    .array(z.object({ description: z.string().trim().min(1).max(300), amount: z.number().positive(), tax_rate: z.number().min(0).max(100) }))
    .min(1, 'Add at least one line'),
});

const creditNoteOut = (n: any) => ({
  id: n.id,
  ref_id: n.ref_id,
  invoice_id: n.invoiceId,
  invoice_ref: n.invoice?.ref_id ?? null,
  customer_name: n.invoice?.customer?.name ?? null,
  credit_date: n.credit_date,
  reason: n.reason,
  status: n.status,
  subtotal: Number(n.subtotal),
  tax_amount: Number(n.tax_amount),
  total_amount: Number(n.total_amount),
  journal_entry_id: n.journalEntryId,
  voided_at: n.voidedAt,
  lines: (n.lines ?? []).map((l: any) => ({ description: l.description, amount: Number(l.amount), tax_rate: Number(l.tax_rate), tax_amount: Number(l.tax_amount) })),
});

/** GET /invoices/credit-notes — every credit note (?invoice_id=, ?customer_id=), newest first. */
export const listCreditNotes = async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const rows = await prisma.creditNote.findMany({
      where: { ...(q.invoice_id ? { invoiceId: q.invoice_id } : {}), ...(q.customer_id ? { customerId: q.customer_id } : {}) },
      include: { lines: true, invoice: { select: { ref_id: true, customer: { select: { name: true } } } } },
      orderBy: [{ credit_date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    res.json({ success: true, data: rows.map(creditNoteOut) });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to list credit notes');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/** POST /invoices/:id/credit-notes — issue a credit note against an issued invoice (posts to the ledger). */
export const createCreditNote = async (req: Request, res: Response) => {
  try {
    const parsed = creditNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    const note = await issueCreditNote({ invoiceId: String(req.params.id), creditDate: parsed.data.credit_date, reason: parsed.data.reason, lines: parsed.data.lines, userId: (req as any).user?.id });
    await logAuditEvent({ req, action: 'CREDIT_NOTE_ISSUED', entityType: 'CreditNote', entityId: note.id, metadata: { ref_id: note.ref_id, invoiceId: note.invoiceId, total: Number(note.total_amount) } });
    res.status(201).json({ success: true, data: creditNoteOut(note) });
  } catch (error: any) {
    if (error instanceof AccountingError) return res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
    logger.error({ err: error }, 'Failed to issue credit note');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/** POST /invoices/credit-notes/:noteId/void */
export const voidCreditNoteHandler = async (req: Request, res: Response) => {
  try {
    const note = await voidCreditNote(String(req.params.noteId), (req as any).user?.id);
    await logAuditEvent({ req, action: 'CREDIT_NOTE_VOIDED', entityType: 'CreditNote', entityId: note.id, metadata: { ref_id: note.ref_id } });
    res.json({ success: true, data: { id: note.id, status: note.status } });
  } catch (error: any) {
    if (error instanceof AccountingError) return res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
    logger.error({ err: error }, 'Failed to void credit note');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};
