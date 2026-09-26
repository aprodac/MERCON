import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';

export interface AgeingBillDetail {
  id: string;
  ref_id: string | null;
  bill_date: string;
  due_date: string | null;
  days_overdue: number;
  balance: number;
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
}

export interface AgeingPartyContact {
  type: 'provider' | 'payee' | 'customer';
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface AgeingBucketRow {
  party_id: string;
  party_name: string;
  party?: AgeingPartyContact;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
  bills?: AgeingBillDetail[];
  invoices?: AgeingBillDetail[];
}

export interface AgeingBucketCounts {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

function parseAsOfDate(asOfQuery?: string): Date {
  if (!asOfQuery) return new Date();
  const trimmed = asOfQuery.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // Treat as end of that day (23:59:59.999)
    return new Date(`${trimmed}T23:59:59.999`);
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? new Date() : d;
}

export const getARAgeing = async (req: Request, res: Response) => {
  try {
    const asOfRaw = (req.query.as_of || req.query.as_of_date) as string | undefined;
    const asOf = parseAsOfDate(asOfRaw);
    const basis = (req.query.basis === 'bill' ? 'bill' : 'due') as 'due' | 'bill';
    const includeInvoices =
      req.query.include_bills === 'true' ||
      req.query.include_documents === 'true' ||
      req.query.include_invoices === 'true';
    const customerIdParam = req.query.customer_id as string | undefined;

    // Limitation: Invoices voided after as_of are excluded as no void_date is stored on Invoice.
    const whereClause: Prisma.InvoiceWhereInput = {
      status: { in: ['Issued', 'PartiallyPaid', 'Paid'] },
      invoice_date: { lte: asOf },
    };

    if (customerIdParam) {
      whereClause.customerId = customerIdParam;
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        customer: true,
        payments: {
          where: { payment_date: { lte: asOf } },
        },
        advanceApplications: {
          where: { applied_date: { lte: asOf } },
        },
      },
      orderBy: { invoice_date: 'asc' },
    });

    const partyMap = new Map<string, AgeingBucketRow>();
    const bucketCounts: AgeingBucketCounts = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
      total: 0,
    };

    for (const inv of invoices) {
      const totalAmount = Number(inv.total_amount || 0);
      const paidAmount = inv.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const advAmount = inv.advanceApplications.reduce((sum, a) => sum + Number(a.amount || 0), 0);
      const balance = totalAmount - paidAmount - advAmount;

      if (balance <= 0.001) continue;

      const customerId = inv.customerId || 'unknown_customer';
      const customerName = inv.customer?.name || 'Unknown Customer';

      const partyContact: AgeingPartyContact = {
        type: 'customer',
        id: customerId,
        name: customerName,
        phone: inv.customer?.contact_phone || inv.customer?.primary_contact_phone || null,
        email: null,
      };

      const row = partyMap.get(customerId) || {
        party_id: customerId,
        party_name: customerName,
        party: partyContact,
        current: 0,
        days_1_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_90_plus: 0,
        total: 0,
        invoices: includeInvoices ? [] : undefined,
      };

      const refDate =
        basis === 'due'
          ? inv.due_date
            ? new Date(inv.due_date)
            : new Date(inv.invoice_date)
          : new Date(inv.invoice_date);

      const diffMs = asOf.getTime() - refDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';

      if (diffDays <= 0) {
        row.current += balance;
        bucketCounts.current += 1;
        bucket = 'current';
      } else if (diffDays <= 30) {
        row.days_1_30 += balance;
        bucketCounts.days_1_30 += 1;
        bucket = '1-30';
      } else if (diffDays <= 60) {
        row.days_31_60 += balance;
        bucketCounts.days_31_60 += 1;
        bucket = '31-60';
      } else if (diffDays <= 90) {
        row.days_61_90 += balance;
        bucketCounts.days_61_90 += 1;
        bucket = '61-90';
      } else {
        row.days_90_plus += balance;
        bucketCounts.days_90_plus += 1;
        bucket = '90+';
      }

      bucketCounts.total += 1;
      row.total += balance;

      if (includeInvoices && row.invoices) {
        row.invoices.push({
          id: inv.id,
          ref_id: inv.ref_id,
          bill_date: inv.invoice_date.toISOString(),
          due_date: inv.due_date ? inv.due_date.toISOString() : null,
          days_overdue: Math.max(0, diffDays),
          balance,
          bucket,
        });
      }

      partyMap.set(customerId, row);
    }

    const rows = Array.from(partyMap.values());

    if (includeInvoices) {
      for (const r of rows) {
        if (r.invoices) {
          r.invoices.sort(
            (a, b) => new Date(a.due_date || a.bill_date).getTime() - new Date(b.due_date || b.bill_date).getTime()
          );
        }
      }
    }

    const grand_total = rows.reduce(
      (acc, r) => {
        acc.current += r.current;
        acc.days_1_30 += r.days_1_30;
        acc.days_31_60 += r.days_31_60;
        acc.days_61_90 += r.days_61_90;
        acc.days_90_plus += r.days_90_plus;
        acc.total += r.total;
        return acc;
      },
      {
        party_id: 'TOTAL',
        party_name: 'Total',
        current: 0,
        days_1_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_90_plus: 0,
        total: 0,
      }
    );

    const summary = {
      total_current: grand_total.current,
      total_1_30: grand_total.days_1_30,
      total_31_60: grand_total.days_31_60,
      total_61_90: grand_total.days_61_90,
      total_90_plus: grand_total.days_90_plus,
      total_outstanding: grand_total.total,
    };

    return res.json({
      success: true,
      data: {
        as_of: asOf.toISOString(),
        as_of_date: asOf.toISOString(),
        basis,
        summary,
        grand_total,
        bucket_counts: bucketCounts,
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
    const asOfRaw = (req.query.as_of || req.query.as_of_date) as string | undefined;
    const asOf = parseAsOfDate(asOfRaw);
    const basis = (req.query.basis === 'bill' ? 'bill' : 'due') as 'due' | 'bill';
    const includeBills =
      req.query.include_bills === 'true' ||
      req.query.include_documents === 'true';
    const providerIdParam = req.query.provider_id as string | undefined;

    // Limitation: Bills voided after as_of are excluded as no void_date is stored on Bill.
    const whereClause: Prisma.BillWhereInput = {
      status: { in: ['Approved', 'PartiallyPaid', 'Paid'] },
      bill_date: { lte: asOf },
    };

    if (providerIdParam) {
      whereClause.providerId = providerIdParam;
    }

    const bills = await prisma.bill.findMany({
      where: whereClause,
      include: {
        provider: true,
        payments: {
          where: { payment_date: { lte: asOf } },
        },
        advanceApplications: {
          where: { applied_date: { lte: asOf } },
        },
      },
      orderBy: { bill_date: 'asc' },
    });

    const partyMap = new Map<string, AgeingBucketRow>();
    const bucketCounts: AgeingBucketCounts = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
      total: 0,
    };

    for (const bill of bills) {
      const totalAmount = Number(bill.total_amount || 0);
      const paidAmount = bill.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const advAmount = bill.advanceApplications.reduce((sum, a) => sum + Number(a.amount || 0), 0);
      const balance = totalAmount - paidAmount - advAmount;

      if (balance <= 0.001) continue;

      const providerKey = bill.providerId || (bill.payee_name ? `payee:${bill.payee_name}` : 'unknown_payee');
      const providerName = bill.provider?.name || bill.payee_name || 'Unknown Payee';

      const partyContact: AgeingPartyContact = {
        type: bill.providerId ? 'provider' : 'payee',
        id: providerKey,
        name: providerName,
        phone: bill.provider?.phone || null,
        email: bill.provider?.email || null,
      };

      const row = partyMap.get(providerKey) || {
        party_id: providerKey,
        party_name: providerName,
        party: partyContact,
        current: 0,
        days_1_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_90_plus: 0,
        total: 0,
        bills: includeBills ? [] : undefined,
      };

      const refDate =
        basis === 'due'
          ? bill.due_date
            ? new Date(bill.due_date)
            : new Date(bill.bill_date)
          : new Date(bill.bill_date);

      const diffMs = asOf.getTime() - refDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';

      if (diffDays <= 0) {
        row.current += balance;
        bucketCounts.current += 1;
        bucket = 'current';
      } else if (diffDays <= 30) {
        row.days_1_30 += balance;
        bucketCounts.days_1_30 += 1;
        bucket = '1-30';
      } else if (diffDays <= 60) {
        row.days_31_60 += balance;
        bucketCounts.days_31_60 += 1;
        bucket = '31-60';
      } else if (diffDays <= 90) {
        row.days_61_90 += balance;
        bucketCounts.days_61_90 += 1;
        bucket = '61-90';
      } else {
        row.days_90_plus += balance;
        bucketCounts.days_90_plus += 1;
        bucket = '90+';
      }

      bucketCounts.total += 1;
      row.total += balance;

      if (includeBills && row.bills) {
        row.bills.push({
          id: bill.id,
          ref_id: bill.ref_id,
          bill_date: bill.bill_date.toISOString(),
          due_date: bill.due_date ? bill.due_date.toISOString() : null,
          days_overdue: Math.max(0, diffDays),
          balance,
          bucket,
        });
      }

      partyMap.set(providerKey, row);
    }

    const rows = Array.from(partyMap.values());

    if (includeBills) {
      for (const r of rows) {
        if (r.bills) {
          r.bills.sort(
            (a, b) => new Date(a.due_date || a.bill_date).getTime() - new Date(b.due_date || b.bill_date).getTime()
          );
        }
      }
    }

    const grand_total = rows.reduce(
      (acc, r) => {
        acc.current += r.current;
        acc.days_1_30 += r.days_1_30;
        acc.days_31_60 += r.days_31_60;
        acc.days_61_90 += r.days_61_90;
        acc.days_90_plus += r.days_90_plus;
        acc.total += r.total;
        return acc;
      },
      {
        party_id: 'TOTAL',
        party_name: 'Total',
        current: 0,
        days_1_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_90_plus: 0,
        total: 0,
      }
    );

    const summary = {
      total_current: grand_total.current,
      total_1_30: grand_total.days_1_30,
      total_31_60: grand_total.days_31_60,
      total_61_90: grand_total.days_61_90,
      total_90_plus: grand_total.days_90_plus,
      total_outstanding: grand_total.total,
    };

    return res.json({
      success: true,
      data: {
        as_of: asOf.toISOString(),
        as_of_date: asOf.toISOString(),
        basis,
        summary,
        grand_total,
        bucket_counts: bucketCounts,
        rows,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to generate AP Ageing Report');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};
