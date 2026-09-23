import { Request, Response } from 'express';
import { prisma } from '../db';
import { buildSearchAnd } from '../utils/search';
import { logger } from '../utils/logger';

const CUSTOMER_SEARCH_FIELDS = ['name', 'contact_phone'];

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const { is_active, search, page = '1', per_page = '20' } = req.query;
    
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

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: [
          { trips: { _count: 'desc' } },
          { name: 'asc' },
        ],
        include: { _count: { select: { trips: true } } },
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
      include: { trips: { take: 5, orderBy: { createdAt: 'desc' } } }
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
    const tripCount = await prisma.trip.count({ where: { customerId: id } });

    if (tripCount > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CUSTOMER_IN_USE',
          message: `Cannot delete customer because they have ${tripCount} trip(s) linked.`
        }
      });
    }

    // Hard delete associated non-operational items like locations & surcharge rules, then the customer
    await prisma.$transaction([
      prisma.surchargeRule.deleteMany({ where: { customerId: id } }),
      prisma.location.deleteMany({ where: { customerId: id } }),
      prisma.reportTemplate.deleteMany({ where: { customerId: id } }),
      prisma.customer.delete({ where: { id } })
    ]);

    res.json({ success: true, data: { message: 'Customer permanently deleted successfully' } });
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
