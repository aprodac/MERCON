import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';

interface AgeingBucketRow {
  party_id: string;
  party_name: string;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

export const getARAgeing = async (req: Request, res: Response) => {
  try {
    const { as_of_date, customer_id } = req.query;
    const asOf = as_of_date ? new Date(as_of_date as string) : new Date();

    const whereClause: Prisma.InvoiceWhereInput = {
      status: { in: ['Issued', 'PartiallyPaid'] },
    };

    if (customer_id) {
      whereClause.customerId = customer_id as string;
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: { customer: true },
    });

    const partyMap = new Map<string, AgeingBucketRow>();

    for (const inv of invoices) {
      const balance = Number(inv.balance_due || 0);
      if (balance <= 0) continue;

      const customerId = inv.customerId || 'unknown_customer';
      const customerName = inv.customer?.name || 'Unknown Customer';

      const row = partyMap.get(customerId) || {
        party_id: customerId,
        party_name: customerName,
        current: 0,
        days_1_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_90_plus: 0,
        total: 0,
      };

      const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
      const diffMs = asOf.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        row.current += balance;
      } else if (diffDays <= 30) {
        row.days_1_30 += balance;
      } else if (diffDays <= 60) {
        row.days_31_60 += balance;
      } else if (diffDays <= 90) {
        row.days_61_90 += balance;
      } else {
        row.days_90_plus += balance;
      }

      row.total += balance;
      partyMap.set(customerId, row);
    }

    const rows = Array.from(partyMap.values());

    const summary = rows.reduce(
      (acc, r) => {
        acc.total_current += r.current;
        acc.total_1_30 += r.days_1_30;
        acc.total_31_60 += r.days_31_60;
        acc.total_61_90 += r.days_61_90;
        acc.total_90_plus += r.days_90_plus;
        acc.total_outstanding += r.total;
        return acc;
      },
      {
        total_current: 0,
        total_1_30: 0,
        total_31_60: 0,
        total_61_90: 0,
        total_90_plus: 0,
        total_outstanding: 0,
      },
    );

    return res.json({
      success: true,
      data: {
        as_of_date: asOf.toISOString(),
        summary,
        rows,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to generate AR Ageing Report');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

export const getAPAgeing = async (req: Request, res: Response) => {
  try {
    const { as_of_date, provider_id } = req.query;
    const asOf = as_of_date ? new Date(as_of_date as string) : new Date();

    const whereClause: Prisma.BillWhereInput = {
      status: { in: ['Approved', 'PartiallyPaid'] },
    };

    if (provider_id) {
      whereClause.providerId = provider_id as string;
    }

    const bills = await prisma.bill.findMany({
      where: whereClause,
      include: { provider: true },
    });

    const partyMap = new Map<string, AgeingBucketRow>();

    for (const bill of bills) {
      const balance = Number(bill.balance_due || 0);
      if (balance <= 0) continue;

      const providerKey = bill.providerId || (bill.payee_name ? `payee:${bill.payee_name}` : 'unknown_payee');
      const providerName = bill.provider?.name || bill.payee_name || 'Unknown Payee';

      const row = partyMap.get(providerKey) || {
        party_id: providerKey,
        party_name: providerName,
        current: 0,
        days_1_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_90_plus: 0,
        total: 0,
      };

      const dueDate = bill.due_date ? new Date(bill.due_date) : new Date(bill.bill_date);
      const diffMs = asOf.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        row.current += balance;
      } else if (diffDays <= 30) {
        row.days_1_30 += balance;
      } else if (diffDays <= 60) {
        row.days_31_60 += balance;
      } else if (diffDays <= 90) {
        row.days_61_90 += balance;
      } else {
        row.days_90_plus += balance;
      }

      row.total += balance;
      partyMap.set(providerKey, row);
    }

    const rows = Array.from(partyMap.values());

    const summary = rows.reduce(
      (acc, r) => {
        acc.total_current += r.current;
        acc.total_1_30 += r.days_1_30;
        acc.total_31_60 += r.days_31_60;
        acc.total_61_90 += r.days_61_90;
        acc.total_90_plus += r.days_90_plus;
        acc.total_outstanding += r.total;
        return acc;
      },
      {
        total_current: 0,
        total_1_30: 0,
        total_31_60: 0,
        total_61_90: 0,
        total_90_plus: 0,
        total_outstanding: 0,
      },
    );

    return res.json({
      success: true,
      data: {
        as_of_date: asOf.toISOString(),
        summary,
        rows,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to generate AP Ageing Report');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};
