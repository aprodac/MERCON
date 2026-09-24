import { Request, Response } from 'express';
import { Prisma, CoordinatePrecision } from '@prisma/client';
import { prisma } from '../db';
import { getValidUuid } from '../utils/uuid';
import { buildSearchAnd } from '../utils/search';

const LOCATION_SEARCH_FIELDS = ['name', 'code', 'address', 'city'];

export const toSlug = (name: string) =>
  String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const generateLocationCode = (name: string): string => {
  return String(name || '').trim().toUpperCase();
};

export const resolvePrecision = (
  lat: number | null | undefined,
  lng: number | null | undefined,
  requestedPrecision?: CoordinatePrecision | null
): CoordinatePrecision => {
  if (lat == null || lng == null) {
    return CoordinatePrecision.UNKNOWN;
  }
  if (requestedPrecision && (requestedPrecision === CoordinatePrecision.EXACT || requestedPrecision === CoordinatePrecision.APPROXIMATE)) {
    return requestedPrecision;
  }
  return CoordinatePrecision.APPROXIMATE;
};

export const resolveLocation = async (
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    id?: string | null;
    customerId?: string | null;
    code?: string | null;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    lat?: number | null;
    lng?: number | null;
    coordinate_precision?: CoordinatePrecision | null;
    skipCanonicalUpdate?: boolean;
  },
  userId?: string | null
) => {
  const validUserId = getValidUuid(userId);
  const idToUse = getValidUuid(input.id);
  const customerIdToUse = getValidUuid(input.customerId) || undefined;

  if (idToUse) {
    const existing = await tx.location.findFirst({ where: { id: idToUse } });
    if (existing) return existing;
    // If idToUse was passed but not found, fallback to name resolution
  }

  const name = String(input.name || '').trim();
  if (!name) return null;

  const slug = toSlug(name);
  const inputCode = input.code ? String(input.code).trim().toUpperCase() : null;

  let cleanName = name;
  let prefixCode: string | null = null;
  const prefixMatch = name.match(/^([A-Za-z0-9_]+)\s*[\-:]\s*(.+)$/);
  if (prefixMatch) {
    prefixCode = prefixMatch[1].trim().toUpperCase();
    cleanName = prefixMatch[2].trim();
  }
  const cleanSlug = toSlug(cleanName);

  if (inputCode && customerIdToUse) {
    const codeClash = await tx.location.findFirst({
      where: {
        customerId: customerIdToUse,
        code: { equals: inputCode, mode: 'insensitive' as const },
        ...(idToUse ? { id: { not: idToUse } } : {}),
        deletedAt: null,
      },
    });

    if (codeClash && (!idToUse || codeClash.id !== idToUse)) {
      if (codeClash.name.trim().toLowerCase() !== name.toLowerCase()) {
        throw new Error(`LOCATION_CODE_DUPLICATE: Location code "${inputCode}" is already in use for this customer.`);
      }
    }
  }

  // 1. Search for existing location by exact Code, Slug, or exact Name (customer-scoped when customerIdToUse is provided)
  // Strips leading "CODE - " prefix so e.g. "RUH - Riyadh" matches Location code "RUH" or name "Riyadh".
  let found = await tx.location.findFirst({
    where: {
      ...(customerIdToUse ? { customerId: customerIdToUse } : {}),
      OR: [
        { slug },
        { slug: cleanSlug },
        { name: { equals: name, mode: 'insensitive' as const } },
        { name: { equals: cleanName, mode: 'insensitive' as const } },
        { code: { equals: name, mode: 'insensitive' as const } },
        { code: { equals: cleanName, mode: 'insensitive' as const } },
        ...(prefixCode ? [{ code: { equals: prefixCode, mode: 'insensitive' as const } }] : []),
        ...(inputCode ? [{ code: { equals: inputCode, mode: 'insensitive' as const } }] : []),
      ],
      deletedAt: null,
    },
  });

  // 2. Advanced Fuzzy / Token / City Alias Search if direct exact match failed
  if (!found) {
    const candidates = await tx.location.findMany({
      where: {
        deletedAt: null,
        ...(customerIdToUse ? { customerId: customerIdToUse } : {}),
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    let customerName = '';
    if (customerIdToUse) {
      const cust = await tx.customer.findFirst({ where: { id: customerIdToUse }, select: { name: true } });
      if (cust) customerName = cust.name;
    }

    const rawUpper = name.toUpperCase().trim();
    const stripWords = [
      customerName.toUpperCase(),
      'IMILE', 'JDL', 'SHIPA', 'AKS', 'GFS', 'RTL', 'HORIZON', 'ARKAN', 'BARWAN',
      'STATION', 'DC', 'HUB', 'AIRPORT', 'LOGISTICS', 'SAUDI', 'DELIVERY', 'LIMITED', 'LLC', 'COMPANY'
    ].filter(Boolean);

    let stripped = rawUpper;
    for (const w of stripWords) {
      if (w.length >= 2) {
        stripped = stripped.replace(new RegExp(`\\b${w.replace(/[-[\]{}()*+?.:\\^$|#\s]/g, '\\$&')}\\b`, 'gi'), '').trim();
      }
    }
    stripped = stripped.replace(/\s+/g, ' ').trim();

    const tokens = rawUpper.split(/[\s\-_,]+/).filter(t => t.length >= 2);
    const strippedTokens = (stripped || rawUpper).split(/[\s\-_,]+/).filter(t => t.length >= 2);

    const cityMap: Record<string, string[]> = {
      'RUH': ['RIYADH', 'RDC', 'CDC', 'RUH', 'RYD'],
      'JED': ['JEDDAH', 'JED', 'JDS', 'JNS', 'JKS', 'JES'],
      'DMM': ['DAMMAM', 'DMM', 'DDC', 'DAHRAN'],
      'KHA': ['KHAMIS', 'KHAMIS MUSHAIT', 'KHA'],
      'ABH': ['ABHA', 'ABH'],
      'HAIL': ['HAIL', 'HAD'],
      'BUR': ['BURAIDAH', 'BURAYDAH', 'BUR', 'BUS'],
      'UNZ': ['UNAYZAH', 'ONAIZAH', 'UNZ'],
      'TAIF': ['TAIF', 'TIF', 'TAI'],
      'HOF': ['HOFUF', 'AL HASA', 'AL-HOFUF', 'HOF', 'AHS', 'ALH', 'ALL'],
      'QUR': ['QURAYYAT', 'GURAYYAT', 'QUR'],
      'BAH': ['AL BAHA', 'BAHA', 'BAH'],
      'MED': ['MADINAH', 'MEDINA', 'MED', 'MDC', 'MAA'],
      'YNB': ['YANBU', 'YNB'],
      'TUU': ['TABUK', 'TUU'],
      'JUB': ['JUBAIL', 'JUB'],
      'NAJ': ['NAJRAN', 'NAJ'],
      'JIZ': ['JIZAN', 'JAZAN', 'JIZ'],
      'MUH': ['MUHAYIL', 'MUHAYIL AL ANM', 'MUH', 'MUL'],
      'DWD': ['DUWADIMI', 'DWD', 'DUS'],
      'HAB': ['HAFAR', 'HAFAR AL BATIN', 'HAB'],
      'WAD': ['WADI', 'WADI AD DAWASIR', 'WAD'],
    };

    const scoreCandidate = (loc: typeof candidates[0]) => {
      const locCodeUpper = (loc.code || '').toUpperCase().trim();
      const locNameUpper = (loc.name || '').toUpperCase().trim();
      const locCityUpper = (loc.city || '').toUpperCase().trim();
      const sameCustomer = customerIdToUse && loc.customerId === customerIdToUse;

      // 1. Code match
      if (locCodeUpper && (rawUpper === locCodeUpper || (stripped && stripped === locCodeUpper))) {
        return sameCustomer ? 100 : 90;
      }
      if (locCodeUpper && tokens.includes(locCodeUpper)) {
        return sameCustomer ? 95 : 85;
      }
      if (locCodeUpper && strippedTokens.includes(locCodeUpper)) {
        return sameCustomer ? 95 : 85;
      }

      // 2. City dictionary match
      for (const [key, aliases] of Object.entries(cityMap)) {
        const inputMatchesCity = tokens.some(t => aliases.includes(t)) || aliases.some(a => rawUpper.includes(a) || (stripped && stripped.includes(a)));
        const locMatchesCity = aliases.includes(locCodeUpper) || aliases.some(a => locNameUpper.includes(a) || locCityUpper.includes(a));
        if (inputMatchesCity && locMatchesCity) {
          return sameCustomer ? 80 : 70;
        }
      }

      // 3. Substring match
      if (stripped.length >= 3) {
        if (locNameUpper.includes(stripped) || locCityUpper.includes(stripped)) {
          return sameCustomer ? 75 : 65;
        }
        if (locCodeUpper.length >= 3 && stripped.includes(locCodeUpper)) {
          return sameCustomer ? 70 : 60;
        }
      }

      return 0;
    };

    let bestScore = 0;
    let bestLoc: typeof candidates[0] | null = null;

    for (const loc of candidates) {
      const score = scoreCandidate(loc);
      if (score > bestScore) {
        bestScore = score;
        bestLoc = loc;
      }
    }

    if (bestLoc && bestScore >= 60) {
      found = bestLoc;
    }
  }

  const precision = resolvePrecision(input.lat, input.lng, input.coordinate_precision);

  if (found) {
    if (input.skipCanonicalUpdate && !found.deletedAt && found.is_active) {
      return found;
    }
    const isSoftDeleted = found.deletedAt !== null || !found.is_active;

    let canUpdateCode = false;
    if (inputCode && inputCode !== found.code) {
      const codeInUse = await tx.location.findFirst({
        where: {
          ...(customerIdToUse ? { customerId: customerIdToUse } : {}),
          code: { equals: inputCode, mode: 'insensitive' as const },
          id: { not: found.id },
        },
      });
      if (!codeInUse) {
        canUpdateCode = true;
      }
    }

    const updateData: Prisma.LocationUpdateInput = {
      ...(isSoftDeleted ? { deletedAt: null, is_active: true, deleted_by: null } : {}),
      ...(input.lat != null ? { lat: input.lat } : {}),
      ...(input.lng != null ? { lng: input.lng } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.postalCode ? { postalCode: input.postalCode } : {}),
      ...(canUpdateCode && inputCode ? { code: inputCode } : {}),
      coordinate_precision: precision !== CoordinatePrecision.UNKNOWN ? precision : found.coordinate_precision,
      updated_by: validUserId,
    };

    return tx.location.update({
      where: { id: found.id },
      data: updateData,
    });
  }

  if (!customerIdToUse) {
    return null;
  }

  // 2. Generating code & ensuring slug uniqueness for new creation
  const baseCode = inputCode || generateLocationCode(name);
  let codeToUse = baseCode;
  let codeIdx = 2;
  while (await tx.location.findFirst({ where: { customerId: customerIdToUse, code: codeToUse } })) {
    codeToUse = `${baseCode}-${codeIdx}`;
    codeIdx++;
  }

  let slugToUse = slug;
  let slugIdx = 1;
  while (await tx.location.findFirst({ where: { customerId: customerIdToUse, slug: slugToUse } })) {
    slugToUse = `${slug}-${slugIdx}`;
    slugIdx++;
  }

  return tx.location.create({
    data: {
      customerId: customerIdToUse,
      code: codeToUse,
      name,
      slug: slugToUse,
      address: input.address ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      lat: precision === CoordinatePrecision.UNKNOWN ? null : (input.lat ?? null),
      lng: precision === CoordinatePrecision.UNKNOWN ? null : (input.lng ?? null),
      coordinate_precision: precision,
      created_by: validUserId,
    },
  });
};

export const getLocations = async (req: Request, res: Response) => {
  try {
    const { search, active_only, customerId, customer_id, coordinate_precision } = req.query;
    const rawCustId = (customerId || customer_id) as string;
    const targetCustomerId = rawCustId ? getValidUuid(rawCustId) : null;

    const whereClause: any = { deletedAt: null };
    if (targetCustomerId) whereClause.customerId = targetCustomerId;
    if (active_only === 'true') whereClause.is_active = true;
    if (coordinate_precision && Object.values(CoordinatePrecision).includes(coordinate_precision as any)) {
      whereClause.coordinate_precision = coordinate_precision;
    }

    const searchAnd = buildSearchAnd(search, LOCATION_SEARCH_FIELDS);
    if (searchAnd.length > 0) whereClause.AND = searchAnd;

    const locations = await prisma.location.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      include: {
        customer: { select: { id: true, name: true } },
        _count: {
          select: {
            quotationStops: true,
            tripStops: { where: { deletedAt: null } },
          },
        },
      },
    });

    res.json({ success: true, data: locations });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch locations' } });
  }
};

export const getLocationById = async (req: Request, res: Response) => {
  try {
    const location = await prisma.location.findFirst({
      where: { id: req.params.id as string },
      include: {
        customer: { select: { id: true, name: true } },
        _count: {
          select: {
            quotationStops: true,
            tripStops: { where: { deletedAt: null } },
          },
        },
        quotationStops: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            quotation: {
              select: {
                id: true,
                name: true,
                is_active: true,
                rate: true,
                currency: true,
                operation_type: true,
                vehicle_class: true,
                customer: { select: { id: true, name: true } },
                stops: {
                  orderBy: { sequence: 'asc' },
                  include: {
                    location: { select: { id: true, name: true, code: true } }
                  }
                }
              }
            }
          }
        },
        tripStops: {
          take: 20,
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            trip: {
              select: {
                id: true,
                ref_id: true,
                status: true,
                planned_start: true,
                actual_start: true,
                billing_amount: true,
                customer: { select: { id: true, name: true } },
                stops: {
                  orderBy: { stop_sequence: 'asc' },
                  select: {
                    id: true,
                    stop_sequence: true,
                    stop_type: true,
                    location_name: true,
                    location_lat: true,
                    location_lng: true,
                    location: { select: { id: true, name: true, code: true } }
                  }
                }
              }
            }
          }
        }
      },
    });
    if (!location) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Location not found' } });
    }
    res.json({ success: true, data: location });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to fetch location' } });
  }
};

export const createLocation = async (req: Request, res: Response) => {
  try {
    const { name, customerId, customer_id, code, address, city, postalCode, lat, lng, coordinate_precision } = req.body;
    const rawCustId = (customerId || customer_id) as string;
    const targetCustomerId = rawCustId ? getValidUuid(rawCustId) : null;

    if (!targetCustomerId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Please select a customer for this location' } });
    }
    if (!String(name || '').trim()) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Location name is required' } });
    }

    const numericLat = lat === undefined || lat === null || lat === '' ? null : Number(lat);
    const numericLng = lng === undefined || lng === null || lng === '' ? null : Number(lng);

    if ((coordinate_precision === CoordinatePrecision.EXACT || coordinate_precision === CoordinatePrecision.APPROXIMATE) && (numericLat == null || numericLng == null)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Coordinates are required for EXACT or APPROXIMATE precision.' },
      });
    }

    const precision = resolvePrecision(numericLat, numericLng, coordinate_precision);

    const location = await resolveLocation(
      prisma,
      {
        customerId: targetCustomerId,
        code,
        name,
        address: String(address || '').trim() || null,
        city: String(city || '').trim() || null,
        postalCode: String(postalCode || '').trim() || null,
        lat: numericLat,
        lng: numericLng,
        coordinate_precision: precision,
      },
      (req as any).user?.id
    );

    res.status(201).json({ success: true, data: location });
  } catch (error: any) {
    const isDuplicate = error.message?.startsWith('LOCATION_CODE_DUPLICATE');
    res.status(isDuplicate ? 409 : 500).json({
      success: false,
      error: {
        code: isDuplicate ? 'DUPLICATE' : 'SERVER_ERROR',
        message: error.message ? error.message.replace('LOCATION_CODE_DUPLICATE: ', '') : 'Failed to create location',
      },
    });
  }
};

export const updateLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, address, city, postalCode, lat, lng, coordinate_precision, is_active } = req.body;

    const existing = await prisma.location.findFirst({ where: { id: id as string } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Location not found' } });
    }

    const trimmedName = name === undefined ? undefined : String(name).trim();
    if (trimmedName !== undefined && !trimmedName) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Location name cannot be empty' } });
    }

    const newSlug = trimmedName !== undefined ? toSlug(trimmedName) : existing.slug;
    const newCode = code !== undefined ? String(code).trim().toUpperCase() : existing.code;

    if (newCode !== existing.code) {
      const codeClash = await prisma.location.findFirst({
        where: { customerId: existing.customerId, code: newCode, id: { not: existing.id } }
      });
      if (codeClash) {
        return res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE', message: `Code "${newCode}" is already in use for this customer.` },
        });
      }
    }

    const nextLat = lat !== undefined ? (lat === null || lat === '' ? null : Number(lat)) : existing.lat;
    const nextLng = lng !== undefined ? (lng === null || lng === '' ? null : Number(lng)) : existing.lng;
    const requestedPrecision = coordinate_precision !== undefined ? coordinate_precision : existing.coordinate_precision;

    if ((requestedPrecision === CoordinatePrecision.EXACT || requestedPrecision === CoordinatePrecision.APPROXIMATE) && (nextLat == null || nextLng == null)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Coordinates are required for EXACT or APPROXIMATE precision.' },
      });
    }

    const finalPrecision = resolvePrecision(nextLat, nextLng, requestedPrecision);

    const updateData: Prisma.LocationUpdateInput = {
      ...(trimmedName !== undefined ? { name: trimmedName, slug: newSlug } : {}),
      ...(code !== undefined ? { code: newCode } : {}),
      ...(address !== undefined ? { address: String(address || '').trim() || null } : {}),
      ...(city !== undefined ? { city: String(city || '').trim() || null } : {}),
      ...(postalCode !== undefined ? { postalCode: String(postalCode || '').trim() || null } : {}),
      lat: finalPrecision === CoordinatePrecision.UNKNOWN ? null : nextLat,
      lng: finalPrecision === CoordinatePrecision.UNKNOWN ? null : nextLng,
      coordinate_precision: finalPrecision,
      updated_by: getValidUuid((req as any).user?.id),
      version: existing.version + 1,
    };

    if (is_active !== undefined) {
      updateData.is_active = !!is_active;
      if (is_active) {
        updateData.deletedAt = null;
        updateData.deleted_by = null;
      } else {
        updateData.deletedAt = new Date();
        updateData.deleted_by = getValidUuid((req as any).user?.id);
      }
    }

    const location = await prisma.location.update({
      where: { id: id as string },
      data: updateData,
      include: {
        customer: { select: { id: true, name: true } },
        _count: {
          select: {
            quotationStops: true,
            tripStops: { where: { deletedAt: null } },
          },
        },
      },
    });

    res.json({ success: true, data: location });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to update location' } });
  }
};

export const bulkImportLocations = async (req: Request, res: Response) => {
  try {
    const rows: Record<string, any>[] = req.body.rows || [];
    const userId = getValidUuid((req as any).user?.id);
    const rowResults: any[] = [];

    const customerCache = new Map<string, any>();
    const findCustomer = async (custName: string) => {
      const clean = String(custName || '').trim();
      if (!clean) return null;
      const key = clean.toUpperCase();
      if (customerCache.has(key)) return customerCache.get(key);

      // 1. Exact match on name
      let cust = await prisma.customer.findFirst({
        where: {
          name: { equals: clean, mode: 'insensitive' },
          deletedAt: null,
        },
      });

      // 2. Alias / substring matching
      if (!cust) {
        let searchTerms: string[] = [];

        if (key.includes('IMILE')) {
          searchTerms = ['IMILE', 'iMile'];
        } else if (key.includes('JDL') || key.includes('JINGDONG')) {
          searchTerms = ['JDL', 'JINGDONG'];
        } else if (key.includes('AKS')) {
          searchTerms = ['AKS'];
        } else if (key.includes('SHIPA')) {
          searchTerms = ['SHIPA', 'Shipa'];
        } else if (key.includes('HORIZON')) {
          searchTerms = ['HORIZON', 'Horizon'];
        } else if (key.includes('GFS')) {
          searchTerms = ['GFS'];
        } else {
          searchTerms = [clean];
        }

        const orClauses = searchTerms.map((term) => ({
          name: { contains: term, mode: 'insensitive' as const },
        }));

        cust = await prisma.customer.findFirst({
          where: {
            OR: orClauses,
            deletedAt: null,
          },
        });
      }

      // 3. Fallback substring match if 3+ characters
      if (!cust && clean.length >= 3) {
        cust = await prisma.customer.findFirst({
          where: {
            name: { contains: clean, mode: 'insensitive' },
            deletedAt: null,
          },
        });
      }

      if (cust) customerCache.set(key, cust);
      return cust;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      const custName = row.customer_name || row.customer || row['Customer'] || row['Customer *'];
      const locName = row.location_name || row.name || row['Location Name'] || row['Location Name *'] || row['Full Resolved Facility Name'] || row['Label *'] || row['label'];
      const code = row.code || row.location_code || row.short_code || row['Code'] || row['Location Code'] || row['Location Code *'] || row['Short Code'] || row['August Location Label'] || row['August Sheet Label'];
      const address = row.address || row['Address'] || row['Exact Postal Address (Drivers/GPS)'];
      const city = row.city || row['City'];
      const postalCode = row.postal_code || row.postalCode || row['Postal Code'];

      const latVal = row.lat != null ? row.lat : (row.latitude != null ? row.latitude : row['Latitude']);
      const lngVal = row.lng != null ? row.lng : (row.longitude != null ? row.longitude : row['Longitude']);
      const lat = latVal != null && latVal !== '' && !isNaN(Number(latVal)) ? Number(latVal) : null;
      const lng = lngVal != null && lngVal !== '' && !isNaN(Number(lngVal)) ? Number(lngVal) : null;

      const precisionRaw = row.coordinate_precision || row['Coordinate Precision'] || row.precision;

      const label = locName ? `${locName}${code ? ` (${code})` : ''}` : `Row ${rowNumber}`;

      if (!custName || !String(custName).trim()) {
        rowResults.push({ row: rowNumber, label, success: false, error: 'Customer name is missing' });
        continue;
      }

      if (!locName || !String(locName).trim()) {
        rowResults.push({ row: rowNumber, label, success: false, error: 'Location name is missing' });
        continue;
      }

      const cust = await findCustomer(custName);
      if (!cust) {
        rowResults.push({ row: rowNumber, label, success: false, error: `Customer "${custName}" not found in directory` });
        continue;
      }

      try {
        const codeToUse = code ? String(code).trim().toUpperCase() : null;
        const nameToUse = String(locName).trim();

        // Check existing to determine created vs updated
        const existingByCode = codeToUse ? await prisma.location.findFirst({
          where: { customerId: cust.id, code: codeToUse }
        }) : null;

        const existingByName = await prisma.location.findFirst({
          where: { customerId: cust.id, name: { equals: nameToUse, mode: 'insensitive' } }
        });

        const action = (existingByCode || existingByName) ? 'updated' : 'created';
        const precision = resolvePrecision(lat, lng, precisionRaw);

        await resolveLocation(
          prisma,
          {
            customerId: cust.id,
            code: codeToUse || undefined,
            name: nameToUse,
            address: address ? String(address).trim() : undefined,
            city: city ? String(city).trim() : undefined,
            postalCode: postalCode ? String(postalCode).trim() : undefined,
            lat,
            lng,
            coordinate_precision: precision,
          },
          userId
        );

        rowResults.push({
          row: rowNumber,
          label: `${cust.name} — ${nameToUse}${codeToUse ? ` (${codeToUse})` : ''}`,
          success: true,
          action,
        });
      } catch (err: any) {
        rowResults.push({
          row: rowNumber,
          label,
          success: false,
          error: err.message || 'Failed to save location',
        });
      }
    }

    const createdCount = rowResults.filter((r) => r.success && r.action === 'created').length;
    const updatedCount = rowResults.filter((r) => r.success && r.action === 'updated').length;
    const failedCount = rowResults.filter((r) => !r.success).length;

    res.json({
      success: true,
      data: {
        total: rows.length,
        created: createdCount,
        updated: updatedCount,
        failed: failedCount,
        results: rowResults,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to import locations' } });
  }
};

export const deleteLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true' || req.body?.force === true;

    const location = await prisma.location.findFirst({
      where: { id: id as string, deletedAt: null },
    });

    if (!location) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Location not found' } });
    }

    const [tripStopCount, quotationStopCount] = await Promise.all([
      prisma.tripStop.count({
        where: {
          locationId: id as string,
          trip: { deletedAt: null },
        },
      }),
      prisma.quotationStop.count({
        where: {
          locationId: id as string,
          quotation: { deletedAt: null },
        },
      }),
    ]);

    if ((tripStopCount > 0 || quotationStopCount > 0) && !force) {
      const usageParts: string[] = [];
      if (tripStopCount > 0) usageParts.push(`${tripStopCount} active trip stop(s)`);
      if (quotationStopCount > 0) usageParts.push(`${quotationStopCount} quotation stop(s)`);

      return res.status(409).json({
        success: false,
        error: {
          code: 'REFERENTIAL_INTEGRITY_VIOLATION',
          message: `Cannot delete location "${location.name}" because it is referenced by ${usageParts.join(' and ')}. You can deactivate it, or confirm force delete to unlink it.`,
          details: {
            tripStopCount,
            quotationStopCount,
            canForce: true,
          },
        },
      });
    }

    await prisma.$transaction([
      prisma.tripStop.updateMany({ where: { locationId: id as string }, data: { locationId: null } }),
      prisma.quotationStop.updateMany({ where: { locationId: id as string }, data: { locationId: null } }),
      prisma.location.delete({ where: { id: id as string } }),
    ]);

    res.json({ success: true, message: 'Location deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Failed to delete location' } });
  }
};
