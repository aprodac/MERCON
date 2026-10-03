import { getValidUuid } from '../utils/uuid';
import { Request, Response } from 'express';
import { prisma } from '../db';
import { buildSearchAnd } from '../utils/search';
import { logger } from '../utils/logger';
import { statusWhere } from '../utils/invoiceQuery';

const CUSTOMER_SEARCH_FIELDS = ['name', 'contact_phone'];

/** Trip statuses that mean a truck is working for the customer right now. */
const LIVE_TRIP_STATUSES = ['Loading', 'InTransit', 'Delayed'] as const;

/** Sorts the full list (not just the current page) can be ordered by. */
const CUSTOMER_SORTS: Record<string, (dir: 'asc' | 'desc') => any[]> = {
  trips: (dir) => [{ trips: { _count: dir } }, { name: 'asc' }],
  name: (dir) => [{ name: dir }],
  createdAt: (dir) => [{ createdAt: dir }],
};

/**
 * Per-customer figures for the rows on one list page: trucks on the road now,
 * the latest trip date, and what they owe on issued invoices (overdue split out).
 */
async function rowStats(ids: string[]) {
  if (ids.length === 0) return new Map<string, any>();
  const now = new Date();
  const [live, last, unpaid, overdue] = await Promise.all([
    prisma.trip.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, deletedAt: null, status: { in: [...LIVE_TRIP_STATUSES] } },
      _count: { _all: true },
    }),
    prisma.trip.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, deletedAt: null, status: { notIn: ['Cancelled', 'Draft'] } },
      _max: { planned_start: true, createdAt: true },
    }),
    prisma.invoice.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, ...statusWhere('unpaid', now), balance_due: { gt: 0 } },
      _sum: { balance_due: true },
    }),
    prisma.invoice.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, ...statusWhere('overdue', now), balance_due: { gt: 0 } },
      _sum: { balance_due: true },
    }),
  ]);
  const stats = new Map<string, { live_trips: number; last_trip_at: Date | null; outstanding: number; overdue: number }>();
  for (const id of ids) stats.set(id, { live_trips: 0, last_trip_at: null, outstanding: 0, overdue: 0 });
  for (const r of live) stats.get(r.customerId)!.live_trips = r._count._all;
  for (const r of last) stats.get(r.customerId)!.last_trip_at = r._max.planned_start ?? r._max.createdAt ?? null;
  for (const r of unpaid) stats.get(r.customerId)!.outstanding = Number(r._sum.balance_due ?? 0);
  for (const r of overdue) stats.get(r.customerId)!.overdue = Number(r._sum.balance_due ?? 0);
  return stats;
}

/**
 * Headline figures for the Customers page: accounts, who has trucks on the
 * road right now, and receivables (issued, unpaid; overdue = past due date).
 */
export const getCustomerSummary = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const base = { deletedAt: null };
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const liveTrip = { deletedAt: null, status: { in: [...LIVE_TRIP_STATUSES] } };
    const balanceByCustomer = (status: 'unpaid' | 'overdue') =>
      prisma.invoice.groupBy({
        by: ['customerId'],
        where: { ...statusWhere(status, now), balance_due: { gt: 0 }, customer: base },
        _sum: { balance_due: true },
      });

    const [total, active, newThisMonth, liveCustomers, liveTrips, unpaid, overdue] = await Promise.all([
      prisma.customer.count({ where: base }),
      prisma.customer.count({ where: { ...base, isActive: true } }),
      prisma.customer.count({ where: { ...base, createdAt: { gte: monthStart } } }),
      prisma.customer.count({ where: { ...base, trips: { some: liveTrip } } }),
      prisma.trip.count({ where: { ...liveTrip, customer: base } }),
      balanceByCustomer('unpaid'),
      balanceByCustomer('overdue'),
    ]);
    const sum = (rows: { _sum: { balance_due: any } }[]) => rows.reduce((acc, r) => acc + Number(r._sum.balance_due ?? 0), 0);

    return res.json({
      success: true,
      data: {
        total,
        active,
        inactive: total - active,
        new_this_month: newThisMonth,
        live_customers: liveCustomers,
        live_trips: liveTrips,
        outstanding: { amount: sum(unpaid), customers: unpaid.length },
        overdue: { amount: sum(overdue), customers: overdue.length },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch customer summary');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch customer summary' } });
  }
};

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const { is_active, search, page = '1', per_page = '20', live, has_balance, overdue, sort_by, sort_dir } = req.query;
    
    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = { deletedAt: null };
    if (is_active !== undefined) {
      whereClause.isActive = is_active === 'true';
    }
    const searchAnd = buildSearchAnd(search, CUSTOMER_SEARCH_FIELDS);
    if (searchAnd.length > 0) {
      whereClause.AND = searchAnd;
    }
    // Quick filters on the Customers page
    if (live === 'true') {
      whereClause.trips = { some: { deletedAt: null, status: { in: [...LIVE_TRIP_STATUSES] } } };
    }
    if (has_balance === 'true') {
      whereClause.invoices = { some: { ...statusWhere('unpaid'), balance_due: { gt: 0 } } };
    }
    // The Overdue card: customers with an issued invoice past its due date.
    if (overdue === 'true') {
      whereClause.invoices = { some: { ...statusWhere('overdue', new Date()), balance_due: { gt: 0 } } };
    }

    // Picker shape — same contract as `mode=lookup` on drivers/vehicles. Drops
    // the per-row trip-count subquery and every column a dropdown never reads,
    // for the screens that fetch 100-200 customers to fill a combobox.
    if (req.query.mode === 'lookup') {
      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: [
            { trips: { _count: 'desc' } },
            { name: 'asc' },
          ],
          select: {
            id: true,
            name: true,
            contact_phone: true,
            primary_contact_person: true,
            primary_contact_phone: true,
            logo_url: true,
            whatsapp_number: true,
            whatsapp_group_link: true,
            whatsapp_group_name: true,
            payment_terms: true,
            driver_workflow: true,
            isActive: true,
            createdAt: true,
            _count: { select: { trips: true } },
          },
        }),
        prisma.customer.count({ where: whereClause }),
      ]);

      return res.json({
        success: true,
        data: customers,
        meta: {
          page: pageNumber,
          per_page: limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      });
    }

    const dir = sort_dir === 'asc' ? 'asc' : 'desc';
    const orderBy = (CUSTOMER_SORTS[sort_by as string] ?? CUSTOMER_SORTS.trips)(dir);
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy,
        include: { _count: { select: { trips: { where: { deletedAt: null, status: { notIn: ['Cancelled'] } } } } } },
      }),
      prisma.customer.count({ where: whereClause }),
    ]);
    const stats = await rowStats(customers.map((c) => c.id));

    return res.json({
      success: true,
      data: customers.map((c) => ({ ...c, stats: stats.get(c.id) })),
      meta: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch customers' } });
  }
};

export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const idOrRef = req.params.id as string;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
    const whereClause: any = isUuid
      ? { id: idOrRef, deletedAt: null }
      : {
          name: { equals: idOrRef, mode: 'insensitive' },
          deletedAt: null,
        };

    const customer = await prisma.customer.findFirst({
      where: whereClause,
      // Same trip shape the driver and vehicle detail endpoints return, so the
      // three detail pages render trip cards (route, driver, payload) alike.
      include: {
        trips: {
          where: { deletedAt: null, status: { notIn: ['Cancelled'] } },
          take: 100,
          orderBy: [{ planned_start: 'desc' }, { createdAt: 'desc' }],
          include: {
            driver: { select: { id: true, first_name: true, last_name: true, phone_primary: true } },
            vehicle: { select: { id: true, ref_id: true, plate_number: true, asset_type: true, capacity_kg: true } },
            stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' } },
          },
        },
        _count: { select: { trips: { where: { deletedAt: null, status: { notIn: ['Cancelled'] } } } } },
      }
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    }

    res.json({ success: true, data: customer });
  } catch (error) {
    logger.error({ err: error, id: req.params.id }, 'Failed to fetch customer by ID');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch customer' } });
  }
};

export const getCustomerStatement = async (req: Request, res: Response) => {
  try {
    const idOrRef = req.params.id as string;
    const { date_from, date_to } = req.query;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
    const customerWhere: any = isUuid
      ? { id: idOrRef, deletedAt: null }
      : { name: { equals: idOrRef, mode: 'insensitive' }, deletedAt: null };

    const customer = await prisma.customer.findFirst({
      where: customerWhere,
      select: { id: true, name: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Customer not found' },
      });
    }

    const invoiceWhere: any = {
      customerId: customer.id,
    };

    if (date_from || date_to) {
      invoiceWhere.invoice_date = {};
      if (date_from) {
        invoiceWhere.invoice_date.gte = new Date(date_from as string);
      }
      if (date_to) {
        const toDate = new Date(date_to as string);
        toDate.setHours(23, 59, 59, 999);
        invoiceWhere.invoice_date.lte = toDate;
      }
    }

    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      orderBy: [
        { invoice_date: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        ref_id: true,
        invoice_date: true,
        due_date: true,
        status: true,
        total_amount: true,
        paid_amount: true,
        balance_due: true,
        currency: true,
      },
    });

    let totalOutstanding = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;

    const formattedInvoices = invoices.map((inv) => {
      const total = Number(inv.total_amount) || 0;
      const paid = Number(inv.paid_amount) || 0;
      const balance = Number(inv.balance_due) || 0;

      if (inv.status !== 'Draft' && inv.status !== 'Void') {
        totalInvoiced += total;
        totalPaid += paid;
        totalOutstanding += balance;
      }

      return {
        id: inv.id,
        ref_id: inv.ref_id,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        status: inv.status,
        total_amount: total,
        paid_amount: paid,
        balance_due: balance,
        currency: inv.currency,
      };
    });

    return res.json({
      success: true,
      data: {
        customer: { id: customer.id, name: customer.name },
        invoices: formattedInvoices,
        total_outstanding: totalOutstanding,
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
      },
    });
  } catch (error) {
    logger.error({ err: error, id: req.params.id }, 'Failed to fetch customer statement');
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch customer statement' },
    });
  }
};

export const createCustomer = async (req: Request, res: Response) => {
  try {
    const {
      name,
      contact_phone,
      logo_url,
      primary_contact_person,
      primary_contact_phone,
      secondary_contact_person,
      secondary_contact_phone,
      payment_terms,
      whatsapp_number,
      whatsapp_group_link,
      whatsapp_group_name,
      driver_workflow,
      tracking_enabled,
      tracking_auto_link,
      tracking_show_deadline,
      tracking_show_delay_reason,
      tracking_show_photos,
      isActive,
    } = req.body;
    
    const customer = await (prisma.customer as any).create({
      data: {
        name,
        contact_phone,
        logo_url,
        primary_contact_person,
        primary_contact_phone,
        secondary_contact_person,
        secondary_contact_phone,
        payment_terms,
        whatsapp_number,
        whatsapp_group_link,
        whatsapp_group_name,
        driver_workflow: driver_workflow || 'NATIVE',
        tracking_enabled,
        tracking_auto_link,
        tracking_show_deadline,
        tracking_show_delay_reason,
        tracking_show_photos,
        isActive: isActive ?? true,
        created_by: (req as any).user?.id
      }
    });
    
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create customer' } });
  }
};

export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const updated = await prisma.customer.update({
      where: { id: req.params.id as string },
      data: {
        ...req.body,
        updated_by: (req as any).user?.id
      }
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update customer' } });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    }

    // Trips still on the road or booked can't lose their customer.
    const openTrips = await prisma.trip.count({
      where: { customerId: id, deletedAt: null, status: { in: ['Draft', 'Scheduled', 'Loading', 'InTransit', 'Delayed'] as any } },
    });
    if (openTrips > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CUSTOMER_IN_USE',
          message: `${customer.name} has ${openTrips} open trip${openTrips === 1 ? '' : 's'}. Finish or cancel ${openTrips === 1 ? 'it' : 'them'} first.`,
        },
      });
    }

    // Soft delete, like trips: finished trips, quotations and locations stay
    // linked, and the Recycle bin can restore it (or delete it for good).
    await prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), deleted_by: getValidUuid((req as any).user?.id), isActive: false },
    });

    res.json({ success: true, data: { message: `${customer.name} moved to the Recycle bin` } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete customer' } });
  }
};

export const bulkImportCustomers = async (req: Request, res: Response) => {
  try {
    const { rows } = req.body as { rows: Record<string, any>[] };
    const userId = (req as any).user?.id;
    const results: any[] = [];

    for (let i = 0; i < (rows || []).length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      const label = row.name ? String(row.name).trim() : `Row ${rowNumber}`;

      try {
        if (!row.name || !String(row.name).trim()) {
          results.push({ row: rowNumber, success: false, label, error: 'Company Name is missing' });
          continue;
        }

        const name = String(row.name).trim();
        const contact_phone = String(row.contact_phone || row.phone || '').trim();

        if (!contact_phone) {
          results.push({ row: rowNumber, success: false, label, error: 'Primary Contact Phone is missing' });
          continue;
        }

        const existing = await prisma.customer.findFirst({
          where: {
            OR: [
              { contact_phone: contact_phone },
              { name: { equals: name, mode: 'insensitive' } }
            ]
          }
        });

        if (existing) {
          await prisma.customer.update({
            where: { id: existing.id },
            data: {
              name,
              contact_phone,
              ...(existing.deletedAt ? { deletedAt: null, deleted_by: null, isActive: true } : {}),
              updated_by: userId,
            }
          });
          results.push({ row: rowNumber, success: true, label, action: 'updated' });
        } else {
          const created = await prisma.customer.create({
            data: {
              name,
              contact_phone,
              created_by: userId,
            }
          });
          results.push({ row: rowNumber, success: true, label, action: 'created' });
        }
      } catch (err: any) {
        results.push({ row: rowNumber, success: false, label, error: err.message || 'Could not import customer' });
      }
    }

    const created = results.filter(r => r.success && r.action === 'created').length;
    const updated = results.filter(r => r.success && r.action === 'updated').length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      data: {
        total: rows.length,
        created,
        updated,
        failed,
        results
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to import customers' } });
  }
};
