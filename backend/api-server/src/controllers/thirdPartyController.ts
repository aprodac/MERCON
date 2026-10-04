import { Request, Response } from 'express';
import { prisma } from '../db';
import { buildSearchAnd } from '../utils/search';
import { TripStatus } from '@prisma/client';

const THIRD_PARTY_SEARCH_FIELDS = ['name', 'contact_person', 'phone', 'email', 'tax_id'];

// Trip statuses that mean the trip is actively started and in progress.
const ACTIVE_TRIP_STATUSES = ['Loading', 'InTransit', 'Delayed'];

export const getThirdPartyProviders = async (req: Request, res: Response) => {
  try {
    const { is_active, search, page = '1', per_page = '50' } = req.query;

    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = { deletedAt: null };
    if (is_active !== undefined) {
      whereClause.isActive = is_active === 'true';
    }

    const searchAnd = buildSearchAnd(search, THIRD_PARTY_SEARCH_FIELDS);
    if (searchAnd.length > 0) {
      whereClause.AND = searchAnd;
    }

    const [providers, total] = await Promise.all([
      prisma.thirdPartyProvider.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { subcontracts: { where: { trip: { deletedAt: null } } } },
          },
        },
      }),
      prisma.thirdPartyProvider.count({ where: whereClause }),
    ]);

    const providerIds = providers.map((p: any) => p.id);
    const [activeByProvider, totalsByProvider] = providerIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.tripSubcontract.groupBy({
            by: ['providerId'],
            where: {
              providerId: { in: providerIds },
              trip: { status: { in: ACTIVE_TRIP_STATUSES as TripStatus[] }, deletedAt: null },
            },
            _count: { _all: true },
          }),
          prisma.tripSubcontract.groupBy({
            by: ['providerId'],
            where: { providerId: { in: providerIds }, trip: { deletedAt: null } },
            _sum: { cost: true },
          }),
        ]);

    const activeCountById = new Map<string, number>(
      activeByProvider.map((row: any) => [row.providerId as string, row._count._all])
    );
    const totalsById = new Map<string, { cost: number }>(
      totalsByProvider.map((row: any) => [
        row.providerId as string,
        { cost: Number(row._sum.cost ?? 0) },
      ])
    );

    const formattedProviders = providers.map((provider: any) => ({
      ...provider,
      total_trips: provider._count?.subcontracts || 0,
      active_trips: activeCountById.get(provider.id) || 0,
      total_cost: totalsById.get(provider.id)?.cost || 0,
      total_revenue: 0,
    }));

    res.json({
      success: true,
      data: formattedProviders,
      meta: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch third party providers:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch third party providers' } });
  }
};

export const getThirdPartyStats = async (_req: Request, res: Response) => {
  try {
    const where = { deletedAt: null };
    const [total, active, tripTotals] = await Promise.all([
      prisma.thirdPartyProvider.count({ where }),
      prisma.thirdPartyProvider.count({ where: { ...where, isActive: true } }),
      prisma.tripSubcontract.aggregate({
        where: { providerId: { not: null }, trip: { deletedAt: null } },
        _count: { _all: true },
        _sum: { cost: true },
      }),
    ]);

    const totalCost = Number(tripTotals._sum.cost ?? 0);

    res.json({
      success: true,
      data: {
        total,
        active,
        inactive: total - active,
        total_trips: tripTotals._count._all,
        total_cost: totalCost,
        total_revenue: 0,
        net_profit: 0 - totalCost,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to compute third-party stats' } });
  }
};

export const getThirdPartyProviderById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const provider: any = await prisma.thirdPartyProvider.findFirst({
      where: { id, deletedAt: null },
      include: {
        subcontracts: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            trip: {
              include: {
                customer: true,
                // Just enough of the route to label the trip "from → to".
                stops: {
                  orderBy: { stop_sequence: 'asc' },
                  select: { stop_sequence: true, stop_type: true, location_name: true, location: { select: { name: true, city: true } } },
                },
              },
            },
          },
        },
        _count: { select: { subcontracts: true } },
      },
    });

    if (!provider) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Third-party provider not found' } });
    }

    const activeTripsCount = await prisma.tripSubcontract.count({
      where: {
        providerId: provider.id,
        trip: {
          status: { in: ['Scheduled', 'Loading', 'InTransit', 'Delayed'] },
          deletedAt: null,
        },
      },
    });

    const totalCostAggregate = await prisma.tripSubcontract.aggregate({
      where: {
        providerId: provider.id,
        trip: { deletedAt: null },
      },
      _sum: {
        cost: true,
      },
    });

    res.json({
      success: true,
      data: {
        ...provider,
        // Each trip carries what this carrier is paid for it (the subcontract's cost).
        trips: (provider.subcontracts || []).map((sc: any) => ({ ...sc.trip, third_party_cost: sc.cost })),
        total_trips: provider._count?.subcontracts || 0,
        active_trips: activeTripsCount,
        total_cost: totalCostAggregate._sum.cost || 0,
        total_revenue: 0,
      },
    });
  } catch (error) {
    console.error('Failed to fetch third party provider:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch third party provider' } });
  }
};

export const createThirdPartyProvider = async (req: Request, res: Response) => {
  try {
    const { name, contact_person, phone, email, address, tax_id, notes, rating } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Provider name is required' } });
    }

    const existing = await prisma.thirdPartyProvider.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' }, deletedAt: null },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_EXISTS', message: 'A provider with this name already exists' } });
    }

    const provider = await prisma.thirdPartyProvider.create({
      data: {
        name: name.trim(),
        contact_person: contact_person?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        tax_id: tax_id?.trim() || null,
        notes: notes?.trim() || null,
        rating: typeof rating === 'number' ? rating : 5.0,
      },
    });

    res.status(201).json({ success: true, data: provider });
  } catch (error) {
    console.error('Failed to create third party provider:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create third party provider' } });
  }
};

export const updateThirdPartyProvider = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, contact_person, phone, email, address, tax_id, notes, rating, isActive } = req.body;

    const existing = await prisma.thirdPartyProvider.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.thirdPartyProvider.findFirst({
        where: { name: { equals: name.trim(), mode: 'insensitive' }, deletedAt: null, id: { not: id } },
      });
      if (duplicate) {
        return res.status(400).json({ success: false, error: { code: 'ALREADY_EXISTS', message: 'Another provider with this name already exists' } });
      }
    }

    const updated = await prisma.thirdPartyProvider.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(contact_person !== undefined && { contact_person: contact_person?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(tax_id !== undefined && { tax_id: tax_id?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(rating !== undefined && { rating }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update third party provider:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update third party provider' } });
  }
};

export const deleteThirdPartyProvider = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.thirdPartyProvider.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    await prisma.$transaction([
      prisma.tripSubcontract.updateMany({ where: { providerId: id }, data: { providerId: null } }),
      prisma.thirdPartyProvider.delete({ where: { id } })
    ]);

    res.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    console.error('Failed to delete third party provider:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete third party provider' } });
  }
};

export const bulkImportThirdPartyProviders = async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Rows array is required' } });
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const results: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row.name || row.provider_name || row.company || '').trim();

      if (!name) {
        failed++;
        results.push({ row: i + 1, success: false, error: 'Provider name is required' });
        continue;
      }

      try {
        const existing = await prisma.thirdPartyProvider.findFirst({
          where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
        });

        if (existing) {
          await prisma.thirdPartyProvider.update({
            where: { id: existing.id },
            data: {
              ...(row.contact_person && { contact_person: String(row.contact_person).trim() }),
              ...(row.phone && { phone: String(row.phone).trim() }),
              ...(row.email && { email: String(row.email).trim() }),
              ...(row.address && { address: String(row.address).trim() }),
              ...(row.tax_id && { tax_id: String(row.tax_id).trim() }),
              ...(row.notes && { notes: String(row.notes).trim() }),
            },
          });
          updated++;
          results.push({ row: i + 1, success: true, label: name, action: 'updated' });
        } else {
          await prisma.thirdPartyProvider.create({
            data: {
              name,
              contact_person: row.contact_person ? String(row.contact_person).trim() : null,
              phone: row.phone ? String(row.phone).trim() : null,
              email: row.email ? String(row.email).trim() : null,
              address: row.address ? String(row.address).trim() : null,
              tax_id: row.tax_id ? String(row.tax_id).trim() : null,
              notes: row.notes ? String(row.notes).trim() : null,
            },
          });
          created++;
          results.push({ row: i + 1, success: true, label: name, action: 'created' });
        }
      } catch (err: any) {
        failed++;
        results.push({ row: i + 1, success: false, label: name, error: err?.message || 'Database error' });
      }
    }

    res.json({
      success: true,
      data: {
        total: rows.length,
        created,
        updated,
        failed,
        results,
      },
    });
  } catch (error) {
    console.error('Failed to bulk import third party providers:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to bulk import third party providers' } });
  }
};

// ============================================================================
// PROVIDER RATE CARD CRUD & DETERMINISTIC MATCHING ENGINE
// ============================================================================

export const getProviderRates = async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.providerId || req.params.id || '');
    const { status, search } = req.query;

    const whereClause: any = {
      providerId,
      deletedAt: null,
    };

    if (status && typeof status === 'string') {
      whereClause.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const query = search.trim();
      whereClause.OR = [
        { origin_city: { contains: query, mode: 'insensitive' } },
        { destination_city: { contains: query, mode: 'insensitive' } },
        { vehicle_class: { contains: query, mode: 'insensitive' } },
        { line_type: { contains: query, mode: 'insensitive' } },
      ];
    }

    const rates = await prisma.providerRateCard.findMany({
      where: whereClause,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        originLocation: { select: { id: true, name: true, city: true } },
        destinationLocation: { select: { id: true, name: true, city: true } },
      },
    });

    res.json({ success: true, data: rates });
  } catch (error) {
    console.error('Failed to fetch provider rates:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch provider rates' } });
  }
};

export const createProviderRateCard = async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.providerId || req.body.providerId || '');
    const {
      origin_city,
      destination_city,
      originLocationId,
      destinationLocationId,
      vehicle_class,
      line_type,
      operation_type,
      pricing_basis = 'Per Trip',
      cost,
      valid_from,
      valid_to,
      status = 'active',
    } = req.body;

    if (!providerId) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'providerId is required' } });
    }
    if (!origin_city || !destination_city) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'origin_city and destination_city are required' } });
    }
    if (!vehicle_class || !line_type) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'vehicle_class and line_type are required' } });
    }
    if (cost === undefined || cost === null || isNaN(Number(cost)) || Number(cost) < 0) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Valid non-negative cost is required' } });
    }

    if (valid_from && valid_to) {
      if (new Date(valid_from) > new Date(valid_to)) {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'valid_from must be before or equal to valid_to' } });
      }
    }

    const newRate = await prisma.providerRateCard.create({
      data: {
        providerId,
        origin_city: String(origin_city).trim(),
        destination_city: String(destination_city).trim(),
        originLocationId: originLocationId || null,
        destinationLocationId: destinationLocationId || null,
        vehicle_class: String(vehicle_class).trim(),
        line_type: String(line_type).trim(),
        operation_type: operation_type ? String(operation_type).trim() : null,
        pricing_basis: String(pricing_basis).trim(),
        cost: Number(cost),
        valid_from: valid_from ? new Date(valid_from) : null,
        valid_to: valid_to ? new Date(valid_to) : null,
        status: status || 'active',
      },
      include: {
        originLocation: { select: { id: true, name: true, city: true } },
        destinationLocation: { select: { id: true, name: true, city: true } },
      },
    });

    res.status(201).json({ success: true, data: newRate });
  } catch (error) {
    console.error('Failed to create provider rate card:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create provider rate card' } });
  }
};

export const updateProviderRateCard = async (req: Request, res: Response) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id || '') as string;
    const {
      origin_city,
      destination_city,
      originLocationId,
      destinationLocationId,
      vehicle_class,
      line_type,
      operation_type,
      pricing_basis,
      cost,
      valid_from,
      valid_to,
      status,
    } = req.body;

    const existing = await prisma.providerRateCard.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider rate card not found' } });
    }

    if (cost !== undefined && (isNaN(Number(cost)) || Number(cost) < 0)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Cost must be a valid non-negative number' } });
    }

    const updated = await prisma.providerRateCard.update({
      where: { id },
      data: {
        ...(origin_city !== undefined && { origin_city: String(origin_city).trim() }),
        ...(destination_city !== undefined && { destination_city: String(destination_city).trim() }),
        ...(originLocationId !== undefined && { originLocationId: originLocationId || null }),
        ...(destinationLocationId !== undefined && { destinationLocationId: destinationLocationId || null }),
        ...(vehicle_class !== undefined && { vehicle_class: String(vehicle_class).trim() }),
        ...(line_type !== undefined && { line_type: String(line_type).trim() }),
        ...(operation_type !== undefined && { operation_type: operation_type ? String(operation_type).trim() : null }),
        ...(pricing_basis !== undefined && { pricing_basis: String(pricing_basis).trim() }),
        ...(cost !== undefined && { cost: Number(cost) }),
        ...(valid_from !== undefined && { valid_from: valid_from ? new Date(valid_from) : null }),
        ...(valid_to !== undefined && { valid_to: valid_to ? new Date(valid_to) : null }),
        ...(status !== undefined && { status }),
      },
      include: {
        originLocation: { select: { id: true, name: true, city: true } },
        destinationLocation: { select: { id: true, name: true, city: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update provider rate card:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update provider rate card' } });
  }
};

export const deleteProviderRateCard = async (req: Request, res: Response) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id || '') as string;
    const existing = await prisma.providerRateCard.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider rate card not found' } });
    }

    await prisma.providerRateCard.update({
      where: { id },
      data: {
        status: 'archived',
        deletedAt: new Date(),
      },
    });

    res.json({ success: true, message: 'Provider rate card archived successfully' });
  } catch (error) {
    console.error('Failed to delete provider rate card:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete provider rate card' } });
  }
};

export const matchProviderRateCard = async (req: Request, res: Response) => {
  try {
    const {
      providerId,
      origin,
      origin_city,
      originLocationId,
      destination,
      destination_city,
      destinationLocationId,
      vehicle_class,
      vehicle_type,
      line_type,
      rate_category,
      operation_type,
      billing_type,
      pricing_basis,
      target_date,
    } = req.body;

    if (!providerId) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'providerId is required for rate matching' } });
    }

    const norm = (s?: string | null) => String(s || '').toLowerCase().replace(/[\s,_()[\]\/{}\-.]/g, '');
    const normalizeLineTypeToken = (s?: string | null): string => {
      if (!s) return '';
      const str = String(s).toUpperCase().replace(/_/g, ' ');
      if (str.includes('10')) return '10_HRS';
      if (str.includes('12')) return '12_HRS';
      if (str.includes('ROUND')) return 'ROUND_TRIP';
      if (str.includes('SINGLE')) return 'SINGLE_TRIP';
      return str.replace(/[\s,_()[\]\/{}\-.]/g, '');
    };

    const normalizeBillingType = (s?: string | null): string => {
      if (!s) return '';
      const str = String(s).toLowerCase();
      if (str.includes('month')) return 'monthly';
      if (str.includes('extra') || str.includes('spot')) return 'extra';
      return str;
    };

    const targetOrigCity = origin_city || origin || '';
    const targetDestCity = destination_city || destination || '';
    const targetVehicle = vehicle_class || vehicle_type || '';
    const targetLine = line_type || rate_category || '';
    const targetOp = normalizeBillingType(operation_type || billing_type);
    const targetBasis = pricing_basis || (targetOp === 'monthly' ? 'Per Month' : 'Per Trip');
    const targetTime = target_date ? new Date(target_date).getTime() : Date.now();

    const candidateCards = await prisma.providerRateCard.findMany({
      where: {
        providerId,
        status: 'active',
        deletedAt: null,
      },
      include: {
        originLocation: { select: { id: true, name: true, city: true } },
        destinationLocation: { select: { id: true, name: true, city: true } },
      },
    });

    const validCards = candidateCards.filter((rc: any) => {
      // 1. Date Validity Check
      if (rc.valid_from && new Date(rc.valid_from).getTime() > targetTime) return false;
      if (rc.valid_to && new Date(rc.valid_to).getTime() < targetTime) return false;

      // 2. Pricing Basis Exact Match Requirement
      if (rc.pricing_basis && norm(rc.pricing_basis) !== norm(targetBasis)) return false;

      // 3. Vehicle Class Match
      if (targetVehicle && rc.vehicle_class) {
        const rcV = norm(rc.vehicle_class);
        const tV = norm(targetVehicle);
        if (rcV !== tV) return false;
      }

      // 4. Line Type Match
      if (targetLine && rc.line_type) {
        const rcL = normalizeLineTypeToken(rc.line_type);
        const tL = normalizeLineTypeToken(targetLine);
        if (rcL !== tL) return false;
      }

      // 5. Operation Type Rule: Never match a rate with a conflicting explicit operation type
      if (rc.operation_type && targetOp) {
        const rcOp = normalizeBillingType(rc.operation_type);
        if (rcOp && rcOp !== targetOp) return false;
      }

      // 6. Route Match
      const matchOrigin =
        (originLocationId && rc.originLocationId && rc.originLocationId === originLocationId) ||
        (targetOrigCity && norm(rc.origin_city) === norm(targetOrigCity)) ||
        (targetOrigCity && norm(rc.origin_city).includes(norm(targetOrigCity))) ||
        (targetOrigCity && norm(targetOrigCity).includes(norm(rc.origin_city)));

      const matchDest =
        (destinationLocationId && rc.destinationLocationId && rc.destinationLocationId === destinationLocationId) ||
        (targetDestCity && norm(rc.destination_city) === norm(targetDestCity)) ||
        (targetDestCity && norm(rc.destination_city).includes(norm(targetDestCity))) ||
        (targetDestCity && norm(targetDestCity).includes(norm(rc.destination_city)));

      return matchOrigin && matchDest;
    });

    if (validCards.length === 0) {
      return res.json({ success: true, data: null, message: 'No matching provider rate card found' });
    }

    // Rank candidate cards:
    // Rank 1: Location ID exact match + exact operation_type match
    // Rank 2: City corridor match + exact operation_type match
    // Rank 3: Location ID exact match + operation_type IS NULL (wildcard)
    // Rank 4: City corridor match + operation_type IS NULL (wildcard)
    const rankedCards = validCards.map((rc: any) => {
      const locExact = Boolean(originLocationId && destinationLocationId && rc.originLocationId === originLocationId && rc.destinationLocationId === destinationLocationId);
      const opExact = Boolean(rc.operation_type && targetOp && normalizeBillingType(rc.operation_type) === targetOp);

      let rank = 4;
      if (locExact && opExact) rank = 1;
      else if (!locExact && opExact) rank = 2;
      else if (locExact && !rc.operation_type) rank = 3;
      else rank = 4;

      return { card: rc, rank };
    });

    rankedCards.sort((a: any, b: any) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return new Date(b.card.updatedAt).getTime() - new Date(a.card.updatedAt).getTime();
    });

    const bestMatch = rankedCards[0].card;

    res.json({
      success: true,
      data: bestMatch,
      matched_rank: rankedCards[0].rank,
    });
  } catch (error) {
    console.error('Failed to match provider rate card:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to match provider rate card' } });
  }
};

export const getPreviousDrivers = async (req: Request, res: Response) => {
  try {
    const providerId = req.params.providerId as string;

    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'providerId is required' },
      });
    }

    const subcontracts = await prisma.tripSubcontract.findMany({
      where: {
        providerId,
        trip: { deletedAt: null },
        OR: [
          { driverName: { not: null } },
          { driverPhone: { not: null } },
          { vehiclePlate: { not: null } },
        ],
      },
      select: {
        driverName: true,
        driverPhone: true,
        vehiclePlate: true,
        vehicleType: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const seen = new Set<string>();
    const deduplicated: Array<{
      driverName: string | null;
      driverPhone: string | null;
      vehiclePlate: string | null;
      vehicleType: string | null;
    }> = [];

    const norm = (str?: string | null) => (str ? str.trim().toLowerCase().replace(/[\s\-_()]/g, '') : '');

    for (const item of subcontracts) {
      const nameNorm = norm(item.driverName);
      const phoneNorm = norm(item.driverPhone);
      const plateNorm = norm(item.vehiclePlate);

      const identityKey = `${nameNorm}|${phoneNorm}|${plateNorm}`;

      if (!identityKey.replace(/\|/g, '')) {
        continue;
      }

      if (!seen.has(identityKey)) {
        seen.add(identityKey);
        deduplicated.push({
          driverName: item.driverName ? item.driverName.trim() : null,
          driverPhone: item.driverPhone ? item.driverPhone.trim() : null,
          vehiclePlate: item.vehiclePlate ? item.vehiclePlate.trim() : null,
          vehicleType: item.vehicleType ? item.vehicleType.trim() : null,
        });
      }
    }

    res.json({
      success: true,
      data: deduplicated,
    });
  } catch (error) {
    console.error('Failed to fetch 3PL previous drivers:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch previous drivers' },
    });
  }
};


