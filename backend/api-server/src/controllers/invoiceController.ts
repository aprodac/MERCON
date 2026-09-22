import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { generateRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { issueInvoice, recordInvoicePayment, voidInvoice } from '../utils/invoiceEngine';
import { AccountingError } from '../utils/accountingEngine';

const INVOICE_REF_PREFIX = 'INV';
const INVOICE_REF_PAD = 4;

export const nextInvoiceRefId = () =>
  generateRefId(
    INVOICE_REF_PREFIX,
    () => prisma.invoice.findMany({ select: { ref_id: true } }),
    { padLength: INVOICE_REF_PAD },
  );

/**
 * Helper to generate invoice lines from selected trip IDs
 */
export async function populateLinesFromTrips(tripIds: string[]) {
  if (!tripIds || tripIds.length === 0) return [];

  const trips = await prisma.trip.findMany({
    where: { id: { in: tripIds } },
    include: {
      customer: true,
    },
  });

  const lines: { tripId: string; description: string; quantity: number; rate: number; amount: number }[] = [];

  for (const trip of trips) {
    const rate = Number(trip.billing_amount) || 0;
    lines.push({
      tripId: trip.id,
      description: `Freight Service: Trip ${trip.ref_id || trip.id.slice(0, 8)} (${trip.vehicle_type || 'Standard'})`,
      quantity: 1,
      rate,
      amount: rate,
    });
  }

  return lines;
}

const invoiceLineSchema = z.object({
  tripId: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'Line description is required'),
  quantity: z.number().positive().default(1),
  rate: z.number().min(0, 'Rate cannot be negative'),
  amount: z.number().min(0, 'Amount cannot be negative'),
});

const createInvoiceSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  invoice_date: z.string().min(1, 'Invoice date is required'),
  due_date: z.string().nullable().optional(),
  tax_rate: z.number().min(0).max(100).default(0),
  currency: z.string().default('SAR'),
  tripIds: z.array(z.string().uuid()).optional(),
  lines: z.array(invoiceLineSchema).optional(),
});

const updateInvoiceSchema = z.object({
  invoice_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  currency: z.string().optional(),
  lines: z.array(invoiceLineSchema).optional(),
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
    const { customer_id, status, date_from, date_to, search, page = '1', per_page = '50' } = req.query;

    const pageNumber = Math.max(1, parseInt(page as string) || 1);
    const limit = Math.max(1, parseInt(per_page as string) || 50);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = {};

    if (customer_id && customer_id !== 'all') {
      whereClause.customerId = customer_id as string;
    }

    if (status && status !== 'all') {
      whereClause.status = status as string;
    }

    if (date_from || date_to) {
      whereClause.invoice_date = {};
      if (date_from) whereClause.invoice_date.gte = new Date(date_from as string);
      if (date_to) whereClause.invoice_date.lte = new Date(date_to as string);
    }

    if (search) {
      const q = String(search).trim();
      whereClause.OR = [
        { ref_id: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { lines: { some: { description: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { lines: true, payments: true, trips: true } },
        },
        orderBy: { createdAt: 'desc' },
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
          include: { trip: { select: { id: true, ref_id: true, vehicle_type: true, billing_amount: true, status: true } } },
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

    const { customerId, invoice_date, due_date, tax_rate, currency, tripIds, lines } = parseResult.data;

    // Verify customer exists
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CUSTOMER', message: 'Customer not found' },
      });
    }

    // Build line items (from provided lines or auto-populated from tripIds)
    let finalLines = lines || [];
    if (tripIds && tripIds.length > 0) {
      const tripLines = await populateLinesFromTrips(tripIds);
      finalLines = [...finalLines, ...tripLines];
    }

    if (finalLines.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_LINES', message: 'Invoice must contain at least 1 line item or selected trip' },
      });
    }

    // Calculate subtotal and tax
    let subtotal = 0;
    for (const line of finalLines) {
      subtotal += line.amount;
    }
    const taxAmount = Number((subtotal * (tax_rate / 100)).toFixed(2));
    const totalAmount = Number((subtotal + taxAmount).toFixed(2));

    const ref_id = await nextInvoiceRefId();

    const invoice = await prisma.invoice.create({
      data: {
        ref_id,
        customerId,
        invoice_date: new Date(invoice_date),
        due_date: due_date ? new Date(due_date) : null,
        status: 'Draft',
        subtotal,
        tax_rate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        paid_amount: 0,
        balance_due: totalAmount,
        currency: currency || 'SAR',
        created_by: userId,
        updated_by: userId,
        lines: {
          create: finalLines.map((l) => ({
            tripId: l.tripId || null,
            description: l.description,
            quantity: l.quantity || 1,
            rate: l.rate,
            amount: l.amount,
          })),
        },
      },
      include: {
        customer: true,
        lines: true,
      },
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

    const updated = await prisma.$transaction(async (tx) => {
      if (data.lines) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      }

      // Recompute subtotal
      const currentLines = data.lines || existing.lines;
      let subtotal = 0;
      for (const line of currentLines) {
        subtotal += Number((line as any).amount);
      }

      const taxRate = data.tax_rate !== undefined ? data.tax_rate : Number(existing.tax_rate);
      const taxAmount = Number((subtotal * (taxRate / 100)).toFixed(2));
      const totalAmount = Number((subtotal + taxAmount).toFixed(2));

      return await tx.invoice.update({
        where: { id },
        data: {
          invoice_date: data.invoice_date ? new Date(data.invoice_date) : undefined,
          due_date: data.due_date !== undefined ? (data.due_date ? new Date(data.due_date) : null) : undefined,
          tax_rate: data.tax_rate !== undefined ? data.tax_rate : undefined,
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          balance_due: totalAmount,
          currency: data.currency || undefined,
          updated_by: userId,
          lines: data.lines
            ? {
                create: data.lines.map((l) => ({
                  tripId: l.tripId || null,
                  description: l.description,
                  quantity: l.quantity || 1,
                  rate: l.rate,
                  amount: l.amount,
                })),
              }
            : undefined,
        },
        include: {
          customer: true,
          lines: true,
        },
      });
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
