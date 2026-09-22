import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { nextBillRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { approveBill, recordBillPayment, voidBill } from '../utils/billEngine';
import { AccountingError } from '../utils/accountingEngine';

/**
 * Helper to generate bill lines from selected Expense and TripSubcontract IDs
 */
export async function populateLinesFromSources(
  expenseIds?: string[],
  tripSubcontractIds?: string[],
) {
  const lines: {
    source_type: string;
    source_id: string | null;
    accountId?: string | null;
    description: string;
    amount: number;
  }[] = [];

  if (expenseIds && expenseIds.length > 0) {
    const expenses = await prisma.expense.findMany({
      where: { id: { in: expenseIds } },
    });

    for (const exp of expenses) {
      lines.push({
        source_type: 'Expense',
        source_id: exp.id,
        accountId: null, // picked by operator or resolved via default expense accounts
        description: `[${exp.ref_id || 'EXP'}] ${exp.category}: ${exp.description || exp.payee || 'Operating Expense'}`,
        amount: Number(exp.amount) || 0,
      });
    }
  }

  if (tripSubcontractIds && tripSubcontractIds.length > 0) {
    const subcontracts = await prisma.tripSubcontract.findMany({
      where: { id: { in: tripSubcontractIds } },
      include: {
        trip: true,
        provider: true,
      },
    });

    for (const sub of subcontracts) {
      lines.push({
        source_type: 'TripSubcontract',
        source_id: sub.id,
        accountId: null,
        description: `[Subcontract] Trip ${sub.trip?.ref_id || sub.tripId.slice(0, 8)} - ${sub.provider?.name || '3PL Provider'}`,
        amount: Number(sub.cost) || 0,
      });
    }
  }

  return lines;
}

const billLineSchema = z.object({
  source_type: z.string().default('Manual'),
  source_id: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'Line description is required'),
  amount: z.number().min(0, 'Amount cannot be negative'),
});

const createBillSchema = z.object({
  providerId: z.string().uuid().nullable().optional(),
  payee_name: z.string().nullable().optional(),
  bill_date: z.string().min(1, 'Bill date is required'),
  due_date: z.string().nullable().optional(),
  tax_amount: z.number().min(0).default(0),
  currency: z.string().default('SAR'),
  expenseIds: z.array(z.string().uuid()).optional(),
  tripSubcontractIds: z.array(z.string().uuid()).optional(),
  lines: z.array(billLineSchema).optional(),
});

const updateBillSchema = z.object({
  providerId: z.string().uuid().nullable().optional(),
  payee_name: z.string().nullable().optional(),
  bill_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  tax_amount: z.number().min(0).optional(),
  currency: z.string().optional(),
  lines: z.array(billLineSchema).optional(),
});

const paymentSchema = z.object({
  amount: z.number().positive('Payment amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  accountId: z.string().uuid('Invalid account ID'),
  payment_method: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
});

/**
 * List bills with filters and summary totals
 */
export const getBills = async (req: Request, res: Response) => {
  try {
    const provider_id = req.query.provider_id as string | undefined;
    const status = req.query.status as string | undefined;
    const date_from = req.query.date_from as string | undefined;
    const date_to = req.query.date_to as string | undefined;
    const search = req.query.search as string | undefined;
    const page = (req.query.page as string) || '1';
    const per_page = (req.query.per_page as string) || '50';

    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limit = Math.max(1, parseInt(per_page) || 50);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = {};

    if (provider_id && provider_id !== 'all') {
      whereClause.providerId = provider_id;
    }

    if (status && status !== 'all') {
      whereClause.status = status;
    }

    if (date_from || date_to) {
      whereClause.bill_date = {};
      if (date_from) whereClause.bill_date.gte = new Date(date_from);
      if (date_to) whereClause.bill_date.lte = new Date(date_to);
    }

    if (search) {
      const searchStr = search.trim();
      whereClause.OR = [
        { ref_id: { contains: searchStr, mode: 'insensitive' } },
        { payee_name: { contains: searchStr, mode: 'insensitive' } },
        { provider: { name: { contains: searchStr, mode: 'insensitive' } } },
      ];
    }

    const [bills, totalCount] = await Promise.all([
      prisma.bill.findMany({
        where: whereClause,
        include: {
          provider: true,
          lines: {
            include: {
              account: true,
            },
          },
          payments: {
            include: {
              account: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bill.count({ where: whereClause }),
    ]);

    // Aggregate overall metrics across filtered set
    const aggregate = await prisma.bill.aggregate({
      where: whereClause,
      _sum: {
        total_amount: true,
        paid_amount: true,
        balance_due: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: bills,
      meta: {
        total: totalCount,
        page: pageNumber,
        per_page: limit,
        total_pages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalBilled: aggregate._sum.total_amount || 0,
        totalPaid: aggregate._sum.paid_amount || 0,
        totalOutstanding: aggregate._sum.balance_due || 0,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching bills:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_FETCH_BILLS',
      message: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Get bill by ID
 */
export const getBillById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = req.params.id;

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        provider: true,
        lines: {
          include: {
            account: true,
          },
        },
        payments: {
          include: {
            account: true,
            journalEntry: true,
          },
        },
        journalEntry: {
          include: {
            lines: {
              include: {
                account: true,
              },
            },
          },
        },
      },
    });

    if (!bill) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Bill not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: bill,
    });
  } catch (error: any) {
    logger.error('Error fetching bill:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_FETCH_BILL',
      message: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Create a new Draft Bill
 */
export const createDraftBill = async (req: Request, res: Response) => {
  try {
    const validated = createBillSchema.parse(req.body);

    if (!validated.providerId && !validated.payee_name) {
      return res.status(400).json({
        success: false,
        error: 'PROVIDER_OR_PAYEE_REQUIRED',
        message: 'A bill must specify either a providerId or a payee_name',
      });
    }

    // Auto-populate lines from selected source IDs if provided
    const autoLines = await populateLinesFromSources(validated.expenseIds, validated.tripSubcontractIds);
    const manualLines = validated.lines || [];
    const allLines = [...autoLines, ...manualLines];

    if (allLines.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MINIMUM_LINES_REQUIRED',
        message: 'A bill must contain at least 1 line item',
      });
    }

    const ref_id = await nextBillRefId(prisma);

    const subtotal = allLines.reduce((sum, l) => sum + l.amount, 0);
    const tax_amount = validated.tax_amount || 0;
    const total_amount = subtotal + tax_amount;
    const balance_due = total_amount;

    const bill = await prisma.bill.create({
      data: {
        ref_id,
        providerId: validated.providerId || null,
        payee_name: validated.payee_name || null,
        bill_date: new Date(validated.bill_date),
        due_date: validated.due_date ? new Date(validated.due_date) : null,
        status: 'Draft',
        subtotal,
        tax_amount,
        total_amount,
        paid_amount: 0,
        balance_due,
        currency: validated.currency || 'SAR',
        created_by: (req as any).user?.id || null,
        lines: {
          create: allLines.map((l) => ({
            source_type: l.source_type || 'Manual',
            source_id: l.source_id || null,
            accountId: l.accountId || null,
            description: l.description,
            amount: l.amount,
          })),
        },
      },
      include: {
        provider: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      data: bill,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid bill payload',
        details: error.issues,
      });
    }

    logger.error('Error creating draft bill:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_CREATE_BILL',
      message: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Update a Draft Bill
 */
export const updateDraftBill = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = req.params.id;
    const validated = updateBillSchema.parse(req.body);

    const existingBill = await prisma.bill.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!existingBill) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Bill not found',
      });
    }

    if (existingBill.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: `Only Draft bills can be edited (current status: '${existingBill.status}')`,
      });
    }

    const updateData: any = {
      updated_by: (req as any).user?.id || null,
    };

    if (validated.providerId !== undefined) updateData.providerId = validated.providerId;
    if (validated.payee_name !== undefined) updateData.payee_name = validated.payee_name;
    if (validated.bill_date) updateData.bill_date = new Date(validated.bill_date);
    if (validated.due_date !== undefined) {
      updateData.due_date = validated.due_date ? new Date(validated.due_date) : null;
    }
    if (validated.currency) updateData.currency = validated.currency;

    if (validated.lines) {
      const subtotal = validated.lines.reduce((sum, l) => sum + l.amount, 0);
      const tax_amount = validated.tax_amount ?? Number(existingBill.tax_amount);
      const total_amount = subtotal + tax_amount;

      updateData.subtotal = subtotal;
      updateData.tax_amount = tax_amount;
      updateData.total_amount = total_amount;
      updateData.balance_due = total_amount;

      // Replace lines
      await prisma.billLine.deleteMany({ where: { billId: id } });
      updateData.lines = {
        create: validated.lines.map((l) => ({
          source_type: l.source_type || 'Manual',
          source_id: l.source_id || null,
          accountId: l.accountId || null,
          description: l.description,
          amount: l.amount,
        })),
      };
    } else if (validated.tax_amount !== undefined) {
      const subtotal = Number(existingBill.subtotal);
      const tax_amount = validated.tax_amount;
      const total_amount = subtotal + tax_amount;

      updateData.tax_amount = tax_amount;
      updateData.total_amount = total_amount;
      updateData.balance_due = total_amount;
    }

    const updatedBill = await prisma.bill.update({
      where: { id },
      data: updateData,
      include: {
        provider: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: updatedBill,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid update payload',
        details: error.issues,
      });
    }

    logger.error('Error updating draft bill:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_UPDATE_BILL',
      message: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * Delete a Draft Bill
 */
export const deleteDraftBill = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = req.params.id;

    const existingBill = await prisma.bill.findUnique({ where: { id } });

    if (!existingBill) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Bill not found',
      });
    }

    if (existingBill.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: `Only Draft bills can be deleted (current status: '${existingBill.status}')`,
      });
    }

    await prisma.bill.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: 'Draft bill deleted successfully',
    });
  } catch (error: any) {
    logger.error('Error deleting draft bill:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_DELETE_BILL',
      message: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * POST /bills/:id/approve — Approve draft bill & post to GL
 */
export const approveBillHandler = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = req.params.id;
    const userId = (req as any).user?.id || 'SYSTEM';

    const bill = await approveBill(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Bill approved and posted to General Ledger successfully',
      data: bill,
    });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    logger.error('Error approving bill:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_APPROVE_BILL',
      message: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * POST /bills/:id/payments — Record a payment against an approved bill
 */
export const recordBillPaymentHandler = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = req.params.id;
    const userId = (req as any).user?.id || 'SYSTEM';
    const payload = paymentSchema.parse(req.body);

    const result = await recordBillPayment(id, userId, payload);

    return res.status(200).json({
      success: true,
      message: 'Bill payment recorded and posted to General Ledger successfully',
      data: result,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid payment payload',
        details: error.issues,
      });
    }

    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    logger.error('Error recording bill payment:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_RECORD_PAYMENT',
      message: error.message || 'An unexpected error occurred',
    });
  }
};

/**
 * POST /bills/:id/void — Void an approved bill
 */
export const voidBillHandler = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = req.params.id;
    const userId = (req as any).user?.id || 'SYSTEM';

    const bill = await voidBill(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Bill voided and GL postings reversed successfully',
      data: bill,
    });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    logger.error('Error voiding bill:', error);
    return res.status(500).json({
      success: false,
      error: 'FAILED_TO_VOID_BILL',
      message: error.message || 'An unexpected error occurred',
    });
  }
};
